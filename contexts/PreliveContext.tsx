import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

// Mirrors the main-process PreliveClient.getStatus() shape. NEVER carries the
// API key — only whether the last history fetch succeeded and the cached count.
export interface PreliveStatus {
  connected: boolean
  error: string | null
  gameCount: number
  lastFetchAt: number | null
}

interface PreliveContextType {
  connected: boolean
  // True while a just-submitted key is being verified against prelive (the
  // set-api-key IPC round-trip). Purely a UI affordance for the Connect button.
  connecting: boolean
  error: string | null
  gameCount: number
  lastFetchAt: number | null
  // Store a key and fetch the history immediately; resolves once status settles.
  setApiKey: (key: string) => Promise<void>
  // Clear the stored key + cached tier; detection falls back to local + curated.
  disconnect: () => Promise<void>
}

const PreliveContext = createContext<PreliveContextType | undefined>(undefined)

export const usePrelive = () => {
  const context = useContext(PreliveContext)
  if (!context) {
    throw new Error('usePrelive must be used within a PreliveProvider')
  }
  return context
}

interface PreliveProviderProps {
  children: ReactNode
}

// The pairing + polling lives in the main process (holds the credential, makes
// the HTTPS calls); this context is a thin IPC mirror — much simpler than
// DiscordContext since there's no OAuth handshake, just connect/status/disconnect.
export const PreliveProvider: React.FC<PreliveProviderProps> = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameCount, setGameCount] = useState(0)
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)

  const applyStatus = useCallback((s: PreliveStatus | null | undefined) => {
    if (!s) return
    setConnected(!!s.connected)
    setError(s.error ?? null)
    setGameCount(s.gameCount ?? 0)
    setLastFetchAt(s.lastFetchAt ?? null)
  }, [])

  const setApiKey = useCallback(
    async (key: string) => {
      if (typeof window === 'undefined' || !window.electronAPI?.preliveSetApiKey) return
      setConnecting(true)
      setError(null)
      try {
        const result = await window.electronAPI.preliveSetApiKey(key)
        applyStatus(result)
      } finally {
        setConnecting(false)
      }
    },
    [applyStatus],
  )

  const disconnect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.preliveDisconnect) return
    const result = await window.electronAPI.preliveDisconnect()
    applyStatus(result)
  }, [applyStatus])

  // Subscribe to pushed status changes (background refreshes, auth failures) and
  // seed the initial status on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onPreliveStatusChanged) return

    const cleanup = window.electronAPI.onPreliveStatusChanged(applyStatus)

    window.electronAPI.preliveGetStatus?.().then(applyStatus).catch(() => {})

    return () => {
      cleanup?.()
    }
  }, [applyStatus])

  const value: PreliveContextType = {
    connected,
    connecting,
    error,
    gameCount,
    lastFetchAt,
    setApiKey,
    disconnect,
  }

  return <PreliveContext.Provider value={value}>{children}</PreliveContext.Provider>
}
