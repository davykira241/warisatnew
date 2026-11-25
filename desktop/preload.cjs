const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('warisatDesktop', {
    onPopupRequested(callback) {
        ipcRenderer.on('popup-requested', (_event, request) => callback(request));
    },
    playWithMpv(url) {
        return ipcRenderer.invoke('play-with-mpv', url);
    }
});
