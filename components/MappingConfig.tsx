import React, { useState, useEffect, useRef } from 'react'
import { isValidAudioFile, extractFilename, createAudioMetadata, formatFileSize } from '../utils/audioUtils'

interface MappingConfigProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  onMapSound: (buttonIndex: number, audioFile: string) => void
}

export const MappingConfig: React.FC<MappingConfigProps> = ({
  buttonStates,
  soundMappings,
  onMapSound
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
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Configure Button Mappings</h2>
      
      <div className="mb-6">
        <button
          onClick={() => setListeningForButton(true)}
          className={`
            px-6 py-3 rounded-lg font-medium transition-all
            ${listeningForButton 
              ? 'bg-yellow-600 animate-pulse' 
              : 'bg-purple-600 hover:bg-purple-700'
            }
          `}
        >
          {listeningForButton 
            ? 'Press a controller button...' 
            : 'Click to map a button'
          }
        </button>

        {selectedButton !== null && (
          <div className="mt-4 p-4 bg-gray-700 rounded-lg">
            <p className="mb-2">Selected Button: <strong>{selectedButton + 1}</strong></p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleWebFileSelect}
              className="hidden"
            />
            <button
              onClick={handleFileSelect}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition"
            >
              Choose Audio File
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium mb-2">Current Mappings</h3>
        <div className="max-h-96 overflow-y-auto">
          {Array.from({ length: 16 }, (_, i) => {
            const mapping = soundMappings.get(i)
            if (!mapping) return null

            return (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium bg-gray-600 px-2 py-1 rounded">
                    Button {i + 1}
                  </span>
                  <span className="text-sm text-gray-300">
                    {getSoundName(mapping)}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveMapping(i)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition"
                >
                  Remove
                </button>
              </div>
            )
          }).filter(Boolean)}
        </div>
        {soundMappings.size === 0 && (
          <p className="text-gray-400 text-center py-4">No mappings configured yet</p>
        )}
      </div>
    </div>
  )
}