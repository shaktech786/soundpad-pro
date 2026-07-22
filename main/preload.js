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
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:listDirectory', dirPath),
  getDefaultAudioDir: () => ipcRenderer.invoke('fs:getDefaultAudioDir'),

  // Store management for persistent data
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  storeClear: () => ipcRenderer.invoke('store:clear'),
  
  // HID stop button — raw-byte pattern match, captured when user assigns the button
  armHidStopCapture: () => ipcRenderer.invoke('arm-hid-stop-capture'),
  clearHidStopPattern: () => ipcRenderer.invoke('clear-hid-stop-pattern'),
  hasHidStopPattern: () => ipcRenderer.invoke('has-hid-stop-pattern'),
  onHidStopCaptured: (callback) => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('hid-stop-captured', handler);
    return () => ipcRenderer.removeListener('hid-stop-captured', handler);
  },
  // Legacy — kept so any in-flight renderer code doesn't throw
  setHidStopButton: (buttonId) => ipcRenderer.invoke('set-hid-stop-button', buttonId),

  // HID controller input — the primary (and only) gamepad path. Decoded in the
  // main process so it keeps firing while another app holds foreground focus.
  hidGetState: () => ipcRenderer.invoke('hid:get-state'),
  onHidButtons: (callback) => {
    const handler = (_event, buttonIds) => callback(buttonIds);
    ipcRenderer.on('hid-buttons-changed', handler);
    return () => ipcRenderer.removeListener('hid-buttons-changed', handler);
  },
  onHidConnectionChanged: (callback) => {
    const handler = (_event, connected) => callback(connected);
    ipcRenderer.on('hid-connection-changed', handler);
    return () => ipcRenderer.removeListener('hid-connection-changed', handler);
  },

  // Calibration (used by the /calibrate page only)
  hidGetCalibration: () => ipcRenderer.invoke('hid:get-calibration'),
  hidSetCalibration: (overrides) => ipcRenderer.invoke('hid:set-calibration', overrides),
  hidClearCalibration: () => ipcRenderer.invoke('hid:clear-calibration'),
  onHidRawReport: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('hid-raw-report', handler);
    return () => ipcRenderer.removeListener('hid-raw-report', handler);
  },

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

  // Now-playing broadcast: renderer reports which WDM (Howler) sounds are
  // playing so the main process can expose them on the local HTTP server
  notifyWdmPlaying: (filePaths) => ipcRenderer.send('audio:wdm-playing', filePaths),

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

  // Discord RPC (connection + OAuth handshake)
  discordConnect: () => ipcRenderer.invoke('discord:connect'),
  discordDisconnect: () => ipcRenderer.invoke('discord:disconnect'),
  discordStatus: () => ipcRenderer.invoke('discord:status'),
  discordGetConfig: () => ipcRenderer.invoke('discord:get-config'),
  discordSetVoiceSettings: (settings) => ipcRenderer.invoke('discord:set-voice-settings', settings),
  discordGetVoiceSettings: () => ipcRenderer.invoke('discord:get-voice-settings'),
  discordSetActivity: (activity) => ipcRenderer.invoke('discord:set-activity', activity),
  discordRefreshActivity: (enabled) => ipcRenderer.invoke('discord:refresh-activity', enabled),
  onDiscordStatusChanged: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('discord:status-changed', handler);
    return () => ipcRenderer.removeListener('discord:status-changed', handler);
  },
  onDiscordVoiceStateChanged: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('discord:voice-state-changed', handler);
    return () => ipcRenderer.removeListener('discord:voice-state-changed', handler);
  },

  // Prelive API-key pairing (games:read history → highest-priority game tier)
  preliveSetApiKey: (apiKey) => ipcRenderer.invoke('prelive:set-api-key', apiKey),
  preliveGetStatus: () => ipcRenderer.invoke('prelive:get-status'),
  preliveDisconnect: () => ipcRenderer.invoke('prelive:disconnect'),
  onPreliveStatusChanged: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('prelive:status-changed', handler);
    return () => ipcRenderer.removeListener('prelive:status-changed', handler);
  },

  // Auto-updater (silent background download, user-gated install)
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
  onAppUpdateStatusChanged: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('app:update-status', handler);
    return () => ipcRenderer.removeListener('app:update-status', handler);
  },

  // Logging
  logError: (error) => ipcRenderer.invoke('log-error', error),

  // Cleanup listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('hotkey-triggered');
    ipcRenderer.removeAllListeners('global-stop-audio');
    ipcRenderer.removeAllListeners('hid-stop-captured');
    ipcRenderer.removeAllListeners('hid-buttons-changed');
    ipcRenderer.removeAllListeners('hid-connection-changed');
    ipcRenderer.removeAllListeners('hid-raw-report');
    ipcRenderer.removeAllListeners('asio:stream-lost');
    ipcRenderer.removeAllListeners('asio:stream-recovered');
    ipcRenderer.removeAllListeners('discord:status-changed');
    ipcRenderer.removeAllListeners('discord:voice-state-changed');
    ipcRenderer.removeAllListeners('prelive:status-changed');
    ipcRenderer.removeAllListeners('app:update-status');
  }
});