import React from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { BoardBuilder } from '../components/BoardBuilder'
import { BOARD_TEMPLATES, HAUTE42_DEFAULT_BUTTON_MAPPING } from '../config/constants'
import type { ButtonPosition, ButtonShape } from '../types/profile'

// obs-websocket-js is imported transitively: types/profile → OBSContext → obs-websocket-js
vi.mock('obs-websocket-js', () => ({ default: class OBSWebSocket {} }))

function renderBuilder(props: Partial<React.ComponentProps<typeof BoardBuilder>> = {}) {
  const onSave = vi.fn()
  const utils = render(
    <BoardBuilder
      initialLayout={[]}
      initialShape="circle"
      onSave={onSave}
      {...props}
    />
  )
  return { ...utils, onSave }
}

describe('BoardBuilder — template picker', () => {
  test('templates toggle button is hidden when showPresets is false', () => {
    renderBuilder({ showPresets: false })
    expect(screen.queryByRole('button', { name: /Templates/i })).not.toBeInTheDocument()
  })

  test('clicking Templates opens the picker grouped by category', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    // Category headers
    expect(screen.getByText('Leverless')).toBeInTheDocument()
    expect(screen.getByText('Arcade')).toBeInTheDocument()
    expect(screen.getByText('Gamepad')).toBeInTheDocument()
    expect(screen.getByText('Grid')).toBeInTheDocument()
  })

  test('every template shows its name, description and button count', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    for (const template of BOARD_TEMPLATES) {
      const nameEl = screen.getByText(template.name)
      const card = nameEl.closest('button')
      expect(card).not.toBeNull()

      const scoped = within(card as HTMLElement)
      expect(scoped.getByText(template.description)).toBeInTheDocument()
      const expectedCount = `${template.layout.length} button${template.layout.length !== 1 ? 's' : ''}`
      expect(scoped.getByText(expectedCount)).toBeInTheDocument()
    }
  })

  test('applying a template sets both layout and button shape on save', () => {
    const { onSave } = renderBuilder({ initialShape: 'circle' })
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    const vewlix = BOARD_TEMPLATES.find(t => t.id === 'vewlix-8')!
    expect(vewlix.buttonShape).toBe('circle')

    const square = BOARD_TEMPLATES.find(t => t.buttonShape === 'square')!
    fireEvent.click(screen.getByText(square.name))

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const [savedLayout, savedShape]: [ButtonPosition[], ButtonShape] = onSave.mock.calls[0]
    expect(savedLayout).toEqual(square.layout)
    expect(savedShape).toBe(square.buttonShape)
  })

  test('applying a template replaces the previous layout entirely', () => {
    const initialLayout: ButtonPosition[] = [{ id: 99, x: 10, y: 10 }]
    const { onSave } = renderBuilder({ initialLayout, initialShape: 'circle' })
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    const haute42 = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
    fireEvent.click(screen.getByText(haute42.name))

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))

    const [savedLayout]: [ButtonPosition[]] = onSave.mock.calls[0]
    expect(savedLayout.some(b => b.id === 99)).toBe(false)
    expect(savedLayout).toHaveLength(haute42.layout.length)
  })
})

describe('BoardBuilder — template default button mapping', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  test('a template without a defaultButtonMapping saves a null mapping and shows no notice', () => {
    const { onSave } = renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    const vewlix = BOARD_TEMPLATES.find(t => t.id === 'vewlix-8')!
    expect(vewlix.defaultButtonMapping).toBeUndefined()
    fireEvent.click(screen.getByText(vewlix.name))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))
    const [, , buttonMapping] = onSave.mock.calls[0]
    expect(buttonMapping).toBeNull()
  })

  test('the Haute42 template with no controller connected saves an empty mapping and prompts calibration', () => {
    // No window.electronAPI at all — useSimpleGamepad reports disconnected
    // and BoardBuilder's own calibration check no-ops.
    const { onSave } = renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))

    const haute42 = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
    fireEvent.click(screen.getByText(haute42.name))

    expect(screen.getByRole('alert')).toHaveTextContent(/can't confirm it matches your controller/i)
    expect(screen.getByRole('button', { name: /Run Calibration/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))
    const [, , buttonMapping] = onSave.mock.calls[0]
    expect(buttonMapping).toEqual([])
  })

  test('the Haute42 template with a connected, calibrated Haute42 saves the full default mapping', async () => {
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

    const { onSave } = renderBuilder()

    await waitFor(() => expect((window as any).electronAPI.hidGetCalibration).toHaveBeenCalled())
    await waitFor(() => expect((window as any).electronAPI.hidGetState).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))
    const haute42 = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
    fireEvent.click(screen.getByText(haute42.name))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/shipped a default button mapping/i))

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))
    const [, , buttonMapping] = onSave.mock.calls[0]
    expect(buttonMapping).toEqual(HAUTE42_DEFAULT_BUTTON_MAPPING)
    expect(buttonMapping!.length).toBeGreaterThan(0)
  })

  test('adding a button after applying a template invalidates the applied mapping', () => {
    const { onSave } = renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Templates/i }))
    const haute42 = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
    fireEvent.click(screen.getByText(haute42.name))

    // Even though gating would have withheld it (no device), the notice
    // should disappear once the button set changes underneath the template.
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Button/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Layout/i }))
    const [, , buttonMapping] = onSave.mock.calls[0]
    expect(buttonMapping).toBeNull()
  })
})
