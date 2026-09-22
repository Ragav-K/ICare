# ICare Desktop - Doctor

Standalone Electron app for doctors. On launch it checks whether
`doctor-web`'s Vite dev server is already running; if not, it starts it
itself (`npm run dev:doctor` at the repo root) and waits for it to come up,
then loads it in a native window.

## Run locally

```powershell
npm install
npm --workspace apps/desktop-doctor run dev
```

Override the target URL with `ICARE_DOCTOR_URL` if you're pointing at a
staged build instead of the dev server.

## Package a build

```powershell
npm --workspace apps/desktop-doctor run build
```

Produces a Windows installer via `electron-builder` in
`apps/desktop-doctor/dist`.
