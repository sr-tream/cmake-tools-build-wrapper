import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getExtensionPath } from './extension';
import { NotifyType } from './notifications';

let notifyLastId = -1;
let notifyLastCmd = '';

export async function showNativeNotification(config: vscode.WorkspaceConfiguration, message: string, type: NotifyType): Promise<boolean> {
    const command = config.get<string>('notifySend.Path', 'notify-send');
    const time = config.get<number>('notifySend.ShowTime', 10000);
    const extensionPath = getExtensionPath();

    let cmd = `${command} -p -a "${vscode.env.appName}: cmake-build"`;
    let crit = false;
    if (type === NotifyType.Success) {
        const icon = config.get<string>('notifySend.IconSuccess', '');
        if (icon.length !== 0) {
            cmd += ` -i "${icon}"`;
        }
        else if ((await extensionPath).length !== 0) {
            cmd += ` -i "${extensionPath}/icons/success.svg"`;
        }
    } else {
        const icon = config.get<string>('notifySend.IconFails', '');
        crit = config.get<boolean>('notifySend.CriticalUrgencyForFails', false);

        if (icon.length !== 0) {
            cmd += ` -i "${icon}"`;
        }
        else if ((await extensionPath).length !== 0) {
            cmd += ` -i "${extensionPath}/icons/fail.svg"`;
        }
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

    return true;
}

export async function hideNativeNotification() {
    if (notifyLastId === -1 || notifyLastCmd.length === 0) { return; }

    // Use timer to avoid error "Created too many similar notifications in quick succession"
    const cmd = notifyLastCmd;
    const id = notifyLastId;
    setTimeout(() => { exec(`${cmd} -t 1 -u normal -r ${id}`); }, 1000);
}