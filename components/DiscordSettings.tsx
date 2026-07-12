import React, { useEffect, useState } from 'react'
import { useDiscord } from '../contexts/DiscordContext'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { useTheme } from '../contexts/ThemeContext'

interface DiscordSettingsProps {
  onClose?: () => void
}

export const DiscordSettings: React.FC<DiscordSettingsProps> = ({ onClose }) => {
  const {
    connected,
    connecting,
    awaitingAuthorization,
    error,
    user,
    connect,
    disconnect,
    getConfig,
    setClientSecret,
  } = useDiscord()
  const { theme } = useTheme()

  const [clientSecret, setClientSecretInput] = useState('')
  const [hasClientSecret, setHasClientSecret] = useState(false)
  const [saving, setSaving] = useState(false)

  // Prefill "already configured" state (never the secret value itself — it's
  // never sent back from the main process once stored).
  useEffect(() => {
    let cancelled = false
    getConfig().then((config) => {
      if (!cancelled && config) setHasClientSecret(config.hasClientSecret)
    })
    return () => {
      cancelled = true
    }
  }, [getConfig])

  // App-level toggle (not profile-scoped) for showing the currently playing
  // sound as Discord Rich Presence. Persisted alongside other integration
  // settings; the main process reads the same key to drive SET_ACTIVITY.
  const [richPresence, setRichPresence] = usePersistentStorage<boolean>(
    'discord-rich-presence-enabled',
    true,
  )

  const toggleRichPresence = () => {
    const next = !richPresence
    setRichPresence(next)
    // Apply instantly (main clears or re-pushes presence) without waiting for
    // the persisted-store write to land.
    void window.electronAPI?.discordRefreshActivity?.(next)
  }

  const handleConnect = async () => {
    setSaving(true)
    try {
      if (clientSecret.trim()) {
        const result = await setClientSecret(clientSecret.trim())
        if (result) setHasClientSecret(result.hasClientSecret)
        setClientSecretInput('')
      }
      await connect()
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  const statusLabel = connected
    ? 'Connected to Discord'
    : awaitingAuthorization
      ? 'Waiting for authorization…'
      : connecting
        ? 'Connecting…'
        : 'Not Connected'

  const cardClass = theme === 'light' ? 'bg-gray-100' : 'bg-gray-800'
  const headingClass = theme === 'light' ? 'text-gray-900' : 'text-white'
  const labelClass = theme === 'light' ? 'text-gray-600' : 'text-gray-400'

  return (
    <div className={`rounded-xl p-6 shadow-2xl ${theme === 'light' ? 'bg-white' : 'bg-gray-900'}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-2xl font-bold flex items-center gap-3 ${headingClass}`}>
          <span className="text-3xl">🎮</span>
          Discord Integration
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition-colors ${
              theme === 'light'
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Close
          </button>
        )}
      </div>

      {/* Connection Status */}
      <div className="mb-6">
        <div className={`flex items-center gap-4 p-4 rounded-lg ${cardClass}`}>
          <div
            className={`w-4 h-4 rounded-full ${
              connected
                ? 'bg-green-500 animate-pulse'
                : connecting
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
            }`}
          />
          <div className="flex-1">
            <div className={`font-bold ${headingClass}`}>{statusLabel}</div>
            {connected && user && (
              <div className="text-green-400 text-sm mt-1">
                {user.global_name || user.username}
              </div>
            )}
            {awaitingAuthorization && (
              <div className="text-yellow-400 text-sm mt-1">
                Approve the popup in your Discord client to finish connecting.
              </div>
            )}
            {error && !connecting && (
              <div className="text-red-400 text-sm mt-1">{error}</div>
            )}
          </div>
        </div>
      </div>

      {!connected && (
        <div className="space-y-4 mb-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Discord Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecretInput(e.target.value)}
              placeholder={hasClientSecret ? '•••••••• (saved — leave blank to keep)' : 'Client secret'}
              className={`w-full px-4 py-2 rounded-lg border focus:border-indigo-500 focus:outline-none ${
                theme === 'light'
                  ? 'bg-gray-50 text-gray-900 border-gray-300'
                  : 'bg-gray-800 text-white border-gray-700'
              }`}
            />
            <p className={`text-xs mt-1 ${labelClass}`}>
              From prelive&apos;s Discord app (OAuth2 → Client Secret) — the same one prelive
              itself uses. Stored locally on this machine only, never sent anywhere else.
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || saving || (!hasClientSecret && !clientSecret.trim())}
            className={`w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors ${
              theme === 'light' ? 'disabled:bg-gray-300' : 'disabled:bg-gray-700'
            }`}
          >
            {connecting ? 'Connecting…' : 'Connect to Discord'}
          </button>

          {/* Setup Instructions */}
          <div className={`mt-4 p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm ${labelClass}`}>
              <div className={`font-bold mb-2 ${headingClass}`}>Setup Instructions:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Make sure the Discord desktop app is running and you are signed in</li>
                <li>Paste the Client Secret from prelive&apos;s Discord app</li>
                <li>Click <span className={`font-semibold ${headingClass}`}>Connect to Discord</span></li>
                <li>Approve the authorization popup in Discord</li>
                <li>The token is saved — later launches reconnect without prompting</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm mb-1 ${labelClass}`}>Authorized Account</div>
            <div className={`font-bold truncate ${headingClass}`}>
              {user ? user.global_name || user.username : 'Connected'}
            </div>
          </div>

          <div className={`p-4 rounded-lg flex items-center justify-between gap-4 ${cardClass}`}>
            <div className="flex-1">
              <div className={`font-bold ${headingClass}`}>Show currently playing sound in Discord status</div>
              <div className={`text-sm mt-1 ${labelClass}`}>
                Displays a Rich Presence status with the sound you&apos;re playing.
                Clears automatically when playback stops.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={richPresence}
              aria-label="Show currently playing sound in Discord status"
              onClick={toggleRichPresence}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                richPresence ? 'bg-indigo-600' : theme === 'light' ? 'bg-gray-300' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  richPresence ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
          >
            Disconnect from Discord
          </button>
        </div>
      )}
    </div>
  )
}
