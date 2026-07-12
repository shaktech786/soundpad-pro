import React, { useState } from 'react'
import { usePrelive } from '../contexts/PreliveContext'
import { useTheme } from '../contexts/ThemeContext'

interface PreliveSettingsProps {
  onClose?: () => void
}

export const PreliveSettings: React.FC<PreliveSettingsProps> = ({ onClose }) => {
  const { connected, connecting, error, gameCount, setApiKey, disconnect } = usePrelive()
  const { theme } = useTheme()

  const [apiKeyInput, setApiKeyInput] = useState('')

  const handleConnect = async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    await setApiKey(key)
    // Never keep the plaintext key sitting in component state after submitting it.
    setApiKeyInput('')
  }

  const handleDisconnect = async () => {
    await disconnect()
    setApiKeyInput('')
  }

  const statusLabel = connected
    ? `Connected — ${gameCount} game${gameCount === 1 ? '' : 's'}`
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
          <span className="text-3xl">🎥</span>
          Prelive Integration
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
            {connected && (
              <div className="text-green-400 text-sm mt-1">
                Your streamed-game history is the top game-detection source.
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
            <label className={`block text-sm font-semibold mb-2 ${headingClass}`} htmlFor="prelive-api-key">
              API Key
            </label>
            <input
              id="prelive-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConnect()
              }}
              placeholder="prl_live_…"
              className={`w-full px-4 py-3 rounded-lg font-mono text-sm outline-none transition-colors border ${
                theme === 'light'
                  ? 'bg-gray-50 border-gray-300 text-gray-900 focus:border-emerald-500'
                  : 'bg-gray-800 border-gray-700 text-white focus:border-emerald-500'
              }`}
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || !apiKeyInput.trim()}
            className={`w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors ${
              theme === 'light' ? 'disabled:bg-gray-300' : 'disabled:bg-gray-700'
            }`}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>

          {/* Setup Instructions */}
          <div className={`mt-4 p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm ${labelClass}`}>
              <div className={`font-bold mb-2 ${headingClass}`}>Setup Instructions:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Go to{' '}
                  <span className={`font-semibold ${headingClass}`}>prelive.ai/settings?tab=api-keys</span>
                </li>
                <li>
                  Create a new key and check <span className={`font-semibold ${headingClass}`}>ONLY</span>{' '}
                  the <span className={`font-semibold ${headingClass}`}>games:read</span> scope
                </li>
                <li>Copy the key (it&apos;s shown only once)</li>
                <li>Paste it here and click <span className={`font-semibold ${headingClass}`}>Connect</span></li>
              </ol>
              <div className={`mt-3 pt-3 border-t ${theme === 'light' ? 'border-gray-300' : 'border-gray-700'}`}>
                Treat the key like a password — it&apos;s stored locally and never shown again. Grant it
                nothing beyond <span className={`font-semibold ${headingClass}`}>games:read</span>. Revoke it
                anytime in prelive&apos;s settings to cut off access immediately.
              </div>
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm mb-1 ${labelClass}`}>Streamed games synced</div>
            <div className={`font-bold ${headingClass}`}>
              {gameCount} game{gameCount === 1 ? '' : 's'}
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
          >
            Disconnect from Prelive
          </button>
        </div>
      )}
    </div>
  )
}
