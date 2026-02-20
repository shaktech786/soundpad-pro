import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'

// Mirror of GP2040-CE GpioAction enum (only the button-relevant ones)
const ACTION_LABELS: Record<number, string> = {
  [-10]: 'None',
  [-5]: 'Reserved',
  0: 'Addon',
  1: 'Up', 2: 'Down', 3: 'Left', 4: 'Right',
  5: 'B1 (B)', 6: 'B2 (A)', 7: 'B3 (Y)', 8: 'B4 (X)',
  9: 'L1 (L)', 10: 'R1 (R)', 11: 'L2 (ZL)', 12: 'R2 (ZR)',
  13: 'S1 (Minus)', 14: 'S2 (Plus)',
  15: 'A1 (Home)', 16: 'A2 (Capture)',
  17: 'L3', 18: 'R3', 19: 'Function',
  20: 'DDI Up', 21: 'DDI Down', 22: 'DDI Left', 23: 'DDI Right',
  32: 'Turbo',
  41: 'A3', 42: 'A4',
  43: 'Extra 1', 44: 'Extra 2', 45: 'Extra 3', 46: 'Extra 4',
  47: 'Extra 5', 48: 'Extra 6', 49: 'Extra 7', 50: 'Extra 8',
  51: 'Extra 9', 52: 'Extra 10', 53: 'Extra 11', 54: 'Extra 12',
  59: 'LS X-', 60: 'LS X+', 61: 'LS Y-', 62: 'LS Y+',
  63: 'RS X-', 64: 'RS X+', 65: 'RS Y-', 66: 'RS Y+',
}

// Actions that produce Switch mode gamepad output → Gamepad API index
const ACTION_TO_GAMEPAD: Record<number, number> = {
  5: 0, 6: 1, 7: 2, 8: 3,       // B1-B4
  9: 4, 10: 5, 11: 6, 12: 7,    // L1,R1,L2,R2
  13: 8, 14: 9,                   // S1, S2
  17: 10, 18: 11,                 // L3, R3
  15: 16, 16: 17,                 // A1, A2
  1: 300, 2: 302, 3: 303, 4: 301, // D-pad hat switch
}

interface PinInfo {
  gpio: number
  actionId: number
  actionName: string
  label: string
  gamepadIndex: number | null
  isActive: boolean
}

interface Issue {
  type: string
  message: string
  action?: string
  gpios?: number[]
  gamepadIndex?: number | null
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export default function ControllerConfigPage() {
  const { buttonStates, connected: gamepadConnected } = useSimpleGamepad()
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [firmwareVersion, setFirmwareVersion] = useState('')
  const [pins, setPins] = useState<PinInfo[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [gamepadOptions, setGamepadOptions] = useState<any>(null)
  const [metadata, setMetadata] = useState<Record<string, any>>({})
  const [error, setError] = useState('')
  const [liveButtonLog, setLiveButtonLog] = useState<number[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [rawData, setRawData] = useState<any>(null)

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null

  // Track live button presses
  useEffect(() => {
    const pressed = Array.from(buttonStates.entries())
      .filter(([_, v]) => v)
      .map(([k]) => k)
    if (pressed.length > 0) {
      setLiveButtonLog(prev => {
        const next = [...prev]
        for (const id of pressed) {
          if (next[next.length - 1] !== id) next.push(id)
        }
        return next.slice(-40)
      })
    }
  }, [buttonStates])

  const connect = useCallback(async () => {
    if (!api) return
    setConnectionState('connecting')
    setError('')

    const result = await api.gp2040CheckConnection()
    if (result.connected) {
      setConnectionState('connected')
      const v = result.version
      setFirmwareVersion(v?.version || (typeof v === 'string' ? v : JSON.stringify(v)))

      const [mappingsResult, optionsResult] = await Promise.all([
        api.gp2040GetPinMappings(),
        api.gp2040GetGamepadOptions(),
      ])

      if (mappingsResult.success) {
        setPins(mappingsResult.pins || [])
        setIssues(mappingsResult.issues || [])
        setMetadata(mappingsResult.metadata || {})
        setRawData(mappingsResult.rawData || null)
      } else {
        setError(`Pin mappings: ${mappingsResult.error}`)
        setRawData(mappingsResult.rawData || null)
      }

      if (optionsResult.success) {
        setGamepadOptions(optionsResult.options)
      }
    } else {
      setConnectionState('error')
      setError(result.error || 'Cannot reach controller')
    }
  }, [api])

  const navigate = useCallback((route: string) => {
    if (api?.navigate) {
      api.navigate(route)
    } else {
      window.location.href = route
    }
  }, [api])

  const activePins = pins.filter(p => p.isActive)
  const inactivePins = pins.filter(p => !p.isActive)

  // Build duplicate map for highlighting
  const duplicateGpios = new Set<number>()
  for (const issue of issues) {
    if (issue.type === 'duplicate' && issue.gpios) {
      for (const g of issue.gpios) duplicateGpios.add(g)
    }
  }

  // Dead button GPIOs (extra buttons with no Switch output)
  const deadGpios = new Set<number>()
  for (const issue of issues) {
    if (issue.type === 'no_gamepad_output' && (issue as any).gpio !== undefined) {
      deadGpios.add((issue as any).gpio)
    }
  }

  return (
    <>
      <Head>
        <title>Controller Config - SoundPad Pro</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-5xl mx-auto px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Controller Configuration</h1>
              <p className="text-gray-400 mt-1">Read GP2040-CE GPIO pin mappings and identify duplicate buttons</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
            >
              Back to SoundPad
            </button>
          </div>

          {/* Connection */}
          <div className="bg-gray-900 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">GP2040-CE Connection</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionState === 'connected' ? 'bg-green-500' :
                connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                connectionState === 'error' ? 'bg-red-500' : 'bg-gray-600'
              }`} />
              <span className="text-gray-300 text-sm">
                {connectionState === 'connected'
                  ? `Connected — Firmware ${firmwareVersion}${metadata.profileLabel ? ` — Profile: ${metadata.profileLabel}` : ''}`
                  : connectionState === 'connecting' ? 'Connecting to 192.168.7.1...'
                  : connectionState === 'error' ? 'Connection Failed'
                  : 'Not Connected'}
              </span>
              <button
                onClick={connect}
                disabled={connectionState === 'connecting'}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
              >
                {connectionState === 'connecting' ? '...' : connectionState === 'connected' ? 'Refresh' : 'Connect'}
              </button>
            </div>

            {connectionState === 'disconnected' && (
              <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 space-y-2">
                <p className="font-medium text-yellow-400">To read pin mappings, enter Config Mode:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Unplug the controller</li>
                  <li>Hold <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded">S2</span> while plugging back in</li>
                  <li>Or hold <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded">S2 + B3 + B4</span> for 5 seconds while plugged in</li>
                  <li>Click Connect</li>
                </ol>
              </div>
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm mt-3">{error}</div>
            )}
          </div>

          {/* Live Gamepad Input */}
          <div className="bg-gray-900 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-3">
              Live Gamepad Input
              <span className={`ml-3 text-sm font-normal ${gamepadConnected ? 'text-green-400' : 'text-gray-500'}`}>
                {gamepadConnected ? 'Controller Active (normal mode)' : 'No Gamepad'}
              </span>
            </h2>
            <p className="text-gray-500 text-xs mb-3">
              Press buttons to see Gamepad API IDs. If two physical buttons show the same ID, that's your duplicate.
            </p>

            <div className="mb-3">
              <span className="text-xs text-gray-400 mr-2">Pressed:</span>
              <span className="inline-flex flex-wrap gap-1.5 min-h-[32px] items-center">
                {Array.from(buttonStates.entries())
                  .filter(([_, p]) => p)
                  .map(([idx]) => (
                    <span key={idx} className="px-3 py-1 bg-purple-600 rounded text-white font-bold text-sm font-mono">{idx}</span>
                  ))}
                {Array.from(buttonStates.entries()).filter(([_, p]) => p).length === 0 && (
                  <span className="text-gray-600 text-xs">-</span>
                )}
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-400">History:</span>
                <button onClick={() => setLiveButtonLog([])} className="text-xs text-gray-600 hover:text-gray-400">Clear</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {liveButtonLog.map((btn, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-xs font-mono">{btn}</span>
                ))}
                {liveButtonLog.length === 0 && <span className="text-gray-700 text-xs">Press buttons...</span>}
              </div>
            </div>
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-red-300 mb-3">Issues Found ({issues.length})</h2>
              <div className="space-y-3">
                {issues.map((issue, i) => (
                  <div key={i} className={`rounded-lg p-3 text-sm ${
                    issue.type === 'duplicate' ? 'bg-red-900/30 border border-red-800/50' : 'bg-yellow-900/20 border border-yellow-800/40'
                  }`}>
                    <span className={`font-medium ${issue.type === 'duplicate' ? 'text-red-300' : 'text-yellow-300'}`}>
                      {issue.type === 'duplicate' ? 'DUPLICATE' : 'DEAD BUTTON'}
                    </span>
                    <span className={`ml-2 ${issue.type === 'duplicate' ? 'text-red-200' : 'text-yellow-200'}`}>
                      {issue.message}
                    </span>
                    {issue.type === 'duplicate' && (
                      <p className="text-red-400 text-xs mt-1">
                        Fix: In GP2040-CE web config, change one of these GPIO pins to a different unused action (e.g., A2/Capture, L3, R3).
                      </p>
                    )}
                    {issue.type === 'no_gamepad_output' && (
                      <p className="text-yellow-400 text-xs mt-1">
                        Fix: Extra buttons produce NO output in Switch mode. Remap this GPIO to a standard action like A2, L3, or R3.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pin Mappings Table */}
          {activePins.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Active GPIO Mappings
                <span className="text-sm font-normal text-gray-400 ml-2">({activePins.length} pins mapped)</span>
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-800">
                      <th className="py-2 px-3 w-20">GPIO</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3 w-24">Action ID</th>
                      <th className="py-2 px-3 w-32">Gamepad API ID</th>
                      <th className="py-2 px-3 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePins.map(pin => {
                      const isDupe = duplicateGpios.has(pin.gpio)
                      const isDead = deadGpios.has(pin.gpio)
                      const gamepadId = ACTION_TO_GAMEPAD[pin.actionId]
                      return (
                        <tr key={pin.gpio} className={`border-b border-gray-800/50 ${
                          isDupe ? 'bg-red-950/30' : isDead ? 'bg-yellow-950/20' : ''
                        }`}>
                          <td className="py-2 px-3 font-mono text-blue-400">{pin.gpio}</td>
                          <td className="py-2 px-3 text-white font-medium">
                            {ACTION_LABELS[pin.actionId] || pin.actionName}
                          </td>
                          <td className="py-2 px-3 font-mono text-gray-400">{pin.actionId}</td>
                          <td className="py-2 px-3 font-mono">
                            {gamepadId !== undefined ? (
                              <span className="text-green-400">{gamepadId}</span>
                            ) : (
                              <span className="text-red-400">none</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {isDupe ? (
                              <span className="text-red-400 text-xs font-medium">DUPE</span>
                            ) : isDead ? (
                              <span className="text-yellow-400 text-xs font-medium">DEAD</span>
                            ) : (
                              <span className="text-green-400 text-xs">OK</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {inactivePins.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowInactive(!showInactive)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    {showInactive ? 'Hide' : 'Show'} {inactivePins.length} inactive pins
                  </button>
                  {showInactive && (
                    <div className="mt-2 text-xs text-gray-600 font-mono space-y-0.5">
                      {inactivePins.map(p => (
                        <div key={p.gpio}>GPIO {p.gpio}: {ACTION_LABELS[p.actionId] || p.actionName}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Gamepad Options */}
          {gamepadOptions && (
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">Gamepad Options</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-xs block mb-1">Input Mode</span>
                  <span className="text-white font-mono">
                    {gamepadOptions.inputMode === 0 ? 'XInput' :
                     gamepadOptions.inputMode === 1 ? 'Switch' :
                     gamepadOptions.inputMode === 2 ? 'PS3' :
                     gamepadOptions.inputMode === 3 ? 'Keyboard' :
                     gamepadOptions.inputMode === 4 ? 'PS4' :
                     `Mode ${gamepadOptions.inputMode}`}
                  </span>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-xs block mb-1">D-Pad Mode</span>
                  <span className="text-white font-mono">
                    {gamepadOptions.dpadMode === 0 ? 'Digital' :
                     gamepadOptions.dpadMode === 1 ? 'Left Stick' :
                     gamepadOptions.dpadMode === 2 ? 'Right Stick' :
                     `Mode ${gamepadOptions.dpadMode}`}
                  </span>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-xs block mb-1">SOCD Mode</span>
                  <span className="text-white font-mono">
                    {gamepadOptions.socdMode === 0 ? 'Up Priority' :
                     gamepadOptions.socdMode === 1 ? 'Neutral' :
                     gamepadOptions.socdMode === 2 ? 'Last Win' :
                     `Mode ${gamepadOptions.socdMode}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Raw API Response */}
          {rawData && (
            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-3">Raw API Response</h2>
              <p className="text-gray-500 text-xs mb-2">/api/getPinMappings — this is exactly what the controller returned:</p>
              <pre className="bg-gray-950 rounded-lg p-4 text-xs text-green-400 font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </div>
          )}

          {/* Troubleshooting */}
          <div className="bg-gray-900 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Fixing Duplicate Buttons</h2>
            <div className="text-gray-300 text-sm space-y-3">
              <div>
                <h3 className="text-white font-medium mb-1">If DUPLICATE: Two GPIOs mapped to the same action</h3>
                <p className="text-gray-400">
                  Open the GP2040-CE web configurator at <span className="font-mono text-blue-400">192.168.7.1</span> and
                  change one GPIO pin's action to something different. Use an unused standard button like A2 (Capture), L3, or R3.
                </p>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">If DEAD: Extra button with no Switch output</h3>
                <p className="text-gray-400">
                  Extra buttons (E1-E12) produce NO gamepad output in Switch mode. Remap the GPIO to a standard action.
                  Available standard actions that produce unique gamepad IDs: B1-B4, L1, R1, L2, R2, S1, S2, L3, R3, A1, A2.
                </p>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">Profile save bug</h3>
                <p className="text-gray-400">
                  GP2040-CE v0.7.10-RC1 had a bug where Profile 2+ pin mappings were wiped on reboot.
                  Your firmware is {firmwareVersion || 'unknown'} — if older, update.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
