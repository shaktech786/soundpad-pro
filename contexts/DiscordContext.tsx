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

export interface DiscordAction {
  type:
    | 'mute'
    | 'unmute'
    | 'toggle_mute'
    | 'deafen'
    | 'undeafen'
    | 'toggle_deafen'
    | 'push_to_talk'
}

export interface DiscordVoiceSettings {
  mute?: boolean
  deaf?: boolean
  [key: string]: unknown
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
  // Fire a mute/deafen/toggle action on press (mirrors OBS's press-fire model).
  executeAction: (action: DiscordAction) => Promise<void>
  // Push-to-talk: active=true unmutes (on press), active=false remutes (on release).
  setPushToTalk: (active: boolean) => Promise<void>
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

  // Keep a ref of the live connection state so the action helpers (called from
  // the dispatch loop) never fire IPC against a dead connection via a stale
  // closure — same pattern the audio engine uses for its mode flag.
  const connectedRef = useRef(false)
  useEffect(() => {
    connectedRef.current = status === 'connected'
  }, [status])

  const setVoiceSettings = useCallback(
    async (settings: DiscordVoiceSettings): Promise<DiscordVoiceSettings | null> => {
      if (typeof window === 'undefined' || !window.electronAPI?.discordSetVoiceSettings) return null
      if (!connectedRef.current) return null
      try {
        return await window.electronAPI.discordSetVoiceSettings(settings)
      } catch (err) {
        console.warn('Discord setVoiceSettings failed:', err)
        return null
      }
    },
    [],
  )

  const getVoiceSettings = useCallback(async (): Promise<DiscordVoiceSettings | null> => {
    if (typeof window === 'undefined' || !window.electronAPI?.discordGetVoiceSettings) return null
    if (!connectedRef.current) return null
    try {
      return await window.electronAPI.discordGetVoiceSettings()
    } catch (err) {
      console.warn('Discord getVoiceSettings failed:', err)
      return null
    }
  }, [])

  const setPushToTalk = useCallback(
    async (active: boolean) => {
      // Press unmutes; release remutes.
      await setVoiceSettings({ mute: !active })
    },
    [setVoiceSettings],
  )

  const executeAction = useCallback(
    async (action: DiscordAction) => {
      switch (action.type) {
        case 'mute':
          await setVoiceSettings({ mute: true })
          break
        case 'unmute':
          await setVoiceSettings({ mute: false })
          break
        case 'deafen':
          await setVoiceSettings({ deaf: true })
          break
        case 'undeafen':
          await setVoiceSettings({ deaf: false })
          break
        case 'toggle_mute': {
          const current = await getVoiceSettings()
          await setVoiceSettings({ mute: !(current?.mute ?? false) })
          break
        }
        case 'toggle_deafen': {
          const current = await getVoiceSettings()
          await setVoiceSettings({ deaf: !(current?.deaf ?? false) })
          break
        }
        case 'push_to_talk':
          // Click-to-test only: a momentary unmute then remute.
          await setPushToTalk(true)
          await setPushToTalk(false)
          break
      }
    },
    [setVoiceSettings, getVoiceSettings, setPushToTalk],
  )

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
    executeAction,
    setPushToTalk,
  }

  return (
    <DiscordContext.Provider value={value}>
      {children}
    </DiscordContext.Provider>
  )
}
