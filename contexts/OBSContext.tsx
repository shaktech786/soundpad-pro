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
    })

    obs.on('ConnectionError', (err) => {
      console.error('❌ OBS WebSocket connection error:', err)
      setError(err.message || 'Connection error')
      setConnected(false)
      setConnecting(false)
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

      await obsRef.current.connect(url, config.password)

      // Save config to localStorage for auto-connect on next launch
      localStorage.setItem('obs-connection-config', JSON.stringify(config))
      console.log('💾 Saved OBS config for auto-connect')

      // Connection success is handled by the 'Identified' event
    } catch (err: any) {
      console.error('Failed to connect to OBS:', err)
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnected(false)
    }
  }, [])

  // Auto-connect on mount if saved config exists
  useEffect(() => {
    if (autoConnectAttempted.current) return
    autoConnectAttempted.current = true

    const tryAutoConnect = async () => {
      try {
        const savedConfig = localStorage.getItem('obs-connection-config')
        if (savedConfig) {
          const config: OBSConnectionConfig = JSON.parse(savedConfig)
          console.log('🔄 Auto-connecting to OBS with saved config...')
          await connect(config)
        }
      } catch (err) {
        console.log('No saved OBS config or auto-connect failed:', err)
      }
    }

    // Wait a bit for OBS client to initialize
    setTimeout(tryAutoConnect, 1000)
  }, [connect])

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
          if (obsState.streaming) {
            await obsRef.current.call('StopStream')
          } else {
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
          if (obsState.recording) {
            await obsRef.current.call('StopRecord')
          } else {
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
          if (obsState.replayBufferActive) {
            await obsRef.current.call('StopReplayBuffer')
          } else {
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
            const response = await obsRef.current.call('GetSceneItemId', {
              sceneName: action.params.sceneName,
              sourceName: action.params.sourceName
            })

            await obsRef.current.call('SetSceneItemEnabled', {
              sceneName: action.params.sceneName,
              sceneItemId: (response as any).sceneItemId,
              sceneItemEnabled: !(response as any).sceneItemEnabled
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
