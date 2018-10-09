/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event, DisposableCollection, Disposable } from '@theia/core';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { DebugConfiguration } from '../common/debug-common';
import { DebugSessionConnection, DebugRequestTypes, DebugEventTypes } from './debug-session-connection';
import { DebugThread, StoppedDetails } from './model/debug-thread';
import { DebugScope } from './console/debug-console-items';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugSource } from './model/debug-source';
import { DebugBreakpoint } from './model/debug-breakpoint';
import debounce = require('p-debounce');
import URI from '@theia/core/lib/common/uri';
import { DebugUtils } from './debug-utils';
import { BreakpointManager } from './breakpoint/breakpoint-manager';

export enum DebugState {
    Inactive,
    Running,
    Stopped
}

/**
 * Initialize requests arguments.
 */
export const INITIALIZE_ARGUMENTS = {
    clientID: 'Theia',
    clientName: 'Theia IDE',
    locale: 'en-US',
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: 'path',
    supportsVariableType: false,
    supportsVariablePaging: false,
    supportsRunInTerminalRequest: true
};

// FIXME: make injectable to allow easily inject services
export class DebugSession {

    protected readonly connection: DebugSessionConnection;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<URI>();
    readonly onDidChangeBreakpoints: Event<URI> = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(uri: URI): void {
        this.onDidChangeBreakpointsEmitter.fire(uri);
    }

    protected readonly toDispose = new DisposableCollection();

    constructor(
        public readonly sessionId: string,
        public readonly configuration: DebugConfiguration,
        connectionProvider: WebSocketConnectionProvider,
        protected readonly terminalServer: TerminalService,
        protected readonly editorManager: EditorManager,
        protected readonly breakpoints: BreakpointManager
    ) {
        this.connection = new DebugSessionConnection(sessionId, connectionProvider);
        this.connection.onRequest('runInTerminal', (request: DebugProtocol.RunInTerminalRequest) => this.runInTerminal(request));
        this.toDispose.pushAll([
            this.onDidChangeEmitter,
            this.onDidChangeBreakpointsEmitter,
            Disposable.create(() => {
                this.clearBreakpoints();
                this.updateThreads([]);
            }),
            this.connection,
            this.on('initialized', () => this.configure()),
            this.on('continued', ({ body: { allThreadsContinued, threadId } }) => {
                if (allThreadsContinued !== false) {
                    this.clearThreads();
                } else {
                    this.clearThread(threadId);
                }
            }),
            this.on('stopped', ({ body }) => this.resolveThreads(body)),
            this.on('thread', ({ body: { reason, threadId } }) => {
                if (reason === 'started') {
                    this.resolveThreads(undefined);
                } else if (reason === 'exited') {
                    this.clearThread(threadId);
                }
            }),
            this.on('capabilities', event => this.updateCapabilities(event.body.capabilities)),
            this.breakpoints.onDidChangeMarkers(uri => this.updateBreakpoints({ uri, sourceModified: true }))
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // TODO
    allThreadsContinued = false;
    // TODO
    allThreadsStopped = false;

    protected _capabilities: DebugProtocol.Capabilities = {};
    get capabilities(): DebugProtocol.Capabilities {
        return this._capabilities;
    }

    protected readonly sources = new Map<string, DebugSource>();
    getSource(raw: DebugProtocol.Source): DebugSource {
        const uri = DebugUtils.toUri(raw).toString();
        const source = this.sources.get(uri) || new DebugSource(this.connection, this.editorManager);
        source.update({ raw });
        this.sources.set(uri, source);
        return source;
    }
    getSourceForUri(uri: URI): DebugSource | undefined {
        return this.sources.get(uri.toString());
    }
    toSource(uri: URI): DebugSource {
        const source = this.getSourceForUri(uri);
        if (source) {
            return source;
        }
        const sourceReference = uri.query;
        if (sourceReference) {
            return this.getSource({
                sourceReference: Number.parseInt(sourceReference),
                name: uri.path.toString()
            });
        }
        return this.getSource({
            name: uri.displayName,
            path: uri.path.toString()
        });
    }

    protected _threads = new Map<number, DebugThread>();
    get threads(): IterableIterator<DebugThread> {
        return this._threads.values();
    }
    *getThreads(filter: (thread: DebugThread) => boolean): IterableIterator<DebugThread> {
        for (const thread of this.threads) {
            if (filter(thread)) {
                yield thread;
            }
        }
    }
    get runningThreads(): IterableIterator<DebugThread> {
        return this.getThreads(thread => !thread.stopped);
    }
    get stoppedThreads(): IterableIterator<DebugThread> {
        return this.getThreads(thread => thread.stopped);
    }

    async pauseAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const thread of this.runningThreads) {
            promises.push((async () => {
                try {
                    await thread.pause();
                } catch (e) {
                    console.error(e);
                }
            })());
        }
        await Promise.all(promises);
    }

    async continueAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const thread of this.stoppedThreads) {
            promises.push((async () => {
                try {
                    await thread.continue();
                } catch (e) {
                    console.error(e);
                }
            })());
        }
        await Promise.all(promises);
    }

    get currentFrame(): DebugStackFrame | undefined {
        return this.currentThread && this.currentThread.currentFrame;
    }

    protected _currentThread: DebugThread | undefined;
    get currentThread(): DebugThread | undefined {
        return this._currentThread;
    }
    set currentThread(thread: DebugThread | undefined) {
        this.setCurrentThread(thread);
    }

    get state(): DebugState {
        if (this.connection.disposed) {
            return DebugState.Inactive;
        }
        const thread = this.currentThread;
        if (thread) {
            return thread.stopped ? DebugState.Stopped : DebugState.Running;
        }
        return !!this.stoppedThreads.next().value ? DebugState.Stopped : DebugState.Running;
    }

    async resolveScopes(): Promise<DebugScope[]> {
        const { currentFrame } = this;
        return currentFrame ? currentFrame.resolveScopes() : [];
    }

    async initialize(args: DebugProtocol.InitializeRequestArguments): Promise<DebugProtocol.InitializeResponse> {
        const response = await this.connection.sendRequest('initialize', args);
        this._capabilities = response.body || {};
        return response;
    }
    protected async configure(): Promise<void> {
        await this.updateBreakpoints({ sourceModified: false });
        await this.sendRequest('configurationDone', {});
        await this.resolveThreads(undefined);
    }

    async disconnect(args: DebugProtocol.DisconnectArguments = {}): Promise<void> {
        await this.sendRequest('disconnect', args);
    }

    async completions(text: string, column: number, line: number): Promise<DebugProtocol.CompletionItem[]> {
        const frameId = this.currentFrame && this.currentFrame.raw.id;
        const response = await this.sendRequest('completions', { frameId, text, column, line });
        return response.body.targets;
    }

    async evaluate(expression: string, context?: string): Promise<DebugProtocol.EvaluateResponse['body']> {
        const frameId = this.currentFrame && this.currentFrame.raw.id;
        const response = await this.sendRequest('evaluate', { expression, frameId, context });
        return response.body;
    }

    sendRequest<K extends keyof DebugRequestTypes>(command: K, args: DebugRequestTypes[K][0]): Promise<DebugRequestTypes[K][1]> {
        return this.connection.sendRequest(command, args);
    }

    on<K extends keyof DebugEventTypes>(kind: K, listener: (e: DebugEventTypes[K]) => any): Disposable {
        return this.connection.on(kind, listener);
    }
    onCustom<E extends DebugProtocol.Event>(kind: string, listener: (e: E) => any): Disposable {
        return this.connection.onCustom(kind, listener);
    }

    protected async runInTerminal({ arguments: { title, cwd, args, env } }: DebugProtocol.RunInTerminalRequest): Promise<DebugProtocol.RunInTerminalResponse['body']> {
        const terminal = await this.terminalServer.newTerminal({ title, cwd, shellPath: args[0], shellArgs: args.slice(1), env });
        this.terminalServer.activateTerminal(terminal);
        const processId = await terminal.start();
        return { processId };
    }

    protected clearThreads(): void {
        for (const thread of this.threads) {
            thread.clear();
        }
        this.updateCurrentThread();
    }
    protected clearThread(threadId: number): void {
        const thread = this._threads.get(threadId);
        if (thread) {
            thread.clear();
        }
        this.updateCurrentThread();
    }

    protected resolveThreads = debounce(async (stoppedDetails: StoppedDetails | undefined) => {
        const response = await this.sendRequest('threads', {});
        this.updateThreads(response.body.threads, stoppedDetails);
    }, 100);
    protected updateThreads(threads: DebugProtocol.Thread[], stoppedDetails?: StoppedDetails): void {
        const existing = this._threads;
        this._threads = new Map();
        for (const raw of threads) {
            const id = raw.id;
            const thread = existing.get(id) || new DebugThread(this);
            this._threads.set(id, thread);
            thread.update({
                raw,
                stoppedDetails: stoppedDetails && stoppedDetails.threadId === id ? stoppedDetails : undefined
            });
        }
        this.updateCurrentThread(stoppedDetails);
    }

    protected updateCurrentThread(stoppedDetails?: StoppedDetails): void {
        const { currentThread } = this;
        let threadId = currentThread && currentThread.raw.id;
        if (stoppedDetails && !stoppedDetails.preserveFocusHint && !!stoppedDetails.threadId) {
            threadId = stoppedDetails.threadId;
        }
        this.setCurrentThread(typeof threadId === 'number' && this._threads.get(threadId)
            || this._threads.values().next().value);
    }

    protected setCurrentThread(thread: DebugThread | undefined): Promise<void> {
        return this.doSetCurrentThread(thread && thread.stopped ? thread : undefined);
    }
    protected readonly toDisposeOnCurrentThread = new DisposableCollection();
    protected async doSetCurrentThread(thread: DebugThread | undefined): Promise<void> {
        this.toDisposeOnCurrentThread.dispose();
        this._currentThread = thread;
        this.fireDidChange();
        if (thread) {
            this.toDisposeOnCurrentThread.push(thread.onDidChanged(() => this.fireDidChange()));
            await thread.resolve();
        }
    }

    protected updateCapabilities(capabilities: DebugProtocol.Capabilities): void {
        Object.assign(this._capabilities, capabilities);
    }

    protected readonly _breakpoints = new Map<string, DebugBreakpoint[]>();
    getBreakpoints(uri?: URI): DebugBreakpoint[] {
        if (uri) {
            return this._breakpoints.get(uri.path.toString()) || [];
        }
        const result = [];
        for (const breakpoints of this._breakpoints.values()) {
            result.push(...breakpoints);
        }
        return result;
    }
    protected clearBreakpoints(): void {
        const uris = [...this._breakpoints.keys()];
        this._breakpoints.clear();
        for (const uri of uris) {
            this.fireDidChangeBreakpoints(new URI(uri));
        }
    }
    protected async updateBreakpoints(options: {
        uri?: URI,
        sourceModified: boolean
    }): Promise<void> {
        const { uri, sourceModified } = options;
        for (const affectedUri of this.getAffectedUris(uri)) {
            const path = affectedUri.path.toString();
            const breakpoints = this.breakpoints.getBreakpoints({
                uri: affectedUri,
                enabled: true
            });
            const response = await this.sendRequest('setBreakpoints', {
                source: { path },
                sourceModified,
                breakpoints: breakpoints.map(({ data }) => data.raw)
            });
            const result = response.body.breakpoints.map((raw, index) =>
                new DebugBreakpoint({ raw, data: breakpoints[index].data }, this)
            );
            this._breakpoints.set(affectedUri.toString(), result);
            this.fireDidChangeBreakpoints(affectedUri);
        }
    }
    protected *getAffectedUris(uri?: URI): IterableIterator<URI> {
        if (uri) {
            yield uri;
        } else {
            for (const uriString of this.breakpoints.getUris()) {
                yield new URI(uriString);
            }
        }
    }

}
