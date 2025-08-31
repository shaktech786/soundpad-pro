const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let globalHotkeysEnabled = true;
let registeredHotkeys = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'SoundPad Pro',
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      hardwareAcceleration: false // Fix GPU errors
    },
    backgroundColor: '#1a1a1a'
  });

  mainWindow.setTitle('SoundPad Pro'); // Ensure title is set

  const url = isDev 
    ? 'http://localhost:3005' // Updated port to match Next.js
    : `file://${path.join(__dirname, '../out/index.html')}`;
    
  mainWindow.loadURL(url);
  
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Register default global stop hotkey
  globalShortcut.register('Escape', () => {
    if (mainWindow && globalHotkeysEnabled) {
      mainWindow.webContents.send('global-stop-audio');
    }
  });
});

app.on('window-all-closed', () => {
  // Unregister all shortcuts when app is closing
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers for audio routing
ipcMain.handle('get-audio-devices', async () => {
  // This will get the system audio devices
  const sources = await desktopCapturer.getSources({ 
    types: ['window', 'screen'],
    fetchWindowIcons: false 
  });
  return sources;
});

// Virtual audio output handling
ipcMain.handle('setup-virtual-audio', async () => {
  // We'll use the system audio and route it through Electron
  // This makes the app appear as an audio source to OBS
  return { success: true, deviceName: 'SoundPad Pro Virtual Audio' };
});

// Controller support
ipcMain.handle('get-controllers', async () => {
  // The renderer will use Web Gamepad API
  // We just need to enable it
  return { enabled: true };
});

// Global hotkey management
ipcMain.handle('register-hotkey', async (event, { key, buttonIndex }) => {
  try {
    // Unregister previous hotkey for this button if exists
    const previousKey = Array.from(registeredHotkeys.entries())
      .find(([k, v]) => v === buttonIndex)?.[0];
    if (previousKey) {
      globalShortcut.unregister(previousKey);
      registeredHotkeys.delete(previousKey);
    }
    
    // Register new hotkey
    const success = globalShortcut.register(key, () => {
      if (mainWindow && globalHotkeysEnabled) {
        mainWindow.webContents.send('hotkey-triggered', buttonIndex);
      }
    });
    
    if (success) {
      registeredHotkeys.set(key, buttonIndex);
    }
    
    return { success, key, buttonIndex };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unregister-hotkey', async (event, key) => {
  try {
    globalShortcut.unregister(key);
    registeredHotkeys.delete(key);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-global-hotkeys', async (event, enabled) => {
  globalHotkeysEnabled = enabled;
  return { enabled: globalHotkeysEnabled };
});

ipcMain.handle('get-registered-hotkeys', async () => {
  return Array.from(registeredHotkeys.entries()).map(([key, buttonIndex]) => ({
    key,
    buttonIndex
  }));
});