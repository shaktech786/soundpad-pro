const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  setupVirtualAudio: () => ipcRenderer.invoke('setup-virtual-audio'),
  getControllers: () => ipcRenderer.invoke('get-controllers'),

  // Navigation for static export
  navigate: (route) => ipcRenderer.invoke('navigate', route),

  // File system access for audio files
  selectAudioFile: async () => {
    const result = await ipcRenderer.invoke('dialog:openFile');
    return result;
  },
  readAudioFile: async (filePath) => {
    const result = await ipcRenderer.invoke('read-audio-file', filePath);
    return result;
  },

  // Store management for persistent data
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  storeClear: () => ipcRenderer.invoke('store:clear'),
  
  // Global hotkey management
  registerHotkey: (key, buttonIndex) => ipcRenderer.invoke('register-hotkey', { key, buttonIndex }),
  unregisterHotkey: (key) => ipcRenderer.invoke('unregister-hotkey', key),
  toggleGlobalHotkeys: (enabled) => ipcRenderer.invoke('toggle-global-hotkeys', enabled),
  getRegisteredHotkeys: () => ipcRenderer.invoke('get-registered-hotkeys'),
  
  // Listen for hotkey events (returns cleanup function to avoid listener leaks)
  onHotkeyTriggered: (callback) => {
    const handler = (event, buttonIndex) => callback(buttonIndex);
    ipcRenderer.on('hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('hotkey-triggered', handler);
  },
  onGlobalStopAudio: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('global-stop-audio', handler);
    return () => ipcRenderer.removeListener('global-stop-audio', handler);
  },

  // Listen for HID gamepad button states (works when window unfocused)
  onHIDGamepadState: (callback) => {
    const handler = (event, buttonStates) => callback(buttonStates);
    ipcRenderer.on('hid-gamepad-state', handler);
    return () => ipcRenderer.removeListener('hid-gamepad-state', handler);
  },

  // Audio diagnostics
  writeAudioDiag: (data) => ipcRenderer.invoke('write-audio-diag', data),

  // ASIO Audio Engine
  asioGetDevices: () => ipcRenderer.invoke('asio:get-devices'),
  asioInitialize: (deviceId) => ipcRenderer.invoke('asio:initialize', deviceId),
  asioShutdown: () => ipcRenderer.invoke('asio:shutdown'),
  asioStatus: () => ipcRenderer.invoke('asio:status'),
  asioLoadSound: (filePath) => ipcRenderer.invoke('asio:load-sound', filePath),
  asioCachePcm: (filePath, pcmData) => ipcRenderer.invoke('asio:cache-pcm', filePath, pcmData),
  asioUnloadSound: (filePath) => ipcRenderer.invoke('asio:unload-sound', filePath),
  asioPlaySound: (filePath, options) => ipcRenderer.invoke('asio:play-sound', filePath, options),
  asioStopSound: (filePath) => ipcRenderer.invoke('asio:stop-sound', filePath),
  asioStopAll: () => ipcRenderer.invoke('asio:stop-all'),
  asioSetVolume: (filePath, volume) => ipcRenderer.invoke('asio:set-volume', filePath, volume),
  asioSetMasterVolume: (volume) => ipcRenderer.invoke('asio:set-master-volume', volume),
  asioTestTone: () => ipcRenderer.invoke('asio:test-tone'),
  asioReconnect: () => ipcRenderer.invoke('asio:reconnect'),
  asioDiag: () => ipcRenderer.invoke('asio:diag'),

  // ASIO stream health events (returns cleanup function)
  onAsioStreamLost: (callback) => {
    const handler = (event, reason) => callback(reason);
    ipcRenderer.on('asio:stream-lost', handler);
    return () => ipcRenderer.removeListener('asio:stream-lost', handler);
  },
  onAsioStreamRecovered: (callback) => {
    const handler = (event, device) => callback(device);
    ipcRenderer.on('asio:stream-recovered', handler);
    return () => ipcRenderer.removeListener('asio:stream-recovered', handler);
  },

  // GP2040-CE Controller Config
  gp2040CheckConnection: () => ipcRenderer.invoke('gp2040:check-connection'),
  gp2040GetPinMappings: () => ipcRenderer.invoke('gp2040:get-pin-mappings'),
  gp2040SetPinMappings: (mappings) => ipcRenderer.invoke('gp2040:set-pin-mappings', mappings),
  gp2040GetGamepadOptions: () => ipcRenderer.invoke('gp2040:get-gamepad-options'),
  gp2040SetGamepadOptions: (options) => ipcRenderer.invoke('gp2040:set-gamepad-options', options),
  gp2040GetAddonsOptions: () => ipcRenderer.invoke('gp2040:get-addons-options'),
  gp2040AnalyzeMappings: (mappings) => ipcRenderer.invoke('gp2040:analyze-mappings', mappings),

  // Logging
  logError: (error) => ipcRenderer.invoke('log-error', error),

  // Cleanup listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('hotkey-triggered');
    ipcRenderer.removeAllListeners('global-stop-audio');
    ipcRenderer.removeAllListeners('hid-gamepad-state');
    ipcRenderer.removeAllListeners('asio:stream-lost');
    ipcRenderer.removeAllListeners('asio:stream-recovered');
  }
});