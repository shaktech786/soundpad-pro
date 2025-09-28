import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'

function MyApp({ Component, pageProps }: AppProps) {
  // Ensure client-side only code runs only in browser
  useEffect(() => {
    // Fix for Electron production build
    if (typeof window !== 'undefined') {
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
      <Component {...pageProps} />
    </ErrorBoundary>
  )
}

export default MyApp