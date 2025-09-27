import React, { useState, useEffect, useRef } from 'react'
import { isValidAudioFile, extractFilename, createAudioMetadata, formatFileSize } from '../utils/audioUtils'

interface MappingConfigProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  onMapSound: (buttonIndex: number, audioFile: string) => void
  controllerButtonCount?: number
}

export const MappingConfig: React.FC<MappingConfigProps> = ({
  buttonStates,
  soundMappings,
  onMapSound,
  controllerButtonCount = 16
}) => {
  const [selectedButton, setSelectedButton] = useState<number | null>(null)
  const [listeningForButton, setListeningForButton] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Listen for controller button press
  useEffect(() => {
    if (!listeningForButton) return

    const pressedButton = Array.from(buttonStates.entries()).find(([_, pressed]) => pressed)
    if (pressedButton) {
      setSelectedButton(pressedButton[0])
      setListeningForButton(false)
    }
  }, [buttonStates, listeningForButton])

  const handleFileSelect = async () => {
    if (selectedButton === null) return
    
    // Check if button already has a mapping
    const existingMapping = soundMappings.get(selectedButton)
    if (existingMapping) {
      const existingName = extractFilename(existingMapping)
      const confirmed = window.confirm(
        `Button ${selectedButton + 1} is already mapped to "${existingName}".\n\nReplace with a new sound?`
      )
      if (!confirmed) {
        setSelectedButton(null)
        return
      }
    }
    
    // Use Electron's native file dialog if available
    if (typeof window !== 'undefined' && window.electronAPI?.selectAudioFile) {
      try {
        const result = await window.electronAPI.selectAudioFile()
        if (result && result.filePath) {
          // Store the actual file path with metadata
          const filePathWithName = createAudioMetadata(result.filePath, result.fileName)
          onMapSound(selectedButton, filePathWithName)
          setSelectedButton(null)
          console.log('Selected file:', result.filePath)
        }
      } catch (error) {
        console.error('Error selecting file:', error)
        alert('Failed to select audio file')
      }
    } else {
      // Fallback to HTML file input for web
      fileInputRef.current?.click()
    }
  }
  
  const handleWebFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedButton === null || !event.target.files?.[0]) return
    
    const file = event.target.files[0]
    
    // Validate file type using utility function
    if (!isValidAudioFile(file)) {
      console.error('Invalid file type:', file.type, file.name)
      alert(`Invalid audio file format.\nSupported formats: MP3, WAV, OGG, M4A, FLAC, WebM, AAC, OPUS`)
      if (event.target) event.target.value = ''
      return
    }
    
    // Check file size (warn if > 50MB)
    if (file.size > 50 * 1024 * 1024) {
      const proceed = window.confirm(
        `This file is ${formatFileSize(file.size)}.\nLarge files may take longer to load.\nContinue?`
      )
      if (!proceed) {
        if (event.target) event.target.value = ''
        return
      }
    }
    
    // Create object URL for the file (only for web fallback)
    const filePath = URL.createObjectURL(file)
    
    // Store with metadata using utility function
    const filePathWithName = createAudioMetadata(filePath, file.name)
    
    onMapSound(selectedButton, filePathWithName)
    setSelectedButton(null)
    
    // Reset file input
    if (event.target) {
      event.target.value = ''
    }
  }

  const handleRemoveMapping = (buttonIndex: number) => {
    // Remove by setting empty string
    onMapSound(buttonIndex, '')
  }

  const getSoundName = (filePath: string) => {
    if (!filePath) return 'Not mapped'
    return extractFilename(filePath)
  }

  return (
    <div className="bg-gray-900 rounded-xl p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Configure Button Mappings
        </h2>
        <div className="text-sm text-gray-400">
          {soundMappings.size} / 16 mapped
        </div>
      </div>

      <div className="mb-8">
        <div className="flex gap-4">
          <button
            onClick={() => setListeningForButton(true)}
            className={`
              px-8 py-4 rounded-xl font-semibold transition-all shadow-lg
              ${listeningForButton
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse shadow-orange-500/50'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-purple-500/30'
              }
            `}
          >
            {listeningForButton
              ? '🎮 Press a controller button...'
              : '🎵 Map a Sound to Button'
            }
          </button>

          {selectedButton === null && !listeningForButton && (
            <button
              onClick={() => {
                if (window.confirm('Clear all sound mappings?')) {
                  soundMappings.forEach((_, key) => handleRemoveMapping(key))
                }
              }}
              className="px-6 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition shadow-lg"
            >
              Clear All
            </button>
          )}
        </div>

        {selectedButton !== null && (
          <div className="mt-6 p-6 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg">
                  {selectedButton + 1}
                </div>
                <div>
                  <p className="text-sm text-gray-400">Selected Pad</p>
                  <p className="font-semibold">Button {selectedButton + 1}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedButton(null)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
              >
                Cancel
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleWebFileSelect}
              className="hidden"
            />
            <button
              onClick={handleFileSelect}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 rounded-xl font-semibold transition shadow-lg shadow-green-500/30"
            >
              📁 Choose Audio File
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>Current Mappings</span>
          <span className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">
            Sorted by button number
          </span>
        </h3>

        <div className="grid gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {Array.from(soundMappings.entries())
            .sort(([a], [b]) => a - b)
            .map(([i, mapping]) => {
            if (!mapping) return null

            // Color code by row like in the pad display
            const row = Math.floor(i / 4)
            const rowColors = [
              'from-blue-600/20 to-blue-700/20 border-blue-500/30',
              'from-green-600/20 to-green-700/20 border-green-500/30',
              'from-yellow-600/20 to-yellow-700/20 border-yellow-500/30',
              'from-red-600/20 to-red-700/20 border-red-500/30'
            ]

            return (
              <div
                key={i}
                className={`flex items-center justify-between p-4 bg-gradient-to-r ${rowColors[row % 4]} border rounded-xl backdrop-blur-sm`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-900/50 rounded-lg flex items-center justify-center font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <span className="font-medium text-white">
                      {getSoundName(mapping)}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">Pad {i + 1}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMapping(i)}
                  className="px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-sm font-medium transition shadow-sm"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>

        {soundMappings.size === 0 && (
          <div className="text-center py-12 bg-gray-800/50 rounded-xl">
            <p className="text-gray-400">No sound mappings configured</p>
            <p className="text-sm text-gray-500 mt-2">Press the button above to start mapping sounds</p>
          </div>
        )}
      </div>
    </div>
  )
}