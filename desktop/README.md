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

Icons are rasterised from `build/icon.svg` automatically by every `build:*`
script (via `npm run icons`). No manual `inkscape`/`magick` step needed.

Build for the current platform:

```bash
npm run build:win     # → desktop/dist/Orblood Setup x.y.z.exe
npm run build:mac     # → desktop/dist/Orblood-x.y.z-arm64.dmg + x64.dmg
npm run build:linux   # → desktop/dist/Orblood-x.y.z.AppImage + .deb
```

### Build in GitHub Actions (recommended)

A workflow at `.github/workflows/desktop-build.yml` builds Win/Mac/Linux on
their native runners and uploads the installers as workflow artifacts. The
repo can stay private — only people with read access to the repo can
download the artifacts.

Trigger options:

1. **Push a version tag** — fastest, also drafts a GitHub Release with all
   installers attached:
   ```bash
   git tag v0.1.0 && git push --tags
   ```
2. **Manual run** — open the **Actions** tab → "Desktop build" → **Run
   workflow**. Set `release` to `true` if you also want a draft release;
   leave it as `false` to just download the artifacts.
3. **Push to `build/desktop`** — handy for iterating on the workflow itself
   without minting a tag.

Each run produces three artifacts:
- `orblood-windows` — `.exe` installer
- `orblood-macos`   — `.dmg` (arm64 + x64)
- `orblood-linux`   — `.AppImage` + `.deb`

Click into the run, scroll to **Artifacts**, download the one you need,
unzip, and share the installer with your team.

### Why three runners?

`electron-builder` cross-compiles poorly. macOS DMGs need `hdiutil` (macOS
only); Windows installers need `signtool` + the NSIS toolchain in its
expected paths; Linux native deps for `sharp` only resolve cleanly on
glibc. Running each platform on its own GitHub-hosted runner is much
simpler than wrestling with `osxcross` or Wine.

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
