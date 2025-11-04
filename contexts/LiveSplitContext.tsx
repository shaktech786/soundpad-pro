import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'

export interface LiveSplitConnectionConfig {
  address: string
  port: string
}

export interface LiveSplitAction {
  type: 'start' | 'split' | 'reset' | 'pause' | 'resume' |
        'skip_split' | 'undo_split' | 'start_or_split' |
        'toggle_pause' | 'init_game_time' | 'smart_toggle'
}

export interface LiveSplitState {
  currentTimerState: 'NotRunning' | 'Running' | 'Ended' | 'Paused'
}

interface LiveSplitContextType {
  connected: boolean
  connecting: boolean
  error: string | null
  liveSplitState: LiveSplitState
  connect: (config: LiveSplitConnectionConfig) => Promise<void>
  disconnect: () => void
  executeAction: (action: LiveSplitAction, isLongPress?: boolean) => Promise<void>
}

const LiveSplitContext = createContext<LiveSplitContextType | undefined>(undefined)

export const useLiveSplit = () => {
  const context = useContext(LiveSplitContext)
  if (!context) {
    throw new Error('useLiveSplit must be used within a LiveSplitProvider')
  }
  return context
}

interface LiveSplitProviderProps {
  children: ReactNode
}

export const LiveSplitProvider: React.FC<LiveSplitProviderProps> = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liveSplitState, setLiveSplitState] = useState<LiveSplitState>({
    currentTimerState: 'NotRunning'
  })

  const socketRef = useRef<WebSocket | null>(null)
  const isInitialized = useRef(false)
  const autoConnectAttempted = useRef(false)
  const stateQueryInterval = useRef<NodeJS.Timeout | null>(null)

  // Connect function
  const connect = useCallback(async (config: LiveSplitConnectionConfig) => {
    setConnecting(true)
    setError(null)

    try {
      const url = `ws://${config.address}:${config.port}/livesplit`
      console.log('🏁 Connecting to LiveSplit Server at:', url)

      const socket = new WebSocket(url)

      socket.onopen = () => {
        console.log('✅ LiveSplit Server connected')
        setConnected(true)
        setConnecting(false)
        setError(null)

        // Save config to localStorage for auto-connect on next launch
        localStorage.setItem('livesplit-connection-config', JSON.stringify(config))
        console.log('💾 Saved LiveSplit config for auto-connect')
      }

      socket.onerror = (err) => {
        console.error('❌ LiveSplit Server connection error:', err)
        setError('Failed to connect to LiveSplit Server')
        setConnected(false)
        setConnecting(false)
      }

      socket.onclose = () => {
        console.log('🔴 LiveSplit Server connection closed')
        setConnected(false)
        setConnecting(false)
      }

      socketRef.current = socket
    } catch (err: any) {
      console.error('Failed to connect to LiveSplit Server:', err)
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
        const savedConfig = localStorage.getItem('livesplit-connection-config')
        if (savedConfig) {
          const config: LiveSplitConnectionConfig = JSON.parse(savedConfig)
          console.log('🔄 Auto-connecting to LiveSplit Server with saved config...')
          await connect(config)
        }
      } catch (err) {
        console.log('No saved LiveSplit config or auto-connect failed:', err)
      }
    }

    // Wait a bit for socket initialization
    setTimeout(tryAutoConnect, 1500)
  }, [connect])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting from LiveSplit Server')
      socketRef.current.close()
      socketRef.current = null
      setConnected(false)
      setError(null)
    }
  }, [])

  const executeAction = useCallback(async (action: LiveSplitAction, isLongPress?: boolean) => {
    // Check if socket exists and is in OPEN state (readyState === 1)
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot execute LiveSplit action - not connected', {
        hasSocket: !!socketRef.current,
        readyState: socketRef.current?.readyState,
        connected: connected
      })
      return
    }

    try {
      let command = ''

      // Handle smart_toggle with long press support
      if (action.type === 'smart_toggle') {
        if (isLongPress) {
          command = 'reset'
          console.log('🏁 Long press detected - resetting timer')
        } else {
          command = 'startorsplit'
          console.log('🏁 Quick press - start or split')
        }
      } else {
        switch (action.type) {
          case 'start':
            command = 'starttimer'
            break
          case 'split':
            command = 'split'
            break
          case 'reset':
            command = 'reset'
            break
          case 'pause':
            command = 'pause'
            break
          case 'resume':
            command = 'resume'
            break
          case 'skip_split':
            command = 'skipsplit'
            break
          case 'undo_split':
            command = 'unsplit'
            break
          case 'start_or_split':
            command = 'startorsplit'
            break
          case 'toggle_pause':
            command = 'togglepause'
            break
          case 'init_game_time':
            command = 'initgametime'
            break
          default:
            console.warn('Unknown LiveSplit action type:', action.type)
            return
        }
      }

      console.log('🏁 Executing LiveSplit command:', command)
      socketRef.current.send(command)
      console.log('✅ LiveSplit command sent successfully')
    } catch (err: any) {
      console.error('❌ Failed to execute LiveSplit action:', err)
      setError(err.message || 'Failed to execute action')
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        console.log('🧹 Cleaning up LiveSplit connection')
        socketRef.current.close()
      }
    }
  }, [])

  const value: LiveSplitContextType = {
    connected,
    connecting,
    error,
    liveSplitState,
    connect,
    disconnect,
    executeAction
  }

  return (
    <LiveSplitContext.Provider value={value}>
      {children}
    </LiveSplitContext.Provider>
  )
}
