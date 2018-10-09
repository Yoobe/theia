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

import { injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugBreakpoint } from '../model/debug-breakpoint';
import { DebugSessionManager } from '../debug-session-manager';
import { SourceBreakpoint } from '../breakpoint/breakpoint-marker';

@injectable()
export class DebugEditorModel implements Disposable {

    protected readonly toDispose = new DisposableCollection();

    protected readonly uri: URI;
    protected decorations: string[] = [];
    protected decorationRanges = new Map<string, monaco.Range>();

    constructor(
        readonly editor: monaco.editor.IStandaloneCodeEditor,
        readonly breakpoints: BreakpointManager,
        readonly sessions: DebugSessionManager
    ) {
        this.uri = new URI(editor.getModel().uri.toString());
        this.toDispose.pushAll([
            editor.onMouseDown(event => this.handleMouseDown(event)),
            editor.onMouseMove(event => this.handleMouseMove(event)),
            editor.onMouseLeave(event => this.handleMouseLeave(event)),
            editor.getModel().onDidChangeDecorations(() => this.updateBreakpoints()),
            editor.getModel().onDidChangeContent(() => this.renderBreakpoints())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    renderBreakpoints(): void {
        const breakpoints = this.sessions.getBreakpointsForUri(this.uri);
        const decorations = this.createDecorations(breakpoints);
        this.setDecorations(decorations);
    }
    protected createDecorations(breakpoints: DebugBreakpoint[]): monaco.editor.IModelDeltaDecoration[] {
        return breakpoints.map(breakpoint => this.createDecoration(breakpoint));
    }
    protected createDecoration(breakpoint: DebugBreakpoint): monaco.editor.IModelDeltaDecoration {
        const lineNumber = breakpoint.line;
        const range = new monaco.Range(lineNumber, 1, lineNumber, 2);
        const options = this.createDecorationOptions(breakpoint);
        return { range, options };
    }
    protected createDecorationOptions(breakpoint: DebugBreakpoint): monaco.editor.IModelDecorationOptions {
        if (breakpoint.installed) {
            const decoration = breakpoint.verified ? DebugEditorModel.BREAKPOINT_DECORATION : DebugEditorModel.BREAKPOINT_UNVERIFIED_DECORATION;
            if (breakpoint.message) {
                return {
                    ...decoration,
                    glyphMarginHoverMessage: {
                        value: breakpoint.message
                    }
                };
            }
            return decoration;
        }
        if (!this.breakpoints.breakpointsDisabled && breakpoint.enabled) {
            return DebugEditorModel.BREAKPOINT_DECORATION;
        }
        return DebugEditorModel.BREAKPOINT_DISABLED_DECORATION;
    }
    protected setDecorations(decorations: monaco.editor.IModelDeltaDecoration[]): void {
        this.decorations = this.editor.getModel().deltaDecorations(this.decorations, decorations);
        this.updateDecorationRanges();
    }
    protected updateDecorationRanges(): void {
        this.decorationRanges.clear();
        for (const decoration of this.decorations) {
            const range = this.editor.getModel().getDecorationRange(decoration);
            this.decorationRanges.set(decoration, range);
        }
    }

    protected updateBreakpoints(): void {
        if (this.areBreakpointsAffected()) {
            const breakpoints = this.createBreakpoints();
            this.breakpoints.setBreakpoints(this.uri, breakpoints);
        }
    }
    protected areBreakpointsAffected(): boolean {
        for (const decoration of this.decorations) {
            const range = this.editor.getModel().getDecorationRange(decoration);
            const oldRange = this.decorationRanges.get(decoration)!;
            if (!range || !range.equalsRange(oldRange)) {
                return true;
            }
        }
        return false;
    }
    protected createBreakpoints(): SourceBreakpoint[] {
        const breakpoints: SourceBreakpoint[] = [];
        for (const decoration of this.decorations) {
            const breakpoint = this.createBreakpoint(decoration);
            if (breakpoint) {
                breakpoints.push(breakpoint);
            }
        }
        return breakpoints;
    }
    protected createBreakpoint(decoration: string): SourceBreakpoint | undefined {
        const range = this.editor.getModel().getDecorationRange(decoration);
        if (range && range.endColumn > range.startColumn) {
            const uri = this.uri;
            const line = range.startLineNumber;
            const column = range.startColumn;
            const oldRange = this.decorationRanges.get(decoration)!;
            const breakpoint = this.breakpoints.getBreakpoint(uri, oldRange.startLineNumber);
            const raw = breakpoint && breakpoint.raw;
            return {
                uri: uri.toString(),
                enabled: true,
                ...breakpoint,
                raw: {
                    ...raw,
                    line,
                    column
                }
            };
        }
        return undefined;
    }

    protected handleMouseDown(event: monaco.editor.IEditorMouseEvent): void {
        this.toggleBreakpoint(event);
        this.hintBreakpoint(event);
    }
    protected handleMouseMove(event: monaco.editor.IEditorMouseEvent): void {
        this.hintBreakpoint(event);
    }
    protected handleMouseLeave(event: monaco.editor.IEditorMouseEvent): void {
        this.deltaHintDecorations([]);
    }

    protected toggleBreakpoint(event: monaco.editor.IEditorMouseEvent): void {
        if (event.target && event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            const { lineNumber, column } = event.target.position;
            this.breakpoints.toggleBreakpoint(this.uri, lineNumber, column);
        }
    }

    protected hintDecorations: string[] = [];
    protected hintBreakpoint(event: monaco.editor.IEditorMouseEvent): void {
        const hintDecorations = this.createHintDecorations(event);
        this.deltaHintDecorations(hintDecorations);
    }
    protected deltaHintDecorations(hintDecorations: monaco.editor.IModelDeltaDecoration[]): void {
        this.hintDecorations = this.editor.deltaDecorations(this.hintDecorations, hintDecorations);
    }
    protected createHintDecorations(event: monaco.editor.IEditorMouseEvent): monaco.editor.IModelDeltaDecoration[] {
        if (event.target && event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            const lineNumber = event.target.position.lineNumber;
            if (!!this.breakpoints.getBreakpoint(this.uri, lineNumber)) {
                return [];
            }
            return [{
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: DebugEditorModel.BREAKPOINT_HINT_DECORATION
            }];
        }
        return [];
    }

    static BREAKPOINT_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-breakpoint-glyph',
        glyphMarginHoverMessage: {
            value: 'Breakpoint'
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    };
    static BREAKPOINT_DISABLED_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-breakpoint-disabled-glyph',
        glyphMarginHoverMessage: {
            value: 'Disabled Breakpoint'
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    };
    static BREAKPOINT_UNVERIFIED_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-breakpoint-unverified-glyph',
        glyphMarginHoverMessage: {
            value: 'Unverified Breakpoint'
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    };
    static BREAKPOINT_HINT_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-breakpoint-hint-glyph',
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    };

}
