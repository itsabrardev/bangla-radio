const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

// Dev mode: NODE_ENV=development থাকলে dev server থেকে load করবে
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    title: 'বাংলা রেডিও',
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // cross-origin audio streaming এর জন্য দরকার
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  if (isDev) {
    // Dev mode — Vite dev server থেকে load
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production — packaged dist folder থেকে load
    // __dirname হলো electron/ folder, dist হলো তার পাশে (root level)
    const distPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(distPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Close করলে tray-তে minimize হবে, বন্ধ হবে না
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Menu
  const template = [
    {
      label: 'বাংলা রেডিও',
      submenu: [
        { label: 'বাংলা রেডিও সম্পর্কে', role: 'about' },
        { type: 'separator' },
        {
          label: 'বন্ধ করুন',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { app.isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Toggle Fullscreen', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Zoom In', role: 'zoomin' },
        { label: 'Zoom Out', role: 'zoomout' },
        { label: 'Reset Zoom', role: 'resetzoom' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// System Tray
function createTray() {
  try {
    // SVG icon — packager এর পরে resources/app/ এর মধ্যে থাকে
    const iconPath = path.join(__dirname, '..', 'public', 'favicon.svg');
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
    } catch {
      icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('বাংলা রেডিও');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'বাংলা রেডিও খুলুন', click: () => mainWindow.show() },
      { type: 'separator' },
      { label: 'বন্ধ করুন', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  } catch (e) {
    console.log('Tray not available:', e.message);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
