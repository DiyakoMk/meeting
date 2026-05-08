# Orblood Desktop

Electron shell for Orblood. Connects to a remote Orblood server (the same Node + MariaDB backend that lives in `/server`) and serves the `/public` frontend in a native window with mic, tray, single-instance lock, and persistent settings.

The desktop app does **not** bundle the server. It's a privileged browser wrapper that points at whatever URL the user provides on first launch (their VPS or a self-hosted instance).

---

## Layout

```
desktop/
├── package.json          electron + electron-builder config
├── src/
│   ├── main.cjs          main process: window, tray, IPC, settings
│   └── preload.cjs       exposes window.orblood to the renderer
├── renderer/
│   └── setup.html        first-launch server picker
└── build/
    ├── icon.svg          source icon (raster these to icon.png/.ico/.icns)
    ├── icon.png          1024×1024 (Linux + fallback)
    ├── icon.ico          Windows installer/exe
    ├── icon.icns         macOS bundle
    └── entitlements.mac.plist  mic + JIT for hardened runtime
```

---

## Develop

```bash
cd desktop
npm install
npm run dev
```

The first launch shows the server picker. Paste your backend URL (e.g. `https://orblood.example.com`); it will probe `/api/healthz` and persist the choice in the OS userData dir:

- **macOS:** `~/Library/Application Support/Orblood/orblood-settings.json`
- **Windows:** `%APPDATA%/Orblood/orblood-settings.json`
- **Linux:** `~/.config/Orblood/orblood-settings.json`

Settings → System → **Change server** lets you switch backends later (or right-click the tray icon → Change server).

---

## Build distributables

The icons are sourced from `build/icon.svg`. Convert once before building:

```bash
# .png  (Linux / fallback)
inkscape build/icon.svg -o build/icon.png -w 1024 -h 1024
# .ico  (Windows)
magick convert build/icon.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
# .icns (macOS) — easiest with iconutil
iconutil -c icns -o build/icon.icns <icon.iconset>/
```

Then build for the current platform:

```bash
npm run build:win     # → desktop/dist/Orblood Setup x.y.z.exe
npm run build:mac     # → desktop/dist/Orblood-x.y.z-arm64.dmg + x64.dmg
npm run build:linux   # → desktop/dist/Orblood-x.y.z.AppImage + .deb
```

CI tip: build each target on its native OS. Cross-compiling macOS from Linux requires `osxcross` and isn't worth the headache for a 5-MB Electron shell.

---

## How the renderer talks to the backend

`src/main.cjs` loads `<backend>/?desktop=1` directly. That URL is served by `server/src/index.js` (which already does `express.static(public)`). Same-origin = simple CORS, working WebSocket upgrade, no rewriting of `/api/*` paths.

`window.ORBLOOD_API` is left unset, so `_backendBase()` in `app.js` falls back to relative URLs — exactly what we want.

The preload exposes a tiny `window.orblood` API:

```js
window.orblood.isDesktop      // true
window.orblood.platform       // 'darwin' | 'win32' | 'linux'
window.orblood.getSettings()
window.orblood.setBackendUrl(url)
window.orblood.resetBackend()
window.orblood.openExternal(url)
```

The frontend uses `window.orblood?.isDesktop` to reveal desktop-only entries (e.g. the "Change server" item in Settings). Everything else is identical to the browser build.

---

## What lives in the desktop app vs the server

| Feature | Where it runs |
|---|---|
| HTML/JS/CSS | Served by `server/src/index.js` from `/public` — same in browser and desktop |
| API + WebSocket signaling | Server (Express) |
| MariaDB persistence | Server |
| WebRTC voice (peer-to-peer) | Direct between renderer processes; never touches the server |
| TURN relay (when P2P fails) | Coturn on the same VPS |
| Window management, tray, mic permission grant, single-instance | Desktop only |

So one server backs N desktop apps + N browser tabs simultaneously.
