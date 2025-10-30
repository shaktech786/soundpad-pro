import React, { useState, useEffect } from 'react'
import { useOBS, OBSConnectionConfig } from '../contexts/OBSContext'

interface OBSSettingsProps {
  onClose?: () => void
}

export const OBSSettings: React.FC<OBSSettingsProps> = ({ onClose }) => {
  const { connected, connecting, error, obsState, connect, disconnect } = useOBS()

  const [config, setConfig] = useState<OBSConnectionConfig>({
    address: 'localhost',
    port: '4455',
    password: ''
  })

  // Load saved config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('obs-connection-config')
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig))
      } catch (err) {
        console.error('Failed to load OBS config:', err)
      }
    }
  }, [])

  const handleConnect = async () => {
    // Save config
    localStorage.setItem('obs-connection-config', JSON.stringify(config))
    await connect(config)
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="text-3xl">🎬</span>
          OBS Studio Integration
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
          <div className={`w-4 h-4 rounded-full ${connected ? 'bg-green-500 animate-pulse' : connecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
          <div className="flex-1">
            <div className="font-bold text-white">
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
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Server Address
            </label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig({ ...config, address: e.target.value })}
              placeholder="localhost"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Port
            </label>
            <input
              type="text"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: e.target.value })}
              placeholder="4455"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="Enter OBS WebSocket password"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
          >
            {connecting ? 'Connecting...' : 'Connect to OBS'}
          </button>

          {/* Setup Instructions */}
          <div className="mt-4 p-4 bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-400">
              <div className="font-bold text-white mb-2">Setup Instructions:</div>
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
            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Streaming</div>
              <div className={`font-bold text-lg ${obsState.streaming ? 'text-red-500' : 'text-gray-500'}`}>
                {obsState.streaming ? '🔴 LIVE' : '⚫ Offline'}
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Recording</div>
              <div className={`font-bold text-lg ${obsState.recording ? 'text-red-500' : 'text-gray-500'}`}>
                {obsState.recording ? '🔴 REC' : '⚫ Stopped'}
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Current Scene</div>
              <div className="font-bold text-white truncate">
                {obsState.currentScene || 'Unknown'}
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Replay Buffer</div>
              <div className={`font-bold text-lg ${obsState.replayBufferActive ? 'text-green-500' : 'text-gray-500'}`}>
                {obsState.replayBufferActive ? '✅ Active' : '⚫ Inactive'}
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800 rounded-lg">
            <div className="text-gray-400 text-sm mb-2">Available Scenes ({obsState.scenes.length})</div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
              {obsState.scenes.map((scene, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    scene === obsState.currentScene
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {scene}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 bg-gray-800 rounded-lg">
            <div className="text-gray-400 text-sm mb-2">Available Sources ({obsState.sources.length})</div>
            <div className="max-h-32 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-2">
                {obsState.sources.slice(0, 10).map((source, idx) => (
                  <span key={idx} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded truncate">
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
