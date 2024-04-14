import * as vscode from 'vscode';
import { showNativeNotification, hideNativeNotification } from './notify-send';
import { Config } from './config';

export enum NotifyType {
    Success,
    Fail
}

export async function showNotification(config: Config.Global, message: string, type: NotifyType = NotifyType.Success): Promise<void> {
    const defaultProvider = process.platform === 'linux' ? Config.NotifyProvider.VSCodeAndNotifySend : Config.NotifyProvider.VSCode;
    const provider = config.notifyProvider === Config.NotifyProvider.Default ? defaultProvider : config.notifyProvider;

    // Hide previous system notification
    // Need to avoid manual closing:
    // - fail notifications with critical urgency
    // - notifications with infinity time show
    hideNativeNotification();

    const needShowSystemNotification = provider === 'Native Notifications' ||
        (provider.endsWith('/Native Notifications') && !vscode.window.state.focused);

    let notificationShowed = false;
    if (provider.startsWith('Custom provider') && !needShowSystemNotification) {
        notificationShowed = await showCustomNotification(config.customNotifyProvider, message);
    }

    if (provider.startsWith('VSCode API') && !needShowSystemNotification) {
        notificationShowed = await showVSCodeNotification(message, type);
    }

    if (needShowSystemNotification && !notificationShowed) {
        showNativeNotification(config.notifySend, message, type);
    }
}

async function showCustomNotification(config: Config.CustomNotifyProvider, message: string): Promise<boolean> {
    if (config.ProviderCommand.length !== 0) {
        const argsOrdering = config.Arguments;
        if (argsOrdering === Config.CustomNotifyProviderArguments.messageOnly) {
            vscode.commands.executeCommand(config.ProviderCommand, `CMake Tools: ${message}`);
        }
        else if (argsOrdering === Config.CustomNotifyProviderArguments.titleThenMessage) {
            vscode.commands.executeCommand(config.ProviderCommand, "CMake Tools", `${message}`);
        }
        else if (argsOrdering === Config.CustomNotifyProviderArguments.messageThenTitle) {
            vscode.commands.executeCommand(config.ProviderCommand, `${message}`, "CMake Tools");
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