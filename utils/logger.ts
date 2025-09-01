// Production-safe logger utility
// Only logs in development mode or when explicitly enabled

const isDevelopment = process.env.NODE_ENV === 'development'
const isDebugEnabled = typeof window !== 'undefined' && 
  (window.localStorage?.getItem('debug') === 'true' || 
   new URLSearchParams(window.location?.search).has('debug'))

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment || isDebugEnabled) {
      console.log('[SoundPad]', ...args)
    }
  },
  
  error: (...args: any[]) => {
    // Always log errors
    console.error('[SoundPad Error]', ...args)
    
    // Send to Electron main process for file logging
    if (typeof window !== 'undefined' && window.electronAPI?.logError) {
      window.electronAPI.logError({
        message: args[0]?.message || String(args[0]),
        details: args.slice(1)
      })
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment || isDebugEnabled) {
      console.warn('[SoundPad Warning]', ...args)
    }
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment || isDebugEnabled) {
      console.debug('[SoundPad Debug]', ...args)
    }
  },
  
  info: (...args: any[]) => {
    if (isDevelopment || isDebugEnabled) {
      console.info('[SoundPad Info]', ...args)
    }
  },
  
  // Performance logging
  time: (label: string) => {
    if (isDevelopment || isDebugEnabled) {
      console.time(`[SoundPad] ${label}`)
    }
  },
  
  timeEnd: (label: string) => {
    if (isDevelopment || isDebugEnabled) {
      console.timeEnd(`[SoundPad] ${label}`)
    }
  }
}

// Export as default for easier imports
export default logger