import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { Haute42Layout } from '../components/Haute42Layout'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { useOBS, OBSAction } from '../contexts/OBSContext'
import { useLiveSplit, LiveSplitAction } from '../contexts/LiveSplitContext'
import { OBSSettings } from '../components/OBSSettings'
import { LiveSplitSettings } from '../components/LiveSplitSettings'
import { OBSActionAssigner } from '../components/OBSActionAssigner'
import { URLInputModal } from '../components/URLInputModal'

type CombinedAction = (OBSAction & { service: 'obs' }) | (LiveSplitAction & { service: 'livesplit' })

export default function Home() {
  const router = useRouter()
  const { buttonStates, connected } = useSimpleGamepad()
  const { playSound, stopAll, loadSound, audioDevices, selectedAudioDevice, selectAudioDevice } = useAudioEngine()
  const { connected: obsConnected, executeAction: executeOBSAction, obsState } = useOBS()
  const { connected: liveSplitConnected, executeAction: executeLiveSplitAction } = useLiveSplit()
  const [soundMappings, setSoundMappings] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )
  const [combinedActions, setCombinedActions] = usePersistentStorage<Map<number, CombinedAction>>(
    'combined-action-mappings',
    new Map()
  )
  const [autoLoadComplete, setAutoLoadComplete] = useState(false)
  const [buttonMapping, setButtonMapping] = useState<Map<number, number>>(new Map())
  const [stopButton, setStopButton] = useState<number | null>(null)
  const [assigningStopButton, setAssigningStopButton] = useState(false)
  const [globalHotkeysEnabled, setGlobalHotkeysEnabled] = useState(false)
  const [showOBSSettings, setShowOBSSettings] = useState(false)
  const [showLiveSplitSettings, setShowLiveSplitSettings] = useState(false)
  const [assigningAction, setAssigningAction] = useState<number | null>(null)
  const [assigningUrlSound, setAssigningUrlSound] = useState<number | null>(null)

  // Helper to navigate properly in Electron and browser
  const navigateTo = async (route: string) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.navigate) {
      // Use Electron navigation in production
      await (window as any).electronAPI.navigate(route)
    } else {
      // Use Next.js router in dev/browser
      router.push(route)
    }
  }

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
      if (!hasSeenOnboarding) {
        navigateTo('/onboarding')
      }
    }

    // Load stop button
    const savedStopButton = localStorage.getItem('haute42-stop-button')
    if (savedStopButton) {
      try {
        setStopButton(Number(savedStopButton))
      } catch (err) {
        console.error('Failed to load stop button:', err)
      }
    }

    // Load global hotkeys setting
    const savedGlobalHotkeys = localStorage.getItem('global-hotkeys-enabled')
    if (savedGlobalHotkeys) {
      setGlobalHotkeysEnabled(savedGlobalHotkeys === 'true')
    }
  }, [router])

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

  // Register/unregister global hotkeys
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.registerHotkey) return

    const registerHotkeys = async () => {
      if (globalHotkeysEnabled) {
        // Register hotkeys for pads 0-15 using Numpad keys
        const numpadKeys = [
          'num0', 'num1', 'num2', 'num3',
          'num4', 'num5', 'num6', 'num7',
          'num8', 'num9', 'numdec', 'numadd',
          'numsub', 'nummult', 'numdiv', 'numenter'
        ]

        for (let i = 0; i < 16; i++) {
          const key = `CommandOrControl+${numpadKeys[i]}`
          try {
            await (window as any).electronAPI.registerHotkey(key, i)
            console.log(`Registered global hotkey ${key} for pad ${i}`)
          } catch (err) {
            console.error(`Failed to register hotkey ${key}:`, err)
          }
        }

        // Register global stop hotkey if stop button is assigned
        if (stopButton !== null) {
          try {
            await (window as any).electronAPI.registerHotkey('CommandOrControl+Escape', 999)
            console.log('Registered global stop hotkey')
          } catch (err) {
            console.error('Failed to register stop hotkey:', err)
          }
        }
      }
    }

    registerHotkeys()

    // Toggle global hotkeys in main process
    if ((window as any).electronAPI?.toggleGlobalHotkeys) {
      (window as any).electronAPI.toggleGlobalHotkeys(globalHotkeysEnabled)
    }
  }, [globalHotkeysEnabled, stopButton])

  // Listen for global hotkey events
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onHotkeyTriggered) return

    const handleHotkey = (buttonIndex: number) => {
      console.log('Global hotkey triggered:', buttonIndex)

      // Check if this is the stop hotkey
      if (buttonIndex === 999) {
        stopAll()
        return
      }

      // Play sound for this pad
      const soundFile = soundMappings.get(buttonIndex)
      if (soundFile) {
        const cleanUrl = soundFile.split('#')[0]
        console.log(`Global hotkey ${buttonIndex}, playing:`, cleanUrl)
        playSound(cleanUrl, { restart: true })
      }
    }

    (window as any).electronAPI.onHotkeyTriggered(handleHotkey)

    // Also listen for global stop audio event
    if ((window as any).electronAPI?.onGlobalStopAudio) {
      (window as any).electronAPI.onGlobalStopAudio(() => {
        console.log('Global stop audio triggered')
        stopAll()
      })
    }

    return () => {
      if ((window as any).electronAPI?.removeAllListeners) {
        (window as any).electronAPI.removeAllListeners()
      }
    }
  }, [soundMappings, playSound, stopAll])

  // Track previous button states for edge detection (using ref to avoid infinite re-renders)
  const prevButtonStates = useRef<Map<number, boolean>>(new Map())

  // Track button press start times for long press detection
  const buttonPressStart = useRef<Map<number, number>>(new Map())

  // Handle assigning stop button
  useEffect(() => {
    if (!assigningStopButton) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      if (isPressed && !wasPressed) {
        setStopButton(gamepadButtonIndex)
        localStorage.setItem('haute42-stop-button', String(gamepadButtonIndex))
        setAssigningStopButton(false)
        console.log('Stop button assigned to:', gamepadButtonIndex)
      }
    })

    // Update previous states
    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, assigningStopButton])

  // Play sound when controller buttons are pressed
  useEffect(() => {
    if (assigningStopButton) return // Don't play sounds while assigning stop button

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      // Button pressed down - record timestamp and execute immediate actions
      if (isPressed && !wasPressed) {
        // Record button press start time for long press detection
        buttonPressStart.current.set(gamepadButtonIndex, Date.now())

        // Check if this is the stop button
        if (stopButton !== null && gamepadButtonIndex === stopButton) {
          console.log('Stop button pressed, stopping all sounds')
          stopAll()
          return
        }

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

        // Execute combined action (OBS or LiveSplit) if assigned
        const combinedAction = combinedActions.get(visualButtonId)
        console.log(`🎮 Button ${visualButtonId} pressed - checking for actions`, {
          hasCombinedAction: !!combinedAction,
          service: combinedAction?.service,
          actionType: combinedAction?.type,
          obsConnected,
          liveSplitConnected
        })

        if (combinedAction) {
          if (combinedAction.service === 'obs' && obsConnected) {
            console.log(`🎬 Executing OBS action:`, combinedAction.type)
            executeOBSAction(combinedAction as OBSAction)
          } else if (combinedAction.service === 'livesplit' && liveSplitConnected) {
            // Don't execute LiveSplit action on press down - wait for release to determine if long press
            console.log(`🏁 LiveSplit action detected, waiting for button release to determine press duration`)
          } else {
            console.warn(`⚠️ Action not executed - service: ${combinedAction.service}, obsConnected: ${obsConnected}, liveSplitConnected: ${liveSplitConnected}`)
          }
        }
      }

      // Button released - check for long press and execute LiveSplit actions
      if (!isPressed && wasPressed) {
        // Find which visual button this gamepad button corresponds to
        let visualButtonId = gamepadButtonIndex
        if (buttonMapping.size > 0) {
          for (const [vId, gId] of buttonMapping.entries()) {
            if (gId === gamepadButtonIndex) {
              visualButtonId = vId
              break
            }
          }
        }

        const combinedAction = combinedActions.get(visualButtonId)

        // Handle LiveSplit actions with long press detection
        if (combinedAction?.service === 'livesplit' && liveSplitConnected) {
          const pressStartTime = buttonPressStart.current.get(gamepadButtonIndex)
          if (pressStartTime) {
            const pressDuration = Date.now() - pressStartTime
            const isLongPress = pressDuration >= 2000 // 2 second threshold

            console.log(`🏁 Executing LiveSplit action:`, {
              action: combinedAction.type,
              pressDuration,
              isLongPress
            })

            executeLiveSplitAction(combinedAction as LiveSplitAction, isLongPress)

            // Clean up the press start time
            buttonPressStart.current.delete(gamepadButtonIndex)
          }
        }
      }
    })

    // Update previous states (using ref to avoid re-renders)
    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, soundMappings, playSound, buttonMapping, stopButton, stopAll, assigningStopButton, combinedActions, obsConnected, liveSplitConnected, executeOBSAction, executeLiveSplitAction])

  const handlePlaySound = (url: string) => {
    const cleanUrl = url.split('#')[0]
    console.log('🔊 ====== AUDIO PLAYBACK DEBUG ======')
    console.log('🔊 Original URL:', url)
    console.log('🔊 Clean URL:', cleanUrl)
    console.log('🔊 Is Electron?:', typeof window !== 'undefined' && !!(window as any).electronAPI)
    console.log('🔊 Audio devices available:', audioDevices.length)
    console.log('🔊 Selected device:', selectedAudioDevice)
    playSound(cleanUrl, { restart: true })
    console.log('🔊 playSound() function called')
    console.log('🔊 =====================================')
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
    } else {
      // In browser mode, fall back to URL input
      console.log(`Electron API not available, opening URL input for pad ${index}`)
      handleMapSoundFromUrl(index)
    }
  }

  const handleMapSoundFromUrl = (index: number) => {
    console.log(`Opening URL input for pad ${index}`)
    setAssigningUrlSound(index)
  }

  const handleConfirmUrlSound = (url: string, name?: string) => {
    if (assigningUrlSound !== null) {
      console.log(`Mapping pad ${assigningUrlSound} to URL:`, url, name)
      setSoundMappings(prev => {
        const newMap = new Map(prev)
        // Store the URL directly - the audio engine already supports remote URLs
        newMap.set(assigningUrlSound, url)
        return newMap
      })
      setAssigningUrlSound(null)
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

          {/* OBS Status Badge */}
          {obsConnected && (
            <div className="flex justify-center mb-4">
              <div className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold flex items-center gap-3">
                <span className="text-2xl">🎬</span>
                <div className="text-white">
                  <div className="font-bold">OBS Connected</div>
                  <div className="text-xs opacity-90">
                    {obsState.streaming && '🔴 LIVE'}
                    {obsState.recording && ' ⏺️ REC'}
                    {!obsState.streaming && !obsState.recording && 'Ready'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Haute42 Layout */}
          <Haute42Layout
            buttonStates={buttonStates}
            soundMappings={soundMappings}
            obsActions={combinedActions}
            onPlaySound={handlePlaySound}
            onMapSound={handleMapSound}
            onMapSoundFromUrl={handleMapSoundFromUrl}
            onAssignOBSAction={(obsConnected || liveSplitConnected) ? (index) => setAssigningAction(index) : undefined}
            buttonMapping={buttonMapping}
            stopButton={stopButton}
          />

          {/* Controls */}
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  console.log('🔴 STOP ALL SOUNDS button clicked')
                  stopAll()
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
              >
                STOP ALL SOUNDS
              </button>
              <button
                onClick={() => {
                  console.log('🔄 RELOAD SOUNDS button clicked')
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
                  console.log('🔄 REMAP BUTTONS button clicked')
                  if (confirm('Restart button mapping? This will clear your current mapping and take you to the onboarding page.')) {
                    localStorage.removeItem('haute42-button-mapping')
                    navigateTo('/onboarding')
                  }
                }}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors"
              >
                🔄 REMAP BUTTONS
              </button>
              <button
                onClick={() => setShowOBSSettings(true)}
                className={`px-6 py-3 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                  obsConnected
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                <span className="text-xl">🎬</span>
                {obsConnected ? 'OBS CONNECTED' : 'CONNECT TO OBS'}
              </button>
              <button
                onClick={() => setShowLiveSplitSettings(true)}
                className={`px-6 py-3 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                  liveSplitConnected
                    ? 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                <span className="text-xl">🏁</span>
                {liveSplitConnected ? 'LIVESPLIT CONNECTED' : 'CONNECT TO LIVESPLIT'}
              </button>
            </div>

            {/* Stop Button Assignment */}
            <div className="flex justify-center items-center gap-4">
              <button
                onClick={() => setAssigningStopButton(true)}
                className={`px-6 py-3 font-bold rounded-lg transition-colors ${
                  assigningStopButton
                    ? 'bg-yellow-500 hover:bg-yellow-600 animate-pulse'
                    : 'bg-purple-600 hover:bg-purple-700'
                } text-white`}
              >
                {assigningStopButton ? '⏳ Press a button...' : '🛑 ASSIGN STOP BUTTON'}
              </button>
              {stopButton !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">
                    Stop Button: <span className="text-white font-bold">
                      {stopButton < 100 ? `Button ${stopButton}` : `Axis ${Math.floor((stopButton - 100) / 2)}${(stopButton - 100) % 2 === 0 ? '+' : '-'}`}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      setStopButton(null)
                      localStorage.removeItem('haute42-stop-button')
                    }}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Global Hotkeys Toggle */}
            <div className="flex justify-center items-center gap-4">
              <div className="flex items-center gap-3 px-6 py-3 bg-gray-900 rounded-lg">
                <span className="text-white font-bold">⌨️ Global Hotkeys (Numpad):</span>
                <button
                  onClick={() => {
                    const newValue = !globalHotkeysEnabled
                    setGlobalHotkeysEnabled(newValue)
                    localStorage.setItem('global-hotkeys-enabled', String(newValue))
                  }}
                  className={`px-4 py-2 font-bold rounded transition-colors ${
                    globalHotkeysEnabled
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-700 hover:bg-gray-600'
                  } text-white`}
                >
                  {globalHotkeysEnabled ? 'ON' : 'OFF'}
                </button>
                {globalHotkeysEnabled && (
                  <span className="text-gray-400 text-xs">
                    Ctrl+Num0-9 for pads | Ctrl+Esc to stop
                  </span>
                )}
              </div>
            </div>

            {/* Audio Output Device Selector */}
            <div className="flex justify-center items-center gap-4">
              <div className="flex items-center gap-3 px-6 py-3 bg-gray-900 rounded-lg">
                <span className="text-white font-bold">🔊 Audio Output:</span>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => selectAudioDevice(e.target.value)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded transition-colors cursor-pointer"
                >
                  <option value="">Default Device</option>
                  {audioDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
                {selectedAudioDevice && audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label.toLowerCase().includes('voicemeeter') && (
                  <span className="text-green-400 text-xs font-medium">
                    ✓ Routing to VoiceMeeter
                  </span>
                )}
                {selectedAudioDevice && audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label.toLowerCase().includes('cable') && (
                  <span className="text-blue-400 text-xs font-medium">
                    ✓ Routing to VB-Cable
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-gray-900 rounded-lg">
            <div className="text-white text-sm">
              <div className="font-bold mb-2">Quick Guide:</div>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>Press buttons on your Haute42 to trigger sounds</li>
                <li>Click <span className="text-gray-300">empty pads</span> to assign custom sounds</li>
                <li>Click <span className="text-blue-400">mapped pads</span> to preview sounds</li>
                <li><span className="text-yellow-400">Right-click or Ctrl+Click</span> any pad to change/assign audio file</li>
                {obsConnected && (
                  <>
                    <li><span className="text-purple-400">Right-click</span> any pad to assign OBS actions</li>
                    <li><span className="text-purple-400">Alt+Click</span> any pad to assign OBS actions</li>
                    <li>Pads with <span className="text-purple-400">🎬 badge</span> have OBS actions assigned</li>
                  </>
                )}
                <li>Assign a controller button to stop all sounds instantly</li>
                <li>Enable global hotkeys to use numpad keys when app is not in focus</li>
                <li>Use "Remap Buttons" if your controller layout doesn't match</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* OBS Settings Modal */}
      {showOBSSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <OBSSettings onClose={() => setShowOBSSettings(false)} />
          </div>
        </div>
      )}

      {/* LiveSplit Settings Modal */}
      {showLiveSplitSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <LiveSplitSettings onClose={() => setShowLiveSplitSettings(false)} />
          </div>
        </div>
      )}

      {/* Action Assigner Modal (OBS + LiveSplit) */}
      {assigningAction !== null && (
        <OBSActionAssigner
          buttonIndex={assigningAction}
          currentAction={combinedActions.get(assigningAction) || null}
          scenes={obsState.scenes}
          sources={obsState.sources}
          obsConnected={obsConnected}
          liveSplitConnected={liveSplitConnected}
          onAssign={(action) => {
            console.log(`🎯 Assigning action to button ${assigningAction}:`, action)
            if (action) {
              setCombinedActions(prev => {
                const newMap = new Map(prev)
                newMap.set(assigningAction, action)
                console.log(`✅ Action saved to button ${assigningAction}`, {
                  service: action.service,
                  type: action.type,
                  totalActions: newMap.size
                })
                return newMap
              })
            } else {
              console.log(`❌ Clearing action from button ${assigningAction}`)
              setCombinedActions(prev => {
                const newMap = new Map(prev)
                newMap.delete(assigningAction)
                return newMap
              })
            }
          }}
          onClose={() => setAssigningAction(null)}
        />
      )}

      {/* URL Input Modal */}
      {assigningUrlSound !== null && (
        <URLInputModal
          isOpen={assigningUrlSound !== null}
          buttonIndex={assigningUrlSound}
          onConfirm={handleConfirmUrlSound}
          onClose={() => setAssigningUrlSound(null)}
        />
      )}
    </>
  )
}
