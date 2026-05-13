// Preload script for Electron IPC bridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC methods to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  refresh: () => ipcRenderer.invoke('refresh'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, data) => callback(data));
  }
});

// Mark as Electron environment
contextBridge.exposeInMainWorld('isElectron', true);
