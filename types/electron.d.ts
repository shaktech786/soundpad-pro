interface ElectronAPI {
  getAudioDevices: () => Promise<any>
  setupVirtualAudio: () => Promise<any>
  getControllers: () => Promise<any>

  // Navigation for static export
  navigate: (route: string) => Promise<void>

  // File dialog
  selectAudioFile: () => Promise<{
    filePath: string
    fileName: string
  } | null>
  readAudioFile: (filePath: string) => Promise<{ buffer: Buffer; mimeType: string; fileName: string } | { error: string }>

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

  // HID stop button — raw-byte pattern captured from main's HID poller
  armHidStopCapture: () => Promise<{ success: boolean }>
  clearHidStopPattern: () => Promise<{ success: boolean }>
  hasHidStopPattern: () => Promise<{ success: boolean; present: boolean }>
  onHidStopCaptured: (callback: (snapshot: number[]) => void) => (() => void)
  // Legacy, no-op kept for backwards compatibility during rollout
  setHidStopButton: (buttonId: number | null) => Promise<{ success: boolean }>

  // Event listeners (return cleanup functions to remove the specific listener)
  onHotkeyTriggered: (callback: (buttonIndex: number) => void) => (() => void)
  onGlobalStopAudio: (callback: () => void) => (() => void)

  // Audio diagnostics
  writeAudioDiag: (data: string) => Promise<string>

  // ASIO Audio Engine
  asioGetDevices: () => Promise<{ success: boolean; devices: any[] }>
  asioInitialize: (deviceId?: string) => Promise<{ success: boolean; device?: string; mode?: string; sampleRate?: number; error?: string }>
  asioShutdown: () => Promise<{ success: boolean; error?: string }>
  asioStatus: () => Promise<any>
  asioLoadSound: (filePath: string) => Promise<{ success: boolean; error?: string }>
  asioCachePcm: (filePath: string, pcmData: any) => Promise<{ success: boolean; samples?: number; error?: string }>
  asioUnloadSound: (filePath: string) => Promise<{ success: boolean; error?: string }>
  asioPlaySound: (filePath: string, options?: { volume?: number; loop?: boolean; restart?: boolean }) => Promise<{ success: boolean; error?: string }>
  asioStopSound: (filePath: string) => Promise<{ success: boolean; error?: string }>
  asioStopAll: () => Promise<{ success: boolean; error?: string }>
  asioSetVolume: (filePath: string, volume: number) => Promise<{ success: boolean; error?: string }>
  asioSetMasterVolume: (volume: number) => Promise<{ success: boolean; error?: string }>
  asioTestTone: () => Promise<{ success: boolean; error?: string }>
  asioReconnect: () => Promise<{ success: boolean; device?: string; reconnected?: boolean; error?: string }>
  asioDiag: () => Promise<any>

  // ASIO stream health events
  onAsioStreamLost: (callback: (reason: string) => void) => (() => void)
  onAsioStreamRecovered: (callback: (device: string) => void) => (() => void)

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