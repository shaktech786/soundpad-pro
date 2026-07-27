import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { BoardBuilder } from '../components/BoardBuilder'
import { BOARD_TEMPLATES } from '../config/constants'
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
