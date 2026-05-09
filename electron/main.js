// Electron entry point for the ORBLOOD desktop wrapper.
//
// This file does three things:
//   1. Boots the existing Express + WebSocket backend in-process by
//      requiring server/src/index.js. The server already reads its
//      config from .env, so we plant a sensible default at app startup
//      if one isn't present (uploads land inside userData, JWT secret
//      is a generated per-install token).
//   2. Opens a single BrowserWindow pointed at http://localhost:<port>
//      once the backend is listening. We poll /api/healthz so the
//      window doesn't show "Cannot reach server" on first boot.
//   3. Tears the backend process down cleanly when the last window is
//      closed so MariaDB connections aren't left dangling.
//
// We deliberately keep the server runtime untouched; this file only
// orchestrates lifecycle. If you change anything in server/src, the
// desktop app picks it up automatically.

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

// Default port for the embedded backend. We let it differ from the dev
// server port so a user with the dev tunnel running won't collide.
const SERVER_PORT = 4567;

// Resolve repo paths relative to this file. The packaged build extracts
// the server folder under app.asar.unpacked/server (configured in the
// builder section of package.json) so node_modules native binaries
// stay loadable.
function repoRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.resolve(__dirname, '..');
}

function ensureEnv() {
  const root = repoRoot();
  const envPath = path.join(root, 'server', '.env');
  if (fs.existsSync(envPath)) return envPath;

  // First-run: generate a config that points uploads at userData and
  // bakes a fresh JWT secret. The user is expected to have a local
  // MariaDB / MySQL listening on 3306 with an `orblood` database;
  // otherwise the server boots but rejects logins until they fix it.
  const userData = app.getPath('userData');
  const uploadsDir = path.join(userData, 'uploads');
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}
  const env = [
    'DB_HOST=127.0.0.1',
    'DB_PORT=3306',
    'DB_USER=orblood',
    'DB_PASSWORD=orbloodpw',
    'DB_NAME=orblood',
    'JWT_SECRET=' + crypto.randomBytes(24).toString('hex'),
    'JWT_EXPIRES_IN=7d',
    'PORT=' + SERVER_PORT,
    'PUBLIC_ORIGIN=*',
    'UPLOAD_DIR=' + uploadsDir.replace(/\\/g, '/'),
    'PUBLIC_UPLOADS_BASE=/uploads',
    ''
  ].join('\n');
  try {
    fs.mkdirSync(path.join(root, 'server'), { recursive: true });
    fs.writeFileSync(envPath, env, 'utf8');
  } catch (e) {
    console.warn('[electron] could not write .env:', e.message);
  }
  return envPath;
}

let backendStarted = false;
function startBackend() {
  if (backendStarted) return;
  backendStarted = true;
  ensureEnv();
  // Inject PORT before the server reads its config.
  process.env.PORT = String(SERVER_PORT);
  // Resolve absolute path; require() needs it from the unpacked tree.
  const serverEntry = path.join(repoRoot(), 'server', 'src', 'index.js');
  // The backend is an ES module; load it via dynamic import so this
  // CommonJS process can host it. We don't await the promise — once
  // import() resolves the listener has been registered.
  import(require('node:url').pathToFileURL(serverEntry).href).catch(err => {
    console.error('[electron] backend boot failed:', err);
  });
}

// Poll healthz until the backend is up, then resolve. Kept short so
// the splash window doesn't sit white forever if the DB is missing.
function waitForBackend(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 8000);
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port: SERVER_PORT, path: '/api/healthz', timeout: 800 }, res => {
        // Even a 401 means the server is up; only network failure means "not yet".
        res.resume();
        resolve(true);
      });
      req.on('error',   () => Date.now() > deadline ? resolve(false) : setTimeout(tick, 250));
      req.on('timeout', () => { req.destroy(); Date.now() > deadline ? resolve(false) : setTimeout(tick, 250); });
    };
    tick();
  });
}

let mainWindow = null;
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#020103',
    autoHideMenuBar: true,
    title: 'ORBLOOD',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Open external links in the system browser instead of a new
  // BrowserWindow — the SPA never expects to be navigated to a foreign
  // origin, so any window.open() is for /api uploads or third-party
  // links (e.g. avatar URLs the user pastes in chat).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch (_) {}
    return { action: 'deny' };
  });

  await waitForBackend();
  await mainWindow.loadURL('http://localhost:' + SERVER_PORT + '/');
  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS the convention is to keep the app alive until Cmd+Q,
  // but we ship Windows-only so close == quit.
  app.quit();
});
