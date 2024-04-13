import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';
import { exec } from 'child_process';

let cmakeToolsApi: api.CMakeToolsApi | undefined = undefined;
let cmakeProjectUri: vscode.Uri | undefined = undefined;
let cmakeProjectWatcher: vscode.Disposable | undefined = undefined;
let extensionPath: string | undefined = undefined;

let notifyLastId = -1;
let notifyLastCmd = '';
enum NotifyType {
	Success,
	Fail
}

async function showNotification(message: string, type: NotifyType = NotifyType.Success): Promise<void> {
	const config = vscode.workspace.getConfiguration('cmake-tools-build-wrapper');
	const defaultProvider = process.platform === 'linux' ? 'VSCode API/Native Notifications' : 'VSCode API';
	let provider = config.get<string>('notifyProvider', defaultProvider);
	if (provider === 'Default') provider = defaultProvider;

	// Hide previous system notification
	// Need to avoid manual closing:
	// - fail notifications with critical urgency
	// - notifications with infinity time show
	if (notifyLastId !== -1 && notifyLastCmd.length > 0) {
		// Use timer to avoid error "Created too many similar notifications in quick succession"
		const cmd = notifyLastCmd;
		const id = notifyLastId;
		setTimeout(() => { exec(`${cmd} -t 1 -u normal -r ${id}`); }, 1000);
	}

	const needShowSystemNotification = provider === 'Native Notifications' ||
		(provider.endsWith('/Native Notifications') && !vscode.window.state.focused);

	let notificationShowed = false;
	if (provider.startsWith('Custom provider') && !needShowSystemNotification) {
		notificationShowed = true;
		const command = config.get<string>('customNotifyProvider.ProviderCommand', '');
		if (command.length !== 0) {
			const argsOrdering = config.get<string>('customNotifyProvider.Arguments', '');
			if (argsOrdering === 'messageOnly')
				vscode.commands.executeCommand(command, `CMake Tools: ${message}`);
			else if (argsOrdering === 'titleThenMessage')
				vscode.commands.executeCommand(command, "CMake Tools", `${message}`);
			else if (argsOrdering === 'messageThenTitle')
				vscode.commands.executeCommand(command, `${message}`, "CMake Tools");
		}
		else
			vscode.window.showErrorMessage(`cmake-build: Custom notification provider is not configured`);
	}

	if (provider.startsWith('VSCode API') && !needShowSystemNotification) {
		notificationShowed = true;
		if (type === NotifyType.Success)
			vscode.window.showInformationMessage(`CMake Tools: ${message}`);
		else
			vscode.window.showWarningMessage(`CMake Tools ${message}`);
	}

	if (needShowSystemNotification && !notificationShowed) {
		const command = config.get<string>('notifySend.Path', 'notify-send');
		const time = config.get<number>('notifySend.ShowTime', 10000);

		let cmd = `${command} -p -a "${vscode.env.appName}: cmake-build"`
		let crit = false;
		if (type === NotifyType.Success) {
			const icon = config.get<string>('notifySend.IconSuccess', '');
			if (icon.length !== 0) cmd += ` -i "${icon}"`;
			else if (extensionPath !== undefined) cmd += ` -i "${extensionPath}/icons/success.svg"`;
		} else {
			const icon = config.get<string>('notifySend.IconFails', '');
			crit = config.get<boolean>('notifySend.CriticalUrgencyForFails', false);

			if (icon.length !== 0) cmd += ` -i "${icon}"`;
			else if (extensionPath !== undefined) cmd += ` -i "${extensionPath}/icons/fail.svg"`;
		}

		cmd += ` "CMake Tools" "${message}"`;

		exec(`${cmd} -t ${time} -u ${crit ? 'critical' : 'normal'}`, (error, stdout, stderr) => {
			if (error) {
				vscode.window.showErrorMessage('cmake-build: Failed to send notification: ' + error);
				return;
			}
			if (stdout.length !== 0) {
				notifyLastId = parseInt(stdout, 10);
				notifyLastCmd = cmd;
			}
			if (stderr.length !== 0) {
				vscode.window.showWarningMessage('cmake-build: `notify-send` error: ' + stderr);
				return;
			}
		});
	}
}

async function openCMakeOutput(): Promise<void> {
	const config = vscode.workspace.getConfiguration('cmake-tools-build-wrapper');
	const baseCommand = 'workbench.action.output.show.extension-output-ms-vscode.cmake-tools';
	vscode.commands.getCommands(true).then((commands) => {
		const outputView = config.get<string>('outputView', '');
		if (outputView.length > 0) {
			for (const command of commands) {
				if (!command.startsWith(baseCommand)) continue;

				if (command.endsWith(`-${outputView}`)) {
					vscode.commands.executeCommand(command);
					return;
				}
			}
		}
		for (const command of commands) {
			if (!command.startsWith(baseCommand)) continue;

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

async function withErrorCheck(name: string, action: () => Promise<void>) {
	const config = vscode.workspace.getConfiguration('cmake-tools-build-wrapper');
	action()
		.then(() => {
			const notifySuccess = config.get<boolean>('notifySuccess', false);
			if (notifySuccess)
				showNotification(`${name} completed`, NotifyType.Success);
		})
		.catch((error) => {
			const notifyFails = config.get<boolean>('notifyFails', false);
			if (notifyFails)
				showNotification(`${error}`, NotifyType.Fail);
			const openOutput = config.get<boolean>('openOutput', false);
			if (openOutput) {
				openCMakeOutput();
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
	context.subscriptions.push(vscode.commands.registerCommand('cmake-tools-build-wrapper.output', () => { openCMakeOutput() }));

	extensionPath = context.extensionPath;
}

export function deactivate() {
	cmakeProjectWatcher?.dispose();
}
