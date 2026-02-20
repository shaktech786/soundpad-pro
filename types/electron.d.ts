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
  
  // GP2040-CE Controller Config
  gp2040CheckConnection: () => Promise<{ connected: boolean; version?: any; error?: string }>
  gp2040GetPinMappings: () => Promise<{ success: boolean; mappings?: Record<string, { pin: number; gamepadIndex: number | null }>; error?: string }>
  gp2040SetPinMappings: (mappings: Record<string, any>) => Promise<{ success: boolean; error?: string }>
  gp2040GetGamepadOptions: () => Promise<{ success: boolean; options?: any; error?: string }>
  gp2040SetGamepadOptions: (options: any) => Promise<{ success: boolean; error?: string }>
  gp2040GetAddonsOptions: () => Promise<{ success: boolean; options?: any; error?: string }>
  gp2040AnalyzeMappings: (mappings: Record<string, any>) => Promise<any>

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