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

import { BaseWidget, PanelLayout, Message } from '@theia/core/lib/browser';
import { ViewContainer } from '@theia/core/lib/browser/view-container';
import { DebugSession } from '../debug-session';
import { inject, injectable, postConstruct } from 'inversify';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugStyles } from './base/debug-styles';
import { DebugToolBar } from './debug-toolbar-widget';

// FIXME
import { ConsoleContentWidget } from '@theia/console/lib/browser/content/console-content-widget';
import { DebugVariablesSource } from '../view/debug-variables-source';
import { ConsoleSessionNode } from '@theia/console/lib/browser/content/console-content-tree';

/**
 * The debug target widget. It is used as a container
 * for the rest of widgets for the specific debug target.
 */
@injectable()
export class DebugWidget extends BaseWidget {
    // TODO: private readonly HORIZONTALS_IDS = ['theia-bottom-content-panel', 'theia-main-content-panel'];

    @inject(DebugSession) protected readonly session: DebugSession;
    @inject(DebugThreadsWidget) protected readonly threads: DebugThreadsWidget;
    @inject(DebugStackFramesWidget) protected readonly frames: DebugStackFramesWidget;
    @inject(DebugBreakpointsWidget) protected readonly breakpoints: DebugBreakpointsWidget;
    @inject(DebugToolBar) protected readonly toolbar: DebugToolBar;

    @inject(ConsoleContentWidget)
    protected readonly variables: ConsoleContentWidget; // FIXME extract reusable tree data source
    @inject(DebugVariablesSource)
    protected readonly variablesSource: DebugVariablesSource;

    @postConstruct()
    protected init(): void {
        this.id = `debug-panel-${this.session.sessionId}`;
        this.title.label = this.session.configuration.name;
        this.title.caption = this.session.configuration.name;
        this.title.closable = true;
        this.title.iconClass = 'fa debug-tab-icon';
        this.addClass(DebugStyles.DEBUG_CONTAINER);

        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.toolbar);

        const debugContainer = new ViewContainer();

        this.variables.id = 'debug:variables:' + this.session.sessionId;
        this.variables.title.label = 'Variables';
        this.variables.model.root = ConsoleSessionNode.to(this.variablesSource);
        this.variables.scrollArea = debugContainer.node;
        this.variablesSource.onDidChange(() => this.variables.model.refresh());
        debugContainer.addWidget(this.variables);
        debugContainer.addWidget(this.threads);
        debugContainer.addWidget(this.frames);
        debugContainer.addWidget(this.breakpoints);
        layout.addWidget(debugContainer);

        this.toDispose.push(this.session.onDidChange(() => {
            this.toolbar.update();
            debugContainer.update();
        }));
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.toolbar.focus();
    }

}
