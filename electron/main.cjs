const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const waitOn = require('wait-on');
const { autoUpdater } = require('electron-updater');

let serverProcess;
const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  const entry = path.join(process.resourcesPath, '.output', 'server', 'index.mjs');
  serverProcess = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NITRO_PORT: String(PORT),
      NITRO_HOST: '127.0.0.1',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  serverProcess.on('exit', (code) => {
    if (code && !app.isQuitting) console.error(`[Gama Outlet] servidor terminou: ${code}`);
  });
}

async function createWindow() {
  startServer();
  await waitOn({ resources: [URL], timeout: 30000 });
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b1118',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL(URL);
}

function setupUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdates().catch(() => {});
  autoUpdater.on('update-downloaded', () => {
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
  });
}

app.isQuitting = false;
app.whenReady().then(async () => {
  try {
    await createWindow();
    setupUpdater();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
app.on('window-all-closed', () => app.quit());
