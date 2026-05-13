// Orblood desktop — Electron main process.
//
// This shell loads the public/ frontend that ships with the server repo and
// points it at a remote backend chosen by the user on first launch (and
// editable later from the in-app server picker). All audio/voice traffic
// stays peer-to-peer via WebRTC; the desktop app is just a privileged
// browser wrapper around the same /public/index.html that the server
// already hosts.

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// --- Single-instance lock --------------------------------------------------
// If the user double-clicks the icon, focus the existing window instead of
// spawning a second copy that would fight over notifications and state.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// --- Persistent settings ---------------------------------------------------
// Tiny JSON file in the app's userData folder. We deliberately avoid pulling
// electron-store as a dep so the bundle stays minimal.
const userDataDir = app.getPath('userData');
const settingsPath = path.join(userDataDir, 'orblood-settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch { return {}; }
}

function writeSettings(patch) {
  const next = Object.assign({}, readSettings(), patch || {});
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}

// --- Window creation -------------------------------------------------------
let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  const settings = readSettings();
  const bounds = settings.windowBounds || { width: 1320, height: 860 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#020103',
    autoHideMenuBar: true,
    title: 'Orblood',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // We need WebRTC to reach mic + camera, plus the renderer talks to a
      // remote HTTPS backend that lives on a different origin.
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Persist window bounds so the next launch reopens where the user left it.
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isFullScreen() || mainWindow.isMinimized()) return;
    writeSettings({ windowBounds: mainWindow.getBounds() });
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Closing the window should hide to tray on Windows/Linux instead of
  // quitting the app, so notifications and voice stay alive in the
  // background. Cmd+Q on macOS still quits.
  mainWindow.on('close', e => {
    if (isQuitting) return;
    if (process.platform !== 'darwin' && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // External links should open in the user's default browser, not in our
  // Electron window. (Profile sites, support docs, etc.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  // Auto-grant mic permission for the configured backend origin so WebRTC
  // can do its thing without a per-call prompt. We still respect deny on
  // every other origin.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true);
      return;
    }
    callback(false);
  });

  loadFrontend();
}

function loadFrontend() {
  const settings = readSettings();
  const backend = (settings.backendUrl || '').replace(/\/$/, '');
  if (!backend) {
    // First launch — show the bundled server picker so the user can paste
    // their VPS URL once and never see this screen again.
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
    return;
  }
  // Treat the configured URL as the canonical app origin: the renderer
  // loads `<backend>/` directly, which already serves the static frontend
  // from server/public via Express. Same-origin = simpler CORS, working
  // cookies, and the WebSocket upgrade path the app already expects.
  mainWindow.loadURL(backend + '/?desktop=1').catch(err => {
    showLoadError(backend, err);
  });
}

function showLoadError(url, err) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orblood</title>
    <style>body{font-family:system-ui,-apple-system,sans-serif;background:#020103;color:#f8f0f0;padding:48px;line-height:1.55}
      h1{color:#b91c4a;font-size:1.4rem}
      code{background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px}
      button{background:#b91c4a;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:1rem;cursor:pointer;margin-top:18px}</style>
    </head><body>
    <h1>Cannot reach Orblood server</h1>
    <p>Tried: <code>${escapeHtml(url)}</code></p>
    <p style="opacity:0.7">${escapeHtml(err && err.message || String(err))}</p>
    <button id="retry">Retry</button>
    <button id="reset" style="background:transparent;color:#f8f0f0;border:1px solid rgba(255,255,255,0.15);margin-left:10px">Change server</button>
    <script>
      document.getElementById('retry').onclick = () => location.reload();
      document.getElementById('reset').onclick = () => window.orblood.resetBackend();
    </script>
    </body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// --- IPC -------------------------------------------------------------------
ipcMain.handle('orblood:getSettings', () => readSettings());

ipcMain.handle('orblood:setBackendUrl', async (_evt, url) => {
  const cleaned = String(url || '').trim().replace(/\/+$/, '');
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) {
    return { ok: false, error: 'Enter a full URL like https://orblood.example.com' };
  }
  // Health probe so the user gets immediate feedback if the URL is wrong.
  try {
    const res = await fetch(cleaned + '/api/healthz', { method: 'GET' });
    if (!res.ok) throw new Error('health check returned ' + res.status);
  } catch (e) {
    return { ok: false, error: 'Could not reach ' + cleaned + ' — ' + (e.message || e) };
  }
  // Keep the last-used URL around so the setup screen can pre-fill it the
  // next time the user "Change server"s — friendlier than forcing a retype.
  writeSettings({ backendUrl: cleaned, lastBackendUrl: cleaned });
  loadFrontend();
  return { ok: true };
});

ipcMain.handle('orblood:resetBackend', () => {
  writeSettings({ backendUrl: null });
  loadFrontend();
  return { ok: true };
});

ipcMain.handle('orblood:openExternal', (_evt, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// --- Tray ------------------------------------------------------------------
function createTray() {
  if (process.platform === 'darwin') return; // macOS apps stay in the dock.
  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  let img;
  try {
    img = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty();
  } catch { img = nativeImage.createEmpty(); }
  tray = new Tray(img);
  tray.setToolTip('Orblood');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Orblood', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Change server…', click: () => { writeSettings({ backendUrl: null }); loadFrontend(); if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// --- Lifecycle -------------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Tray keeps the app alive in the background; only quit when the user
    // explicitly chose "Quit" via the tray menu.
    if (isQuitting) app.quit();
  }
});
