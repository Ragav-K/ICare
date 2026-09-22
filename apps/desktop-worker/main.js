const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// This app is one role of the ICare desktop suite (worker/doctor/admin are
// separate installable apps, not tabs in one launcher). It boots its own
// Vite dev server if one isn't already running, then loads it directly -
// no role picker, since this app IS the healthcare worker app.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEV_SCRIPT = process.env.ICARE_DEV_SCRIPT || "dev:healthcare-worker";
const DEFAULT_URL = process.env.ICARE_WORKER_URL || "http://127.0.0.1:5173";
const APP_TITLE = "ICare - Healthcare Worker";

let win = null;
let devServerProcess = null;

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForUrl(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (async function poll() {
      if (await checkUrl(url)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for dev server"));
      setTimeout(poll, 500);
    })();
  });
}

function startDevServer() {
  return new Promise((resolve, reject) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    // shell: true is required on Windows - spawn() cannot exec a .cmd file
    // directly (it throws EINVAL); .cmd files must be run through a shell.
    devServerProcess = spawn(npmCommand, ["run", DEV_SCRIPT], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: process.platform === "win32",
    });
    let resolved = false;
    const onOutput = (chunk) => {
      const match = chunk.toString().match(/Local:\s+(http:\/\/[0-9.]+:\d+)/);
      if (match && !resolved) {
        resolved = true;
        resolve(match[1]);
      }
    };
    devServerProcess.stdout.on("data", onOutput);
    devServerProcess.stderr.on("data", onOutput);
    devServerProcess.on("error", reject);
    setTimeout(() => {
      if (!resolved) reject(new Error("Dev server did not announce a URL in time"));
    }, 45000);
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: APP_TITLE,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "loading.html"));

  let targetUrl = DEFAULT_URL;
  const alreadyRunning = await checkUrl(DEFAULT_URL);
  if (!alreadyRunning) {
    try {
      targetUrl = await startDevServer();
      await waitForUrl(targetUrl, 60000);
    } catch (error) {
      console.error(error);
      if (!win.isDestroyed()) win.loadFile(path.join(__dirname, "error.html"));
      return;
    }
  }

  if (win.isDestroyed()) return;
  win.loadURL(targetUrl);

  // Keep external links in the OS browser; keep in-app popups (the print/PDF
  // flow opens window.open("", "_blank") which resolves to "about:blank")
  // inside this window instead of routing them to the OS, which can't
  // resolve an "about:" URL on its own.
  win.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    const sameOrigin = popupUrl.startsWith(new URL(targetUrl).origin);
    const isInAppPopup =
      sameOrigin || popupUrl === "about:blank" || popupUrl.startsWith("blob:") || popupUrl.startsWith("data:");
    if (!isInAppPopup) {
      shell.openExternal(popupUrl);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

app.whenReady().then(createWindow);

function shutdown() {
  if (devServerProcess) devServerProcess.kill();
}

app.on("window-all-closed", () => {
  shutdown();
  app.quit();
});

app.on("before-quit", shutdown);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
