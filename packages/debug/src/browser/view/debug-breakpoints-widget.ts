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

import { VirtualWidget, SELECTED_CLASS } from '@theia/core/lib/browser';
import { DebugSession } from '../debug-session';
import { h } from '@phosphor/virtualdom';
import { injectable, inject, postConstruct } from 'inversify';
import { DebugStyles } from './base/debug-styles';
import { DebugSessionManager } from '../debug-session-manager';

@injectable()
export class DebugBreakpointsWidget extends VirtualWidget {

    @inject(DebugSession)
    protected readonly session: DebugSession;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @postConstruct()
    protected init() {
        this.id = 'debug:breakpoints:' + this.session.sessionId;
        this.title.label = 'Breakpoints';
        this.addClass('theia-debug-entry');
        this.manager.onDidChangeBreakpoints(() => this.update());
    }

    protected render(): h.Child {
        const items: h.Child = [];
        for (const breakpoint of this.manager.getBreakpoints(this.session)) {
            const item =
                h.div({
                    className: DebugStyles.DEBUG_ITEM,
                    onclick: event => {
                        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
                        if (selected) {
                            selected.className = DebugStyles.DEBUG_ITEM;
                        }
                        (event.target as HTMLDivElement).className = `${DebugStyles.DEBUG_ITEM} ${SELECTED_CLASS}`;
                    }
                }, breakpoint.uri.displayName + ':' + breakpoint.line);
            items.push(item);
        }

        return h.div({ className: 'theia-debug-breakpoints' }, items);
    }

}
