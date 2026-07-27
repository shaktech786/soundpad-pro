import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { Haute42Layout } from '../components/Haute42Layout'
import { ThemeProvider } from '../contexts/ThemeContext'
import { HAUTE42_LAYOUT } from '../config/constants'
import type { BoardProfile } from '../types/profile'

// obs-websocket-js is imported transitively: types/profile → OBSContext → obs-websocket-js
vi.mock('obs-websocket-js', () => ({ default: class OBSWebSocket {} }))

// Simulates a BoardProfile saved by a version of the app that predates
// boardLayout/buttonShape (and predates the template catalog entirely).
// BoardProfile has no schema versioning, so old saved data can genuinely
// arrive at runtime shaped like this.
const legacyProfile = {
  id: 'legacy-1',
  name: 'Old Profile',
  createdAt: 0,
  updatedAt: 0,
  buttonMapping: [],
  soundMappings: [],
  combinedActions: [],
  buttonVolumes: [],
  linkedButtons: [],
  stopButton: null,
  drumPadButtons: [],
} as unknown as BoardProfile

describe('BoardProfile — legacy fixture without boardLayout/buttonShape', () => {
  test('Haute42Layout falls back to the default Haute42 geometry', () => {
    render(
      <ThemeProvider>
        <Haute42Layout
          buttonStates={new Map()}
          soundMappings={new Map()}
          onPlaySound={vi.fn()}
          onMapSound={vi.fn()}
          boardLayout={legacyProfile.boardLayout}
          buttonShape={legacyProfile.buttonShape}
        />
      </ThemeProvider>
    )

    expect(screen.getAllByRole('button')).toHaveLength(HAUTE42_LAYOUT.length)
  })

  test('Haute42Layout falls back to circle buttons when buttonShape is missing', () => {
    render(
      <ThemeProvider>
        <Haute42Layout
          buttonStates={new Map()}
          soundMappings={new Map()}
          onPlaySound={vi.fn()}
          onMapSound={vi.fn()}
          boardLayout={legacyProfile.boardLayout}
          buttonShape={legacyProfile.buttonShape}
        />
      </ThemeProvider>
    )

    const [firstButton] = screen.getAllByRole('button')
    expect(firstButton.className).toContain('rounded-full')
  })
})
