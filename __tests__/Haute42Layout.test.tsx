import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
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

describe('Haute42Layout — drag-and-drop (PRE-470)', () => {
  function makeApi(overrides: Record<string, unknown> = {}) {
    return {
      getPathForFile: vi.fn((file: File) => `C:\\Music\\${file.name}`),
      prepareDroppedAudioFile: vi.fn().mockResolvedValue({ filePath: 'C:\\Music\\kick.mp3', fileName: 'kick.mp3' }),
      ...overrides,
    }
  }

  beforeEach(() => {
    delete (window as any).electronAPI
  })

  test('drag-over shows a visible affordance on the target pad', () => {
    renderLayout({ onDropSound: vi.fn() })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })

    fireEvent.dragOver(button, { dataTransfer: { types: ['Files'] } })

    expect(button.className).toContain('ring-green-400')
  })

  test('drag-leave clears the affordance', () => {
    renderLayout({ onDropSound: vi.fn() })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })

    fireEvent.dragOver(button, { dataTransfer: { types: ['Files'] } })
    expect(button.className).toContain('ring-green-400')

    fireEvent.dragLeave(button, { dataTransfer: { types: ['Files'] } })
    expect(button.className).not.toContain('ring-green-400')
  })

  test('dropping a supported audio file assigns it to the pad', async () => {
    (window as any).electronAPI = makeApi()
    const onDropSound = vi.fn()
    renderLayout({ onDropSound })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })
    const file = new File(['data'], 'kick.mp3', { type: 'audio/mpeg' })

    fireEvent.drop(button, { dataTransfer: { files: [file], types: ['Files'] } })

    await waitFor(() => expect(onDropSound).toHaveBeenCalledWith(0, 'C:\\Music\\kick.mp3', 'kick.mp3'))
  })

  test('dropping a non-audio file is rejected with a visible message and no assignment', async () => {
    (window as any).electronAPI = makeApi()
    const onDropSound = vi.fn()
    renderLayout({ onDropSound })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })
    const file = new File(['data'], 'notes.txt', { type: 'text/plain' })

    fireEvent.drop(button, { dataTransfer: { files: [file], types: ['Files'] } })

    await screen.findByRole('status')
    expect(screen.getByRole('status').textContent).toMatch(/supported audio file/i)
    expect(onDropSound).not.toHaveBeenCalled()
  })

  test('dropping a folder is rejected with a message, not silently ignored', async () => {
    (window as any).electronAPI = makeApi({
      prepareDroppedAudioFile: vi.fn().mockResolvedValue({
        error: 'folder',
        message: 'Folders aren\u2019t supported here — use the picker\u2019s "Browse..." to open one.',
      }),
    })
    const onDropSound = vi.fn()
    renderLayout({ onDropSound })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })
    // A dropped folder surfaces as a File whose name carries a supported-looking
    // extension is not guaranteed — the authoritative folder check happens in
    // the main process via prepareDroppedAudioFile, which this test's fake
    // simulates returning a 'folder' error for.
    const file = new File(['data'], 'MySounds.mp3', { type: '' })

    fireEvent.drop(button, { dataTransfer: { files: [file], types: ['Files'] } })

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/folder/i)
    expect(onDropSound).not.toHaveBeenCalled()
  })

  test('dropping multiple files assigns the first and reports the rest as ignored', async () => {
    (window as any).electronAPI = makeApi()
    const onDropSound = vi.fn()
    renderLayout({ onDropSound })
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })
    const file1 = new File(['data'], 'kick.mp3', { type: 'audio/mpeg' })
    const file2 = new File(['data'], 'snare.mp3', { type: 'audio/mpeg' })

    fireEvent.drop(button, { dataTransfer: { files: [file1, file2], types: ['Files'] } })

    await waitFor(() => expect(onDropSound).toHaveBeenCalledWith(0, 'C:\\Music\\kick.mp3', 'kick.mp3'))
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/1 other file ignored/i)
  })

  test('pads with no onDropSound handler do not react to drag-over', () => {
    renderLayout()
    const button = screen.getByRole('button', { name: /Assign sound to pad/i })

    fireEvent.dragOver(button, { dataTransfer: { types: ['Files'] } })

    expect(button.className).not.toContain('ring-green-400')
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
