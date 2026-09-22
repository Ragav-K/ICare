# ICare Desktop - Admin

Standalone Electron app for the admin console. On launch it checks whether
`admin-web`'s Vite dev server is already running; if not, it starts it
itself (`npm run dev:admin` at the repo root) and waits for it to come up,
then loads it in a native window.

## Run locally

```powershell
npm install
npm --workspace apps/desktop-admin run dev
```

Override the target URL with `ICARE_ADMIN_URL` if you're pointing at a
staged build instead of the dev server.

## Package a build

```powershell
npm --workspace apps/desktop-admin run build
```

Produces a Windows installer via `electron-builder` in
`apps/desktop-admin/dist`.
