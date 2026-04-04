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
  const [liveSplitState] = useState<LiveSplitState>({
    currentTimerState: 'NotRunning'
  })

  const socketRef = useRef<WebSocket | null>(null)
  const autoConnectAttempted = useRef(false)
  const savedConfigRef = useRef<LiveSplitConnectionConfig | null>(null)
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isConnectingRef = useRef(false)

  // Load saved config from electron-store or localStorage
  const loadSavedConfig = useCallback(async (): Promise<LiveSplitConnectionConfig | null> => {
    let config: LiveSplitConnectionConfig | null = null

    if (typeof window !== 'undefined' && (window as any).electronAPI?.storeGet) {
      config = await (window as any).electronAPI.storeGet('livesplit-connection-config')
    }

    if (!config) {
      const saved = localStorage.getItem('livesplit-connection-config')
      if (saved) {
        try {
          config = JSON.parse(saved)
        } catch (e) {
          console.error('Failed to parse LiveSplit config from localStorage')
        }
      }
    }

    return config
  }, [])

  const stopReconnectLoop = useCallback(() => {
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current)
      reconnectIntervalRef.current = null
    }
  }, [])

  // Attempt a single silent reconnection
  const tryReconnect = useCallback(() => {
    const config = savedConfigRef.current
    if (!config || isConnectingRef.current) return
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return

    // Close stale socket if it's still connecting (not open, not already closed)
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      if (socketRef.current.readyState === WebSocket.OPEN) return
      socketRef.current.close()
      socketRef.current = null
    }

    isConnectingRef.current = true
    try {
      const url = `ws://${config.address}:${config.port}/livesplit`
      console.log('🔄 Auto-reconnecting to LiveSplit at:', url)
      const socket = new WebSocket(url)

      socket.onopen = () => {
        console.log('✅ LiveSplit Server reconnected')
        setConnected(true)
        setConnecting(false)
        setError(null)
        isConnectingRef.current = false
        stopReconnectLoop()
      }

      socket.onerror = () => {
        isConnectingRef.current = false
      }

      socket.onclose = () => {
        setConnected(false)
        setConnecting(false)
        isConnectingRef.current = false
        startReconnectLoop()
      }

      socketRef.current = socket
    } catch {
      isConnectingRef.current = false
    }
  }, [stopReconnectLoop])

  const startReconnectLoop = useCallback(() => {
    if (reconnectIntervalRef.current) return
    if (!savedConfigRef.current) return

    console.log('🔁 Starting LiveSplit reconnection loop (every 10s)')
    reconnectIntervalRef.current = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        stopReconnectLoop()
        return
      }
      tryReconnect()
    }, 10000)
  }, [tryReconnect, stopReconnectLoop])

  // Connect function
  const connect = useCallback(async (config: LiveSplitConnectionConfig) => {
    setConnecting(true)
    setError(null)
    stopReconnectLoop()

    try {
      const url = `ws://${config.address}:${config.port}/livesplit`
      console.log('🏁 Connecting to LiveSplit Server at:', url)

      const socket = new WebSocket(url)

      socket.onopen = () => {
        console.log('✅ LiveSplit Server connected')
        setConnected(true)
        setConnecting(false)
        setError(null)

        // Save config for auto-connect and reconnection
        savedConfigRef.current = config
        if (typeof window !== 'undefined' && (window as any).electronAPI?.storeSet) {
          (window as any).electronAPI.storeSet('livesplit-connection-config', config)
        } else {
          localStorage.setItem('livesplit-connection-config', JSON.stringify(config))
        }
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
        startReconnectLoop()
      }

      socketRef.current = socket
    } catch (err: any) {
      console.error('Failed to connect to LiveSplit Server:', err)
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnected(false)
    }
  }, [stopReconnectLoop, startReconnectLoop])

  // Auto-connect on mount if saved config exists
  useEffect(() => {
    if (autoConnectAttempted.current) return
    autoConnectAttempted.current = true

    let cancelled = false

    const tryAutoConnect = async () => {
      const config = await loadSavedConfig()
      if (!config || cancelled) return

      savedConfigRef.current = config
      console.log('🔄 Auto-connecting to LiveSplit Server with saved config...')

      try {
        await connect(config)
      } catch {
        if (!cancelled) {
          startReconnectLoop()
        }
      }
    }

    setTimeout(tryAutoConnect, 1500)

    return () => {
      cancelled = true
      stopReconnectLoop()
    }
  }, [connect, loadSavedConfig, startReconnectLoop, stopReconnectLoop])

  const disconnect = useCallback(() => {
    stopReconnectLoop()
    savedConfigRef.current = null
    if (socketRef.current) {
      console.log('🔌 Disconnecting from LiveSplit Server')
      socketRef.current.close()
      socketRef.current = null
      setConnected(false)
      setError(null)
    }
  }, [stopReconnectLoop])

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
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current)
      }
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
