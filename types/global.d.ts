declare global {
  interface Window {
    process?: any
    electronAPI?: {
      selectAudioFile: () => Promise<{ filePath: string; fileName: string }>
      getAudioDevices: () => Promise<any>
      setupVirtualAudio: () => Promise<any>
      storeGet: (key: string) => Promise<any>
      storeSet: (key: string, value: any) => Promise<void>
      toggleGlobalHotkeys: (enabled: boolean) => Promise<void>
      registerHotkey: (key: string, buttonIndex: number) => Promise<{ success: boolean }>
      unregisterHotkey: (key: string) => Promise<void>
      logError: (error: any) => void
      onHotkeyTriggered: (callback: (buttonIndex: number) => void) => void
      onGlobalStopAudio: (callback: () => void) => void
      removeAllListeners: () => void
    }
  }
}

export {}