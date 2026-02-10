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
  
  // Listen for hotkey events
  onHotkeyTriggered: (callback) => {
    ipcRenderer.on('hotkey-triggered', (event, buttonIndex) => callback(buttonIndex));
  },
  onGlobalStopAudio: (callback) => {
    ipcRenderer.on('global-stop-audio', () => callback());
  },

  // Listen for HID gamepad button states (works when window unfocused)
  onHIDGamepadState: (callback) => {
    ipcRenderer.on('hid-gamepad-state', (event, buttonStates) => callback(buttonStates));
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
  asioDiag: () => ipcRenderer.invoke('asio:diag'),

  // Cleanup listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('hotkey-triggered');
    ipcRenderer.removeAllListeners('global-stop-audio');
    ipcRenderer.removeAllListeners('hid-gamepad-state');
  }
});