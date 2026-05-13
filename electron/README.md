# ORBLOOD desktop (Windows)

Thin Electron wrapper around the existing Express + WebSocket backend.
The wrapper spawns the backend in the same process, opens a window
pointed at it, and stores user data alongside the install instead of in
the dev tunnel.

## How to run / build

### Build the installer

The installer is built by GitHub Actions on a Windows runner.

1. Open the repo on GitHub.
2. Actions tab → "Build Windows desktop" → Run workflow.
3. When the run finishes, download the `orblood-windows` artifact.
   Inside is `ORBLOOD-Setup-<version>.exe`.

The same workflow auto-runs on any push to `orblood` / `orblood2` that
touches `electron/`, `public/`, `server/` or the root `package.json`.

### Local prerequisites on the user's machine

Because the wrapper boots the existing backend untouched, the user
needs a local MariaDB (or MySQL) database before the app can sign in.

Default credentials baked into the auto-generated `server/.env`:

| key            | value          |
| -------------- | -------------- |
| `DB_HOST`      | `127.0.0.1`    |
| `DB_PORT`      | `3306`         |
| `DB_USER`      | `orblood`      |
| `DB_PASSWORD`  | `orbloodpw`    |
| `DB_NAME`      | `orblood`      |

One-time setup (Windows shell, after installing MariaDB):

```sh
mysql -u root -p
> CREATE DATABASE orblood CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'orblood'@'localhost' IDENTIFIED BY 'orbloodpw';
> GRANT ALL ON orblood.* TO 'orblood'@'localhost';
> FLUSH PRIVILEGES;
> exit
```

Then run the schema bootstrap once. The packaged app does NOT do this
for you; we don't bundle a migration runner.

```sh
cd "%LOCALAPPDATA%\Programs\ORBLOOD\resources\app.asar.unpacked\server"
npm run init-db
```

After that, launch ORBLOOD from the Start menu and sign up like
normal. Avatar / cover uploads land in
`%APPDATA%\ORBLOOD\uploads\` (per-user, not shared with other users
on the same machine).

### Why isn't this fully self-contained?

The current backend is hard-bound to MariaDB (JSON columns,
`ON DUPLICATE KEY UPDATE`, `INTERVAL` syntax, WebSocket realtime
fan-out). Rewriting it for embedded SQLite is a larger task that we
left for later. For now: install MariaDB once, run the app, done.
