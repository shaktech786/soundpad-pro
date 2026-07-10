import React, { useState, useEffect } from 'react'
import { useDiscord } from '../contexts/DiscordContext'
import { usePersistentStorage } from '../hooks/usePersistentStorage'

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
    setConfig,
    getConfig,
  } = useDiscord()

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState('http://localhost')
  const [hasSecret, setHasSecret] = useState(false)
  const [saving, setSaving] = useState(false)

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

  // Prefill from persisted config (secret is never returned — we only learn
  // whether one is already stored).
  useEffect(() => {
    const load = async () => {
      const config = await getConfig()
      if (config) {
        setClientId(config.clientId || '')
        setRedirectUri(config.redirectUri || 'http://localhost')
        setHasSecret(config.hasSecret)
      }
    }
    load()
  }, [getConfig])

  const handleConnect = async () => {
    setSaving(true)
    try {
      await setConfig({
        clientId,
        // Empty string leaves the stored secret untouched (so users don't have
        // to re-paste it every time they open this panel).
        clientSecret,
        redirectUri,
      })
      if (clientSecret) setHasSecret(true)
      setClientSecret('')
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

  const canConnect = clientId.trim().length > 0 && (hasSecret || clientSecret.trim().length > 0)

  return (
    <div className="bg-gray-900 rounded-xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="text-3xl">🎮</span>
          Discord Integration
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Connection Status */}
      <div className="mb-6">
        <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
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
            <div className="font-bold text-white">{statusLabel}</div>
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
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Discord Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Application (client) ID"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Get this from your prelive Discord app config (Discord Developer
              Portal → your application → OAuth2 → Client ID).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Discord Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={hasSecret ? '•••••••• (saved — leave blank to keep)' : 'Client secret'}
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Same application as the prelive web app (OAuth2 → Client Secret).
              Stored locally; used once to exchange the authorization code.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Redirect URI
            </label>
            <input
              type="text"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="http://localhost"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Must match a redirect registered under OAuth2 in the Discord app.
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || saving || !canConnect}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
          >
            {connecting ? 'Connecting…' : 'Connect to Discord'}
          </button>

          {/* Setup Instructions */}
          <div className="mt-4 p-4 bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-400">
              <div className="font-bold text-white mb-2">Setup Instructions:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Make sure the Discord desktop app is running and you are signed in</li>
                <li>Paste the Client ID and Client Secret from your prelive Discord app</li>
                <li>Click <span className="text-white font-semibold">Connect to Discord</span></li>
                <li>On first connect, approve the authorization popup in Discord</li>
                <li>The token is saved — later launches reconnect without prompting</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">Authorized Account</div>
            <div className="font-bold text-white truncate">
              {user ? user.global_name || user.username : 'Connected'}
            </div>
          </div>

          <div className="p-4 bg-gray-800 rounded-lg flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="font-bold text-white">Show currently playing sound in Discord status</div>
              <div className="text-gray-400 text-sm mt-1">
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
                richPresence ? 'bg-indigo-600' : 'bg-gray-600'
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
