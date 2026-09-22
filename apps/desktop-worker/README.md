# ICare Desktop - Healthcare Worker

Standalone Electron app for healthcare workers. On launch it checks whether
`healthcare-worker-web`'s Vite dev server is already running; if not, it
starts it itself (`npm run dev:healthcare-worker` at the repo root) and waits
for it to come up, then loads it in a native window. No role picker - this
app is only the healthcare worker experience.

## Run locally

```powershell
npm install
npm --workspace apps/desktop-worker run dev
```

Override the target URL with `ICARE_WORKER_URL` if you're pointing at a
staged build instead of the dev server.

## Package a build

```powershell
npm --workspace apps/desktop-worker run build
```

Produces a Windows installer via `electron-builder` in
`apps/desktop-worker/dist`.
