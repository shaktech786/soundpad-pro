import React, { useEffect, useState } from 'react'

export const ControllerDiagnostics: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState({
    apiSupported: false,
    gamepadsConnected: 0,
    rawGamepads: [] as any[],
    error: null as string | null,
    timestamp: new Date().toISOString()
  })

  useEffect(() => {
    const checkGamepadSupport = () => {
      const supported = 'getGamepads' in navigator
      const gamepads = supported ? navigator.getGamepads() : []
      const connectedGamepads = []
      
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          connectedGamepads.push({
            index: i,
            id: gamepads[i]!.id,
            connected: gamepads[i]!.connected,
            mapping: gamepads[i]!.mapping,
            buttons: gamepads[i]!.buttons.length,
            axes: gamepads[i]!.axes.length,
            timestamp: gamepads[i]!.timestamp
          })
        }
      }

      setDiagnostics({
        apiSupported: supported,
        gamepadsConnected: connectedGamepads.length,
        rawGamepads: connectedGamepads,
        error: !supported ? 'Gamepad API not supported in this browser' : null,
        timestamp: new Date().toISOString()
      })
    }

    // Initial check
    checkGamepadSupport()

    // Poll for changes
    const interval = setInterval(checkGamepadSupport, 1000)

    // Listen for gamepad events
    const handleConnect = (e: GamepadEvent) => {
      console.log('Gamepad connected event:', e)
      checkGamepadSupport()
    }

    const handleDisconnect = (e: GamepadEvent) => {
      console.log('Gamepad disconnected event:', e)
      checkGamepadSupport()
    }

    window.addEventListener('gamepadconnected', handleConnect)
    window.addEventListener('gamepaddisconnected', handleDisconnect)

    return () => {
      clearInterval(interval)
      window.removeEventListener('gamepadconnected', handleConnect)
      window.removeEventListener('gamepaddisconnected', handleDisconnect)
    }
  }, [])

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 p-4 rounded-lg shadow-lg max-w-md text-xs">
      <h3 className="font-bold mb-2 text-yellow-400">Controller Diagnostics</h3>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">API Support:</span>{' '}
          <span className={diagnostics.apiSupported ? 'text-green-400' : 'text-red-400'}>
            {diagnostics.apiSupported ? 'YES' : 'NO'}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Connected:</span>{' '}
          <span className="text-white">{diagnostics.gamepadsConnected}</span>
        </div>
        {diagnostics.error && (
          <div className="text-red-400">Error: {diagnostics.error}</div>
        )}
        {diagnostics.rawGamepads.length > 0 && (
          <div className="mt-2">
            <div className="font-semibold text-gray-300">Detected Controllers:</div>
            {diagnostics.rawGamepads.map((gp, i) => (
              <div key={i} className="ml-2 mt-1 p-1 bg-gray-700 rounded">
                <div className="text-green-400">#{gp.index}: {gp.id}</div>
                <div className="text-gray-400">
                  Buttons: {gp.buttons}, Axes: {gp.axes}
                </div>
                <div className="text-gray-400">
                  Mapping: {gp.mapping || 'standard'}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-gray-500 mt-2">
          Last update: {new Date(diagnostics.timestamp).toLocaleTimeString()}
        </div>
      </div>
      <div className="mt-2 text-gray-400">
        <div>Tips:</div>
        <div className="text-xs">• Press any button on controller</div>
        <div className="text-xs">• Try unplugging and reconnecting</div>
        <div className="text-xs">• Check Windows Game Controller settings</div>
      </div>
    </div>
  )
}