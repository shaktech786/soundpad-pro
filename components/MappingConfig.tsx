import React, { useState, useEffect, useRef } from 'react'

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedButton === null || !event.target.files?.[0]) return
    
    const file = event.target.files[0]
    const filePath = URL.createObjectURL(file)
    
    onMapSound(selectedButton, filePath)
    setSelectedButton(null)
  }

  const handleRemoveMapping = (buttonIndex: number) => {
    // Remove by setting empty string
    onMapSound(buttonIndex, '')
  }

  const getSoundName = (filePath: string) => {
    if (!filePath) return 'Not mapped'
    if (filePath.startsWith('blob:')) return 'Loaded sound'
    const parts = filePath.split(/[/\\]/)
    return parts[parts.length - 1]
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
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Choose Audio File
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium mb-2">Current Mappings</h3>
        {Array.from(soundMappings.entries()).length === 0 ? (
          <p className="text-gray-400">No mappings configured</p>
        ) : (
          <div className="space-y-2">
            {Array.from(soundMappings.entries()).map(([button, file]) => (
              <div 
                key={button}
                className="flex items-center justify-between p-3 bg-gray-700 rounded"
              >
                <div>
                  <span className="font-medium">Button {button + 1}: </span>
                  <span className="text-gray-300">{getSoundName(file)}</span>
                </div>
                <button
                  onClick={() => handleRemoveMapping(button)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-sm font-medium mb-2 text-gray-300">Instructions:</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>1. Click "Click to map a button"</li>
          <li>2. Press a button on your controller</li>
          <li>3. Select an audio file to map to that button</li>
          <li>4. The sound will play when you press that button</li>
        </ul>
      </div>
    </div>
  )
}