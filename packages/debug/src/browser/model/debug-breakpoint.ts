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

import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import URI from '@theia/core/lib/common/uri';
import { DebugSession } from '../debug-session';
import { SourceBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugSource } from './debug-source';

export class DebugBreakpointData {
    readonly raw?: DebugProtocol.Breakpoint;
    readonly data: SourceBreakpoint;
}

export class DebugBreakpoint extends DebugBreakpointData {

    readonly uri: URI;

    constructor(
        data: DebugBreakpointData,
        protected readonly session?: DebugSession
    ) {
        super();
        Object.assign(this, data);
        this.uri = new URI(this.data.uri);
    }

    get id(): number | undefined {
        return this.raw && this.raw.id;
    }

    get enabled(): boolean {
        return this.data.enabled;
    }

    get installed(): boolean {
        return !!this.raw;
    }

    get verified(): boolean {
        return this.raw && this.raw.verified || false;
    }
    get message(): string {
        return this.raw && this.raw.message || '';
    }

    /** 1-based */
    get line(): number {
        return this.raw && this.raw.line || this.data.raw.line;
    }
    get column(): number | undefined {
        return this.raw && this.raw.column || this.data.raw.column;
    }
    get endLine(): number | undefined {
        return this.raw && this.raw.column;
    }
    get endColumn(): number | undefined {
        return this.raw && this.raw.column;
    }

    get source(): DebugSource | undefined {
        return this.raw && this.raw.source && this.session && this.session.getSource(this.raw.source);
    }
}
