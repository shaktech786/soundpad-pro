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
import { useTheme } from '../contexts/ThemeContext'

// --- Inline SVG icons ---
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const SunIcon = () => (
  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
  </svg>
)

const MoonIcon = () => (
  <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
  </svg>
)

// --- Collapsible sidebar section ---
function SidebarSection({ title, defaultOpen = true, children, theme }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  theme: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`border-b ${theme === 'light' ? 'border-gray-200' : 'border-gray-800'}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold transition-colors ${
          theme === 'light'
            ? 'text-gray-700 hover:bg-gray-100'
            : 'text-gray-300 hover:bg-gray-800/50'
        }`}
      >
        {title}
        <ChevronIcon open={open} />
      </button>
      <div className="sidebar-section-content" aria-hidden={!open}>
        <div>
          <div className={`px-4 pb-4 space-y-3 ${open ? '' : 'invisible'}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Status dot ---
function StatusDot({ active, live }: { active: boolean; live?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        active
          ? live
            ? 'bg-red-500 status-dot-live'
            : 'bg-green-500'
          : 'bg-gray-500'
      }`}
    />
  )
}

export default function Home() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
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
  const [linkedButtons, setLinkedButtons] = usePersistentStorage<Map<number, number>>(
    'haute42-linked-buttons',
    new Map()
  )
  const [boardLayout, setBoardLayout, boardLayoutLoading] = usePersistentStorage<ButtonPosition[]>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT,
    HAUTE42_LAYOUT
  )
  const [buttonShape, setButtonShape, buttonShapeLoading] = usePersistentStorage<ButtonShape>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE,
    'circle'
  )

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
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Helper to navigate properly in Electron and browser
  const navigateTo = async (route: string) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.navigate) {
      await (window as any).electronAPI.navigate(route)
    } else {
      router.push(route)
    }
  }

  // Check if onboarding needed (wait for button mapping to load first)
  useEffect(() => {
    console.log(`[Init] buttonMappingLoading: ${buttonMappingLoading}, buttonMapping.size: ${buttonMapping.size}`)
    if (buttonMappingLoading || boardLayoutLoading) return

    console.log(`[Init] Button mapping loaded with ${buttonMapping.size} entries:`, Array.from(buttonMapping.entries()))

    if (buttonMapping.size === 0) {
      const hasSeenOnboarding = localStorage.getItem('onboarding-complete')
      if (!hasSeenOnboarding) {
        navigateTo('/onboarding')
      } else {
        const buttonCount = boardLayout.length || 16
        const defaultMap = new Map<number, number>()
        for (let i = 0; i < buttonCount; i++) {
          defaultMap.set(i, i)
        }
        setButtonMapping(defaultMap)
      }
    }
  }, [buttonMappingLoading, buttonMapping.size, boardLayoutLoading, boardLayout.length])

  // Load global hotkeys setting from localStorage
  useEffect(() => {
    const savedGlobalHotkeys = localStorage.getItem('global-hotkeys-enabled')
    if (savedGlobalHotkeys) {
      setGlobalHotkeysEnabled(savedGlobalHotkeys === 'true')
    }
  }, [])

  // Auto-load sounds from SoundBoard directory on first run
  useEffect(() => {
    const autoLoadSounds = async () => {
      console.log(`[Init] soundMappingsLoading: ${soundMappingsLoading}, soundMappings.size: ${soundMappings.size}`)
      if (soundMappingsLoading) return
      console.log(`[Init] Sound mappings loaded:`, Array.from(soundMappings.entries()))

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
          if (index < 16) newMappings.set(index, file)
        })

        setSoundMappings(newMappings)
        setAutoLoadComplete(true)
        console.log('Auto-loaded', newMappings.size, 'sounds')

        for (const [_, filepath] of newMappings) {
          try {
            await loadSound(filepath)
          } catch (err) {
            console.error('Failed to preload:', filepath, err)
          }
        }
      } else if (soundMappings.size > 0) {
        setAutoLoadComplete(true)
        console.log('Loaded', soundMappings.size, 'mappings from store')

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

  // Reload all sounds when audio mode changes or ASIO becomes ready
  const prevAudioMode = useRef(audioMode)
  const hasReloadedForAsio = useRef(false)
  useEffect(() => {
    const modeChanged = prevAudioMode.current !== audioMode
    if (modeChanged) {
      prevAudioMode.current = audioMode
      hasReloadedForAsio.current = false
    }

    if (audioMode === 'asio' && !asioReady) return
    if (audioMode === 'asio' && hasReloadedForAsio.current && !modeChanged) return
    if (!modeChanged && audioMode === 'wdm') return

    hasReloadedForAsio.current = true

    const reloadSounds = async () => {
      console.log(`[AudioMode] Reloading ${soundMappings.size} sounds for ${audioMode} mode`)
      for (const [_, filepath] of soundMappings) {
        try {
          await loadSound(filepath, true)
        } catch (err) {
          console.error('Failed to reload on mode switch:', filepath, err)
        }
      }
      console.log(`[AudioMode] Reload complete`)
    }

    reloadSounds()
  }, [audioMode, asioReady, soundMappings, loadSound])

  // Register/unregister global hotkeys
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.registerHotkey) return

    const registerHotkeys = async () => {
      if (globalHotkeysEnabled) {
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

    if ((window as any).electronAPI?.toggleGlobalHotkeys) {
      (window as any).electronAPI.toggleGlobalHotkeys(globalHotkeysEnabled)
    }
  }, [globalHotkeysEnabled, stopButton])

  // Listen for global hotkey events
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onHotkeyTriggered) return

    const handleHotkey = (buttonIndex: number) => {
      console.log('Global hotkey triggered:', buttonIndex)

      if (buttonIndex === 999) {
        stopAll()
        return
      }

      const soundFile = soundMappings.get(buttonIndex)
      if (soundFile) {
        const cleanUrl = soundFile.split('#')[0]
        const volume = (buttonVolumes.get(buttonIndex) ?? 100) / 100
        console.log(`Global hotkey ${buttonIndex}, playing:`, cleanUrl, `at ${Math.round(volume * 100)}%`)
        playSound(cleanUrl, { restart: true, volume })
      }
    }

    ;(window as any).electronAPI.onHotkeyTriggered(handleHotkey)

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

  // Poll for triggers from OBS dock
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
              const lastPlay = lastPlayTime.current.get(trigger.index) || 0
              if (now - lastPlay < 150) {
                console.log('[Trigger] Debounced button', trigger.index)
                continue
              }
              lastPlayTime.current.set(trigger.index, now)

              const soundFile = trigger.filePath || soundMappings.get(trigger.index)
              const volume = trigger.volume !== undefined ? trigger.volume / 100 : (buttonVolumes.get(trigger.index) ?? 100) / 100
              console.log('[Trigger] Button', trigger.index, 'soundFile:', soundFile, 'volume:', volume)
              if (soundFile) {
                const cleanUrl = soundFile.split('#')[0]
                console.log('[Trigger] Playing:', cleanUrl)
                playSound(cleanUrl, { restart: true, volume })
              }
            } else if (trigger.type === 'action' && typeof trigger.index === 'number') {
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

  // Track previous button states for edge detection
  const prevButtonStates = useRef<Map<number, boolean>>(new Map())
  const buttonPressStart = useRef<Map<number, number>>(new Map())
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

    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, assigningStopButton])

  // Handle configuring linked buttons
  useEffect(() => {
    if (!configuringLinkedButtons || !linkingStep) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      if (isPressed && !wasPressed) {
        if (linkingStep === 'primary') {
          setPendingPrimaryButton(gamepadButtonIndex)
          setLinkingStep('secondary')
          console.log('Primary button captured:', gamepadButtonIndex)
        } else if (linkingStep === 'secondary' && pendingPrimaryButton !== null) {
          if (gamepadButtonIndex !== pendingPrimaryButton) {
            setLinkedButtons(prev => {
              const newMap = new Map(prev)
              newMap.set(gamepadButtonIndex, pendingPrimaryButton)
              return newMap
            })
            console.log(`Linked button ${gamepadButtonIndex} to primary ${pendingPrimaryButton}`)
          }
          setConfiguringLinkedButtons(false)
          setLinkingStep(null)
          setPendingPrimaryButton(null)
        }
      }
    })

    prevButtonStates.current = new Map(buttonStates)
  }, [buttonStates, configuringLinkedButtons, linkingStep, pendingPrimaryButton])

  // Play sound when controller buttons are pressed
  useEffect(() => {
    if (assigningStopButton || configuringLinkedButtons) return
    if (buttonMappingLoading || soundMappingsLoading) return

    buttonStates.forEach((isPressed, gamepadButtonIndex) => {
      const wasPressed = prevButtonStates.current.get(gamepadButtonIndex) || false

      if (isPressed && !wasPressed) {
        const linkedPrimary = linkedButtons.get(gamepadButtonIndex)
        if (linkedPrimary !== undefined && buttonStates.get(linkedPrimary)) {
          console.log(`[Gamepad] Button ${gamepadButtonIndex} is linked to ${linkedPrimary} which is also pressed - ignoring`)
          return
        }

        console.log(`[Gamepad] Button ${gamepadButtonIndex} pressed, mapping size: ${buttonMapping.size}, sounds: ${soundMappings.size}`)
        buttonPressStart.current.set(gamepadButtonIndex, Date.now())

        if (stopButton !== null && gamepadButtonIndex === stopButton) {
          console.log(`[Gamepad] Stop button triggered`)
          stopAll()
          return
        }

        let visualButtonId = gamepadButtonIndex
        if (buttonMapping.size > 0) {
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

        const combinedAction = combinedActions.get(visualButtonId)
        if (combinedAction) {
          if (combinedAction.service === 'obs' && obsConnected) {
            executeOBSAction(combinedAction as OBSAction)
          }
        }
      }

      if (!isPressed && wasPressed) {
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

        if (combinedAction?.service === 'livesplit' && liveSplitConnected) {
          const pressStartTime = buttonPressStart.current.get(gamepadButtonIndex)
          if (pressStartTime) {
            const pressDuration = Date.now() - pressStartTime
            const isLongPress = pressDuration >= 2000
            executeLiveSplitAction(combinedAction as LiveSplitAction, isLongPress)
            buttonPressStart.current.delete(gamepadButtonIndex)
          }
        }
      }
    })

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
        newMap.set(assigningUrlSound, url)
        return newMap
      })
      setAssigningUrlSound(null)
    }
  }

  // --- Format stop button label ---
  const stopButtonLabel = stopButton !== null
    ? stopButton < 100
      ? `Button ${stopButton}`
      : `Axis ${Math.floor((stopButton - 100) / 2)}${(stopButton - 100) % 2 === 0 ? '+' : '-'}`
    : null

  return (
    <>
      <Head>
        <title>SoundPad Pro - Haute42</title>
      </Head>

      <div className={`min-h-screen flex flex-col transition-colors duration-200 ${theme === 'light' ? 'bg-gray-100' : 'bg-gray-950'}`}>
        {/* ===== Header ===== */}
        <header className={`flex items-center justify-between px-4 py-2 border-b ${
          theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'
        }`}>
          <div className="flex items-center gap-3">
            <h1 className={`text-lg font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              SoundPad Pro
            </h1>
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
          </div>

          <div className="flex items-center gap-2">
            {/* Controller badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              connected
                ? theme === 'light' ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
                : theme === 'light' ? 'bg-gray-200 text-gray-500' : 'bg-gray-800 text-gray-500'
            }`}>
              <StatusDot active={connected} />
              {connected ? 'Controller' : 'No Controller'}
            </div>

            {/* OBS badge */}
            <button
              onClick={() => setShowOBSSettings(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                obsConnected
                  ? 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
                  : theme === 'light' ? 'bg-gray-200 text-gray-500 hover:bg-gray-300' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
              }`}
            >
              <StatusDot active={obsConnected} live={obsState.streaming} />
              OBS{obsConnected && obsState.streaming ? ': LIVE' : ''}
            </button>

            {/* LiveSplit badge */}
            <button
              onClick={() => setShowLiveSplitSettings(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                liveSplitConnected
                  ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                  : theme === 'light' ? 'bg-gray-200 text-gray-500 hover:bg-gray-300' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
              }`}
            >
              <StatusDot active={liveSplitConnected} />
              LiveSplit
            </button>

            {/* Settings gear */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-1.5 rounded-lg transition-colors ${
                sidebarOpen
                  ? theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-white'
                  : theme === 'light' ? 'text-gray-500 hover:bg-gray-200' : 'text-gray-400 hover:bg-gray-800'
              }`}
              title="Toggle settings"
            >
              <GearIcon />
            </button>
          </div>
        </header>

        {/* ===== Main content ===== */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Board area */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 overflow-auto">
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

            {/* Action bar below board */}
            <div className="w-full max-w-3xl mt-4 flex items-center justify-between px-2">
              <button
                onClick={() => {
                  console.log('STOP ALL SOUNDS button clicked')
                  stopAll()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="4" y="4" width="12" height="12" rx="1" />
                </svg>
                STOP ALL
              </button>

              <div className="flex items-center gap-3">
                <span className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                  {soundMappings.size} sounds loaded
                </span>
                <button
                  onClick={() => {
                    if (confirm('Clear all pad mappings?')) {
                      setSoundMappings(new Map())
                      setAutoLoadComplete(false)
                    }
                  }}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    theme === 'light' ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  Clear Sounds
                </button>
              </div>
            </div>
          </div>

          {/* Right: Settings sidebar */}
          <aside className={`sidebar flex-shrink-0 ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'} border-l ${
            theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'
          } overflow-y-auto`}>
            <div className="w-[320px]">
              {/* Section 1: Audio */}
              <SidebarSection title="Audio" theme={theme}>
                <div className="space-y-2">
                  <label className={`text-xs font-medium ${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Output Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAudioMode('wdm')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        audioMode === 'wdm'
                          ? 'bg-blue-600 text-white'
                          : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      <div>WDM</div>
                      <div className={`text-[10px] font-normal mt-0.5 ${
                        audioMode === 'wdm' ? 'text-blue-200' : theme === 'light' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Windows Mixer
                      </div>
                    </button>
                    <button
                      onClick={() => setAudioMode('asio')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        audioMode === 'asio'
                          ? asioReady ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
                          : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      <div>Direct</div>
                      <div className={`text-[10px] font-normal mt-0.5 ${
                        audioMode === 'asio'
                          ? asioReady ? 'text-green-200' : 'text-yellow-200'
                          : theme === 'light' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {audioMode === 'asio' && !asioReady ? 'Connecting...' : 'VoiceMeeter AUX'}
                      </div>
                    </button>
                  </div>
                  {audioMode === 'asio' && loadErrors.get('__asio__') && (
                    <p className="text-xs text-red-400">{loadErrors.get('__asio__')}</p>
                  )}
                </div>
              </SidebarSection>

              {/* Section 2: Controller */}
              <SidebarSection title="Controller" theme={theme}>
                {/* Stop button */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-medium ${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Stop Button
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssigningStopButton(true)}
                      className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        assigningStopButton
                          ? 'bg-yellow-500 text-white animate-pulse'
                          : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {assigningStopButton ? 'Press a button...' : stopButtonLabel || 'Not assigned'}
                    </button>
                    {stopButton !== null && (
                      <button
                        onClick={() => setStopButton(null)}
                        className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                          theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-500'
                        }`}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Linked buttons */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-medium ${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Linked Buttons
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (configuringLinkedButtons) {
                          setConfiguringLinkedButtons(false)
                          setLinkingStep(null)
                          setPendingPrimaryButton(null)
                        } else {
                          setConfiguringLinkedButtons(true)
                          setLinkingStep('primary')
                          setPendingPrimaryButton(null)
                        }
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        configuringLinkedButtons
                          ? 'bg-yellow-500 text-white animate-pulse'
                          : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {configuringLinkedButtons
                        ? linkingStep === 'primary'
                          ? 'Press PRIMARY...'
                          : 'Press GHOST...'
                        : 'Add Link'
                      }
                    </button>
                    {linkedButtons.size > 0 && !configuringLinkedButtons && (
                      <button
                        onClick={() => setLinkedButtons(new Map())}
                        className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                          theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-500'
                        }`}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  {linkedButtons.size > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {Array.from(linkedButtons.entries()).map(([secondary, primary]) => (
                        <div
                          key={secondary}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                            theme === 'light' ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300'
                          }`}
                        >
                          <span>{secondary}</span>
                          <span className="text-gray-500">&#8594;</span>
                          <span className="text-indigo-400">{primary}</span>
                          <button
                            onClick={() => {
                              setLinkedButtons(prev => {
                                const newMap = new Map(prev)
                                newMap.delete(secondary)
                                return newMap
                              })
                            }}
                            className="ml-0.5 text-red-400 hover:text-red-300"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Global hotkeys */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-medium ${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Global Hotkeys (Numpad)
                  </label>
                  <button
                    onClick={() => {
                      const newValue = !globalHotkeysEnabled
                      setGlobalHotkeysEnabled(newValue)
                      localStorage.setItem('global-hotkeys-enabled', String(newValue))
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      globalHotkeysEnabled
                        ? 'bg-green-600 text-white'
                        : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    <span>{globalHotkeysEnabled ? 'Enabled' : 'Disabled'}</span>
                    <span className={`text-[10px] font-normal ${globalHotkeysEnabled ? 'text-green-200' : theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Ctrl+Num0-9
                    </span>
                  </button>
                </div>
              </SidebarSection>

              {/* Section 3: Integrations */}
              <SidebarSection title="Integrations" theme={theme}>
                {/* OBS */}
                <button
                  onClick={() => setShowOBSSettings(true)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    obsConnected
                      ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                      : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <StatusDot active={obsConnected} live={obsState.streaming} />
                  <span className="flex-1 text-left">OBS Studio</span>
                  <span className={`text-[10px] font-normal ${
                    obsConnected ? 'text-purple-400/70' : theme === 'light' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {obsConnected
                      ? obsState.streaming ? 'LIVE' : obsState.recording ? 'REC' : 'Connected'
                      : 'Not connected'
                    }
                  </span>
                </button>

                {/* LiveSplit */}
                <button
                  onClick={() => setShowLiveSplitSettings(true)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    liveSplitConnected
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                      : theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <StatusDot active={liveSplitConnected} />
                  <span className="flex-1 text-left">LiveSplit</span>
                  <span className={`text-[10px] font-normal ${
                    liveSplitConnected ? 'text-blue-400/70' : theme === 'light' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {liveSplitConnected ? 'Connected' : 'Not connected'}
                  </span>
                </button>
              </SidebarSection>

              {/* Section 4: Layout & Profile */}
              <SidebarSection title="Layout & Profile" theme={theme}>
                <button
                  onClick={() => setShowBoardEditor(true)}
                  className={`w-full px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  Edit Layout
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
                  className={`w-full px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  Remap Buttons
                </button>

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <span>Theme</span>
                  <span className="flex items-center gap-1.5">
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                    <span className={`text-[10px] font-normal ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {theme === 'dark' ? 'Light' : 'Dark'}
                    </span>
                  </span>
                </button>
              </SidebarSection>
            </div>
          </aside>
        </div>
      </div>

      {/* ===== Modals (unchanged) ===== */}

      {showOBSSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <OBSSettings onClose={() => setShowOBSSettings(false)} />
          </div>
        </div>
      )}

      {showLiveSplitSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <LiveSplitSettings onClose={() => setShowLiveSplitSettings(false)} />
          </div>
        </div>
      )}

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
            console.log(`Assigning action to button ${assigningAction}:`, action)
            if (action) {
              setCombinedActions(prev => {
                const newMap = new Map(prev)
                newMap.set(assigningAction, action)
                console.log(`Action saved to button ${assigningAction}`, {
                  service: action.service,
                  type: action.type,
                  totalActions: newMap.size
                })
                return newMap
              })
            } else {
              console.log(`Clearing action from button ${assigningAction}`)
              setCombinedActions(prev => {
                const newMap = new Map(prev)
                newMap.delete(assigningAction)
                return newMap
              })
            }
          }}
          onAssignSound={(url, name) => {
            console.log(`Assigning sound to button ${assigningAction}:`, url, name)
            setSoundMappings(prev => {
              const newMap = new Map(prev)
              newMap.set(assigningAction, url)
              return newMap
            })
          }}
          onClearSound={() => {
            console.log(`Clearing sound from button ${assigningAction}`)
            setSoundMappings(prev => {
              const newMap = new Map(prev)
              newMap.delete(assigningAction)
              return newMap
            })
          }}
          onSetVolume={(volume) => {
            console.log(`Setting volume for button ${assigningAction}:`, volume)
            setButtonVolumes(prev => {
              const newMap = new Map(prev)
              newMap.set(assigningAction, volume)
              return newMap
            })
          }}
          onClose={() => setAssigningAction(null)}
        />
      )}

      {assigningUrlSound !== null && (
        <URLInputModal
          isOpen={assigningUrlSound !== null}
          buttonIndex={assigningUrlSound}
          onConfirm={handleConfirmUrlSound}
          onClose={() => setAssigningUrlSound(null)}
        />
      )}

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
