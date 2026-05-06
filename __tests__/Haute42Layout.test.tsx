import React from 'react'
import { render, screen } from '@testing-library/react'
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

  test('errored button title contains the raw error', () => {
    renderLayout({
      soundMappings: new Map([[0, 'C:\\sounds\\missing.mp3']]),
      fileErrors: new Map([[0, 'ENOENT: no such file or directory']]),
    })

    const button = screen.getByRole('button', { name: /warning/i })
    expect(button).toHaveAttribute('title', expect.stringContaining('ENOENT'))
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
