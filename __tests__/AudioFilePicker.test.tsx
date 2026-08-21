import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ThemeProvider } from '../contexts/ThemeContext'
import { AudioFilePicker } from '../components/AudioFilePicker'

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

interface ListResult {
  entries: DirEntry[]
  error: string | null
  truncated: boolean
  totalCount: number
}

const ROOT = 'C:\\Music'

// Builds a listDirectory mock keyed by dirPath, so multi-step navigation
// (descend, revalidate-on-confirm) can be scripted per directory without
// juggling call-order assumptions.
function mockListDirectoryByPath(byPath: Record<string, ListResult>) {
  return vi.fn(async (dirPath: string) => byPath[dirPath] ?? { entries: [], error: null, truncated: false, totalCount: 0 })
}

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listDirectory: vi.fn().mockResolvedValue({ entries: [], error: null, truncated: false, totalCount: 0 }),
    storeGet: vi.fn().mockResolvedValue(null),
    storeSet: vi.fn().mockResolvedValue(true),
    getDefaultAudioDir: vi.fn().mockResolvedValue(ROOT),
    pathDirname: vi.fn().mockImplementation((p: string) => Promise.resolve(p === 'C:\\' ? 'C:\\' : 'C:\\')),
    openDirectory: vi.fn(),
    readAudioFile: vi.fn(),
    selectAudioFile: vi.fn(),
    ...overrides,
  }
}

function renderPicker(
  props: Partial<React.ComponentProps<typeof AudioFilePicker>> = {},
  apiOverrides: Record<string, unknown> = {}
) {
  const api = makeApi(apiOverrides)
  ;(window as any).electronAPI = api
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <ThemeProvider>
      <AudioFilePicker onSelect={onSelect} onClose={onClose} {...props} />
    </ThemeProvider>
  )
  return { ...utils, api, onSelect, onClose }
}

beforeEach(() => {
  delete (window as any).electronAPI
})

describe('AudioFilePicker — filter box', () => {
  test('typing narrows the visible entries; clearing restores them', async () => {
    const entries: DirEntry[] = [
      { name: 'kick.wav', path: 'C:\\Music\\kick.wav', isDir: false },
      { name: 'snare.wav', path: 'C:\\Music\\snare.wav', isDir: false },
    ]
    renderPicker({}, {
      listDirectory: mockListDirectoryByPath({ [ROOT]: { entries, error: null, truncated: false, totalCount: 2 } }),
    })

    await screen.findByText('kick.wav')
    expect(screen.getByText('snare.wav')).toBeInTheDocument()

    const filterInput = screen.getByPlaceholderText('Filter files in this folder...')
    fireEvent.change(filterInput, { target: { value: 'kick' } })

    expect(screen.getByText('kick.wav')).toBeInTheDocument()
    expect(screen.queryByText('snare.wav')).not.toBeInTheDocument()

    fireEvent.change(filterInput, { target: { value: '' } })

    expect(screen.getByText('kick.wav')).toBeInTheDocument()
    expect(screen.getByText('snare.wav')).toBeInTheDocument()
  })

  test('autofocuses the filter box on open', async () => {
    renderPicker()
    const filterInput = await screen.findByPlaceholderText('Filter files in this folder...')
    expect(filterInput).toHaveFocus()
  })
})

describe('AudioFilePicker — keyboard navigation', () => {
  test('ArrowDown/ArrowUp move the highlight, Enter descends a directory then confirms a file, Escape closes', async () => {
    const beatsPath = 'C:\\Music\\Beats'
    const filePath = 'C:\\Music\\Beats\\kick2.wav'
    const { onSelect, onClose } = renderPicker({}, {
      listDirectory: mockListDirectoryByPath({
        [ROOT]: {
          entries: [{ name: 'Beats', path: beatsPath, isDir: true }],
          error: null, truncated: false, totalCount: 1,
        },
        [beatsPath]: {
          entries: [{ name: 'kick2.wav', path: filePath, isDir: false }],
          error: null, truncated: false, totalCount: 1,
        },
      }),
    })

    await screen.findByText('Beats')

    // ArrowDown highlights the only (directory) entry; Enter descends.
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })

    const kickFile = await screen.findByText('kick2.wav')
    expect(kickFile).toBeInTheDocument()

    // ArrowDown highlights it, then ArrowUp and ArrowDown again to exercise
    // both directions before confirming with Enter.
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(filePath, 'kick2'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('AudioFilePicker — loading state', () => {
  test('shows a loading indicator while a directory read is in flight', async () => {
    let resolveList: (v: ListResult) => void = () => {}
    const listDirectory = vi.fn().mockImplementation(
      () => new Promise<ListResult>((resolve) => { resolveList = resolve })
    )
    renderPicker({}, { listDirectory })

    expect(await screen.findByText(/Loading/i)).toBeInTheDocument()

    resolveList({ entries: [], error: null, truncated: false, totalCount: 0 })
    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
  })

  test('an out-of-order listDirectory response cannot overwrite a newer one', async () => {
    const folderAPath = 'C:\\Music\\FolderA'
    const pending: Record<string, (v: ListResult) => void> = {}
    const listDirectory = vi.fn(
      (dirPath: string) => new Promise<ListResult>((resolve) => { pending[dirPath] = resolve })
    )

    renderPicker({}, { listDirectory })

    // Initial navigate() to the startup dir.
    await waitFor(() => expect(listDirectory).toHaveBeenCalledWith(ROOT))
    pending[ROOT]({
      entries: [{ name: 'FolderA', path: folderAPath, isDir: true }],
      error: null, truncated: false, totalCount: 1,
    })
    const folderA = await screen.findByText('FolderA')

    // Descend into FolderA — this navigate() call is left pending.
    fireEvent.doubleClick(folderA)
    expect(pending[folderAPath]).toBeDefined()

    // The breadcrumb "up" control isn't gated by isLoading, so it's still
    // clickable while FolderA's request is in flight — click it to fire a
    // second, newer navigate() call before the first one resolves.
    await waitFor(() => expect(screen.getByTitle('Go up')).not.toBeDisabled())
    fireEvent.click(screen.getByTitle('Go up'))
    await waitFor(() => expect(listDirectory).toHaveBeenCalledWith('C:\\'))

    // Resolve the NEWER (up) request first.
    pending['C:\\']({
      entries: [{ name: 'RootEntry.wav', path: 'C:\\RootEntry.wav', isDir: false }],
      error: null, truncated: false, totalCount: 1,
    })
    await screen.findByText('RootEntry.wav')

    // Now resolve the OLDER (FolderA) request — it must be ignored.
    pending[folderAPath]({
      entries: [{ name: 'StaleFile.wav', path: 'C:\\Music\\FolderA\\StaleFile.wav', isDir: false }],
      error: null, truncated: false, totalCount: 1,
    })

    await waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(3))
    expect(screen.queryByText('StaleFile.wav')).not.toBeInTheDocument()
    expect(screen.getByText('RootEntry.wav')).toBeInTheDocument()
  })
})

describe('AudioFilePicker — truncation', () => {
  test('shows a truncation notice with the hidden count when the listing is capped', async () => {
    const entries: DirEntry[] = [
      { name: 'a.wav', path: 'C:\\Music\\a.wav', isDir: false },
      { name: 'b.wav', path: 'C:\\Music\\b.wav', isDir: false },
    ]
    renderPicker({}, {
      listDirectory: mockListDirectoryByPath({
        [ROOT]: { entries, error: null, truncated: true, totalCount: 50 },
      }),
    })

    expect(await screen.findByText(/Showing 2 of 50 files/)).toBeInTheDocument()
  })
})

describe('AudioFilePicker — failure and retry', () => {
  test('a failed directory read shows a friendly line, the underlying message, and a working Retry', async () => {
    const listDirectory = vi.fn()
      .mockResolvedValueOnce({ entries: [], error: 'EACCES: permission denied', truncated: false, totalCount: 0 })
      .mockResolvedValueOnce({
        entries: [{ name: 'ok.wav', path: 'C:\\Music\\ok.wav', isDir: false }],
        error: null, truncated: false, totalCount: 1,
      })

    renderPicker({}, { listDirectory })

    expect(await screen.findByText(/couldn.t read this folder/i)).toBeInTheDocument()
    expect(screen.getByText('EACCES: permission denied')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('ok.wav')).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledTimes(2)
    expect(listDirectory.mock.calls[1][0]).toBe(ROOT)
  })
})

describe('AudioFilePicker — confirm-time revalidation', () => {
  test('confirming a file deleted since it was listed does not call onSelect', async () => {
    const listDirectory = vi.fn()
      .mockResolvedValueOnce({
        entries: [{ name: 'gone.wav', path: 'C:\\Music\\gone.wav', isDir: false }],
        error: null, truncated: false, totalCount: 1,
      })
      .mockResolvedValueOnce({ entries: [], error: null, truncated: false, totalCount: 0 })

    const { onSelect } = renderPicker({}, { listDirectory })

    const file = await screen.findByText('gone.wav')
    fireEvent.doubleClick(file)

    await waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(2))
    expect(onSelect).not.toHaveBeenCalled()
    expect(await screen.findByText(/no longer in this folder/i)).toBeInTheDocument()
  })
})

describe('AudioFilePicker — initialDirectory override', () => {
  const BROKEN_DIR = 'C:\Music\OldSFX'

  test('opens in initialDirectory instead of the pinned library folder', async () => {
    const { api } = renderPicker(
      { initialDirectory: BROKEN_DIR },
      {
        // The pin points somewhere else entirely; the override must win.
        storeGet: vi.fn().mockResolvedValue('C:\Music\Pinned'),
        listDirectory: mockListDirectoryByPath({
          [BROKEN_DIR]: {
            entries: [{ name: 'replacement.wav', path: `${BROKEN_DIR}\replacement.wav`, isDir: false }],
            error: null,
            truncated: false,
            totalCount: 1,
          },
        }),
      }
    )

    expect(await screen.findByText('replacement.wav')).toBeInTheDocument()
    await waitFor(() => expect(api.listDirectory).toHaveBeenCalledWith(BROKEN_DIR))
    expect(api.listDirectory).not.toHaveBeenCalledWith('C:\Music\Pinned')
  })

  test('falls back to the pinned folder when initialDirectory no longer exists', async () => {
    const PINNED = 'C:\Music\Pinned'
    const { api } = renderPicker(
      { initialDirectory: BROKEN_DIR },
      {
        storeGet: vi.fn().mockResolvedValue(PINNED),
        listDirectory: mockListDirectoryByPath({
          // The old folder was deleted along with the sound.
          [BROKEN_DIR]: { entries: [], error: 'ENOENT: no such file or directory', truncated: false, totalCount: 0 },
          [PINNED]: {
            entries: [{ name: 'pinned.wav', path: `${PINNED}\pinned.wav`, isDir: false }],
            error: null,
            truncated: false,
            totalCount: 1,
          },
        }),
      }
    )

    // The user lands on their library, not stranded in an error state.
    expect(await screen.findByText('pinned.wav')).toBeInTheDocument()
    await waitFor(() => expect(api.listDirectory).toHaveBeenCalledWith(PINNED))
  })

  test('never writes the override into the pinned-folder store key', async () => {
    const { api } = renderPicker(
      { initialDirectory: BROKEN_DIR },
      {
        storeGet: vi.fn().mockResolvedValue('C:\Music\Pinned'),
        listDirectory: mockListDirectoryByPath({
          [BROKEN_DIR]: { entries: [], error: null, truncated: false, totalCount: 0 },
        }),
      }
    )

    await waitFor(() => expect(api.listDirectory).toHaveBeenCalledWith(BROKEN_DIR))
    expect(api.storeSet).not.toHaveBeenCalled()
  })
})
