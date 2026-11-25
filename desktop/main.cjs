const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { isDirectMediaUrl, normalizeHttpUrl } = require('./media-url.cjs');

let mainWindow;

function playWithMpv(value) {
    const url = normalizeHttpUrl(value);
    if (!url) throw new Error('Seules les URL vidéo HTTP ou HTTPS sont prises en charge.');

    const executable = process.env.MPV_PATH || (process.platform === 'win32' ? 'mpv.exe' : 'mpv');
    return new Promise((resolve, reject) => {
        const player = spawn(executable, [url], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });

        player.once('error', () => {
            reject(new Error('MPV est introuvable. Installez MPV ou définissez la variable MPV_PATH.'));
        });
        player.once('spawn', () => {
            player.unref();
            resolve({ success: true });
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        backgroundColor: '#050507',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const normalizedUrl = normalizeHttpUrl(url);
        if (normalizedUrl) {
            mainWindow.webContents.send('popup-requested', {
                url: normalizedUrl,
                isMedia: isDirectMediaUrl(normalizedUrl)
            });
        }
        return { action: 'deny' };
    });

    mainWindow.loadFile(path.join(app.getAppPath(), 'index.html'));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

ipcMain.handle('play-with-mpv', (event, url) => {
    if (event.sender !== mainWindow?.webContents) {
        throw new Error('Requête de lecture non autorisée.');
    }
    return playWithMpv(url);
});

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
