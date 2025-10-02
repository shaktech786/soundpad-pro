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
  
  // Cleanup listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('hotkey-triggered');
    ipcRenderer.removeAllListeners('global-stop-audio');
  }
});