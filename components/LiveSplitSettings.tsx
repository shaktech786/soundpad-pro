import React, { useState, useEffect } from 'react'
import { useLiveSplit, LiveSplitConnectionConfig } from '../contexts/LiveSplitContext'
import { useTheme } from '../contexts/ThemeContext'

interface LiveSplitSettingsProps {
  onClose: () => void
}

export const LiveSplitSettings: React.FC<LiveSplitSettingsProps> = ({ onClose }) => {
  const { connected, connecting, error, connect, disconnect } = useLiveSplit()
  const { theme } = useTheme()

  const [config, setConfig] = useState<LiveSplitConnectionConfig>({
    address: 'localhost',
    port: '16834' // Default LiveSplit Server port
  })

  // Load saved config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('livesplit-connection-config')
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig))
      } catch (err) {
        console.error('Failed to load saved LiveSplit config:', err)
      }
    }
  }, [])

  // Keyboard support: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleConnect = async () => {
    await connect(config)
  }

  const handleDisconnect = () => {
    disconnect()
  }

  const headingClass = theme === 'light' ? 'text-gray-900' : 'text-white'
  const labelClass = theme === 'light' ? 'text-gray-600' : 'text-gray-400'
  const cardClass = theme === 'light' ? 'bg-gray-100' : 'bg-gray-800'
  const inputClass = theme === 'light'
    ? 'bg-gray-50 text-gray-900 border-gray-300'
    : 'bg-gray-800 text-white border-gray-700'

  return (
    <div className={`rounded-xl p-6 max-w-2xl w-full shadow-2xl animate-scale-in ${theme === 'light' ? 'bg-white' : 'bg-gray-900'}`} role="dialog" aria-modal="true" aria-labelledby="livesplit-title">
      <div className="flex justify-between items-center mb-6">
        <h2 id="livesplit-title" className={`text-2xl font-bold flex items-center gap-3 ${headingClass}`}>
          <span className="text-3xl" role="img" aria-label="Racing flag">🏁</span>
          LiveSplit Server Settings
        </h2>
        <button
          onClick={onClose}
          className={`px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 ${
            theme === 'light'
              ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
          aria-label="Close LiveSplit settings"
        >
          ✕
        </button>
      </div>

      {/* Connection Status */}
      <div className="mb-6">
        <div className={`px-4 py-3 rounded-lg flex items-center gap-3 ${
          connected ? (theme === 'light' ? 'bg-green-100 border-2 border-green-400' : 'bg-green-900/50 border-2 border-green-500') :
          connecting ? (theme === 'light' ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-yellow-900/50 border-2 border-yellow-500') :
          error ? (theme === 'light' ? 'bg-red-100 border-2 border-red-400' : 'bg-red-900/50 border-2 border-red-500') :
          (theme === 'light' ? 'bg-gray-100 border-2 border-gray-200' : 'bg-gray-800 border-2 border-gray-700')
        }`}>
          <span className="text-2xl">
            {connected ? '✅' : connecting ? '⏳' : error ? '❌' : '⚪'}
          </span>
          <div className="flex-1">
            <div className={`font-bold ${headingClass}`}>
              {connected ? 'Connected to LiveSplit Server' :
               connecting ? 'Connecting...' :
               error ? 'Connection Failed' :
               'Not Connected'}
            </div>
            {error && (
              <div className="text-sm text-red-400 mt-1">{error}</div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Form */}
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Server Address
            </label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig(prev => ({ ...prev, address: e.target.value }))}
              placeholder="localhost"
              disabled={connected}
              className={`w-full px-4 py-2 rounded-lg border focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${inputClass}`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Port
            </label>
            <input
              type="text"
              value={config.port}
              onChange={(e) => setConfig(prev => ({ ...prev, port: e.target.value }))}
              placeholder="16834"
              disabled={connected}
              className={`w-full px-4 py-2 rounded-lg border focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${inputClass}`}
            />
          </div>
        </div>

        {/* Connect/Disconnect Button */}
        <div>
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? '⏳ Connecting...' : '🔌 Connect to LiveSplit Server'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              🔌 Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className={`rounded-lg p-4 ${cardClass}`}>
        <div className={`text-sm space-y-2 ${headingClass}`}>
          <div className="font-bold mb-2">📝 Setup Instructions:</div>
          <ol className={`list-decimal list-inside space-y-1 ml-2 ${labelClass}`}>
            <li>Open LiveSplit</li>
            <li>Right-click LiveSplit → Control → Start Server</li>
            <li>Default port is 16834</li>
            <li>Click "Connect to LiveSplit Server" above</li>
            <li>Assign LiveSplit actions to your controller buttons!</li>
          </ol>
          <div className={`mt-4 pt-4 border-t ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
            <div className={`font-bold mb-1 ${headingClass}`}>🎮 Available Actions:</div>
            <div className={`text-xs ${labelClass}`}>
              Start Timer • Split • Reset • Pause/Resume • Undo Split • Skip Split • and more!
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
