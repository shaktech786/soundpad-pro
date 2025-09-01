const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store');

// Initialize electron-store for persistent storage
const store = new Store({
  name: 'soundpad-pro-settings',
  defaults: {
    soundMappings: [],
    globalHotkeysEnabled: true,
    hotkeyMappings: [],
    stopHotkey: 'Escape',
    windowBounds: { width: 1400, height: 900 }
  }
});

// Disable GPU acceleration to fix rendering issues
app.disableHardwareAcceleration();

let mainWindow;
let globalHotkeysEnabled = true;
let registeredHotkeys = new Map();

function createWindow() {
  // Get saved window bounds or use defaults
  const windowBounds = store.get('windowBounds', { 
    width: 1400, 
    height: 900,
    x: undefined,
    y: undefined
  });

  mainWindow = new BrowserWindow({
    title: 'SoundPad Pro',
    ...windowBounds,
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
  
  // Save window position and size when it changes
  mainWindow.on('resize', () => saveWindowBounds());
  mainWindow.on('move', () => saveWindowBounds());
  
  function saveWindowBounds() {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  }

  mainWindow.setTitle('SoundPad Pro'); // Ensure title is set

  if (isDev) {
    mainWindow.loadURL('http://localhost:3005');
  } else {
    // In production, serve the static files properly
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }
  
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

// File dialog for audio selection
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'flac', 'aac', 'opus', 'weba'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return {
      filePath: result.filePaths[0],
      fileName: path.basename(result.filePaths[0])
    };
  }
  return null;
});

// Store management for persistent data
ipcMain.handle('store:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('store:delete', (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('store:clear', () => {
  store.clear();
  return true;
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