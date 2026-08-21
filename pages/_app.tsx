import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { OBSProvider } from '../contexts/OBSContext'
import { LiveSplitProvider } from '../contexts/LiveSplitContext'
import { DiscordProvider } from '../contexts/DiscordContext'
import { PreliveProvider } from '../contexts/PreliveContext'
import { ThemeProvider } from '../contexts/ThemeContext'

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

      // PRE-470: without this, dropping a file anywhere outside a drop
      // target (or a drop target rejecting it) falls through to Chromium's
      // default behaviour, which navigates the whole window to the
      // dropped file. Drop targets (Haute42Layout pads, AudioFilePicker)
      // call stopPropagation on their own dragover/drop handlers, so only
      // stray drops reach this listener — this is a safety net, not the
      // primary handling.
      const preventNavigation = (event: DragEvent) => event.preventDefault()
      window.addEventListener('dragover', preventNavigation)
      window.addEventListener('drop', preventNavigation)
    }
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <OBSProvider>
          <LiveSplitProvider>
            <DiscordProvider>
              <PreliveProvider>
                <Component {...pageProps} />
              </PreliveProvider>
            </DiscordProvider>
          </LiveSplitProvider>
        </OBSProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default MyApp