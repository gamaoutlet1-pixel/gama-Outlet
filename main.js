const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let updateCheckStarted = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

function setupAutoUpdater() {
  if (updateCheckStarted || !app.isPackaged) return;
  updateCheckStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Gama Outlet] Verificando atualizações...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[Gama Outlet] Atualização encontrada: ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[Gama Outlet] Já está na versão ${info.version}.`);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Gama Outlet] Baixando atualização: ${progress.percent.toFixed(0)}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log(`[Gama Outlet] Atualização ${info.version} baixada. Instalando...`);

    // Pequena espera para o aplicativo terminar de abrir antes de reiniciar.
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 1200);
  });

  autoUpdater.on('error', (error) => {
    console.error('[Gama Outlet] Falha no atualizador:', error);
    // Atualização automática nunca deve impedir o sistema de abrir.
  });

  // Verifica logo após abrir o aplicativo.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[Gama Outlet] Não foi possível verificar atualizações:', error);
    });
  }, 1800);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
