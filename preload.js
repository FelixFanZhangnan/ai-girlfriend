const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,

    // Window controls
    minimize: () => ipcRenderer.invoke('window-action', 'minimize'),
    maximize: () => ipcRenderer.invoke('window-action', 'maximize'),
    close: () => ipcRenderer.invoke('window-action', 'close'),

    // Launcher IPC
    getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
    saveEnvConfig: (config) => ipcRenderer.invoke('save-env-config', config),
    launchGUI: () => ipcRenderer.invoke('launch-gui'),
    launchWeb: () => ipcRenderer.invoke('launch-web'),
});
