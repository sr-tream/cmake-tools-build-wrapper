import * as vscode from 'vscode';
import type * as api from 'vscode-cmake-tools';
import { CMakeToolsBuildWrapper } from './api';
import { showNotification, NotifyType } from './notifications';
import { Config } from './config';

let cmakeToolsApi: api.CMakeToolsApi | undefined = undefined;
let cmakeProjectUri: vscode.Uri | undefined = undefined;
let cmakeProjectWatcher: vscode.Disposable | undefined = undefined;
let extensionPath: string | undefined = undefined;

export async function getExtensionPath(): Promise<string> {
	return extensionPath || "";
}

async function openCMakeOutput(config?: Config.Global): Promise<void> {
	if (config === undefined) config = Config.read();
	const baseCommand = `workbench.action.output.show.extension-output-${config.cmakeExtensionName}`;
	vscode.commands.getCommands(true).then((commands) => {
		if (config.outputView.length > 0) {
			for (const command of commands) {
				if (!command.startsWith(baseCommand)) { continue; }

				if (command.endsWith(`-${config.outputView}`)) {
					vscode.commands.executeCommand(command);
					return;
				}
			}
		}
		for (const command of commands) {
			if (!command.startsWith(baseCommand)) { continue; }

			if (command.indexOf(`-CMake/`) > baseCommand.length) {
				vscode.commands.executeCommand(command);
				return;
			}
		}
	});
}

enum CMakeAction {
	Clean = 'clean',
	Build = 'build',
	Install = 'install',
	Configure = 'configure',
	Reconfigure = 'reconfigure',
}

class ActiveCMakeAction implements vscode.Disposable {
	private static actions: string[] = [];
	private name: string = '';

	constructor(name: string) {
		const index = ActiveCMakeAction.actions.indexOf(name);
		if (index > -1) {
			throw new Error(`CMake action "${name}" already in progress`);
		}

		this.name = name;
		ActiveCMakeAction.actions.push(name);
	}

	dispose(): void {
		const index = ActiveCMakeAction.actions.indexOf(this.name);
		if (index > -1) {
			ActiveCMakeAction.actions.splice(index, 1);
		}
	}

	static async getActiveActions(): Promise<string[]> {
		return ActiveCMakeAction.actions;
	}
}

async function withErrorCheck(name: string, action: () => Promise<void>) {
	try {
		const activeAction = new ActiveCMakeAction(name);
		const config = Config.read();
		action()
			.then(() => {
				if (config.notifySuccess) {
					showNotification(config, `${name} completed`, NotifyType.Success);
				}
				activeAction.dispose();
			})
			.catch((error) => {
				if (config.notifyFails) {
					showNotification(config, `${error}`, NotifyType.Fail);
				}
				if (config.openOutput) {
					openCMakeOutput(config);
				}
				activeAction.dispose();
			});
	} catch (error) {
		vscode.window.showWarningMessage(`cmake-build: ${error}`);
	}
}

async function doCmakeAction(action: CMakeAction) {
	if (cmakeToolsApi === undefined || cmakeProjectUri === undefined) {
		vscode.window.showErrorMessage(`cmake-build: CMake Tools not initialized or project not opened`);
		return;
	}

	cmakeToolsApi.getProject(cmakeProjectUri).then((project) => {
		switch (action) {
			case CMakeAction.Clean:
				withErrorCheck(action, async () => (await project?.clean()));
				break;
			case CMakeAction.Build:
				withErrorCheck(action, async () => (await project?.build()));
				break;
			case CMakeAction.Install:
				withErrorCheck(action, async () => (await project?.install()));
				break;
			case CMakeAction.Configure:
				withErrorCheck(action, async () => (await project?.configure()));
				break;
			case CMakeAction.Reconfigure:
				withErrorCheck(action, async () => (await project?.reconfigure()));
				break;
			default:
				vscode.window.showErrorMessage(`cmake-build: Unknown action ${action}`);
				return;
		}
	});
}

async function resolveCMakeToolsApi(): Promise<api.CMakeToolsApi | undefined> {
	const config = Config.read();
	const extensionId = config.cmakeExtensionName;
	const ext = vscode.extensions.getExtension<api.CMakeToolsExtensionExports>(extensionId);
	if (!ext) {
		vscode.window.showWarningMessage(
			`cmake-build: extension '${extensionId}' is not installed. ` +
			`Install it or set 'cmake-tools-build-wrapper.cmakeExtensionName' to the correct extension ID.`);
		return undefined;
	}
	const exports = await ext.activate();
	return exports.getApi(2 as api.Version);
}

export async function activate(context: vscode.ExtensionContext): Promise<CMakeToolsBuildWrapper.api> {
	resolveCMakeToolsApi().then((cmakeApi) => {
		if (cmakeApi === undefined)
			return;

		cmakeToolsApi = cmakeApi;
		cmakeProjectWatcher = cmakeToolsApi.onActiveProjectChanged((projectUri) => {
			cmakeProjectUri = projectUri;
		});
		const path = cmakeToolsApi.getActiveFolderPath();
		cmakeProjectUri = vscode.Uri.file(path);
	});

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.cmakeExtensionName`)) {
			vscode.window.showInformationMessage(
				'cmake-build: Reload the window to apply the new CMake Tools extension.',
				'Reload Window'
			).then(selection => {
				if (selection === 'Reload Window')
					vscode.commands.executeCommand('workbench.action.reloadWindow');
			});
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.clean`, () => { doCmakeAction(CMakeAction.Clean); }));
	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.build`, () => { doCmakeAction(CMakeAction.Build); }));
	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.install`, () => { doCmakeAction(CMakeAction.Install); }));
	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.configure`, () => { doCmakeAction(CMakeAction.Configure); }));
	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.reconfigure`, () => { doCmakeAction(CMakeAction.Reconfigure); }));
	context.subscriptions.push(vscode.commands.registerCommand(`${CMakeToolsBuildWrapper.EXTENSION_NAME}.output`, () => { openCMakeOutput(); }));

	extensionPath = context.extensionPath;
	return {
		getActiveActions(): Promise<string[]> {
			return ActiveCMakeAction.getActiveActions();
		}
	};
}

export function deactivate() {
	cmakeProjectWatcher?.dispose();
}
