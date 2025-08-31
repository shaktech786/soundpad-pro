import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import { SoundPad } from '../components/SoundPad'
import { ControllerDisplay } from '../components/ControllerDisplay'
import { useGamepad } from '../hooks/useGamepad'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { MappingConfig } from '../components/MappingConfig'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { Settings } from '../components/Settings'
import { ControllerSelector } from '../components/ControllerSelector'

export default function Home() {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedControllerIndex, setSelectedControllerIndex] = useState(0)
  const [soundMappings, setSoundMappings] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )
  const { controllers, buttonStates } = useGamepad()
  const { playSound, loadSound, stopAll } = useAudioEngine()
  
  // Get the selected controller
  const selectedController = controllers[selectedControllerIndex] || controllers[0]

  useEffect(() => {
    // Initialize virtual audio output
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.setupVirtualAudio().then((result: any) => {
        console.log('Virtual audio setup:', result)
      })
      
      // Listen for global hotkey events
      window.electronAPI.onHotkeyTriggered((buttonIndex: number) => {
        const soundFile = soundMappings.get(buttonIndex)
        if (soundFile) {
          playSound(soundFile)
        }
      })
      
      // Listen for global stop command
      window.electronAPI.onGlobalStopAudio(() => {
        stopAll()
      })
    }
    
    // Reload all saved sound mappings
    soundMappings.forEach((audioFile) => {
      loadSound(audioFile)
    })
    
    // Cleanup listeners on unmount
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners()
      }
    }
  }, []) // Only run on mount

  // Handle controller button presses (only from selected controller)
  useEffect(() => {
    if (selectedController) {
      buttonStates.forEach((pressed, buttonIndex) => {
        if (pressed) {
          const soundFile = soundMappings.get(buttonIndex)
          if (soundFile) {
            playSound(soundFile)
          }
        }
      })
    }
  }, [buttonStates, soundMappings, playSound, selectedController])

  const handleSoundMapping = (buttonIndex: number, audioFile: string) => {
    setSoundMappings(prev => new Map(prev).set(buttonIndex, audioFile))
    loadSound(audioFile)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>SoundPad Pro - Professional Soundboard</title>
        <meta name="description" content="Professional soundboard with controller support" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="bg-gray-800 p-4 shadow-xl">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            SoundPad Pro
          </h1>
          <div className="flex items-center gap-4">
            <ControllerSelector
              controllers={controllers}
              selectedIndex={selectedControllerIndex}
              onSelect={setSelectedControllerIndex}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsConfiguring(!isConfiguring)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
              >
                {isConfiguring ? 'Done' : 'Configure'}
              </button>
              <button
                onClick={stopAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition flex items-center gap-2"
                title="Press ESC to stop all audio"
              >
                <span>Stop All</span>
                <kbd className="px-1 py-0.5 bg-red-700 rounded text-xs">ESC</kbd>
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controller Status */}
          <div className="lg:col-span-1">
            <ControllerDisplay 
              controllers={[selectedController].filter(Boolean)}
              buttonStates={buttonStates}
            />
          </div>

          {/* Sound Pad Grid */}
          <div className="lg:col-span-2">
            {isConfiguring ? (
              <MappingConfig
                buttonStates={buttonStates}
                soundMappings={soundMappings}
                onMapSound={handleSoundMapping}
              />
            ) : (
              <SoundPad
                soundMappings={soundMappings}
                buttonStates={buttonStates}
                onPlaySound={playSound}
              />
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm text-gray-400">Status:</span>
              <span className="ml-2 text-green-400">
                {controllers.length > 0 ? `${controllers.length} Controller(s) Connected` : 'No Controllers'}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-400">Audio Output:</span>
              <span className="ml-2 text-blue-400">SoundPad Pro Virtual Audio</span>
            </div>
          </div>
        </div>
      </main>
      
      {/* Settings Modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        soundMappings={soundMappings}
      />
    </div>
  )
}