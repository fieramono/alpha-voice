const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onStartRecording: (callback) => ipcRenderer.on('start-recording', callback),
    onStopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
    onError: (callback) => ipcRenderer.on('error', (_event, value) => callback(value)),
    onUpdateStats: (callback) => ipcRenderer.on('update-stats', (_event, value) => callback(value)),
    onLoadConfig: (callback) => ipcRenderer.on('load-config', (_event, value) => callback(value)),
    sendRecordingFinished: (buffer) => ipcRenderer.send('recording-finished', buffer),
    saveConfig: (config) => ipcRenderer.send('save-config', config)
});
