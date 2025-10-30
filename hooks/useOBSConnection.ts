import { useState, useEffect, useCallback, useRef } from 'react'
import OBSWebSocket from 'obs-websocket-js'

export interface OBSConnectionConfig {
  address: string
  port: string
  password: string
}

export interface OBSAction {
  type: 'start_stream' | 'stop_stream' | 'start_recording' | 'stop_recording' |
        'toggle_mute' | 'set_scene' | 'toggle_source_visibility' | 'trigger_hotkey' |
        'start_replay_buffer' | 'stop_replay_buffer' | 'save_replay_buffer'
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

export const useOBSConnection = () => {
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

  // Initialize OBS WebSocket client
  useEffect(() => {
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
        await refreshOBSState()
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
      setOBSState(prev => ({ ...prev, streaming: data.outputActive }))
    })

    obs.on('RecordStateChanged', (data: any) => {
      setOBSState(prev => ({ ...prev, recording: data.outputActive }))
    })

    obs.on('ReplayBufferStateChanged', (data: any) => {
      setOBSState(prev => ({ ...prev, replayBufferActive: data.outputActive }))
    })

    obs.on('CurrentProgramSceneChanged', (data: any) => {
      setOBSState(prev => ({ ...prev, currentScene: data.sceneName }))
    })

    return () => {
      if (obsRef.current) {
        obsRef.current.disconnect()
      }
    }
  }, [])

  const refreshOBSState = useCallback(async () => {
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
    } catch (err) {
      console.error('Failed to refresh OBS state:', err)
    }
  }, [])

  const connect = useCallback(async (config: OBSConnectionConfig) => {
    if (!obsRef.current) return

    setConnecting(true)
    setError(null)

    try {
      const url = `ws://${config.address}:${config.port}`
      console.log('🔌 Connecting to OBS at:', url)

      await obsRef.current.connect(url, config.password)
    } catch (err: any) {
      console.error('Failed to connect to OBS:', err)
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnected(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (!obsRef.current) return

    try {
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

        case 'start_recording':
          await obsRef.current.call('StartRecord')
          break

        case 'stop_recording':
          await obsRef.current.call('StopRecord')
          break

        case 'start_replay_buffer':
          await obsRef.current.call('StartReplayBuffer')
          break

        case 'stop_replay_buffer':
          await obsRef.current.call('StopReplayBuffer')
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
      await refreshOBSState()
    } catch (err: any) {
      console.error('Failed to execute OBS action:', err)
      setError(err.message || 'Failed to execute action')
    }
  }, [connected, refreshOBSState])

  return {
    connected,
    connecting,
    error,
    obsState,
    connect,
    disconnect,
    executeAction,
    refreshOBSState
  }
}
