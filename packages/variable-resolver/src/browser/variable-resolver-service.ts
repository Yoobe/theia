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

import { injectable, inject } from 'inversify';
import { VariableRegistry } from './variable';

/**
 * The variable resolver service should be used to resolve variables in strings.
 */
@injectable()
export class VariableResolverService {

    protected static VAR_REGEXP = /\$\{(.*?)\}/g;

    @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry;

    /**
     * Resolve the variables in the given string array.
     * @returns promise resolved to the provided string array with already resolved variables.
     * Never reject.
     */
    resolveArray(value: string[]): Promise<string[]> {
        return this.resolve(value);
    }

    /**
     * Resolve the variables in the given string.
     * @returns promise resolved to the provided string with already resolved variables.
     * Never reject.
     */
    async resolve<T>(value: T): Promise<T> {
        const context = new VariableResolverService.Context(this.variableRegistry);
        const resolved = await this.doResolve(value, context);
        return resolved as any;
    }

    protected doResolve(value: Object | undefined, context: VariableResolverService.Context): Object | undefined {
        if (value === undefined || value === null) {
            return value;
        }
        if (typeof value === 'string') {
            return this.doResolveString(value, context);
        }
        if (Array.isArray(value)) {
            return this.doResolveArray(value, context);
        }
        if (typeof value === 'object') {
            return this.doResolveObject(value, context);
        }
        return value;
    }

    protected async doResolveObject(obj: object, context: VariableResolverService.Context): Promise<object> {
        const result: {
            [prop: string]: Object | undefined
        } = {};
        for (const name of Object.keys(obj)) {
            const value = (obj as any)[name];
            const resolved = await this.doResolve(value, context);
            result[name] = resolved;
        }
        return result;
    }

    protected async doResolveArray(values: Array<Object | undefined>, context: VariableResolverService.Context): Promise<Array<Object | undefined>> {
        const result: (Object | undefined)[] = [];
        for (const value of values) {
            const resolved = await this.doResolve(value, context);
            result.push(resolved);
        }
        return result;
    }

    protected async doResolveString(value: string, context: VariableResolverService.Context): Promise<string> {
        await this.resolveVariables(value, context);
        return value.replace(VariableResolverService.VAR_REGEXP, (match: string, varName: string) => {
            const varValue = context.get(varName);
            return varValue !== undefined ? varValue : match;
        });
    }

    protected async resolveVariables(value: string, context: VariableResolverService.Context): Promise<void> {
        let match;
        while ((match = VariableResolverService.VAR_REGEXP.exec(value)) !== null) {
            const variableName = match[1];
            await context.resolve(variableName);
        }
    }

}
export namespace VariableResolverService {
    export class Context {

        protected readonly resolved = new Map<string, string | undefined>();

        constructor(
            protected readonly variableRegistry: VariableRegistry
        ) { }

        get(name: string): string | undefined {
            return this.resolved.get(name);
        }

        async resolve(name: string): Promise<void> {
            if (this.resolved.has(name)) {
                return;
            }
            try {
                const variable = await this.variableRegistry.getVariable(name);
                const value = variable && await variable.resolve();
                this.resolved.set(name, value);
            } catch (e) {
                console.error(`Failed to resolved '${name}' variable`, e);
                this.resolved.set(name, undefined);
            }
        }

    }
}
