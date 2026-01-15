const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;
let isDevMode = process.argv.includes('--dev');

// Server URL
const SERVER_URL = isDevMode ? 'http://localhost:3000' : 'http://localhost:3000';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Albert Mission Control',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#111827',
      symbolColor: '#9ca3af',
      height: 40,
    },
    backgroundColor: '#030712',
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  loadApp();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function loadApp() {
  try {
    await mainWindow.loadURL(SERVER_URL + '/dashboard');
  } catch (err) {
    console.log('Server not ready, showing loading screen...');
    // Show loading page
    mainWindow.loadFile(path.join(__dirname, 'loading.html'));

    // Retry after delay
    setTimeout(loadApp, 2000);
  }
}

function startServer() {
  if (isDevMode) {
    console.log('Development mode - server should already be running');
    return;
  }

  console.log('Starting Next.js server...');

  const serverPath = path.join(__dirname, '..');
  serverProcess = spawn('npm', ['run', 'start'], {
    cwd: serverPath,
    shell: true,
    env: { ...process.env, PORT: '3000' },
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

function createMenu() {
  const template = [
    {
      label: 'Albert',
      submenu: [
        { label: 'About Albert', role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              window.dispatchEvent(new CustomEvent('albert-open-config'));
            `);
          },
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.setZoomLevel(0) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5) },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      ],
    },
    {
      label: 'Panels',
      submenu: [
        { label: 'Research', accelerator: 'CmdOrCtrl+1', click: () => openPanel('research') },
        { label: 'Browser', accelerator: 'CmdOrCtrl+2', click: () => openPanel('browser') },
        { label: 'Email', accelerator: 'CmdOrCtrl+3', click: () => openPanel('email') },
        { label: 'Build', accelerator: 'CmdOrCtrl+4', click: () => openPanel('build') },
        { type: 'separator' },
        { label: 'Task Queue', accelerator: 'CmdOrCtrl+T', click: () => openPanel('task-queue') },
        { label: 'Configuration', accelerator: 'CmdOrCtrl+,', click: () => openPanel('config') },
      ],
    },
    {
      label: 'Voice',
      submenu: [
        {
          label: 'Start Conversation',
          accelerator: 'Space',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              window.dispatchEvent(new CustomEvent('albert-toggle-voice'));
            `);
          },
        },
        { type: 'separator' },
        {
          label: 'Voice Settings',
          click: () => {
            shell.openExternal(SERVER_URL + '/speakers');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/jeffbander/Albert'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/jeffbander/Albert/issues'),
        },
        { type: 'separator' },
        {
          label: 'Open Classic View',
          click: () => shell.openExternal(SERVER_URL),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function openPanel(type) {
  mainWindow.webContents.executeJavaScript(`
    window.dispatchEvent(new CustomEvent('albert-open-panel', { detail: { type: '${type}' } }));
  `);
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// App lifecycle
app.whenReady().then(() => {
  startServer();
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Error', error.message);
});
