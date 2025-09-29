import { useEffect, useState } from 'react'

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  details?: any
}

export function LogViewer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    // Get initial logs from console
    const initialLogs: LogEntry[] = []

    // Override console methods to capture logs
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error
    const originalDebug = console.debug

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '),
        details: args.length > 1 ? args.slice(1) : undefined
      }

      setLogs(prev => [...prev, entry].slice(-500)) // Keep last 500 logs

      // Also store in sessionStorage for persistence
      try {
        const stored = sessionStorage.getItem('soundpad-logs') || '[]'
        const existing = JSON.parse(stored)
        existing.push(entry)
        sessionStorage.setItem('soundpad-logs', JSON.stringify(existing.slice(-500)))
      } catch (e) {
        // Ignore storage errors
      }
    }

    console.log = (...args) => {
      originalLog(...args)
      addLog('info', ...args)
    }

    console.warn = (...args) => {
      originalWarn(...args)
      addLog('warn', ...args)
    }

    console.error = (...args) => {
      originalError(...args)
      addLog('error', ...args)
    }

    console.debug = (...args) => {
      originalDebug(...args)
      addLog('debug', ...args)
    }

    // Load existing logs from sessionStorage
    try {
      const stored = sessionStorage.getItem('soundpad-logs')
      if (stored) {
        setLogs(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load logs from storage:', e)
    }

    // Cleanup
    return () => {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
      console.debug = originalDebug
    }
  }, [isOpen])

  useEffect(() => {
    if (autoScroll && isOpen) {
      const logContainer = document.getElementById('log-container')
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight
      }
    }
  }, [logs, autoScroll, isOpen])

  if (!isOpen) return null

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'debug': return 'text-gray-500'
      default: return 'text-gray-300'
    }
  }

  const getLevelBg = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-900/20'
      case 'warn': return 'bg-yellow-900/20'
      default: return ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Application Logs</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
            <button
              onClick={() => {
                setLogs([])
                sessionStorage.removeItem('soundpad-logs')
              }}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div
          id="log-container"
          className="flex-1 overflow-y-auto p-4 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet...</p>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`mb-2 p-2 rounded ${getLevelBg(log.level)}`}
              >
                <div className="flex gap-2">
                  <span className="text-gray-600">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-bold uppercase ${getLevelColor(log.level)}`}>
                    [{log.level}]
                  </span>
                  <span className="text-gray-300 whitespace-pre-wrap break-all">
                    {log.message}
                  </span>
                </div>
                {log.details && (
                  <details className="mt-1 ml-20">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
                      Details
                    </summary>
                    <pre className="mt-2 text-gray-400 overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-2 border-t border-gray-700 text-xs text-gray-500">
          {logs.length} logs | Press F12 to open DevTools | Ctrl+L to toggle this window
        </div>
      </div>
    </div>
  )
}