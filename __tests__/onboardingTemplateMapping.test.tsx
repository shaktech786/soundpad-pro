import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest'
import { HAUTE42_DEFAULT_BUTTON_MAPPING } from '../config/constants'

// obs-websocket-js is imported transitively: types/profile → OBSContext → obs-websocket-js
vi.mock('obs-websocket-js', () => ({ default: class OBSWebSocket {} }))

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, push: vi.fn() }),
}))

// Imported after the mocks above so onboarding.tsx picks them up.
import OnboardingPage from '../pages/onboarding'

function goToBoardBuilderStep() {
  render(<OnboardingPage />)
  fireEvent.click(screen.getByRole('button', { name: /Next: Design Your Board Layout/i }))
}

function applyHaute42Template() {
  fireEvent.click(screen.getByRole('button', { name: /Templates/i }))
  fireEvent.click(screen.getByText('Haute42 (16 buttons)'))
  fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))
}

describe('onboarding — template default mapping handoff', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  test('an unsupported/uncalibrated device reaches the manual mapping walk with a calibration prompt, no skip offered', async () => {
    // No electronAPI at all — device reads as disconnected.
    goToBoardBuilderStep()
    applyHaute42Template()

    // Not offered a skip — the fallback rule withheld the mapping.
    expect(screen.queryByText(/Default Mapping Available/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Use Template Mapping/i })).not.toBeInTheDocument()

    // The calibration prompt is shown, and the manual walk stays reachable.
    expect(screen.getByRole('alert')).toHaveTextContent(/can't confirm it matches your controller/i)
    expect(screen.getByText(/Map Button 1 of/i)).toBeInTheDocument()
  })

  test('a connected, calibrated Haute42 offers a skip that jumps straight to completion', async () => {
    ;(window as any).electronAPI = {
      onHidButtons: vi.fn(() => () => {}),
      onHidConnectionChanged: vi.fn(() => () => {}),
      hidGetState: vi.fn().mockResolvedValue({ success: true, connected: true, buttonIds: [] }),
      hidGetCalibration: vi.fn().mockResolvedValue({
        success: true,
        defaults: {},
        overrides: { 'b0.0': 0 },
      }),
      storeSet: vi.fn().mockResolvedValue(true),
    }

    goToBoardBuilderStep()

    await waitFor(() => expect((window as any).electronAPI.hidGetCalibration).toHaveBeenCalled())
    await waitFor(() => expect((window as any).electronAPI.hidGetState).toHaveBeenCalled())

    applyHaute42Template()

    expect(await screen.findByText(/Default Mapping Available/i)).toBeInTheDocument()
    expect(screen.queryByText(/Map Button 1 of/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Use Template Mapping/i }))

    expect(await screen.findByText(/Setup Complete!/i)).toBeInTheDocument()
    // 16 pads from the applied template mapping, one row per pad.
    for (const [visualId] of HAUTE42_DEFAULT_BUTTON_MAPPING) {
      expect(screen.getByText(new RegExp(`Pos ${visualId} `))).toBeInTheDocument()
    }
  })

  test('"Map Manually Instead" ignores the offered mapping and starts the normal walk', async () => {
    ;(window as any).electronAPI = {
      onHidButtons: vi.fn(() => () => {}),
      onHidConnectionChanged: vi.fn(() => () => {}),
      hidGetState: vi.fn().mockResolvedValue({ success: true, connected: true, buttonIds: [] }),
      hidGetCalibration: vi.fn().mockResolvedValue({
        success: true,
        defaults: {},
        overrides: { 'b0.0': 0 },
      }),
    }

    goToBoardBuilderStep()
    await waitFor(() => expect((window as any).electronAPI.hidGetCalibration).toHaveBeenCalled())
    await waitFor(() => expect((window as any).electronAPI.hidGetState).toHaveBeenCalled())

    applyHaute42Template()
    expect(await screen.findByText(/Default Mapping Available/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Map Manually Instead/i }))

    expect(screen.getByText(/Map Button 1 of/i)).toBeInTheDocument()
    expect(screen.queryByText(/Setup Complete!/i)).not.toBeInTheDocument()
  })

  test('a template with no default mapping (e.g. Vewlix) never offers a skip or calibration prompt', () => {
    goToBoardBuilderStep()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))
    fireEvent.click(screen.getByText('Vewlix 8-Button'))
    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))

    expect(screen.queryByText(/Default Mapping Available/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/Map Button 1 of/i)).toBeInTheDocument()
  })
})
