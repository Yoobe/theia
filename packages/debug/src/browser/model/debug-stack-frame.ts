/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { WidgetOpenerOptions } from '@theia/core/lib/browser';
import { EditorWidget, Range, Position } from '@theia/editor/lib/browser';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { DebugScope } from '../console/debug-console-items';
import { DebugSource } from './debug-source';
import { RecursivePartial } from '@theia/core';
import { DebugSession } from '../debug-session';

export class DebugStackFrameData {
    readonly raw: DebugProtocol.StackFrame;
}

export class DebugStackFrame extends DebugStackFrameData {

    constructor(
        protected readonly session: DebugSession
    ) {
        super();
    }

    protected _source: DebugSource | undefined;
    get source(): DebugSource | undefined {
        return this._source;
    }
    update(data: Partial<DebugStackFrameData>): void {
        Object.assign(this, data);
        this._source = this.raw.source && this.session.getSource(this.raw.source);
    }

    async open(options: WidgetOpenerOptions = {
        mode: 'reveal'
    }): Promise<EditorWidget | undefined> {
        if (!this.source) {
            return undefined;
        }
        const { line, column, endLine, endColumn } = this.raw;
        const selection: RecursivePartial<Range> = {
            start: Position.create(line - 1, column - 1)
        };
        if (typeof endLine === 'number' && typeof endColumn === 'number') {
            selection.end = Position.create(endLine - 1, endColumn - 1);
        }
        this.source.open({
            ...options,
            selection
        });
    }

    async resolveScopes(): Promise<DebugScope[]> {
        const response = await this.session.sendRequest('scopes', this.toArgs());
        return response.body.scopes.map(raw => new DebugScope(raw, this.session['connection']));
    }

    protected toArgs<T extends object>(arg?: T): { frameId: number } & T {
        return Object.assign({}, arg, {
            frameId: this.raw.id
        });
    }

}
