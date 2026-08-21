import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { Haute42Layout } from '../components/Haute42Layout'
import { ThemeProvider } from '../contexts/ThemeContext'
import type { ButtonPosition } from '../types/profile'

// obs-websocket-js is imported transitively: types/profile → OBSContext → obs-websocket-js
vi.mock('obs-websocket-js', () => ({ default: class OBSWebSocket {} }))

const layout: ButtonPosition[] = [{ id: 0, x: 0, y: 0 }]

function renderLayout(props: Partial<React.ComponentProps<typeof Haute42Layout>> = {}) {
  return render(
    <ThemeProvider>
      <Haute42Layout
        buttonStates={new Map()}
        soundMappings={new Map()}
        onPlaySound={vi.fn()}
        onMapSound={vi.fn()}
        boardLayout={layout}
        {...props}
      />
    </ThemeProvider>
  )
}

describe('Haute42Layout — file error indicators', () => {
  test('errored button has amber background class', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT: no such file or directory']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-amber-700')
  })

  test('errored button title shows the friendly message, not the raw error', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT: no such file or directory']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    expect(button).toHaveAttribute('title', expect.stringContaining('File not found'))
    expect(button.getAttribute('title')).not.toContain('ENOENT')
  })

  test('errored button aria-label shows the friendly message, not the raw error', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT: no such file or directory']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    expect(button.getAttribute('aria-label')).toContain('File not found')
    expect(button.getAttribute('aria-label')).not.toContain('ENOENT')
  })

  test('errored button renders the amber warning badge', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    expect(button.querySelector('[class*="bg-amber-500"]')).toBeInTheDocument()
  })

  test('filename label uses amber text colour when file is missing', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    const label = button.querySelector('[class*="text-amber-200"]')
    expect(label).toBeInTheDocument()
    expect(label?.textContent).toBe('missing')
  })

  test('button without error uses normal blue styling', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\working.mp3']]),
    })

    const button = screen.getByRole('button', { name: /Play sound: working/i })
    expect(button.className).toContain('bg-blue-600')
    expect(button.className).not.toContain('bg-amber-700')
  })

  test('button without error has no warning badge', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\working.mp3']]),
    })

    const button = screen.getByRole('button', { name: /Play sound: working/i })
    expect(button.querySelector('[class*="bg-amber-500"]')).not.toBeInTheDocument()
  })

  test('button without error shows filename as title', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\working.mp3']]),
    })

    const button = screen.getByRole('button', { name: /Play sound: working/i })
    expect(button).toHaveAttribute('title', 'working')
  })

  test('empty button (no sound) shows + and no warning', () => {
    renderLayout()

    const button = screen.getByRole('button', { name: /Assign sound to pad/i })
    expect(button).toBeInTheDocument()
    expect(button.className).not.toContain('bg-amber-700')
  })
})

describe('Haute42Layout — relink affordance', () => {
  test('errored button offers a Relink action', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT']]),
    })

    expect(screen.getByRole('button', { name: 'Relink this sound' })).toBeInTheDocument()
  })

  test('clicking Relink opens the picker for that pad via onMapSound, not onPlaySound', () => {
    const onMapSound = vi.fn()
    const onPlaySound = vi.fn()
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT']]),
      onMapSound,
      onPlaySound,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Relink this sound' }))

    expect(onMapSound).toHaveBeenCalledWith(0)
    expect(onPlaySound).not.toHaveBeenCalled()
  })

  test('Relink is keyboard-activatable with Enter', () => {
    const onMapSound = vi.fn()
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT']]),
      onMapSound,
    })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Relink this sound' }), { key: 'Enter' })

    expect(onMapSound).toHaveBeenCalledWith(0)
  })

  test('a working button has no Relink action', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\working.mp3']]),
    })

    expect(screen.queryByRole('button', { name: 'Relink this sound' })).not.toBeInTheDocument()
  })
})
