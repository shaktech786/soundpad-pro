import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ThemeProvider } from '../contexts/ThemeContext'

// pages/index.tsx pulls in a large dependency graph (gamepad polling, Howler-backed
// audio engine, OBS/LiveSplit/Discord/Prelive websocket-ish contexts, profile
// management). None of that is relevant to the pad-click -> assign-surface wiring
// under test, so every hook/context it touches is mocked to a fixed, side-effect-free
// shape — this keeps the test deterministic and avoids real WebSocket/fetch calls.

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), pathname: '/', query: {} }),
}))

vi.mock('../hooks/useSimpleGamepad', () => ({
  useSimpleGamepad: () => ({ buttonStates: new Map(), connected: false }),
}))

vi.mock('../hooks/useAudioEngine', () => ({
  useAudioEngine: () => ({
    loadSound: vi.fn().mockResolvedValue(undefined),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    unloadSound: vi.fn(),
    stopAll: vi.fn(),
    setVolume: vi.fn(),
    setMasterVolume: vi.fn(),
    isPlaying: () => false,
    isLoading: () => false,
    loadErrors: new Map(),
    loadedSounds: [],
    asioReady: false,
  }),
}))

vi.mock('../hooks/usePersistentStorage', () => ({
  usePersistentStorage: (_key: string, defaultValue: unknown) => [defaultValue, vi.fn(), false],
}))

vi.mock('../hooks/useProfileManager', () => ({
  useProfileManager: () => ({
    profiles: [],
    activeProfileId: null,
    isLoading: false,
    switchProfile: vi.fn(),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    duplicateProfile: vi.fn(),
  }),
}))

vi.mock('../contexts/OBSContext', () => ({
  useOBS: () => ({
    connected: false,
    obsState: { streaming: false, recording: false, replayBufferActive: false, currentScene: null, scenes: [], sources: [] },
    executeAction: vi.fn(),
  }),
}))

vi.mock('../contexts/LiveSplitContext', () => ({
  useLiveSplit: () => ({ connected: false, executeAction: vi.fn() }),
}))

vi.mock('../contexts/DiscordContext', () => ({
  useDiscord: () => ({ connected: false, voiceState: null, executeAction: vi.fn(), setPushToTalk: vi.fn() }),
}))

vi.mock('../contexts/PreliveContext', () => ({
  usePrelive: () => ({ connected: false, gameCount: 0 }),
}))

import Home from '../pages/index'

function stubElectronAPI() {
  ;(window as any).electronAPI = {
    selectAudioFile: vi.fn(),
    listDirectory: vi.fn().mockResolvedValue({ entries: [], error: null }),
    storeGet: vi.fn().mockResolvedValue(null),
    storeSet: vi.fn().mockResolvedValue(true),
    getDefaultAudioDir: vi.fn().mockResolvedValue('C:\\Music'),
    readAudioFile: vi.fn(),
    openDirectory: vi.fn(),
  }
}

function renderHome() {
  return render(
    <ThemeProvider>
      <Home />
    </ThemeProvider>
  )
}

describe('primary pad-click assign flow', () => {
  beforeEach(() => {
    localStorage.clear()
    // Skip the onboarding redirect so the board renders directly.
    localStorage.setItem('onboarding-complete', 'true')
    delete (window as any).electronAPI
  })

  test('clicking an unassigned pad opens the AudioFilePicker, not the native dialog', async () => {
    stubElectronAPI()
    renderHome()

    const pad = screen.getAllByRole('button', { name: /Assign sound to pad/i })[0]
    fireEvent.click(pad)

    expect(await screen.findByText('Choose Audio File')).toBeInTheDocument()
    expect((window as any).electronAPI.selectAudioFile).not.toHaveBeenCalled()
  })

  test('falls back to the URL modal when electronAPI is unavailable (no Electron preload)', () => {
    renderHome()

    const pad = screen.getAllByRole('button', { name: /Assign sound to pad/i })[0]
    fireEvent.click(pad)

    expect(screen.getByText(/Add Sound URL/i)).toBeInTheDocument()
  })
})
