import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'

export type DiscordConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'awaiting-authorization'
  | 'connected'
  | 'error'

export interface DiscordUser {
  id: string
  username: string
  discriminator?: string
  global_name?: string | null
  avatar?: string | null
}

export interface DiscordStatus {
  status: DiscordConnectionStatus
  error: string | null
  user: DiscordUser | null
}

export interface DiscordPublicConfig {
  clientId: string
  redirectUri: string
  hasSecret: boolean
  hasAuth: boolean
}

export interface DiscordConfigInput {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface DiscordContextType {
  connected: boolean
  connecting: boolean
  awaitingAuthorization: boolean
  status: DiscordConnectionStatus
  error: string | null
  user: DiscordUser | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setConfig: (config: Partial<DiscordConfigInput>) => Promise<DiscordPublicConfig | null>
  getConfig: () => Promise<DiscordPublicConfig | null>
}

const DiscordContext = createContext<DiscordContextType | undefined>(undefined)

export const useDiscord = () => {
  const context = useContext(DiscordContext)
  if (!context) {
    throw new Error('useDiscord must be used within a DiscordProvider')
  }
  return context
}

interface DiscordProviderProps {
  children: ReactNode
}

// The connection itself lives in the main process (named-pipe transport), so
// this context is a thin mirror: it drives connect/disconnect over IPC and
// reflects the pushed status. Shape mirrors OBSContext/LiveSplitContext.
export const DiscordProvider: React.FC<DiscordProviderProps> = ({ children }) => {
  const [status, setStatus] = useState<DiscordConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<DiscordUser | null>(null)
  const autoConnectAttempted = useRef(false)

  const applyStatus = useCallback((s: DiscordStatus | null | undefined) => {
    if (!s) return
    setStatus(s.status)
    setError(s.error ?? null)
    setUser(s.user ?? null)
  }, [])

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.discordConnect) return
    setError(null)
    const result = await window.electronAPI.discordConnect()
    applyStatus(result)
  }, [applyStatus])

  const disconnect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.discordDisconnect) return
    const result = await window.electronAPI.discordDisconnect()
    applyStatus(result)
  }, [applyStatus])

  const setConfig = useCallback(async (config: Partial<DiscordConfigInput>) => {
    if (typeof window === 'undefined' || !window.electronAPI?.discordSetConfig) return null
    return window.electronAPI.discordSetConfig(config)
  }, [])

  const getConfig = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.discordGetConfig) return null
    return window.electronAPI.discordGetConfig()
  }, [])

  // Subscribe to pushed status changes and sync the initial status.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onDiscordStatusChanged) return

    const cleanup = window.electronAPI.onDiscordStatusChanged(applyStatus)

    window.electronAPI.discordStatus?.().then(applyStatus).catch(() => {})

    return () => {
      cleanup?.()
    }
  }, [applyStatus])

  // Auto-connect on mount only if already configured AND previously authorized,
  // so returning users reconnect silently without re-prompting, while first-time
  // users must click "Connect to Discord" (which pops the native consent dialog).
  useEffect(() => {
    if (autoConnectAttempted.current) return
    autoConnectAttempted.current = true

    let cancelled = false

    const tryAutoConnect = async () => {
      const config = await getConfig()
      if (cancelled || !config) return
      if (config.clientId && config.hasAuth) {
        await connect().catch(() => {})
      }
    }

    const timer = setTimeout(tryAutoConnect, 1500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [connect, getConfig])

  const value: DiscordContextType = {
    connected: status === 'connected',
    connecting: status === 'connecting' || status === 'awaiting-authorization',
    awaitingAuthorization: status === 'awaiting-authorization',
    status,
    error,
    user,
    connect,
    disconnect,
    setConfig,
    getConfig,
  }

  return (
    <DiscordContext.Provider value={value}>
      {children}
    </DiscordContext.Provider>
  )
}
