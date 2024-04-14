import * as vscode from 'vscode';
import { CMakeToolsBuildWrapper } from './api';

export namespace Config {
    export interface NotifySend {
        Path: string,
        ShowTime: number,
        IconSuccess: string,
        IconFails: string,
        CriticalUrgencyForFails: boolean,
    }
    export const DEFAULT_NOTIFY_SEND: NotifySend = {
        Path: 'notify-send',
        ShowTime: 10000,
        IconSuccess: '',
        IconFails: '',
        CriticalUrgencyForFails: false,
    };

    export enum CustomNotifyProviderArguments {
        messageOnly = 'messageOnly',
        titleThenMessage = 'titleThenMessage',
        messageThenTitle = 'messageThenTitle',
    }
    export interface CustomNotifyProvider {
        ProviderCommand: string,
        Arguments: CustomNotifyProviderArguments | string,
    }
    export const DEFAULT_CUSTOM_NOTIFY_PROVIDER: CustomNotifyProvider = {
        ProviderCommand: '',
        Arguments: CustomNotifyProviderArguments.messageOnly,
    };

    export enum NotifyProvider {
        Default = 'Default',
        VSCode = 'VSCode API',
        NotifySend = 'Native Notifications',
        VSCodeAndNotifySend = 'VSCode API/Native Notifications',
        CustomProvider = 'Custom provider',
        CustomProviderAndNotifySend = 'Custom provider/Native Notifications',
    }
    export interface Global {
        openOutput: boolean,
        outputView: string,
        notifyFails: boolean,
        notifySuccess: boolean,
        notifyProvider: NotifyProvider | string,
        notifySend: NotifySend,
        customNotifyProvider: CustomNotifyProvider,
    }
    export const DEFAULT_GLOBAL: Global = {
        openOutput: true,
        outputView: 'CMake/Build',
        notifyFails: true,
        notifySuccess: true,
        notifyProvider: NotifyProvider.Default,
        notifySend: DEFAULT_NOTIFY_SEND,
        customNotifyProvider: DEFAULT_CUSTOM_NOTIFY_PROVIDER,
    }

    export function read(): Global {
        const config = vscode.workspace.getConfiguration();
        return config.get<Global>(CMakeToolsBuildWrapper.EXTENSION_NAME, DEFAULT_GLOBAL);
    }
}