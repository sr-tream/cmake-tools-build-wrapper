import * as vscode from 'vscode';

export namespace CMakeToolsBuildWrapper {
    export const EXTENSION_PUBLISHER = 'sr-team';
    export const EXTENSION_NAME = 'cmake-tools-build-wrapper';

    export interface api {
        getActiveActions(): Promise<string[]>;
    }

    export async function getAPI(): Promise<api | undefined> {
        const extension = vscode.extensions.getExtension<api>(`${EXTENSION_PUBLISHER}.${EXTENSION_NAME}`);
        if (extension === undefined) { return undefined; }

        return extension.isActive ? await extension.activate() : extension.exports;
    }
}