import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { PreliveSettings } from '../components/PreliveSettings'
import { PreliveProvider } from '../contexts/PreliveContext'
import { ThemeProvider } from '../contexts/ThemeContext'

// These tests exercise the discoverable-pairing story (PRE-389): the "Open
// Prelive API Keys" button must go through the main-process IPC bridge (never
// window.open/renderer navigation), the connected state must surface the
// synced game count + last-sync time getStatus() already returns, and a
// 401/403-rejected key must render a distinct "reconnect" state rather than a
// generic error string.

type Api = {
  preliveGetStatus: ReturnType<typeof vi.fn>
  preliveSetApiKey: ReturnType<typeof vi.fn>
  preliveDisconnect: ReturnType<typeof vi.fn>
  preliveOpenApiKeysPage: ReturnType<typeof vi.fn>
  onPreliveStatusChanged: ReturnType<typeof vi.fn>
}

function setupApi(overrides: Partial<Api> = {}): Api {
  const api: Api = {
    preliveGetStatus: vi.fn().mockResolvedValue({
      connected: false,
      error: null,
      gameCount: 0,
      games: [],
      lastFetchAt: null,
    }),
    preliveSetApiKey: vi.fn(),
    preliveDisconnect: vi.fn(),
    preliveOpenApiKeysPage: vi.fn().mockResolvedValue({ success: true }),
    onPreliveStatusChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

function renderPanel() {
  return render(
    <ThemeProvider>
      <PreliveProvider>
        <PreliveSettings />
      </PreliveProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  delete (window as any).electronAPI
})

describe('PreliveSettings — discoverable pairing', () => {
  test('clicking "Open Prelive API Keys" calls the IPC bridge, not window.open', async () => {
    const api = setupApi()
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderPanel()

    const button = await screen.findByRole('button', { name: /open prelive api keys/i })
    fireEvent.click(button)

    await waitFor(() => expect(api.preliveOpenApiKeysPage).toHaveBeenCalledTimes(1))
    expect(windowOpenSpy).not.toHaveBeenCalled()

    windowOpenSpy.mockRestore()
  })

  test('connected state shows the synced game count and last-sync time from getStatus()', async () => {
    const lastFetchAt = new Date('2026-07-20T12:00:00Z').getTime()
    setupApi({
      preliveGetStatus: vi.fn().mockResolvedValue({
        connected: true,
        error: null,
        gameCount: 3,
        games: ['Hades', 'Slay the Spire', 'Balatro'],
        lastFetchAt,
      }),
    })

    renderPanel()

    expect(await screen.findByText(/connected — 3 games/i)).toBeInTheDocument()
    expect(screen.getByText(/streamed games synced/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(new Date(lastFetchAt).toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))).toBeInTheDocument()
  })

  test('a rejected (401/403) key shows a distinct reconnect state, not a generic error', async () => {
    setupApi({
      preliveGetStatus: vi.fn().mockResolvedValue({
        connected: false,
        error: 'API key was rejected. Create a new key in prelive with the "games:read" scope and reconnect.',
        gameCount: 0,
        games: [],
        lastFetchAt: null,
      }),
    })

    renderPanel()

    expect(await screen.findByText(/key rejected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument()
    // The raw error string should not also be rendered as a separate generic line.
    expect(screen.queryByText(/^api key was rejected\. create a new key/i)).not.toBeInTheDocument()
  })

  test('a generic network error still renders as a plain error line (not the rejected state)', async () => {
    setupApi({
      preliveGetStatus: vi.fn().mockResolvedValue({
        connected: false,
        error: 'Could not reach prelive (timeout)',
        gameCount: 0,
        games: [],
        lastFetchAt: null,
      }),
    })

    renderPanel()

    expect(await screen.findByText(/could not reach prelive/i)).toBeInTheDocument()
    expect(screen.queryByText(/key rejected/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument()
  })
})
