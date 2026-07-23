import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The client takes an injected `httpGetJson`, so main/prelive-client.js never
// touches the real network (`https`) in these tests.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  PreliveClient,
  extractGames,
  buildTier,
  API_KEY_STORE_KEY,
} = require('../main/prelive-client')

// Minimal electron-store stand-in (Map-backed), mirroring the discord test's
// makeStore.
function makeStore(initial: Record<string, any> = {}) {
  const data: Record<string, any> = { ...initial }
  return {
    get: (key: string) => data[key],
    set: (key: string, value: any) => {
      data[key] = value
    },
    delete: (key: string) => {
      delete data[key]
    },
    _data: data,
  }
}

const silentLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

// Build a client whose fetch resolves/rejects on demand. `httpGetJson` records
// the URL + headers it was called with so we can assert the Bearer header.
function makeClient(
  httpGetJson: (url: string, headers: Record<string, string>) => Promise<any>,
  storeInitial: Record<string, any> = {},
) {
  const store = makeStore(storeInitial)
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const client = new PreliveClient({
    store,
    logger: silentLogger,
    httpGetJson: (url: string, headers: Record<string, string>) => {
      calls.push({ url, headers })
      return httpGetJson(url, headers)
    },
  })
  return { client, store, calls }
}

describe('extractGames (envelope unwrapping)', () => {
  test('reads the expected { data: { games: [...] } } shape', () => {
    expect(extractGames({ data: { games: ['Halo', 'Portal'] } })).toEqual(['Halo', 'Portal'])
  })

  test('falls back to a flat { games: [...] } shape', () => {
    expect(extractGames({ games: ['Halo'] })).toEqual(['Halo'])
  })

  test('falls back to a bare array', () => {
    expect(extractGames(['Halo', 'Portal'])).toEqual(['Halo', 'Portal'])
  })

  test('reads name/title/game fields off object entries', () => {
    expect(extractGames({ data: { games: [{ name: 'Halo' }, { title: 'Portal' }] } })).toEqual([
      'Halo',
      'Portal',
    ])
  })

  test('degrades to [] for null / unexpected shapes', () => {
    expect(extractGames(null)).toEqual([])
    expect(extractGames({})).toEqual([])
    expect(extractGames({ data: {} })).toEqual([])
    expect(extractGames({ data: { games: 'nope' } })).toEqual([])
  })
})

describe('buildTier (game names → classifier tier)', () => {
  test('produces title-only entries lowercased', () => {
    expect(buildTier(['Halo Infinite'])).toEqual([
      { game: 'Halo Infinite', title: ['halo infinite'] },
    ])
  })

  test('trims, drops blanks, and dedupes case-insensitively', () => {
    expect(buildTier(['  Halo  ', 'halo', '', 'Portal', null as any])).toEqual([
      { game: 'Halo', title: ['halo'] },
      { game: 'Portal', title: ['portal'] },
    ])
  })

  test('indexes the Arabic spelling of a trailing Roman numeral too', () => {
    // Twitch's category is "Slay the Spire II"; Steam/window titles say
    // "Slay the Spire 2". Without the extra variant the tier never matches, and
    // the base game (a substring of that title) wins instead.
    expect(buildTier(['Slay the Spire II'])).toEqual([
      { game: 'Slay the Spire II', title: ['slay the spire ii', 'slay the spire 2'] },
    ])
  })

  test('leaves an ambiguous single-letter numeral alone', () => {
    expect(buildTier(['Mega Man X'])).toEqual([{ game: 'Mega Man X', title: ['mega man x'] }])
  })
})

describe('PreliveClient.setApiKey + fetch', () => {
  test('stores the key, sends a Bearer header, caches the tier, reports connected', async () => {
    const { client, store, calls } = makeClient(async () => ({
      data: { games: ['Halo', 'Portal'] },
    }))

    const status = await client.setApiKey('prl_live_abc123')

    expect(store.get(API_KEY_STORE_KEY)).toBe('prl_live_abc123')
    expect(calls[0].headers.Authorization).toBe('Bearer prl_live_abc123')
    expect(status.connected).toBe(true)
    expect(status.gameCount).toBe(2)
    expect(status.error).toBeNull()
    expect(status.lastFetchAt).toBeTypeOf('number')
    expect(client.getTier()).toEqual([
      { game: 'Halo', title: ['halo'] },
      { game: 'Portal', title: ['portal'] },
    ])
  })

  test('trims the key before storing and fetching', async () => {
    const { client, store, calls } = makeClient(async () => ({ data: { games: [] } }))
    await client.setApiKey('  prl_test_xyz  ')
    expect(store.get(API_KEY_STORE_KEY)).toBe('prl_test_xyz')
    expect(calls[0].headers.Authorization).toBe('Bearer prl_test_xyz')
  })

  test('a blank key is rejected without storing or fetching', async () => {
    const httpGetJson = vi.fn(async () => ({ data: { games: [] } }))
    const store = makeStore()
    const client = new PreliveClient({ store, logger: silentLogger, httpGetJson })

    const status = await client.setApiKey('   ')

    expect(httpGetJson).not.toHaveBeenCalled()
    expect(store.get(API_KEY_STORE_KEY)).toBeUndefined()
    expect(status.connected).toBe(false)
    expect(status.error).toMatch(/required/i)
  })

  test('getStatus NEVER leaks the API key', async () => {
    const { client } = makeClient(async () => ({ data: { games: ['Halo'] } }))
    await client.setApiKey('prl_live_secret')
    const status = client.getStatus()
    expect(Object.keys(status).sort()).toEqual(['connected', 'error', 'gameCount', 'lastFetchAt'])
    expect(JSON.stringify(status)).not.toContain('prl_live_secret')
  })

  test('hasApiKey reflects whether a key is stored', async () => {
    const { client } = makeClient(async () => ({ data: { games: [] } }))
    expect(client.hasApiKey()).toBe(false)
    await client.setApiKey('prl_live_abc')
    expect(client.hasApiKey()).toBe(true)
  })
})

describe('PreliveClient error handling', () => {
  test('a 401 reports a clear rejected-key error and clears the tier', async () => {
    // First fetch succeeds (populates a tier), then the key is "revoked".
    let call = 0
    const { client } = makeClient(async () => {
      call += 1
      if (call === 1) return { data: { games: ['Halo'] } }
      const err: any = new Error('unauthorized')
      err.statusCode = 401
      throw err
    })

    await client.setApiKey('prl_live_abc')
    expect(client.getStatus().gameCount).toBe(1)

    const status = await client.refresh()
    expect(status.connected).toBe(false)
    expect(status.error).toMatch(/rejected|games:read|scope/i)
    expect(status.gameCount).toBe(0)
    expect(client.getTier()).toEqual([])
  })

  test('a 403 is treated the same as a 401 (revoked / wrong scope)', async () => {
    const { client } = makeClient(async () => {
      const err: any = new Error('forbidden')
      err.statusCode = 403
      throw err
    })
    const status = await client.setApiKey('prl_live_abc')
    expect(status.connected).toBe(false)
    expect(status.error).toMatch(/rejected|scope/i)
  })

  test('a network failure keeps the last good tier but reports disconnected', async () => {
    let call = 0
    const { client } = makeClient(async () => {
      call += 1
      if (call === 1) return { data: { games: ['Halo', 'Portal'] } }
      throw new Error('ECONNREFUSED')
    })

    await client.setApiKey('prl_live_abc')
    expect(client.getStatus().gameCount).toBe(2)

    const status = await client.refresh()
    expect(status.connected).toBe(false)
    expect(status.error).toMatch(/could not reach|ECONNREFUSED/i)
    // Transient outage must NOT wipe personalization.
    expect(status.gameCount).toBe(2)
    expect(client.getTier()).toHaveLength(2)
  })

  test('a malformed-JSON style rejection is a network-class error (tier kept)', async () => {
    let call = 0
    const { client } = makeClient(async () => {
      call += 1
      if (call === 1) return { data: { games: ['Halo'] } }
      throw new Error('prelive returned a malformed JSON response')
    })
    await client.setApiKey('prl_live_abc')
    const status = await client.refresh()
    expect(status.connected).toBe(false)
    expect(status.gameCount).toBe(1)
  })

  test('refresh with no key configured reports disconnected without an error', async () => {
    const httpGetJson = vi.fn(async () => ({ data: { games: [] } }))
    const client = new PreliveClient({ store: makeStore(), logger: silentLogger, httpGetJson })
    const status = await client.refresh()
    expect(httpGetJson).not.toHaveBeenCalled()
    expect(status).toEqual({ connected: false, error: null, gameCount: 0, lastFetchAt: null })
  })
})

describe('PreliveClient.disconnect', () => {
  test('clears the stored key, the cached tier, and resets status', async () => {
    const { client, store } = makeClient(async () => ({ data: { games: ['Halo'] } }))
    await client.setApiKey('prl_live_abc')
    expect(client.getStatus().connected).toBe(true)

    const status = client.disconnect()
    expect(store.get(API_KEY_STORE_KEY)).toBeUndefined()
    expect(status).toEqual({ connected: false, error: null, gameCount: 0, lastFetchAt: null })
    expect(client.getTier()).toEqual([])
    expect(client.hasApiKey()).toBe(false)
  })
})

describe('PreliveClient.getTier immutability', () => {
  test('mutating the returned tier does not corrupt the cache', async () => {
    const { client } = makeClient(async () => ({ data: { games: ['Halo'] } }))
    await client.setApiKey('prl_live_abc')
    const tier = client.getTier()
    tier.push({ game: 'Injected', title: ['injected'] })
    tier[0].title.push('mutated')
    expect(client.getTier()).toEqual([{ game: 'Halo', title: ['halo'] }])
  })
})

describe('PreliveClient status events', () => {
  test('emits a status event on every fetch outcome', async () => {
    const { client } = makeClient(async () => ({ data: { games: ['Halo'] } }))
    const events: any[] = []
    client.on('status', (s: any) => events.push(s))
    await client.setApiKey('prl_live_abc')
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[events.length - 1]).toMatchObject({ connected: true, gameCount: 1 })
    // No emitted status object ever carries the key.
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual(['connected', 'error', 'gameCount', 'lastFetchAt'])
    }
  })
})

describe('PreliveClient scheduling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('start() runs an initial delayed fetch, then refreshes on the interval', async () => {
    const httpGetJson = vi.fn(async () => ({ data: { games: ['Halo'] } }))
    const store = makeStore({ [API_KEY_STORE_KEY]: 'prl_live_abc' })
    const client = new PreliveClient({
      store,
      logger: silentLogger,
      httpGetJson,
      initialDelayMs: 8000,
      fetchIntervalMs: 60_000,
    })

    client.start()
    expect(httpGetJson).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(8000)
    expect(httpGetJson).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(httpGetJson).toHaveBeenCalledTimes(2)

    client.stop()
    await vi.advanceTimersByTimeAsync(60_000 * 3)
    expect(httpGetJson).toHaveBeenCalledTimes(2)
  })

  test('start() with no key configured never fetches', async () => {
    const httpGetJson = vi.fn(async () => ({ data: { games: [] } }))
    const client = new PreliveClient({ store: makeStore(), logger: silentLogger, httpGetJson })
    client.start()
    await vi.advanceTimersByTimeAsync(60_000 * 5)
    expect(httpGetJson).not.toHaveBeenCalled()
  })

  test('a network failure retries on the shorter retry interval', async () => {
    let call = 0
    const httpGetJson = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('offline')
      return { data: { games: ['Halo'] } }
    })
    const store = makeStore({ [API_KEY_STORE_KEY]: 'prl_live_abc' })
    const client = new PreliveClient({
      store,
      logger: silentLogger,
      httpGetJson,
      initialDelayMs: 1000,
      fetchIntervalMs: 60_000,
      retryIntervalMs: 5000,
    })

    client.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(httpGetJson).toHaveBeenCalledTimes(1)
    expect(client.getStatus().connected).toBe(false)

    // Recovers on the shorter retry interval, not the full refresh interval.
    await vi.advanceTimersByTimeAsync(5000)
    expect(httpGetJson).toHaveBeenCalledTimes(2)
    expect(client.getStatus().connected).toBe(true)

    client.stop()
  })
})
