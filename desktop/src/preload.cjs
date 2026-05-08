// Preload — runs in every renderer process. We expose a tiny `window.orblood`
// API so the bundled setup screen + the in-app code can talk to the main
// process without enabling node integration in the web context.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orblood', {
  isDesktop: true,
  platform: process.platform,
  getSettings:    () => ipcRenderer.invoke('orblood:getSettings'),
  setBackendUrl:  url => ipcRenderer.invoke('orblood:setBackendUrl', url),
  resetBackend:   () => ipcRenderer.invoke('orblood:resetBackend'),
  openExternal:   url => ipcRenderer.invoke('orblood:openExternal', url)
});
