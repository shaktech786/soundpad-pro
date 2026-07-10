import React, { useState, useEffect } from 'react'
import { useOBS, OBSConnectionConfig } from '../contexts/OBSContext'
import { useTheme } from '../contexts/ThemeContext'

interface OBSSettingsProps {
  onClose?: () => void
}

export const OBSSettings: React.FC<OBSSettingsProps> = ({ onClose }) => {
  const { connected, connecting, error, obsState, connect, disconnect } = useOBS()
  const { theme } = useTheme()

  const [config, setConfig] = useState<OBSConnectionConfig>({
    address: 'localhost',
    port: '4455',
    password: ''
  })

  // Load saved config from electron-store or localStorage
  useEffect(() => {
    const loadConfig = async () => {
      try {
        let savedConfig = null

        // Try electron-store first
        if (typeof window !== 'undefined' && (window as any).electronAPI?.storeGet) {
          savedConfig = await (window as any).electronAPI.storeGet('obs-connection-config')
        }

        // Fallback to localStorage
        if (!savedConfig) {
          const localConfig = localStorage.getItem('obs-connection-config')
          if (localConfig) {
            savedConfig = JSON.parse(localConfig)
          }
        }

        if (savedConfig) {
          setConfig(savedConfig)
        }
      } catch (err) {
        console.error('Failed to load OBS config:', err)
      }
    }
    loadConfig()
  }, [])

  const handleConnect = async () => {
    // Config is saved in OBSContext.connect()
    await connect(config)
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  const cardClass = theme === 'light' ? 'bg-gray-100' : 'bg-gray-800'
  const headingClass = theme === 'light' ? 'text-gray-900' : 'text-white'
  const labelClass = theme === 'light' ? 'text-gray-600' : 'text-gray-400'
  const inputClass = theme === 'light'
    ? 'bg-gray-50 text-gray-900 border-gray-300'
    : 'bg-gray-800 text-white border-gray-700'

  return (
    <div className={`rounded-xl p-6 shadow-2xl ${theme === 'light' ? 'bg-white' : 'bg-gray-900'}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-2xl font-bold flex items-center gap-3 ${headingClass}`}>
          <span className="text-3xl">🎬</span>
          OBS Studio Integration
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
          <div className={`w-4 h-4 rounded-full ${connected ? 'bg-green-500 animate-pulse' : connecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
          <div className="flex-1">
            <div className={`font-bold ${headingClass}`}>
              {connected ? 'Connected to OBS' : connecting ? 'Connecting...' : 'Not Connected'}
            </div>
            {error && (
              <div className="text-red-400 text-sm mt-1">{error}</div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Form */}
      {!connected && (
        <div className="space-y-4 mb-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Server Address
            </label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig({ ...config, address: e.target.value })}
              placeholder="localhost"
              className={`w-full px-4 py-2 rounded-lg border focus:border-purple-500 focus:outline-none ${inputClass}`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Port
            </label>
            <input
              type="text"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: e.target.value })}
              placeholder="4455"
              className={`w-full px-4 py-2 rounded-lg border focus:border-purple-500 focus:outline-none ${inputClass}`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelClass}`}>
              Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="Enter OBS WebSocket password"
              className={`w-full px-4 py-2 rounded-lg border focus:border-purple-500 focus:outline-none ${inputClass}`}
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className={`w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors ${
              theme === 'light' ? 'disabled:bg-gray-300' : 'disabled:bg-gray-700'
            }`}
          >
            {connecting ? 'Connecting...' : 'Connect to OBS'}
          </button>

          {/* Setup Instructions */}
          <div className={`mt-4 p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm ${labelClass}`}>
              <div className={`font-bold mb-2 ${headingClass}`}>Setup Instructions:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open OBS Studio</li>
                <li>Go to Tools → WebSocket Server Settings</li>
                <li>Enable WebSocket server</li>
                <li>Note the port (default: 4455) and password</li>
                <li>Enter the credentials above and click Connect</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Connected State - OBS Info */}
      {connected && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg ${cardClass}`}>
              <div className={`text-sm mb-1 ${labelClass}`}>Streaming</div>
              <div className={`font-bold text-lg ${obsState.streaming ? 'text-red-500' : 'text-gray-500'}`}>
                {obsState.streaming ? '🔴 LIVE' : '⚫ Offline'}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${cardClass}`}>
              <div className={`text-sm mb-1 ${labelClass}`}>Recording</div>
              <div className={`font-bold text-lg ${obsState.recording ? 'text-red-500' : 'text-gray-500'}`}>
                {obsState.recording ? '🔴 REC' : '⚫ Stopped'}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${cardClass}`}>
              <div className={`text-sm mb-1 ${labelClass}`}>Current Scene</div>
              <div className={`font-bold truncate ${headingClass}`}>
                {obsState.currentScene || 'Unknown'}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${cardClass}`}>
              <div className={`text-sm mb-1 ${labelClass}`}>Replay Buffer</div>
              <div className={`font-bold text-lg ${obsState.replayBufferActive ? 'text-green-500' : 'text-gray-500'}`}>
                {obsState.replayBufferActive ? '✅ Active' : '⚫ Inactive'}
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm mb-2 ${labelClass}`}>Available Scenes ({obsState.scenes.length})</div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
              {obsState.scenes.map((scene, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    scene === obsState.currentScene
                      ? 'bg-purple-600 text-white'
                      : theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {scene}
                </span>
              ))}
            </div>
          </div>

          <div className={`p-4 rounded-lg ${cardClass}`}>
            <div className={`text-sm mb-2 ${labelClass}`}>Available Sources ({obsState.sources.length})</div>
            <div className="max-h-32 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-2">
                {obsState.sources.slice(0, 10).map((source, idx) => (
                  <span key={idx} className={`px-2 py-1 text-xs rounded truncate ${
                    theme === 'light' ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {source}
                  </span>
                ))}
              </div>
              {obsState.sources.length > 10 && (
                <div className="text-gray-500 text-xs mt-2">
                  ...and {obsState.sources.length - 10} more
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
          >
            Disconnect from OBS
          </button>
        </div>
      )}
    </div>
  )
}
