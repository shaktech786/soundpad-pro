import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import { extractAudioUrl } from '../utils/audioUtils'
import { SoundPad } from '../components/SoundPad'
import { ControllerDisplay } from '../components/ControllerDisplay'
import { useGamepad } from '../hooks/useGamepadOptimized'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { MappingConfig } from '../components/MappingConfig'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { Settings } from '../components/Settings'
import { ControllerSelector } from '../components/ControllerSelector'
import { ControllerDiagnostics } from '../components/ControllerDiagnostics'
import { ControllerTest } from '../components/ControllerTest'
import { PerformanceMonitor } from '../components/PerformanceMonitor'
import { AudioStatus } from '../components/AudioStatus'
import logger from '../utils/logger'

export default function Home() {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedControllerIndex, setSelectedControllerIndex] = useState(0)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showControllerTest, setShowControllerTest] = useState(false)
  const [showPerformance, setShowPerformance] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [soundMappings, setSoundMappings] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )
  const [stopButtonIndex, setStopButtonIndex] = usePersistentStorage<number | null>(
    'soundpad-stop-button',
    null
  )
  const { controllers, buttonStates } = useGamepad()
  const { playSound, loadSound, unloadSound, stopAll, isLoading, loadErrors, loadedSounds } = useAudioEngine()
  
  // Get the selected controller
  const selectedController = controllers[selectedControllerIndex] || controllers[0]

  // Add keyboard shortcuts for diagnostics and test mode
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        setShowDiagnostics(prev => !prev)
      }
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        setShowControllerTest(prev => !prev)
      }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        setShowPerformance(prev => !prev)
      }
    }
    
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [])

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsInitializing(true)
        setInitError(null)
        
        // Initialize virtual audio output
        if (typeof window !== 'undefined' && window.electronAPI) {
          try {
            const result = await window.electronAPI.setupVirtualAudio()
            logger.info('Virtual audio setup:', result)
          } catch (error) {
            logger.error('Failed to setup virtual audio:', error)
            setInitError('Failed to initialize virtual audio')
          }
          
          // Listen for global hotkey events
          window.electronAPI.onHotkeyTriggered((buttonIndex: number) => {
            const soundFile = soundMappings.get(buttonIndex)
            if (soundFile) {
              const actualUrl = extractAudioUrl(soundFile)
              playSound(actualUrl)
            }
          })
          
          // Listen for global stop command
          window.electronAPI.onGlobalStopAudio(() => {
            stopAll()
          })
        }
        
        // Reload all saved sound mappings
        const loadPromises: Promise<void>[] = []
        soundMappings.forEach((audioFile) => {
          const actualUrl = extractAudioUrl(audioFile)
          logger.debug('Loading saved sound:', actualUrl)
          loadPromises.push(
            loadSound(actualUrl).catch(err => {
              logger.error('Failed to load saved sound:', err)
            })
          )
        })
        
        await Promise.allSettled(loadPromises)
      } catch (error) {
        logger.error('Initialization error:', error)
        setInitError('Failed to initialize application')
      } finally {
        setIsInitializing(false)
      }
    }
    
    initializeApp()
    
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
          // Check if this is the stop button
          if (stopButtonIndex !== null && buttonIndex === stopButtonIndex) {
            stopAll()
            return
          }
          
          // Otherwise play the mapped sound
          const soundFile = soundMappings.get(buttonIndex)
          if (soundFile) {
            const actualUrl = extractAudioUrl(soundFile)
            playSound(actualUrl)
          }
        }
      })
    }
  }, [buttonStates, soundMappings, playSound, selectedController, stopButtonIndex, stopAll])

  const handleSoundMapping = (buttonIndex: number, audioFile: string) => {
    if (!audioFile) {
      // Remove mapping
      setSoundMappings(prev => {
        const newMap = new Map(prev)
        // Get the old file to unload it from audio engine
        const oldFile = prev.get(buttonIndex)
        if (oldFile) {
          const oldUrl = extractAudioUrl(oldFile)
          unloadSound(oldUrl)
          logger.debug('Removed mapping for button:', buttonIndex, oldUrl)
        }
        newMap.delete(buttonIndex)
        return newMap
      })
    } else {
      // Add/update mapping
      setSoundMappings(prev => {
        const newMap = new Map(prev)
        // Check if there's an existing mapping to replace
        const oldFile = prev.get(buttonIndex)
        if (oldFile) {
          const oldUrl = extractAudioUrl(oldFile)
          const newUrl = extractAudioUrl(audioFile)
          
          // If it's the same file being re-selected, force reload it
          // Otherwise, unload the old one first
          if (oldUrl === newUrl) {
            logger.debug('Force reloading same file:', oldUrl)
            // Force reload will be handled below
          } else {
            logger.debug('Replacing sound:', oldUrl, 'with:', newUrl)
            unloadSound(oldUrl)
          }
        }
        newMap.set(buttonIndex, audioFile)
        return newMap
      })
      
      // Load the new sound (with force reload if it's already loaded)
      const actualUrl = extractAudioUrl(audioFile)
      const forceReload = loadedSounds.includes(actualUrl)
      loadSound(actualUrl, forceReload).catch(err => {
        logger.error('Failed to load sound:', err)
        alert('Failed to load audio file. Please try a different file.')
      })
    }
  }

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
          </div>
          <h2 className="text-xl font-semibold mb-2">Initializing SoundPad Pro...</h2>
          <p className="text-gray-400">Loading your saved sounds and settings</p>
        </div>
      </div>
    )
  }
  
  // Show error screen if initialization failed
  if (initError) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 text-red-400">
            <svg className="inline-block w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Initialization Error</h2>
          <p className="text-gray-400 mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            Retry
          </button>
        </div>
      </div>
    )
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
              <button
                onClick={() => setShowControllerTest(true)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                title="Test controller buttons (Ctrl+T)"
              >
                Test
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
        stopButtonIndex={stopButtonIndex}
        onStopButtonChange={setStopButtonIndex}
      />
      
      {/* Diagnostics Panel - Toggle with Ctrl+D */}
      {showDiagnostics && <ControllerDiagnostics />}
      
      {/* Performance Monitor - Toggle with Ctrl+P */}
      {showPerformance && <PerformanceMonitor />}
      
      {/* Controller Test Mode - Toggle with Ctrl+T */}
      <ControllerTest
        isOpen={showControllerTest}
        onClose={() => setShowControllerTest(false)}
      />
      
      {/* Audio Loading Status */}
      <AudioStatus
        loadingStates={isLoading}
        loadErrors={loadErrors}
        loadedSounds={loadedSounds}
      />
    </div>
  )
}