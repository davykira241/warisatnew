const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('warisatDesktop', {
    onPopupRequested(callback) {
        ipcRenderer.on('popup-requested', (_event, request) => callback(request));
    },
    playWithMpv(url) {
        return ipcRenderer.invoke('play-with-mpv', url);
    },
    setAdBlockEnabled(enabled) {
        return ipcRenderer.invoke('set-ad-block-enabled', enabled);
    },
    navigateTVFrame(action) {
        return ipcRenderer.invoke('navigate-tv-frame', action);
    },
    openExternalUrl(url) {
        return ipcRenderer.invoke('open-external-url', url);
    }
});
