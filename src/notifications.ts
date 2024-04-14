import * as vscode from 'vscode';
import { showNativeNotification, hideNativeNotification } from './notify-send';

export enum NotifyType {
    Success,
    Fail
}

export async function showNotification(message: string, type: NotifyType = NotifyType.Success): Promise<void> {
    const config = vscode.workspace.getConfiguration('cmake-tools-build-wrapper');
    const defaultProvider = process.platform === 'linux' ? 'VSCode API/Native Notifications' : 'VSCode API';
    let provider = config.get<string>('notifyProvider', defaultProvider);
    if (provider === 'Default') {
        provider = defaultProvider;
    }

    // Hide previous system notification
    // Need to avoid manual closing:
    // - fail notifications with critical urgency
    // - notifications with infinity time show
    hideNativeNotification();

    const needShowSystemNotification = provider === 'Native Notifications' ||
        (provider.endsWith('/Native Notifications') && !vscode.window.state.focused);

    let notificationShowed = false;
    if (provider.startsWith('Custom provider') && !needShowSystemNotification) {
        notificationShowed = await showCustomNotification(config, message);
    }

    if (provider.startsWith('VSCode API') && !needShowSystemNotification) {
        notificationShowed = await showVSCodeNotification(message, type);
    }

    if (needShowSystemNotification && !notificationShowed) {
        showNativeNotification(config, message, type);
    }
}

async function showCustomNotification(config: vscode.WorkspaceConfiguration, message: string): Promise<boolean> {
    const command = config.get<string>('customNotifyProvider.ProviderCommand', '');

    if (command.length !== 0) {
        const argsOrdering = config.get<string>('customNotifyProvider.Arguments', '');
        if (argsOrdering === 'messageOnly') {
            vscode.commands.executeCommand(command, `CMake Tools: ${message}`);
        }
        else if (argsOrdering === 'titleThenMessage') {
            vscode.commands.executeCommand(command, "CMake Tools", `${message}`);
        }
        else if (argsOrdering === 'messageThenTitle') {
            vscode.commands.executeCommand(command, `${message}`, "CMake Tools");
        }
        return true;
    }

    vscode.window.showErrorMessage(`cmake-build: Custom notification provider is not configured`);
    return false;
}

async function showVSCodeNotification(message: string, type: NotifyType): Promise<boolean> {
    if (type === NotifyType.Success) {
        vscode.window.showInformationMessage(`CMake Tools: ${message}`);
    }
    else {
        vscode.window.showWarningMessage(`CMake Tools ${message}`);
    }

    return true;
}