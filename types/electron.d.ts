export interface IElectronAPI {
  getAudioDevices: () => Promise<any>
  setupVirtualAudio: () => Promise<{ success: boolean; deviceName: string }>
  getControllers: () => Promise<{ enabled: boolean }>
  selectAudioFile: () => Promise<string | null>
  saveConfig: (config: any) => Promise<void>
  loadConfig: () => Promise<any>
  
  // Global hotkey management
  registerHotkey: (key: string, buttonIndex: number) => Promise<{
    success: boolean
    key?: string
    buttonIndex?: number
    error?: string
  }>
  unregisterHotkey: (key: string) => Promise<{ success: boolean; error?: string }>
  toggleGlobalHotkeys: (enabled: boolean) => Promise<{ enabled: boolean }>
  getRegisteredHotkeys: () => Promise<Array<{ key: string; buttonIndex: number }>>
  
  // Event listeners
  onHotkeyTriggered: (callback: (buttonIndex: number) => void) => void
  onGlobalStopAudio: (callback: () => void) => void
  removeAllListeners: () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}