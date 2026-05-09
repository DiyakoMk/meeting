// Empty preload — the app doesn't need any privileged bridge yet,
// but Electron requires a real file path for `webPreferences.preload`
// when contextIsolation is on. Leaving the file in place gives us a
// place to expose ipcRenderer-backed helpers later without touching
// the BrowserWindow config.
'use strict';
