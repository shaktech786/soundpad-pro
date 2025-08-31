import React, { useState, useEffect } from 'react'
import { usePersistentStorage } from '../hooks/usePersistentStorage'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  soundMappings: Map<number, string>
}

interface HotkeyMapping {
  buttonIndex: number
  key: string
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, soundMappings }) => {
  const [globalHotkeysEnabled, setGlobalHotkeysEnabled] = usePersistentStorage('global-hotkeys-enabled', true)
  const [hotkeyMappings, setHotkeyMappings] = usePersistentStorage<HotkeyMapping[]>('hotkey-mappings', [])
  const [isRecording, setIsRecording] = useState<number | null>(null)
  const [stopHotkey, setStopHotkey] = usePersistentStorage('stop-hotkey', 'Escape')

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Apply saved hotkey settings on mount
      window.electronAPI.toggleGlobalHotkeys(globalHotkeysEnabled)
      
      // Register all saved hotkeys
      hotkeyMappings.forEach(({ key, buttonIndex }) => {
        window.electronAPI.registerHotkey(key, buttonIndex)
      })
    }
  }, [])

  const handleToggleGlobalHotkeys = async () => {
    const newValue = !globalHotkeysEnabled
    setGlobalHotkeysEnabled(newValue)
    
    if (window.electronAPI) {
      await window.electronAPI.toggleGlobalHotkeys(newValue)
    }
  }

  const handleRecordHotkey = (buttonIndex: number) => {
    setIsRecording(buttonIndex)
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const key = getKeyCombo(e)
      
      if (key && window.electronAPI) {
        // Register the hotkey
        window.electronAPI.registerHotkey(key, buttonIndex).then((result) => {
          if (result.success) {
            // Update mappings
            const newMappings = hotkeyMappings.filter(m => m.buttonIndex !== buttonIndex)
            newMappings.push({ buttonIndex, key })
            setHotkeyMappings(newMappings)
          }
        })
      }
      
      setIsRecording(null)
      document.removeEventListener('keydown', handleKeyDown)
    }
    
    document.addEventListener('keydown', handleKeyDown)
  }

  const handleRemoveHotkey = async (buttonIndex: number) => {
    const mapping = hotkeyMappings.find(m => m.buttonIndex === buttonIndex)
    if (mapping && window.electronAPI) {
      await window.electronAPI.unregisterHotkey(mapping.key)
      setHotkeyMappings(hotkeyMappings.filter(m => m.buttonIndex !== buttonIndex))
    }
  }

  const getKeyCombo = (e: KeyboardEvent): string => {
    const parts: string[] = []
    
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Meta')
    
    // Add the main key
    if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      // Map special keys
      const keyMap: Record<string, string> = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
      }
      
      const key = keyMap[e.key] || e.key.toUpperCase()
      parts.push(key)
    }
    
    return parts.join('+')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Global Hotkeys Toggle */}
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold">Global Hotkeys</h3>
              <p className="text-sm text-gray-400">
                Allow soundpad to capture keyboard shortcuts even when not in focus
              </p>
            </div>
            <button
              onClick={handleToggleGlobalHotkeys}
              className={`px-4 py-2 rounded transition ${
                globalHotkeysEnabled 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              {globalHotkeysEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          {globalHotkeysEnabled && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠ When enabled, registered hotkeys will override other applications
            </p>
          )}
        </div>

        {/* Stop All Hotkey */}
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Universal Stop Key</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Current:</span>
            <code className="px-2 py-1 bg-gray-600 rounded">{stopHotkey}</code>
            <span className="text-xs text-gray-400">(Press ESC to stop all audio)</span>
          </div>
        </div>

        {/* Hotkey Mappings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Button Hotkey Mappings</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Array.from(soundMappings.entries()).map(([buttonIndex, soundFile]) => {
              const mapping = hotkeyMappings.find(m => m.buttonIndex === buttonIndex)
              const filename = soundFile.split('/').pop() || soundFile
              
              return (
                <div key={buttonIndex} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Button {buttonIndex}:</span>
                    <span className="text-xs text-gray-400 truncate max-w-[200px]">{filename}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {mapping ? (
                      <>
                        <code className="px-2 py-1 bg-gray-600 rounded text-sm">{mapping.key}</code>
                        <button
                          onClick={() => handleRemoveHotkey(buttonIndex)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleRecordHotkey(buttonIndex)}
                        className={`px-3 py-1 rounded text-sm transition ${
                          isRecording === buttonIndex
                            ? 'bg-yellow-600 animate-pulse'
                            : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                      >
                        {isRecording === buttonIndex ? 'Press a key...' : 'Set Hotkey'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {soundMappings.size === 0 && (
              <p className="text-center text-gray-400 py-4">
                No sound mappings configured yet
              </p>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>• Hotkeys work globally when the app is running</p>
          <p>• Use Ctrl, Alt, Shift modifiers for complex shortcuts</p>
          <p>• Conflicting hotkeys with other apps will be overridden</p>
        </div>
      </div>
    </div>
  )
}