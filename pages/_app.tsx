import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { OBSProvider } from '../contexts/OBSContext'

// Polyfill process for client-side
if (typeof window !== 'undefined' && !window.process) {
  window.process = {
    env: {},
    version: '',
    versions: {},
    platform: 'browser',
    release: {},
    config: {},
  } as any
}

function MyApp({ Component, pageProps }: AppProps) {
  // Ensure client-side only code runs only in browser
  useEffect(() => {
    // Fix for Electron production build
    if (typeof window !== 'undefined') {
      // Ensure process exists
      if (!window.process) {
        window.process = {
          env: {},
          version: '',
          versions: {},
          platform: 'browser',
          release: {},
          config: {},
        } as any
      }

      // Set up global error handler
      window.addEventListener('error', (event) => {
        console.error('Global error:', event.error)
      })

      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason)
      })
    }
  }, [])

  return (
    <ErrorBoundary>
      <OBSProvider>
        <Component {...pageProps} />
      </OBSProvider>
    </ErrorBoundary>
  )
}

export default MyApp