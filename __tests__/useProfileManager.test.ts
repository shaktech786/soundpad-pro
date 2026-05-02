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
