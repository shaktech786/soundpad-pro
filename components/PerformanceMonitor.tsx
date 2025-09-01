import React, { useEffect, useState, useRef } from 'react'

export const PerformanceMonitor: React.FC = () => {
  const [stats, setStats] = useState({
    fps: 0,
    pollRate: 0,
    lastButton: '',
    latency: 0,
    controllers: 0,
    avgLatency: 0,
    minLatency: 999,
    maxLatency: 0
  })
  
  const latencyHistoryRef = useRef<number[]>([])

  useEffect(() => {
    let frameCount = 0
    let lastTime = performance.now()
    let pollCount = 0
    let lastPollTime = performance.now()

    const updateStats = () => {
      const now = performance.now()
      const delta = now - lastTime
      
      if (delta >= 1000) {
        const gamepads = navigator.getGamepads()
        let controllerCount = 0
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i] && gamepads[i]!.connected) {
            controllerCount++
          }
        }

        setStats(prev => ({
          ...prev,
          fps: Math.round((frameCount * 1000) / delta),
          pollRate: Math.round((pollCount * 1000) / (now - lastPollTime)),
          controllers: controllerCount
        }))
        
        frameCount = 0
        pollCount = 0
        lastTime = now
        lastPollTime = now
      }
      
      frameCount++
      
      // Poll gamepad
      const gamepads = navigator.getGamepads()
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i]
        if (gp && gp.connected) {
          pollCount++
          for (let j = 0; j < gp.buttons.length; j++) {
            if (gp.buttons[j].pressed) {
              const pressTime = performance.now()
              const currentLatency = Math.round(pressTime - gp.timestamp)
              
              // Update latency history
              latencyHistoryRef.current.push(currentLatency)
              if (latencyHistoryRef.current.length > 100) {
                latencyHistoryRef.current.shift()
              }
              
              // Calculate statistics
              const avgLatency = Math.round(
                latencyHistoryRef.current.reduce((a, b) => a + b, 0) / latencyHistoryRef.current.length
              )
              const minLatency = Math.min(...latencyHistoryRef.current)
              const maxLatency = Math.max(...latencyHistoryRef.current)
              
              setStats(prev => ({
                ...prev,
                lastButton: `Button ${j}`,
                latency: currentLatency,
                avgLatency,
                minLatency,
                maxLatency
              }))
            }
          }
        }
      }
      
      requestAnimationFrame(updateStats)
    }

    updateStats()
  }, [])

  return (
    <div className="fixed top-4 right-4 bg-black bg-opacity-90 text-green-400 p-3 rounded-lg font-mono text-xs shadow-lg">
      <div className="text-yellow-400 font-bold mb-2">Performance Monitor</div>
      <div className="grid grid-cols-2 gap-x-4">
        <div>FPS: <span className={stats.fps >= 60 ? 'text-green-400' : 'text-yellow-400'}>{stats.fps}</span></div>
        <div>Poll: <span className={stats.pollRate >= 100 ? 'text-green-400' : 'text-yellow-400'}>{stats.pollRate}/s</span></div>
        <div>Controllers: <span className={stats.controllers > 0 ? 'text-green-400' : 'text-red-400'}>{stats.controllers}</span></div>
        <div>Last: <span className="text-cyan-400">{stats.lastButton || 'None'}</span></div>
      </div>
      <div className="mt-2 border-t border-gray-600 pt-2">
        <div className="text-yellow-400 mb-1">Latency (ms)</div>
        <div className="grid grid-cols-2 gap-x-4">
          <div>Current: <span className={stats.latency <= 10 ? 'text-green-400' : stats.latency <= 20 ? 'text-yellow-400' : 'text-red-400'}>{stats.latency}</span></div>
          <div>Avg: <span className={stats.avgLatency <= 10 ? 'text-green-400' : stats.avgLatency <= 20 ? 'text-yellow-400' : 'text-red-400'}>{stats.avgLatency}</span></div>
          <div>Min: <span className="text-green-400">{stats.minLatency === 999 ? 0 : stats.minLatency}</span></div>
          <div>Max: <span className="text-orange-400">{stats.maxLatency}</span></div>
        </div>
      </div>
      <div className="mt-2 text-gray-400 text-xs">
        Press Ctrl+P to hide
      </div>
    </div>
  )
}