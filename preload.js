const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onStartRecording: (callback) => ipcRenderer.on('start-recording', callback),
    onStopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, status) => callback(status)),
    onError: (callback) => ipcRenderer.on('error', (event, msg) => callback(msg)),
    onShortcutRegistered: (callback) => ipcRenderer.on('shortcut-registered', (event, shortcut) => callback(shortcut)),
    sendRecordingFinished: (buffer) => ipcRenderer.send('recording-finished', buffer),
    saveConfig: (config) => ipcRenderer.send('save-config', config)
});
