import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';
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
	const baseCommand = 'workbench.action.output.show.extension-output-ms-vscode.cmake-tools';
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

export async function activate(context: vscode.ExtensionContext): Promise<CMakeToolsBuildWrapper.api> {
	api.getCMakeToolsApi(api.Version.v2).then((cmake) => {
		if (cmake === undefined) {
			vscode.window.showErrorMessage("cmake-build: can't get API of CMake Tools extension.");
			return;
		}

		cmakeToolsApi = cmake;
		cmakeProjectWatcher = cmakeToolsApi.onActiveProjectChanged((projectUri) => {
			cmakeProjectUri = projectUri;
		});
		const path = cmakeToolsApi.getActiveFolderPath();
		cmakeProjectUri = vscode.Uri.file(path);
	});

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
