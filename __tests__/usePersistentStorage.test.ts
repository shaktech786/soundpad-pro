import { describe, test, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePersistentStorage } from '../hooks/usePersistentStorage'

// No electronAPI in jsdom — exercises the localStorage fallback path.

describe('usePersistentStorage (localStorage path)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('returns defaultValue initially', async () => {
    const { result } = renderHook(() => usePersistentStorage('test-key', 'default'))
    await waitFor(() => expect(result.current[2]).toBe(false)) // isLoading resolves
    expect(result.current[0]).toBe('default')
  })

  test('loads a previously stored string from localStorage', async () => {
    localStorage.setItem('test-key', JSON.stringify('stored value'))
    const { result } = renderHook(() => usePersistentStorage('test-key', 'default'))
    await waitFor(() => expect(result.current[2]).toBe(false))
    expect(result.current[0]).toBe('stored value')
  })

  test('loads a stored number from localStorage', async () => {
    localStorage.setItem('num-key', JSON.stringify(42))
    const { result } = renderHook(() => usePersistentStorage('num-key', 0))
    await waitFor(() => expect(result.current[2]).toBe(false))
    expect(result.current[0]).toBe(42)
  })

  test('persists a new value to localStorage when set', async () => {
    const { result } = renderHook(() => usePersistentStorage('save-key', 'init'))
    await waitFor(() => expect(result.current[2]).toBe(false))

    act(() => result.current[1]('updated'))

    await waitFor(() => {
      const raw = localStorage.getItem('save-key')
      return raw !== null && JSON.parse(raw) === 'updated'
    })
    expect(result.current[0]).toBe('updated')
  })

  test('deserializes Map with numeric keys correctly', async () => {
    // Simulate what the hook stores: array of [key, value] pairs with string keys (JSON round-trip)
    localStorage.setItem('map-key', JSON.stringify([[0, 'a'], [1, 'b']]))
    const { result } = renderHook(() => usePersistentStorage('map-key', new Map<number, string>()))
    await waitFor(() => expect(result.current[2]).toBe(false))

    const m = result.current[0] as Map<number, string>
    expect(m instanceof Map).toBe(true)
    expect(m.get(0)).toBe('a')
    expect(m.get(1)).toBe('b')
  })

  test('deserializes Set correctly', async () => {
    localStorage.setItem('set-key', JSON.stringify([10, 20, 30]))
    const { result } = renderHook(() => usePersistentStorage('set-key', new Set<number>()))
    await waitFor(() => expect(result.current[2]).toBe(false))

    const s = result.current[0] as Set<number>
    expect(s instanceof Set).toBe(true)
    expect(s.has(10)).toBe(true)
    expect(s.has(20)).toBe(true)
  })

  test('ignores malformed JSON in localStorage and uses defaultValue', async () => {
    localStorage.setItem('bad-key', 'not-json{{{')
    const { result } = renderHook(() => usePersistentStorage('bad-key', 'fallback'))
    await waitFor(() => expect(result.current[2]).toBe(false))
    expect(result.current[0]).toBe('fallback')
  })
})
