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

import { EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { DebugSessionConnection } from '../debug-session-connection';
import { DebugUtils } from '../debug-utils';

export class DebugSourceData {
    readonly raw: DebugProtocol.Source;
}

export class DebugSource extends DebugSourceData {

    constructor(
        protected readonly connection: DebugSessionConnection,
        protected readonly editorManager: EditorManager
    ) {
        super();
    }

    get uri(): URI {
        return DebugUtils.toUri(this.raw);
    }

    update(data: Partial<DebugSourceData>): void {
        Object.assign(this, data);
    }

    open(options?: EditorOpenerOptions): Promise<EditorWidget> {
        return this.editorManager.open(this.uri, options);
    }

    async load(): Promise<string> {
        const source = this.raw;
        const sourceReference = source.sourceReference!;
        const response = await this.connection.sendRequest('source', {
            sourceReference,
            source
        });
        return response.body.content;
    }

}
