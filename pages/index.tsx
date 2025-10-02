import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { Haute42Layout } from '../components/Haute42Layout'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { usePersistentStorage } from '../hooks/usePersistentStorage'

export default function Home() {
  const { buttonStates, connected } = useSimpleGamepad()
  const { playSound, stopAll, loadSound } = useAudioEngine()
  const [soundMappings, setSoundMappings] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )
  const [autoLoadComplete, setAutoLoadComplete] = useState(false)
  const [buttonMapping, setButtonMapping] = useState<Map<number, number>>(new Map())

  // Load button mapping from localStorage and redirect to onboarding if needed
  useEffect(() => {
    const savedMapping = localStorage.getItem('haute42-button-mapping')
    if (savedMapping) {
      try {
        const mappingObj = JSON.parse(savedMapping)
        const map = new Map<number, number>()
        Object.entries(mappingObj).forEach(([visualId, gamepadBtn]) => {
          map.set(Number(visualId), Number(gamepadBtn))
        })
        setButtonMapping(map)
      } catch (err) {
        console.error('Failed to load button mapping:', err)
      }
    } else {
      // First time user - redirect to onboarding
      const hasSeenOnboarding = localStorage.getItem('onboarding-complete')
      if (!hasSeenOnboarding && typeof window !== 'undefined') {
        window.location.href = '/onboarding'
      }
    }
  }, [])

  // Auto-load sounds from SoundBoard directory on first run
  useEffect(() => {
    const autoLoadSounds = async () => {
      // Only auto-load if we have no mappings yet
      if (soundMappings.size === 0 && !autoLoadComplete) {
        const soundFiles = [
          'C:\\Users\\shake\\Documents\\SoundBoard\\go_to_jail.wav',
          'C:\\Users\\shake\\Documents\\SoundBoard\\just_up_v1.wav',
          'C:\\Users\\shake\\Documents\\SoundBoard\\little_brother.wav',
          'C:\\Users\\shake\\Documents\\SoundBoard\\pauL_creenis.wav',
          'C:\\Users\\shake\\Documents\\SoundBoard\\spaghetti.wav'
        ]

        const newMappings = new Map<number, string>()
        soundFiles.forEach((file, index) => {
          if (index < 16) { // Map to first 16 pads
            newMappings.set(index, file)
          }
        })

        setSoundMappings(newMappings)
        setAutoLoadComplete(true)
        console.log('Auto-loaded', newMappings.size, 'sounds')

        // Pre-load all sounds
        for (const [_, filepath] of newMappings) {
          try {
            await loadSound(filepath)
          } catch (err) {
            console.error('Failed to preload:', filepath, err)
          }
        }
      }
    }

    autoLoadSounds()
  }, [soundMappings.size, autoLoadComplete, setSoundMappings, loadSound])

  // Track previous button states for edge detection
  const [prevButtonStates, setPrevButtonStates] = useState<Map<number, boolean>>(new Map())

  // Play sound when controller buttons are pressed
  useEffect(() => {
    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.get(gamepadButtonIndex) || false

      // Edge detection - only trigger on button down (not release)
      if (isPressed && !wasPressed) {
        // Find which visual button this gamepad button corresponds to
        let visualButtonId = gamepadButtonIndex
        if (buttonMapping.size > 0) {
          // Find the visual button ID that maps to this gamepad button
          for (const [vId, gId] of buttonMapping.entries()) {
            if (gId === gamepadButtonIndex) {
              visualButtonId = vId
              break
            }
          }
        }

        const soundFile = soundMappings.get(visualButtonId)
        if (soundFile) {
          const cleanUrl = soundFile.split('#')[0]
          console.log(`Gamepad button ${gamepadButtonIndex} -> Visual ${visualButtonId}, playing:`, cleanUrl)
          playSound(cleanUrl, { restart: true })
        } else {
          console.log(`Gamepad button ${gamepadButtonIndex} -> Visual ${visualButtonId}, no sound mapped`)
        }
      }
    })

    // Update previous states
    setPrevButtonStates(new Map(buttonStates))
  }, [buttonStates, soundMappings, playSound, prevButtonStates, buttonMapping])

  const handlePlaySound = (url: string) => {
    const cleanUrl = url.split('#')[0]
    console.log('Playing sound:', cleanUrl)
    playSound(cleanUrl, { restart: true })
  }

  const handleMapSound = async (index: number) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.selectAudioFile) {
      try {
        const result = await (window as any).electronAPI.selectAudioFile()
        if (result && result.filePath) {
          console.log(`Mapping pad ${index} to:`, result.filePath)
          setSoundMappings(prev => {
            const newMap = new Map(prev)
            newMap.set(index, result.filePath)
            return newMap
          })
        }
      } catch (error) {
        console.error('Error selecting file:', error)
      }
    }
  }

  return (
    <>
      <Head>
        <title>SoundPad Pro - Haute42</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">SoundPad Pro</h1>
            <div className="flex items-center justify-center gap-4">
              <div className={`px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
                <span className="text-white">
                  {connected ? '✓ Haute42 Connected' : '✗ No Controller'}
                </span>
              </div>
              <div className="text-gray-400 text-sm">
                {soundMappings.size} sounds loaded
              </div>
            </div>
          </div>

          {/* Haute42 Layout */}
          <Haute42Layout
            buttonStates={buttonStates}
            soundMappings={soundMappings}
            onPlaySound={handlePlaySound}
            onMapSound={handleMapSound}
            buttonMapping={buttonMapping}
          />

          {/* Controls */}
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={stopAll}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              STOP ALL SOUNDS
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all pad mappings?')) {
                  setSoundMappings(new Map())
                  setAutoLoadComplete(false)
                }
              }}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
            >
              RELOAD SOUNDS
            </button>
            <button
              onClick={() => {
                if (confirm('Restart button mapping? This will clear your current mapping and take you to the onboarding page.')) {
                  localStorage.removeItem('haute42-button-mapping')
                  // Force full page reload to reset state
                  window.location.replace('/onboarding')
                }
              }}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors"
            >
              🔄 REMAP BUTTONS
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-gray-900 rounded-lg">
            <div className="text-white text-sm">
              <div className="font-bold mb-2">Quick Guide:</div>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>Press buttons on your Haute42 to trigger sounds</li>
                <li>Click <span className="text-gray-300">empty pads</span> to assign custom sounds</li>
                <li>Click <span className="text-blue-400">mapped pads</span> to preview sounds</li>
                <li>Use "Remap Buttons" if your controller layout doesn't match</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
