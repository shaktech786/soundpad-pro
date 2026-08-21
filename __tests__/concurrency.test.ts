import { describe, test, expect, vi } from 'vitest'
import { runWithConcurrencyLimit } from '../utils/concurrency'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('runWithConcurrencyLimit', () => {
  test('invokes the worker for every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const seen: number[] = []

    await runWithConcurrencyLimit(items, async (item) => { seen.push(item) }, 3)

    expect(seen.sort((a, b) => a - b)).toEqual(items)
  })

  test('never runs more than `limit` workers concurrently', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0

    await runWithConcurrencyLimit(items, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await delay(5)
      inFlight--
    }, 5)

    expect(maxInFlight).toBe(5)
  })

  test('a limit larger than the item count still runs everything once', async () => {
    const items = ['a', 'b', 'c']
    const worker = vi.fn(async () => {})

    await runWithConcurrencyLimit(items, worker, 100)

    expect(worker).toHaveBeenCalledTimes(3)
  })

  test('an empty item list resolves immediately without calling the worker', async () => {
    const worker = vi.fn(async () => {})

    await runWithConcurrencyLimit([], worker, 5)

    expect(worker).not.toHaveBeenCalled()
  })

  test('records every failure when the worker itself catches errors (matches preload usage)', async () => {
    const items = ['ok1', 'bad1', 'ok2', 'bad2', 'ok3']
    const failures: string[] = []
    const succeeded: string[] = []

    await runWithConcurrencyLimit(items, async (item) => {
      try {
        if (item.startsWith('bad')) throw new Error(`load failed: ${item}`)
        succeeded.push(item)
      } catch (err) {
        failures.push(item)
      }
    }, 2)

    expect(failures.sort()).toEqual(['bad1', 'bad2'])
    expect(succeeded.sort()).toEqual(['ok1', 'ok2', 'ok3'])
  })

  test('a worker rejection propagates out (caller must catch internally to keep going)', async () => {
    await expect(
      runWithConcurrencyLimit(['a', 'b'], async (item) => {
        if (item === 'b') throw new Error('boom')
      }, 2)
    ).rejects.toThrow('boom')
  })
})
