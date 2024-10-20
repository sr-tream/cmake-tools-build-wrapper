import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getExtensionPath } from './extension';
import { NotifyType } from './notifications';
import { Config } from './config';

let notifyLastId = -1;
let notifyLastCmd = '';

export async function showNativeNotification(config: Config.NotifySend, message: string, type: NotifyType): Promise<boolean> {
    const extensionPath = getExtensionPath();

    let cmd = `${config.Path} -p -a "${vscode.env.appName}: cmake-build"`;
    if (type === NotifyType.Success) {
        if (config.IconSuccess.length !== 0) {
            cmd += ` -i "${config.IconSuccess}"`;
        }
        else if ((await extensionPath).length !== 0) {
            cmd += ` -i "${await extensionPath}/icons/success.svg"`;
        }
    } else {
        if (config.IconFails.length !== 0) {
            cmd += ` -i "${config.IconFails}"`;
        }
        else if ((await extensionPath).length !== 0) {
            cmd += ` -i "${await extensionPath}/icons/fail.svg"`;
        }
    }

    cmd += ` "CMake Tools" "${message}"`;

    const critical = config.CriticalUrgencyForFails && type === NotifyType.Fail;
    exec(`${cmd} -t ${config.ShowTime} -u ${critical ? 'critical' : 'normal'}`, (error, stdout, stderr) => {
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

    return true;
}

export async function hideNativeNotification() {
    if (notifyLastId === -1 || notifyLastCmd.length === 0) { return; }

    // Use timer to avoid error "Created too many similar notifications in quick succession"
    const cmd = notifyLastCmd;
    const id = notifyLastId;
    setTimeout(() => { exec(`${cmd} -t 1 -u normal -r ${id}`); }, 1000);
}