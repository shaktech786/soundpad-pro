const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, dialog, session, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const isDev = require('electron-is-dev');
const Store = require('electron-store');
// HID gamepad disabled - Windows DirectInput exclusively claims gamepad data, blocking raw HID access
// const { HIDGamepad } = require('./hid-gamepad');
const { AsioAudioEngine } = require('./asio-audio-engine');
const { GP2040ceApi } = require('./gp2040ce-api');

let gp2040api = new GP2040ceApi();

// Enable Chromium audio output device selection (required for AudioContext.setSinkId)
app.commandLine.appendSwitch('enable-features', 'AudioServiceOutOfProcess,WebRtcAllowInputVolumeAdjustment');
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');

// Prevent background throttling of timers and audio when window loses focus
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Prevent OS from throttling this process (keeps audio playback smooth)
powerSaveBlocker.start('prevent-app-suspension');

// Initialize electron-store for persistent storage
const store = new Store({
  name: 'soundpad-pro-settings',
  defaults: {
    soundMappings: [],
    globalHotkeysEnabled: true,
    hotkeyMappings: [],
    stopHotkey: '',
    windowBounds: { width: 1400, height: 900 }
  }
});

let mainWindow;
let globalHotkeysEnabled = true;
let registeredHotkeys = new Map();
let saveWindowBoundsTimeout = null;
let asioEngine = null;
let asioInitializing = false;

// Auto-initialize the Direct Audio engine on startup so it's always ready.
// Also pre-loads any sound mappings from the store so playback is instant.
async function autoInitDirectAudio() {
  if (asioInitializing) return;
  asioInitializing = true;
  try {
    asioEngine = new AsioAudioEngine();
    const device = asioEngine.findVoiceMeeterAsio();
    if (device) {
      const result = asioEngine.initialize();
      if (result.success) {
        console.log(`[DirectAudio] Auto-initialized: ${result.device} via ${result.mode} @ ${result.sampleRate}Hz`);

        // Notify renderer when ASIO stream is lost so it can show status
        asioEngine.onStreamLost((reason) => {
          console.error(`[DirectAudio] Stream lost: ${reason}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asio:stream-lost', reason);
          }
        });

        // Pre-load sounds from store so they're ready before renderer loads
        const audioMode = store.get('audio-output-mode');
        if (audioMode === 'asio') {
          const mappings = store.get('soundpad-mappings', []);
          if (Array.isArray(mappings) && mappings.length > 0) {
            console.log(`[DirectAudio] Pre-loading ${mappings.length} sounds...`);
            for (const [, filePath] of mappings) {
              if (typeof filePath === 'string') {
                try {
                  await asioEngine.loadSound(filePath);
                } catch (err) {
                  console.error(`[DirectAudio] Pre-load failed: ${filePath}:`, err.message);
                }
              }
            }
            console.log(`[DirectAudio] Pre-loaded ${asioEngine._soundCache.size} sounds`);
          }
        }
      } else {
        console.error('[DirectAudio] Auto-init failed:', result.error);
        asioEngine = null;
      }
    } else {
      console.log('[DirectAudio] VoiceMeeter AUX device not found, skipping auto-init');
      asioEngine = null;
    }
  } catch (err) {
    console.error('[DirectAudio] Auto-init error:', err.message);
    asioEngine = null;
  } finally {
    asioInitializing = false;
  }
}

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
      backgroundThrottling: false  // Keep gamepad polling active when unfocused
    },
    backgroundColor: '#1a1a1a'
  });
  
  // Debounced window bounds save - only saves 500ms after last resize/move
  function saveWindowBounds() {
    if (saveWindowBoundsTimeout) {
      clearTimeout(saveWindowBoundsTimeout);
    }
    saveWindowBoundsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized() && !mainWindow.isMinimized()) {
        store.set('windowBounds', mainWindow.getBounds());
      }
    }, 500);
  }

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3005');
  } else {
    // Clear cached code to ensure latest build is loaded
    session.defaultSession.clearCache().then(() => {
      mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    });
  }

  mainWindow.on('closed', () => {
    if (saveWindowBoundsTimeout) {
      clearTimeout(saveWindowBoundsTimeout);
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Grant only permissions the app needs (audio output device selection and media)
  const allowedPermissions = new Set(['speaker-selection', 'media', 'audioCapture']);
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return allowedPermissions.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  // Auto-init direct audio engine before creating window
  autoInitDirectAudio().then(() => {
    console.log('[Startup] Direct audio init complete');
  }).catch(err => {
    console.error('[Startup] Direct audio init error:', err.message);
  });

  createWindow();

  // HID gamepad disabled - Windows DirectInput blocks raw HID access
  // To re-enable, uncomment the HIDGamepad import and the code below:
  // hidGamepad = new HIDGamepad((buttonStates) => {
  //   if (mainWindow && !mainWindow.isDestroyed()) {
  //     mainWindow.webContents.send('hid-gamepad-state', buttonStates);
  //   }
  // });
  // hidGamepad.connect();

  // No default global stop hotkey - user can configure in settings
});

app.on('window-all-closed', () => {
  // Unregister all shortcuts when app is closing
  globalShortcut.unregisterAll();
  // HID gamepad cleanup (currently disabled)
  // if (hidGamepad) {
  //   hidGamepad.destroy();
  //   hidGamepad = null;
  // }
  // ASIO engine cleanup
  if (asioEngine) {
    asioEngine.shutdown();
    asioEngine = null;
  }
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
    const filePath = result.filePaths[0];
    // Return the raw file path - it will be converted to URL in the renderer
    return {
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  }
  return null;
});

// Read audio file and return as buffer
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    // Get file extension for MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.opus': 'audio/opus',
      '.weba': 'audio/webm'
    };
    const mimeType = mimeTypes[ext] || 'audio/mpeg';

    return {
      buffer: buffer,
      mimeType: mimeType,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error reading audio file:', error);
    return { error: error.message };
  }
});

// Navigation handler for static export
ipcMain.handle('navigate', (event, route) => {
  if (mainWindow && !isDev) {
    // Split route from query string (e.g. '/onboarding?remap=true')
    const [pathname, queryString] = route.split('?');
    const htmlFile = pathname === '/' ? 'index.html' : `${pathname}.html`;
    const filePath = path.join(__dirname, '../out', htmlFile);
    if (queryString) {
      mainWindow.loadFile(filePath, { query: Object.fromEntries(new URLSearchParams(queryString)) });
    } else {
      mainWindow.loadFile(filePath);
    }
  }
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

// Audio diagnostics - write to file for debugging
ipcMain.handle('write-audio-diag', async (event, data) => {
  const diagPath = path.join(app.getPath('userData'), 'audio-diag.log');
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${data}\n`;
  await fs.appendFile(diagPath, line);
  return diagPath;
});

// --- ASIO Audio Engine IPC Handlers ---

ipcMain.handle('asio:get-devices', async () => {
  try {
    const engine = new AsioAudioEngine();
    return { success: true, devices: engine.getAsioDevices() };
  } catch (err) {
    return { success: false, error: err.message, devices: [] };
  }
});

ipcMain.handle('asio:initialize', async (event, deviceId) => {
  if (asioInitializing) {
    return { success: false, error: 'ASIO initialization already in progress' };
  }
  asioInitializing = true;
  try {
    if (!asioEngine) {
      asioEngine = new AsioAudioEngine();
    }
    const result = asioEngine.initialize(deviceId);
    console.log('[IPC] asio:initialize result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[IPC] asio:initialize error:', err.message);
    return { success: false, error: err.message };
  } finally {
    asioInitializing = false;
  }
});

ipcMain.handle('asio:status', async () => {
  if (!asioEngine || !asioEngine.isInitialized()) {
    return { initialized: false };
  }
  return {
    initialized: true,
    device: asioEngine._deviceName,
    sampleRate: asioEngine._sampleRate,
    channels: asioEngine._channels,
    cachedSounds: asioEngine._soundCache.size,
    activeVoices: asioEngine._activeVoices.size,
    healthy: asioEngine.isStreamHealthy()
  };
});

ipcMain.handle('asio:reconnect', async () => {
  try {
    if (!asioEngine) {
      // Engine doesn't exist, do a full init
      asioEngine = new AsioAudioEngine();
      const result = asioEngine.initialize();
      if (result.success) {
        asioEngine.onStreamLost((reason) => {
          console.error(`[DirectAudio] Stream lost: ${reason}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asio:stream-lost', reason);
          }
        });
      }
      return result;
    }
    const result = asioEngine.reconnect();
    if (result.success && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('asio:stream-recovered', result.device);
    }
    return result;
  } catch (err) {
    console.error('[IPC] asio:reconnect error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:shutdown', async () => {
  try {
    if (asioEngine) {
      const result = asioEngine.shutdown();
      asioEngine = null;
      return result;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:load-sound', async (event, filePath) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      console.error('[IPC] asio:load-sound called but engine not initialized');
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = await asioEngine.loadSound(filePath);
    console.log(`[IPC] asio:load-sound ${filePath}: ${result.success ? 'OK' : result.error}`);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:load-sound ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:unload-sound', async (event, filePath) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.unloadSound(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:cache-pcm', async (event, filePath, pcmData) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = asioEngine.cachePcm(filePath, pcmData);
    console.log(`[IPC] asio:cache-pcm ${filePath}: ${result.success ? 'OK' : result.error} (${result.samples || 0} samples)`);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:cache-pcm ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:play-sound', async (event, filePath, options) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = asioEngine.playSound(filePath, options);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:play-sound ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:stop-sound', async (event, filePath) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.stopSound(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:stop-all', async () => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.stopAll();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:set-volume', async (event, filePath, volume) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.setVolume(filePath, volume);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:set-master-volume', async (event, volume) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.setMasterVolume(volume);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:test-tone', async () => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'Engine not initialized' };
    }
    const result = asioEngine.playTestTone();
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:diag', async () => {
  if (!asioEngine) return { engine: null };
  return {
    initialized: asioEngine.isInitialized(),
    device: asioEngine._deviceName,
    sampleRate: asioEngine._sampleRate,
    framesPerBuffer: asioEngine._framesPerBuffer,
    cachedSounds: Array.from(asioEngine._soundCache.keys()),
    cachedSoundDetails: Array.from(asioEngine._soundCache.entries()).map(([k, v]) => ({
      key: k,
      length: v.length,
      channels: v.channels,
      sampleRate: v.sampleRate,
      maxAmp: Math.max(...Array.from(v.pcm[0].slice(0, 1000)).map(Math.abs))
    })),
    activeVoices: Array.from(asioEngine._activeVoices.entries()).map(([k, v]) => ({
      key: k,
      voices: v.map(voice => ({ cursor: voice.cursor, volume: voice.volume, loop: voice.loop }))
    })),
    masterVolume: asioEngine._masterVolume
  };
});

// --- GP2040-CE Controller Config IPC Handlers ---

ipcMain.handle('gp2040:check-connection', async () => {
  return gp2040api.checkConnection();
});

ipcMain.handle('gp2040:get-pin-mappings', async () => {
  return gp2040api.getPinMappings();
});

ipcMain.handle('gp2040:set-pin-mappings', async (event, mappings) => {
  return gp2040api.setPinMappings(mappings);
});

ipcMain.handle('gp2040:get-gamepad-options', async () => {
  return gp2040api.getGamepadOptions();
});

ipcMain.handle('gp2040:set-gamepad-options', async (event, options) => {
  return gp2040api.setGamepadOptions(options);
});

ipcMain.handle('gp2040:get-addons-options', async () => {
  return gp2040api.getAddonsOptions();
});

// Analyze controller mappings (placeholder — returns the mappings unchanged)
ipcMain.handle('gp2040:analyze-mappings', async (event, mappings) => {
  return { success: true, mappings };
});

// Log errors from renderer process
ipcMain.handle('log-error', async (event, errorData) => {
  const timestamp = new Date().toISOString();
  console.error(`[Renderer Error ${timestamp}]`, errorData.message || errorData);
  if (errorData.stack) console.error(errorData.stack);
  // Also write to error log file
  const logPath = path.join(app.getPath('userData'), 'error.log');
  const line = `[${timestamp}] ${errorData.message || JSON.stringify(errorData)}\n${errorData.stack || ''}\n${errorData.componentStack || ''}\n---\n`;
  await fs.appendFile(logPath, line).catch(() => {});
  return { success: true };
});

ipcMain.handle('gp2040:get-raw-api', async (event, endpoint) => {
  // Generic endpoint fetcher for debugging
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '192.168.7.1', port: 80, path: endpoint, timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ success: true, data: JSON.parse(data) }); }
        catch { resolve({ success: true, data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
  });
});