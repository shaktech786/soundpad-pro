import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { Haute42Layout } from '../components/Haute42Layout'
import { useAudioEngine, AudioMode } from '../hooks/useAudioEngine'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { useOBS, OBSAction } from '../contexts/OBSContext'
import { useLiveSplit, LiveSplitAction } from '../contexts/LiveSplitContext'
import { OBSSettings } from '../components/OBSSettings'
import { LiveSplitSettings } from '../components/LiveSplitSettings'
import { OBSActionAssigner } from '../components/OBSActionAssigner'
import { URLInputModal } from '../components/URLInputModal'
import { ProfileSelector } from '../components/ProfileSelector'
import { BoardBuilder } from '../components/BoardBuilder'
import { useProfileManager } from '../hooks/useProfileManager'
import { ButtonPosition, ButtonShape, CombinedAction } from '../types/profile'
import { APP_CONFIG, HAUTE42_LAYOUT } from '../config/constants'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTheme } from '../contexts/ThemeContext'

export default function Home() {
  const router = useRouter()
  const { theme } = useTheme()
  const { buttonStates, connected } = useSimpleGamepad()
  const [audioMode, setAudioMode] = usePersistentStorage<AudioMode>('audio-output-mode', 'wdm')
  const { playSound, stopAll, loadSound, asioReady, loadErrors } = useAudioEngine(audioMode)
  const { connected: obsConnected, executeAction: executeOBSAction, obsState } = useOBS()
  const { connected: liveSplitConnected, executeAction: executeLiveSplitAction } = useLiveSplit()
  const [soundMappings, setSoundMappings, soundMappingsLoading] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )
  const [combinedActions, setCombinedActions] = usePersistentStorage<Map<number, CombinedAction>>(
    'combined-action-mappings',
    new Map()
  )
  const [buttonVolumes, setButtonVolumes] = usePersistentStorage<Map<number, number>>(
    'button-volumes',
    new Map()
  )
  const [autoLoadComplete, setAutoLoadComplete] = useState(false)
  const [buttonMapping, setButtonMapping, buttonMappingLoading] = usePersistentStorage<Map<number, number>>(
    'haute42-button-mapping',
    new Map()
  )
  const [stopButton, setStopButton, stopButtonLoading] = usePersistentStorage<number | null>(
    'haute42-stop-button',
    null
  )
  // Linked buttons: Map<secondaryButton, primaryButton> - when both are pressed, secondary is ignored
  const [linkedButtons, setLinkedButtons] = usePersistentStorage<Map<number, number>>(
    'haute42-linked-buttons',
    new Map()
  )
  // Board layout and shape from active profile
  const [boardLayout, setBoardLayout, boardLayoutLoading] = usePersistentStorage<ButtonPosition[]>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT,
    HAUTE42_LAYOUT
  )
  const [buttonShape, setButtonShape, buttonShapeLoading] = usePersistentStorage<ButtonShape>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE,
    'circle'
  )

  // Profile manager
  const {
    profiles,
    activeProfileId,
    isLoading: profilesLoading,
    switchProfile,
    renameProfile,
    deleteProfile,
    duplicateProfile,
  } = useProfileManager()

  const [showBoardEditor, setShowBoardEditor] = useState(false)
  const [assigningStopButton, setAssigningStopButton] = useState(false)
  const [configuringLinkedButtons, setConfiguringLinkedButtons] = useState(false)
  const [linkingStep, setLinkingStep] = useState<'primary' | 'secondary' | null>(null)
  const [pendingPrimaryButton, setPendingPrimaryButton] = useState<number | null>(null)
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

  // Check if onboarding needed (wait for button mapping to load first)
  useEffect(() => {
    console.log(`[Init] buttonMappingLoading: ${buttonMappingLoading}, buttonMapping.size: ${buttonMapping.size}`)
    if (buttonMappingLoading || boardLayoutLoading) return

    console.log(`[Init] Button mapping loaded with ${buttonMapping.size} entries:`, Array.from(buttonMapping.entries()))

    // If no button mapping exists, check if onboarding needed
    if (buttonMapping.size === 0) {
      const hasSeenOnboarding = localStorage.getItem('onboarding-complete')
      if (!hasSeenOnboarding) {
        navigateTo('/onboarding')
      } else {
        // Onboarding done but no mapping - create default 1:1 mapping
        const buttonCount = boardLayout.length || 16
        const defaultMap = new Map<number, number>()
        for (let i = 0; i < buttonCount; i++) {
          defaultMap.set(i, i)
        }
        setButtonMapping(defaultMap)
      }
    }
  }, [buttonMappingLoading, buttonMapping.size, boardLayoutLoading, boardLayout.length])

  // Load global hotkeys setting from localStorage (less critical, keep in localStorage)
  useEffect(() => {
    const savedGlobalHotkeys = localStorage.getItem('global-hotkeys-enabled')
    if (savedGlobalHotkeys) {
      setGlobalHotkeysEnabled(savedGlobalHotkeys === 'true')
    }
  }, [])

  // Auto-load sounds from SoundBoard directory on first run (only if store is empty)
  useEffect(() => {
    const autoLoadSounds = async () => {
      console.log(`[Init] soundMappingsLoading: ${soundMappingsLoading}, soundMappings.size: ${soundMappings.size}`)
      // Wait for persistent storage to finish loading before deciding to auto-load
      if (soundMappingsLoading) {
        return
      }
      console.log(`[Init] Sound mappings loaded:`, Array.from(soundMappings.entries()))

      // Only auto-load if we have no mappings yet and haven't already tried
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
      } else if (soundMappings.size > 0) {
        // Mappings loaded from store - mark as complete and pre-load
        setAutoLoadComplete(true)
        console.log('Loaded', soundMappings.size, 'mappings from store')

        // Pre-load all stored sounds
        for (const [_, filepath] of soundMappings) {
          try {
            await loadSound(filepath)
          } catch (err) {
            console.error('Failed to preload:', filepath, err)
          }
        }
      }
    }

    autoLoadSounds()
  }, [soundMappings.size, soundMappingsLoading, autoLoadComplete, setSoundMappings, loadSound])

  // Reload all sounds when audio mode changes
  const prevAudioMode = useRef(audioMode)
  useEffect(() => {
    if (prevAudioMode.current === audioMode) return
    prevAudioMode.current = audioMode

    // Re-load all mapped sounds in the new engine
    const reloadSounds = async () => {
      for (const [_, filepath] of soundMappings) {
        try {
          await loadSound(filepath, true)
        } catch (err) {
          console.error('Failed to reload on mode switch:', filepath, err)
        }
      }
    }

    // Small delay to let the engine initialize
    const timer = setTimeout(reloadSounds, 500)
    return () => clearTimeout(timer)
  }, [audioMode, soundMappings, loadSound])

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
        const volume = (buttonVolumes.get(buttonIndex) ?? 100) / 100
        console.log(`Global hotkey ${buttonIndex}, playing:`, cleanUrl, `at ${Math.round(volume * 100)}%`)
        playSound(cleanUrl, { restart: true, volume })
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
  }, [soundMappings, buttonVolumes, playSound, stopAll])

  // Poll for triggers from OBS dock (dock cannot play audio directly)
  useEffect(() => {
    console.log('[Trigger] Starting trigger polling...')
    const pollTriggers = async () => {
      try {
        const response = await fetch('/api/trigger')
        if (!response.ok) {
          console.log('[Trigger] Response not ok:', response.status)
          return
        }
        const data = await response.json()
        if (data.triggers && data.triggers.length > 0) {
          console.log('[Trigger] Received triggers:', data.triggers)
          const now = Date.now()
          for (const trigger of data.triggers) {
            if (trigger.type === 'play' && typeof trigger.index === 'number') {
              // Debounce: skip if same button was played within 150ms
              const lastPlay = lastPlayTime.current.get(trigger.index) || 0
              if (now - lastPlay < 150) {
                console.log('[Trigger] Debounced button', trigger.index)
                continue
              }
              lastPlayTime.current.set(trigger.index, now)

              // Use filepath from trigger if provided (from dock), otherwise use local mapping
              const soundFile = trigger.filePath || soundMappings.get(trigger.index)
              const volume = trigger.volume !== undefined ? trigger.volume / 100 : (buttonVolumes.get(trigger.index) ?? 100) / 100
              console.log('[Trigger] Button', trigger.index, 'soundFile:', soundFile, 'volume:', volume)
              if (soundFile) {
                const cleanUrl = soundFile.split('#')[0]
                console.log('[Trigger] Playing:', cleanUrl)
                playSound(cleanUrl, { restart: true, volume })
              }
            } else if (trigger.type === 'action' && typeof trigger.index === 'number') {
              // Execute OBS/LiveSplit action from dock
              const action = combinedActions.get(trigger.index)
              console.log('[Trigger] Action for button', trigger.index, 'action:', action)
              if (action) {
                if (action.service === 'obs' && obsConnected) {
                  executeOBSAction(action as OBSAction)
                } else if (action.service === 'livesplit' && liveSplitConnected) {
                  executeLiveSplitAction(action as LiveSplitAction, false)
                }
              }
            } else if (trigger.type === 'stop') {
              stopAll()
            }
          }
        }
      } catch (err) {
        // Ignore - API not available in production
      }
    }
    const interval = setInterval(pollTriggers, 100)
    return () => clearInterval(interval)
  }, [soundMappings, buttonVolumes, playSound, stopAll])

  // Track previous button states for edge detection (using ref to avoid infinite re-renders)
  const prevButtonStates = useRef<Map<number, boolean>>(new Map())

  // Track button press start times for long press detection
  const buttonPressStart = useRef<Map<number, number>>(new Map())

  // Track last play time per button to prevent double-plays (from dock trigger + gamepad)
  const lastPlayTime = useRef<Map<number, number>>(new Map())

  // Handle assigning stop button
  useEffect(() => {
    if (!assigningStopButton) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      if (isPressed && !wasPressed) {
        setStopButton(gamepadButtonIndex)
        setAssigningStopButton(false)
        console.log('Stop button assigned to:', gamepadButtonIndex)
      }
    })

    // Update previous states
    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, assigningStopButton])

  // Handle configuring linked buttons
  useEffect(() => {
    if (!configuringLinkedButtons || !linkingStep) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      if (isPressed && !wasPressed) {
        if (linkingStep === 'primary') {
          // First step: capture the primary button (the one you WANT to trigger)
          setPendingPrimaryButton(gamepadButtonIndex)
          setLinkingStep('secondary')
          console.log('Primary button captured:', gamepadButtonIndex)
        } else if (linkingStep === 'secondary' && pendingPrimaryButton !== null) {
          // Second step: capture the secondary button (the ghost that should be ignored)
          if (gamepadButtonIndex !== pendingPrimaryButton) {
            setLinkedButtons(prev => {
              const newMap = new Map(prev)
              newMap.set(gamepadButtonIndex, pendingPrimaryButton)
              return newMap
            })
            console.log(`Linked button ${gamepadButtonIndex} to primary ${pendingPrimaryButton}`)
          }
          // Reset linking state
          setConfiguringLinkedButtons(false)
          setLinkingStep(null)
          setPendingPrimaryButton(null)
        }
      }
    })

    // Update previous states
    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, configuringLinkedButtons, linkingStep, pendingPrimaryButton])

  // Play sound when controller buttons are pressed
  useEffect(() => {
    if (assigningStopButton || configuringLinkedButtons) return // Don't play sounds while assigning
    // Wait for mappings to load
    if (buttonMappingLoading || soundMappingsLoading) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      // Button pressed down - record timestamp and execute immediate actions
      if (isPressed && !wasPressed) {
        // Check if this is a secondary linked button and its primary is also pressed
        const linkedPrimary = linkedButtons.get(gamepadButtonIndex)
        if (linkedPrimary !== undefined && buttonStates.get(linkedPrimary)) {
          console.log(`[Gamepad] Button ${gamepadButtonIndex} is linked to ${linkedPrimary} which is also pressed - ignoring`)
          return // Skip this button, let the primary handle it
        }

        console.log(`[Gamepad] Button ${gamepadButtonIndex} pressed, mapping size: ${buttonMapping.size}, sounds: ${soundMappings.size}`)

        // Record button press start time for long press detection
        buttonPressStart.current.set(gamepadButtonIndex, Date.now())

        // Check if this is the stop button
        if (stopButton !== null && gamepadButtonIndex === stopButton) {
          console.log(`[Gamepad] Stop button triggered`)
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
        console.log(`[Gamepad] Gamepad btn ${gamepadButtonIndex} -> visual btn ${visualButtonId}`)

        const soundFile = soundMappings.get(visualButtonId)
        console.log(`[Gamepad] Visual btn ${visualButtonId} -> sound: ${soundFile || 'none'}`)
        if (soundFile) {
          // Debounce: skip if same button was played within 150ms (prevents double-play with dock triggers)
          const now = Date.now()
          const lastPlay = lastPlayTime.current.get(visualButtonId) || 0
          if (now - lastPlay >= 150) {
            lastPlayTime.current.set(visualButtonId, now)
            const cleanUrl = soundFile.split('#')[0]
            const volume = (buttonVolumes.get(visualButtonId) ?? 100) / 100
            console.log(`[Gamepad] Playing: ${cleanUrl} at ${Math.round(volume * 100)}%`)
            playSound(cleanUrl, { restart: true, volume })
          } else {
            console.log(`[Gamepad] Debounced - too soon`)
          }
        }

        // Execute combined action (OBS or LiveSplit) if assigned
        const combinedAction = combinedActions.get(visualButtonId)
        if (combinedAction) {
          if (combinedAction.service === 'obs' && obsConnected) {
            executeOBSAction(combinedAction as OBSAction)
          }
          // LiveSplit actions handled on button release for long press detection
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
            executeLiveSplitAction(combinedAction as LiveSplitAction, isLongPress)
            buttonPressStart.current.delete(gamepadButtonIndex)
          }
        }
      }
    })

    // Update previous states (using ref to avoid re-renders)
    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, soundMappings, buttonVolumes, playSound, buttonMapping, stopButton, stopAll, assigningStopButton, configuringLinkedButtons, linkedButtons, combinedActions, obsConnected, liveSplitConnected, executeOBSAction, executeLiveSplitAction, buttonMappingLoading, soundMappingsLoading])

  const handlePlaySound = (url: string, buttonIndex?: number) => {
    const cleanUrl = url.split('#')[0]
    const volume = buttonIndex !== undefined ? (buttonVolumes.get(buttonIndex) ?? 100) / 100 : 1.0
    playSound(cleanUrl, { restart: true, volume })
  }

  const handleMapSound = async (index: number) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.selectAudioFile) {
      try {
        const result = await (window as any).electronAPI.selectAudioFile()
        if (result && result.filePath) {
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
      handleMapSoundFromUrl(index)
    }
  }

  const handleMapSoundFromUrl = (index: number) => {
    setAssigningUrlSound(index)
  }

  const handleConfirmUrlSound = (url: string, name?: string) => {
    if (assigningUrlSound !== null) {
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

      <div className={`min-h-screen py-8 transition-colors duration-200 ${theme === 'light' ? 'bg-gray-100' : 'bg-gray-950'}`}>
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className={`text-4xl font-bold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>SoundPad Pro</h1>
            <div className="flex items-center justify-center gap-4">
              {profiles.length > 0 && (
                <ProfileSelector
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  onSwitch={switchProfile}
                  onRename={renameProfile}
                  onDelete={deleteProfile}
                  onDuplicate={duplicateProfile}
                  onNewProfile={() => navigateTo('/onboarding')}
                />
              )}
              <div className={`px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
                <span className="text-white">
                  {connected ? 'Controller Connected' : 'No Controller'}
                </span>
              </div>
              <div className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
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

          {/* Controller Layout */}
          <Haute42Layout
            buttonStates={buttonStates}
            soundMappings={soundMappings}
            obsActions={combinedActions}
            onPlaySound={handlePlaySound}
            onMapSound={handleMapSound}
            onMapSoundFromUrl={handleMapSoundFromUrl}
            onAssignOBSAction={(index) => setAssigningAction(index)}
            onTriggerAction={(action) => {
              if (action.service === 'obs' && obsConnected) {
                executeOBSAction(action as OBSAction)
              } else if (action.service === 'livesplit' && liveSplitConnected) {
                executeLiveSplitAction(action as LiveSplitAction, false)
              }
            }}
            buttonMapping={buttonMapping}
            stopButton={stopButton}
            boardLayout={boardLayout}
            buttonShape={buttonShape}
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
                className={`px-6 py-3 font-bold rounded-lg transition-colors ${theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              >
                RELOAD SOUNDS
              </button>
              <button
                onClick={() => setShowBoardEditor(true)}
                className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors"
              >
                EDIT LAYOUT
              </button>
              <button
                onClick={async () => {
                  if (confirm('Restart button mapping? This will clear your current mapping and take you to the onboarding page.')) {
                    setButtonMapping(new Map())
                    if (window.electronAPI?.storeDelete) {
                      await window.electronAPI.storeDelete('haute42-button-mapping')
                    }
                    localStorage.removeItem('haute42-button-mapping')
                    localStorage.removeItem('onboarding-complete')
                    window.location.href = '/onboarding'
                  }
                }}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors"
              >
                REMAP BUTTONS
              </button>
              <button
                onClick={() => setShowOBSSettings(true)}
                className={`px-6 py-3 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                  obsConnected
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                    : theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'
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
                    : theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'
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
                  <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                    Stop Button: <span className={`font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                      {stopButton < 100 ? `Button ${stopButton}` : `Axis ${Math.floor((stopButton - 100) / 2)}${(stopButton - 100) % 2 === 0 ? '+' : '-'}`}
                    </span>
                  </span>
                  <button
                    onClick={() => setStopButton(null)}
                    className={`px-3 py-1 text-xs rounded transition-colors ${theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Linked Buttons (for hardware that sends multiple button presses) */}
            <div className="flex justify-center items-center gap-4">
              <button
                onClick={() => {
                  setConfiguringLinkedButtons(true)
                  setLinkingStep('primary')
                  setPendingPrimaryButton(null)
                }}
                className={`px-6 py-3 font-bold rounded-lg transition-colors ${
                  configuringLinkedButtons
                    ? 'bg-yellow-500 hover:bg-yellow-600 animate-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                } text-white`}
              >
                {configuringLinkedButtons
                  ? linkingStep === 'primary'
                    ? '1️⃣ Press PRIMARY button...'
                    : '2️⃣ Press GHOST button...'
                  : '🔗 LINK DUAL-PRESS BUTTONS'
                }
              </button>
              {configuringLinkedButtons && (
                <button
                  onClick={() => {
                    setConfiguringLinkedButtons(false)
                    setLinkingStep(null)
                    setPendingPrimaryButton(null)
                  }}
                  className={`px-4 py-2 text-sm rounded transition-colors ${theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >
                  Cancel
                </button>
              )}
              {linkedButtons.size > 0 && !configuringLinkedButtons && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>Linked:</span>
                  {Array.from(linkedButtons.entries()).map(([secondary, primary]) => (
                    <div key={secondary} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${theme === 'light' ? 'bg-gray-200' : 'bg-gray-800'}`}>
                      <span className={theme === 'light' ? 'text-gray-900' : 'text-white'}>{secondary}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-indigo-400">{primary}</span>
                      <button
                        onClick={() => {
                          setLinkedButtons(prev => {
                            const newMap = new Map(prev)
                            newMap.delete(secondary)
                            return newMap
                          })
                        }}
                        className="ml-1 text-red-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setLinkedButtons(new Map())}
                    className={`px-3 py-1 text-xs rounded transition-colors ${theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* Global Hotkeys Toggle */}
            <div className="flex justify-center items-center gap-4">
              <div className={`flex items-center gap-3 px-6 py-3 rounded-lg ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-900'}`}>
                <span className={`font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>⌨️ Global Hotkeys (Numpad):</span>
                <button
                  onClick={() => {
                    const newValue = !globalHotkeysEnabled
                    setGlobalHotkeysEnabled(newValue)
                    localStorage.setItem('global-hotkeys-enabled', String(newValue))
                  }}
                  className={`px-4 py-2 font-bold rounded transition-colors ${
                    globalHotkeysEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : theme === 'light' ? 'bg-gray-300 hover:bg-gray-400 text-gray-800' : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {globalHotkeysEnabled ? 'ON' : 'OFF'}
                </button>
                {globalHotkeysEnabled && (
                  <span className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                    Ctrl+Num0-9 for pads | Ctrl+Esc to stop
                  </span>
                )}
              </div>
            </div>

            {/* Audio Output Mode Toggle */}
            <div className="flex justify-center items-center gap-4">
              <div className={`flex items-center gap-3 px-6 py-3 rounded-lg ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-900'}`}>
                <span className={`font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Audio Output:</span>
                <button
                  onClick={() => setAudioMode('wdm')}
                  className={`px-4 py-2 rounded font-bold text-sm transition-colors ${
                    audioMode === 'wdm'
                      ? 'bg-blue-600 text-white'
                      : theme === 'light' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  <div>WDM (Default)</div>
                  <div className={`text-xs font-normal ${audioMode === 'wdm' ? 'text-blue-200' : theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Route via Windows Volume Mixer
                  </div>
                </button>
                <button
                  onClick={() => setAudioMode('asio')}
                  className={`px-4 py-2 rounded font-bold text-sm transition-colors ${
                    audioMode === 'asio'
                      ? asioReady ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
                      : theme === 'light' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  <div>Direct (VoiceMeeter)</div>
                  <div className={`text-xs font-normal ${audioMode === 'asio' ? (asioReady ? 'text-green-200' : 'text-yellow-200') : theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    {audioMode === 'asio' && !asioReady ? 'Connecting...' : 'Direct to VoiceMeeter AUX Strip'}
                  </div>
                </button>
                {audioMode === 'asio' && loadErrors.get('__asio__') && (
                  <span className="text-xs text-red-400">
                    {loadErrors.get('__asio__')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className={`mt-6 p-4 rounded-lg ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-900'}`}>
            <div className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              <div className="font-bold mb-2">Quick Guide:</div>
              <ul className={`list-disc list-inside space-y-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                <li>Press buttons on your Haute42 to trigger sounds</li>
                <li>Click <span className={theme === 'light' ? 'text-gray-800' : 'text-gray-300'}>empty pads</span> to assign custom sounds</li>
                <li>Click <span className="text-blue-500">mapped pads</span> to preview sounds</li>
                <li><span className="text-yellow-500">Right-click or Ctrl+Click</span> any pad to change/assign audio file</li>
                {obsConnected && (
                  <>
                    <li><span className="text-purple-500">Right-click</span> any pad to assign OBS actions</li>
                    <li><span className="text-purple-500">Alt+Click</span> any pad to assign OBS actions</li>
                    <li>Pads with <span className="text-purple-500">🎬 badge</span> have OBS actions assigned</li>
                  </>
                )}
                <li>Assign a controller button to stop all sounds instantly</li>
                <li>Enable global hotkeys to use numpad keys when app is not in focus</li>
                <li>Use "Remap Buttons" if your controller layout doesn't match</li>
                <li>Use <span className="text-indigo-500">"Link Dual-Press Buttons"</span> if one physical button triggers two - link the ghost to the real one</li>
              </ul>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="mt-6 flex justify-center">
            <ThemeToggle />
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

      {/* Unified Assignment Modal (Sound + OBS + LiveSplit) */}
      {assigningAction !== null && (
        <OBSActionAssigner
          buttonIndex={assigningAction}
          currentAction={combinedActions.get(assigningAction) || null}
          currentSound={soundMappings.get(assigningAction) || null}
          currentVolume={buttonVolumes.get(assigningAction) ?? 100}
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
          onAssignSound={(url, name) => {
            console.log(`🔊 Assigning sound to button ${assigningAction}:`, url, name)
            setSoundMappings(prev => {
              const newMap = new Map(prev)
              newMap.set(assigningAction, url)
              return newMap
            })
          }}
          onClearSound={() => {
            console.log(`❌ Clearing sound from button ${assigningAction}`)
            setSoundMappings(prev => {
              const newMap = new Map(prev)
              newMap.delete(assigningAction)
              return newMap
            })
          }}
          onSetVolume={(volume) => {
            console.log(`🔊 Setting volume for button ${assigningAction}:`, volume)
            setButtonVolumes(prev => {
              const newMap = new Map(prev)
              newMap.set(assigningAction, volume)
              return newMap
            })
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

      {/* Board Layout Editor Modal */}
      {showBoardEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="max-w-5xl w-full bg-gray-900 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Edit Board Layout</h2>
            <BoardBuilder
              initialLayout={boardLayout}
              initialShape={buttonShape}
              onSave={(layout, shape) => {
                setBoardLayout(layout)
                setButtonShape(shape)
                // Write to persistent storage
                const storeSet = (window as any).electronAPI?.storeSet
                if (storeSet) {
                  storeSet(APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT, layout)
                  storeSet(APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE, shape)
                }
                setShowBoardEditor(false)
              }}
              onCancel={() => setShowBoardEditor(false)}
              showPresets
            />
          </div>
        </div>
      )}
    </>
  )
}
