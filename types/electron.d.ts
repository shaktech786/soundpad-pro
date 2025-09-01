interface ElectronAPI {
  getAudioDevices: () => Promise<any>
  setupVirtualAudio: () => Promise<any>
  getControllers: () => Promise<any>
  
  // File dialog
  selectAudioFile: () => Promise<{
    filePath: string
    fileName: string
  } | null>
  
  // Store management for persistent data
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, value: any) => Promise<boolean>
  storeDelete: (key: string) => Promise<boolean>
  storeClear: () => Promise<boolean>
  
  // Global hotkey management
  registerHotkey: (key: string, buttonIndex: number) => Promise<any>
  unregisterHotkey: (key: string) => Promise<any>
  toggleGlobalHotkeys: (enabled: boolean) => Promise<any>
  getRegisteredHotkeys: () => Promise<any>
  
  // Event listeners
  onHotkeyTriggered: (callback: (buttonIndex: number) => void) => void
  onGlobalStopAudio: (callback: () => void) => void
  
  // Cleanup
  removeAllListeners: () => void
  
  // Logging
  logError: (error: { message: string; stack?: string; details?: any; componentStack?: string }) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}