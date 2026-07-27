import { describe, test, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProfileManager } from '../hooks/useProfileManager'

// No electronAPI — exercises the localStorage path.
// window.location.reload is mocked so switchProfile/deleteProfile don't throw.

vi.stubGlobal('location', { ...window.location, reload: vi.fn() })

describe('useProfileManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('createProfile adds a profile and makes it active', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('My Profile', [], 'circle')
    })

    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    expect(result.current.profiles[0].name).toBe('My Profile')
    expect(result.current.activeProfileId).toBe(result.current.profiles[0].id)
  })

  test('createProfile with buttonMapping stores it on the profile', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Mapped', [], 'square', [[0, 5], [1, 6]])
    })

    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    expect(result.current.profiles[0].buttonMapping).toEqual([[0, 5], [1, 6]])
  })

  test('updateProfileLayout with a buttonMapping arg persists it on the profile record', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Layout Test', [], 'circle')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    const id = result.current.profiles[0].id

    act(() => {
      result.current.updateProfileLayout(id, [{ id: 0, x: 0, y: 0 }], 'square', [[0, 3]])
    })

    await waitFor(() => expect(result.current.profiles[0].buttonMapping).toEqual([[0, 3]]))
    expect(result.current.profiles[0].boardLayout).toEqual([{ id: 0, x: 0, y: 0 }])
    expect(result.current.profiles[0].buttonShape).toBe('square')
  })

  test('updateProfileLayout without a buttonMapping arg leaves the existing mapping untouched', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Layout Test', [], 'circle', [[0, 9]])
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    const id = result.current.profiles[0].id

    act(() => {
      result.current.updateProfileLayout(id, [{ id: 0, x: 5, y: 5 }], 'circle')
    })

    await waitFor(() => expect(result.current.profiles[0].boardLayout).toEqual([{ id: 0, x: 5, y: 5 }]))
    expect(result.current.profiles[0].buttonMapping).toEqual([[0, 9]])
  })

  test('updateProfileLayout writes buttonMapping into the working-state store key for the active profile', async () => {
    const storeSet = vi.fn().mockResolvedValue(true)
    ;(window as any).electronAPI = { storeSet, storeGet: vi.fn().mockResolvedValue(undefined) }

    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Working State Test', [], 'circle')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    const id = result.current.profiles[0].id
    storeSet.mockClear()

    act(() => {
      result.current.updateProfileLayout(id, [{ id: 0, x: 0, y: 0 }], 'circle', [[0, 7]])
    })

    await waitFor(() => expect(storeSet).toHaveBeenCalledWith('haute42-button-mapping', [[0, 7]]))

    delete (window as any).electronAPI
  })

  test('renameProfile updates name and updatedAt', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Old Name', [], 'circle')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))

    const before = result.current.profiles[0].updatedAt
    const id = result.current.profiles[0].id

    // Brief pause to ensure timestamps differ
    await new Promise(r => setTimeout(r, 5))

    act(() => {
      result.current.renameProfile(id, 'New Name')
    })

    await waitFor(() => expect(result.current.profiles[0].name).toBe('New Name'))
    expect(result.current.profiles[0].updatedAt).toBeGreaterThanOrEqual(before)
  })

  test('deleteProfile removes a profile', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('A', [], 'circle')
      result.current.createProfile('B', [], 'circle')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(2))

    const idA = result.current.profiles[0].id
    act(() => {
      result.current.deleteProfile(idA)
    })

    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    expect(result.current.profiles[0].name).toBe('B')
  })

  test('deleteProfile refuses to delete the last profile', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Only', [], 'circle')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))

    const id = result.current.profiles[0].id
    act(() => {
      result.current.deleteProfile(id)
    })

    // Still has the one profile
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
  })

  test('duplicateProfile creates a copy with "(Copy)" suffix', async () => {
    const { result } = renderHook(() => useProfileManager())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.createProfile('Original', [], 'square')
    })
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))

    const id = result.current.profiles[0].id
    await act(async () => {
      await result.current.duplicateProfile(id)
    })

    await waitFor(() => expect(result.current.profiles).toHaveLength(2))
    const copy = result.current.profiles.find(p => p.name.includes('Copy'))
    expect(copy).toBeDefined()
    expect(copy!.name).toBe('Original (Copy)')
    expect(copy!.id).not.toBe(id)
  })
})
