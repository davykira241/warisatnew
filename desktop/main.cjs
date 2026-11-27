const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { isDirectMediaUrl, normalizeHttpUrl } = require('./media-url.cjs');
const { isBlockedAdUrl } = require('./ad-block.cjs');

let mainWindow;
let adBlockEnabled = false;

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

ipcMain.handle('set-ad-block-enabled', (event, enabled) => {
    if (event.sender !== mainWindow?.webContents) {
        throw new Error('Requête de réglage non autorisée.');
    }
    if (typeof enabled !== 'boolean') {
        throw new Error('Le réglage du bloqueur doit être booléen.');
    }
    adBlockEnabled = enabled;
    return { enabled: adBlockEnabled };
});

ipcMain.handle('navigate-tv-frame', async (event, action) => {
    const webContents = mainWindow?.webContents;
    if (event.sender !== webContents || event.senderFrame !== webContents?.mainFrame) {
        throw new Error('Requête de navigation non autorisée.');
    }

    const commands = {
        back: 'history.back()',
        forward: 'history.forward()',
        reload: 'location.reload()'
    };
    if (typeof action !== 'string' || !Object.hasOwn(commands, action)) {
        throw new Error('Commande de navigation invalide.');
    }

    const frame = webContents.mainFrame.frames.find(child => child.name === 'tv-frame');
    if (!frame) {
        throw new Error('Le cadre du serveur TV est indisponible.');
    }
    await frame.executeJavaScript(commands[action], true);
    return { success: true };
});

ipcMain.handle('open-external-url', async (event, value) => {
    const webContents = mainWindow?.webContents;
    if (event.sender !== webContents || event.senderFrame !== webContents?.mainFrame) {
        throw new Error('Requête d’ouverture externe non autorisée.');
    }

    const url = normalizeHttpUrl(value);
    if (!url) throw new Error('Seules les URL HTTP ou HTTPS peuvent être ouvertes.');
    await shell.openExternal(url);
    return { success: true };
});

app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        callback({ cancel: adBlockEnabled && isBlockedAdUrl(details.url) });
    });
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
