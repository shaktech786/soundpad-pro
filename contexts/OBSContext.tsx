import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import OBSWebSocket from 'obs-websocket-js'

export interface OBSConnectionConfig {
  address: string
  port: string
  password: string
}

export interface OBSAction {
  type: 'start_stream' | 'stop_stream' | 'toggle_streaming' |
        'start_recording' | 'stop_recording' | 'toggle_recording' |
        'toggle_mute' | 'set_scene' | 'toggle_source_visibility' | 'trigger_hotkey' |
        'start_replay_buffer' | 'stop_replay_buffer' | 'toggle_replay_buffer' | 'save_replay_buffer'
  params?: {
    sourceName?: string
    sceneName?: string
    hotkeyName?: string
    inputName?: string
  }
}

export interface OBSState {
  streaming: boolean
  recording: boolean
  replayBufferActive: boolean
  currentScene: string | null
  scenes: string[]
  sources: string[]
}

interface OBSContextType {
  connected: boolean
  connecting: boolean
  error: string | null
  obsState: OBSState
  connect: (config: OBSConnectionConfig) => Promise<void>
  disconnect: () => Promise<void>
  executeAction: (action: OBSAction) => Promise<void>
  refreshOBSState: () => Promise<void>
}

const OBSContext = createContext<OBSContextType | undefined>(undefined)

export const useOBS = () => {
  const context = useContext(OBSContext)
  if (!context) {
    throw new Error('useOBS must be used within an OBSProvider')
  }
  return context
}

interface OBSProviderProps {
  children: ReactNode
}

export const OBSProvider: React.FC<OBSProviderProps> = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [obsState, setOBSState] = useState<OBSState>({
    streaming: false,
    recording: false,
    replayBufferActive: false,
    currentScene: null,
    scenes: [],
    sources: []
  })

  const obsRef = useRef<OBSWebSocket | null>(null)
  const isInitialized = useRef(false)
  const autoConnectAttempted = useRef(false)
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const savedConfigRef = useRef<OBSConnectionConfig | null>(null)
  const isConnectingRef = useRef(false)
  const connectedRef = useRef(false)

  // Initialize OBS WebSocket client ONCE
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    console.log('🔧 Initializing OBS WebSocket client')
    obsRef.current = new OBSWebSocket()

    // Set up event listeners
    const obs = obsRef.current

    obs.on('ConnectionOpened', () => {
      console.log('🟢 OBS WebSocket connection opened')
    })

    obs.on('Identified', async () => {
      console.log('✅ OBS WebSocket authenticated')
      setConnected(true)
      setConnecting(false)
      setError(null)
      connectedRef.current = true
      // Stop reconnect loop immediately instead of waiting for next interval check
      stopReconnectLoop()

      // Fetch initial state
      try {
        await refreshOBSStateInternal()
      } catch (err) {
        console.error('Failed to fetch initial OBS state:', err)
      }
    })

    obs.on('ConnectionClosed', () => {
      console.log('🔴 OBS WebSocket connection closed')
      setConnected(false)
      setConnecting(false)
      isConnectingRef.current = false
      connectedRef.current = false
      // Start reconnection loop if we have saved config
      startReconnectLoop()
    })

    obs.on('ConnectionError', (err) => {
      // Only show error in UI if not background reconnecting
      if (!reconnectIntervalRef.current) {
        console.error('❌ OBS WebSocket connection error:', err)
        setError(err.message || 'Connection error')
      }
      setConnected(false)
      setConnecting(false)
      isConnectingRef.current = false
    })

    // Listen to OBS state changes
    obs.on('StreamStateChanged', (data: any) => {
      console.log('🔴 Stream state changed:', data.outputActive)
      setOBSState(prev => ({ ...prev, streaming: data.outputActive }))
    })

    obs.on('RecordStateChanged', (data: any) => {
      console.log('⏺️ Record state changed:', data.outputActive)
      setOBSState(prev => ({ ...prev, recording: data.outputActive }))
    })

    obs.on('ReplayBufferStateChanged', (data: any) => {
      console.log('💾 Replay buffer state changed:', data.outputActive)
      setOBSState(prev => ({ ...prev, replayBufferActive: data.outputActive }))
    })

    obs.on('CurrentProgramSceneChanged', (data: any) => {
      console.log('🎬 Scene changed:', data.sceneName)
      setOBSState(prev => ({ ...prev, currentScene: data.sceneName }))
    })

    // Cleanup on unmount
    return () => {
      if (obsRef.current) {
        console.log('🧹 Cleaning up OBS connection')
        obsRef.current.disconnect().catch(() => {})
      }
    }
  }, [])

  // Connect function (defined before auto-connect effect)
  const connect = useCallback(async (config: OBSConnectionConfig) => {
    if (!obsRef.current) {
      console.error('OBS client not initialized')
      return
    }

    setConnecting(true)
    setError(null)

    try {
      const url = `ws://${config.address}:${config.port}`
      console.log('🔌 Connecting to OBS at:', url)

      // Stop any running reconnect loop — manual connect takes over
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current)
        reconnectIntervalRef.current = null
      }

      await obsRef.current.connect(url, config.password)

      // Save config for auto-connect and reconnection
      savedConfigRef.current = config
      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeSet) {
        await (window as any).electronAPI.storeSet('obs-connection-config', config)
      } else {
        localStorage.setItem('obs-connection-config', JSON.stringify(config))
      }
      console.log('💾 Saved OBS config for auto-connect')

      // Connection success is handled by the 'Identified' event
    } catch (err: any) {
      console.error('Failed to connect to OBS:', err)
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnected(false)
    }
  }, [])

  // Load saved OBS config from electron-store or localStorage
  const loadSavedConfig = useCallback(async (): Promise<OBSConnectionConfig | null> => {
    let config: OBSConnectionConfig | null = null

    if (typeof window !== 'undefined' && (window as any).electronAPI?.storeGet) {
      config = await (window as any).electronAPI.storeGet('obs-connection-config')
    }

    if (!config) {
      const savedConfig = localStorage.getItem('obs-connection-config')
      if (savedConfig) {
        try {
          config = JSON.parse(savedConfig)
        } catch (e) {
          console.error('Failed to parse OBS config from localStorage')
        }
      }
    }

    return config
  }, [])

  // Stop the reconnection loop
  const stopReconnectLoop = useCallback(() => {
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current)
      reconnectIntervalRef.current = null
    }
  }, [])

  // Attempt a single silent connection (no UI error updates on failure)
  const tryReconnect = useCallback(async () => {
    if (!obsRef.current || isConnectingRef.current) return
    if (connectedRef.current) return

    const config = savedConfigRef.current
    if (!config) return

    isConnectingRef.current = true
    try {
      const url = `ws://${config.address}:${config.port}`
      console.log('🔄 Auto-reconnecting to OBS at:', url)
      await obsRef.current.connect(url, config.password)
      // Success handled by 'Identified' event
    } catch {
      // Silent failure — will retry on next interval
    } finally {
      isConnectingRef.current = false
    }
  }, [])

  // Start the persistent reconnection loop (10s interval)
  const startReconnectLoop = useCallback(() => {
    // Don't start if already running or no saved config
    if (reconnectIntervalRef.current) return
    if (!savedConfigRef.current) return

    console.log('🔁 Starting OBS reconnection loop (every 10s)')
    reconnectIntervalRef.current = setInterval(() => {
      if (connectedRef.current) {
        console.log('✅ OBS connected, stopping reconnection loop')
        stopReconnectLoop()
        return
      }
      tryReconnect()
    }, 10000)
  }, [tryReconnect, stopReconnectLoop])

  // Auto-connect on mount and start persistent reconnection
  useEffect(() => {
    if (autoConnectAttempted.current) return
    autoConnectAttempted.current = true

    let cancelled = false
    let initTimeout: NodeJS.Timeout | null = null

    const initAutoConnect = async () => {
      // Wait for OBS client to be initialized
      if (!obsRef.current) {
        initTimeout = setTimeout(initAutoConnect, 500)
        return
      }
      if (cancelled) return

      const config = await loadSavedConfig()
      if (!config) {
        console.log('ℹ️ No saved OBS config found, skipping auto-connect')
        return
      }

      savedConfigRef.current = config
      console.log('🔄 Auto-connecting to OBS:', config.address + ':' + config.port)

      // First attempt immediately
      isConnectingRef.current = true
      try {
        const url = `ws://${config.address}:${config.port}`
        await obsRef.current.connect(url, config.password)
        // Success handled by 'Identified' event
      } catch {
        // OBS not available yet — start reconnection loop
        if (!cancelled) {
          console.log('⏳ OBS not available, will keep retrying every 10s')
          startReconnectLoop()
        }
      } finally {
        isConnectingRef.current = false
      }
    }

    initTimeout = setTimeout(initAutoConnect, 500)

    return () => {
      cancelled = true
      if (initTimeout) clearTimeout(initTimeout)
      stopReconnectLoop()
    }
  }, [connect, loadSavedConfig, startReconnectLoop, stopReconnectLoop])

  const refreshOBSStateInternal = async () => {
    if (!obsRef.current) return

    try {
      const [
        streamStatus,
        recordStatus,
        replayStatus,
        currentScene,
        sceneList,
        inputList
      ] = await Promise.all([
        obsRef.current.call('GetStreamStatus').catch(() => ({ outputActive: false })),
        obsRef.current.call('GetRecordStatus').catch(() => ({ outputActive: false })),
        obsRef.current.call('GetReplayBufferStatus').catch(() => ({ outputActive: false })),
        obsRef.current.call('GetCurrentProgramScene').catch(() => ({ currentProgramSceneName: null })),
        obsRef.current.call('GetSceneList').catch(() => ({ scenes: [] })),
        obsRef.current.call('GetInputList').catch(() => ({ inputs: [] }))
      ])

      setOBSState({
        streaming: streamStatus.outputActive || false,
        recording: recordStatus.outputActive || false,
        replayBufferActive: replayStatus.outputActive || false,
        currentScene: (currentScene as any).currentProgramSceneName || null,
        scenes: ((sceneList as any).scenes || []).map((s: any) => s.sceneName),
        sources: ((inputList as any).inputs || []).map((i: any) => i.inputName)
      })

      console.log('📊 OBS state refreshed:', {
        streaming: streamStatus.outputActive,
        recording: recordStatus.outputActive,
        scenes: ((sceneList as any).scenes || []).length
      })
    } catch (err) {
      console.error('Failed to refresh OBS state:', err)
    }
  }

  const refreshOBSState = useCallback(async () => {
    await refreshOBSStateInternal()
  }, [])

  const disconnect = useCallback(async () => {
    if (!obsRef.current) return

    try {
      console.log('🔌 Disconnecting from OBS')
      await obsRef.current.disconnect()
      setConnected(false)
      setError(null)
    } catch (err) {
      console.error('Failed to disconnect from OBS:', err)
    }
  }, [])

  const executeAction = useCallback(async (action: OBSAction) => {
    if (!obsRef.current || !connected) {
      console.warn('Cannot execute OBS action - not connected')
      return
    }

    try {
      console.log('🎬 Executing OBS action:', action.type, action.params)

      switch (action.type) {
        case 'start_stream':
          await obsRef.current.call('StartStream')
          break

        case 'stop_stream':
          await obsRef.current.call('StopStream')
          break

        case 'toggle_streaming':
          // Query current status directly from OBS to avoid stale state
          const streamStatus = await obsRef.current.call('GetStreamStatus')
          if ((streamStatus as any).outputActive) {
            console.log('Stream is active, stopping...')
            await obsRef.current.call('StopStream')
          } else {
            console.log('Stream is inactive, starting...')
            await obsRef.current.call('StartStream')
          }
          break

        case 'start_recording':
          await obsRef.current.call('StartRecord')
          break

        case 'stop_recording':
          await obsRef.current.call('StopRecord')
          break

        case 'toggle_recording':
          // Query current status directly from OBS to avoid stale state
          const recordStatus = await obsRef.current.call('GetRecordStatus')
          if ((recordStatus as any).outputActive) {
            console.log('Recording is active, stopping...')
            await obsRef.current.call('StopRecord')
          } else {
            console.log('Recording is inactive, starting...')
            await obsRef.current.call('StartRecord')
          }
          break

        case 'start_replay_buffer':
          await obsRef.current.call('StartReplayBuffer')
          break

        case 'stop_replay_buffer':
          await obsRef.current.call('StopReplayBuffer')
          break

        case 'toggle_replay_buffer':
          // Query current status directly from OBS to avoid stale state
          const replayStatus = await obsRef.current.call('GetReplayBufferStatus')
          if ((replayStatus as any).outputActive) {
            console.log('Replay buffer is active, stopping...')
            await obsRef.current.call('StopReplayBuffer')
          } else {
            console.log('Replay buffer is inactive, starting...')
            await obsRef.current.call('StartReplayBuffer')
          }
          break

        case 'save_replay_buffer':
          await obsRef.current.call('SaveReplayBuffer')
          break

        case 'toggle_mute':
          if (action.params?.inputName) {
            await obsRef.current.call('ToggleInputMute', {
              inputName: action.params.inputName
            })
          }
          break

        case 'set_scene':
          if (action.params?.sceneName) {
            await obsRef.current.call('SetCurrentProgramScene', {
              sceneName: action.params.sceneName
            })
          }
          break

        case 'toggle_source_visibility':
          if (action.params?.sceneName && action.params?.sourceName) {
            const itemIdResponse = await obsRef.current.call('GetSceneItemId', {
              sceneName: action.params.sceneName,
              sourceName: action.params.sourceName
            })
            const sceneItemId = (itemIdResponse as any).sceneItemId

            const enabledResponse = await obsRef.current.call('GetSceneItemEnabled', {
              sceneName: action.params.sceneName,
              sceneItemId
            })

            await obsRef.current.call('SetSceneItemEnabled', {
              sceneName: action.params.sceneName,
              sceneItemId,
              sceneItemEnabled: !(enabledResponse as any).sceneItemEnabled
            })
          }
          break

        case 'trigger_hotkey':
          if (action.params?.hotkeyName) {
            await obsRef.current.call('TriggerHotkeyByName', {
              hotkeyName: action.params.hotkeyName
            })
          }
          break

        default:
          console.warn('Unknown OBS action type:', action.type)
      }

      // Refresh state after action
      await refreshOBSStateInternal()
    } catch (err: any) {
      console.error('Failed to execute OBS action:', err)
      setError(err.message || 'Failed to execute action')
    }
  }, [connected])

  const value: OBSContextType = {
    connected,
    connecting,
    error,
    obsState,
    connect,
    disconnect,
    executeAction,
    refreshOBSState
  }

  return (
    <OBSContext.Provider value={value}>
      {children}
    </OBSContext.Provider>
  )
}
