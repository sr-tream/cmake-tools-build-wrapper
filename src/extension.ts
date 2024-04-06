import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';

let cmakeToolsApi: api.CMakeToolsApi | undefined = undefined;
let cmakeProjectUri: vscode.Uri | undefined = undefined;
let cmakeProjectWatcher: vscode.Disposable | undefined = undefined;

enum CMakeAction {
	Clean = 'clean',
	Build = 'build',
	Install = 'install',
	Configure = 'configure',
	Reconfigure = 'reconfigure',
}

async function withErrorCheck(name: string, action: () => Promise<void>) {
	const config = vscode.workspace.getConfiguration('cmake-tools-build-wrapper');
	action()
		.then(() => {
			const notifySuccess = config.get<boolean>('notifySuccess') || false;
			if (notifySuccess)
				vscode.window.showInformationMessage(`CMake Tools: ${name} completed`)
		})
		.catch((error) => {
			const notifyFails = config.get<boolean>('notifyFails') || false;
			if (notifyFails)
				vscode.window.showErrorMessage(`CMake Tools ${error}`);
			const openOutput = config.get<boolean>('openOutput') || false;
			if (openOutput) {
				const baseCommand = 'workbench.action.output.show.extension-output-ms-vscode.cmake-tools';
				const outputView = config.get<string>('outputView') || '';
				const command = outputView.length > 0 ? `${baseCommand}-${outputView}` : baseCommand;
				vscode.commands.executeCommand(command);
			}
		});
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

export function activate(context: vscode.ExtensionContext) {
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

	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.clean', () => { doCmakeAction(CMakeAction.Clean) }));
	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.build', () => { doCmakeAction(CMakeAction.Build) }));
	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.install', () => { doCmakeAction(CMakeAction.Install) }));
	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.configure', () => { doCmakeAction(CMakeAction.Configure) }));
	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.reconfigure', () => { doCmakeAction(CMakeAction.Reconfigure) }));
}

export function deactivate() {
	cmakeProjectWatcher?.dispose();
}
