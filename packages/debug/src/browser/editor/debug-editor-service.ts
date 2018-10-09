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

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugEditorModel } from './debug-editor-model';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';

@injectable()
export class DebugEditorService implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    protected readonly models = new Map<string, DebugEditorModel>();

    initialize(): void {
        this.editorManager.all.forEach(widget => this.push(widget));
        this.editorManager.onCreated(widget => this.push(widget));
        this.sessionManager.onDidChangeBreakpoints(uri => this.render(uri));
    }

    protected push(widget: EditorWidget): void {
        const { editor } = widget;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }
        const uri = editor.getControl().getModel().uri.toString();
        const debugModel = new DebugEditorModel(editor.getControl(), this.breakpoints, this.sessionManager);
        this.models.set(uri, debugModel);
        editor.onDispose(() => {
            debugModel.dispose();
            this.models.delete(uri);
        });
    }

    protected render(uri: URI): void {
        const model = this.models.get(uri.toString());
        if (model) {
            model.renderBreakpoints();
        }
    }

}
