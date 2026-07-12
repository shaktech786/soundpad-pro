import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectGame, GameDetector, GAME_ALLOWLIST } = require('../main/game-detection')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NowPlayingServer } = require('../main/now-playing-server')

describe('detectGame (pure classifier)', () => {
  it('recognises a game by exe name with high confidence', () => {
    expect(detectGame('VALORANT-Win64-Shipping.exe', 'VALORANT')).toEqual({
      detectedGame: 'VALORANT',
      confidence: 'high',
    })
    expect(detectGame('cs2.exe', 'Counter-Strike 2')).toEqual({
      detectedGame: 'Counter-Strike 2',
      confidence: 'high',
    })
    expect(detectGame('r5apex.exe', '')).toEqual({
      detectedGame: 'Apex Legends',
      confidence: 'high',
    })
  })

  it('recognises a game by window-title substring even with an unknown exe', () => {
    expect(detectGame('someLauncher.exe', 'League of Legends (TM) Client')).toEqual({
      detectedGame: 'League of Legends',
      confidence: 'high',
    })
    expect(detectGame('javaw.exe', 'Minecraft 1.20.4')).toEqual({
      detectedGame: 'Minecraft',
      confidence: 'high',
    })
  })

  it('matches exe names case-insensitively and tolerates a missing .exe suffix', () => {
    expect(detectGame('VALORANT.EXE', '').detectedGame).toBe('VALORANT')
    expect(detectGame('cs2', '').detectedGame).toBe('Counter-Strike 2')
  })

  it('never guesses: unknown foreground apps report null with low confidence', () => {
    expect(detectGame('SlayTheSpire2.exe', 'Slay the Spire 2')).toEqual({
      detectedGame: null,
      confidence: 'low',
    })
  })

  it('denylists browsers, Discord, OBS, and Explorer regardless of title', () => {
    for (const proc of ['chrome.exe', 'firefox.exe', 'msedge.exe', 'discord.exe', 'obs64.exe', 'explorer.exe']) {
      expect(detectGame(proc, 'anything')).toEqual({ detectedGame: null, confidence: 'low' })
    }
  })

  it('denylist wins over a game name in a browser tab title', () => {
    // Watching a VALORANT stream in Chrome must NOT report VALORANT.
    expect(detectGame('chrome.exe', 'VALORANT montage - YouTube')).toEqual({
      detectedGame: null,
      confidence: 'low',
    })
  })

  it('reports null for empty input', () => {
    expect(detectGame('', '')).toEqual({ detectedGame: null, confidence: 'low' })
    expect(detectGame(undefined, undefined)).toEqual({ detectedGame: null, confidence: 'low' })
  })
})

describe('detectGame (tiered merge)', () => {
  const localTier = [
    { game: 'Baldur’s Gate 3', exe: ['bg3.exe'], title: ["baldur's gate 3"] },
    { game: 'Stardew Valley', title: ['stardew valley'] }, // Steam-style, title-only
    // Same title substring as a curated game, but a DIFFERENT display name, to
    // prove the earlier tier wins.
    { game: 'Counter-Strike 2 (local)', exe: ['cs2.exe'] },
  ]

  it('matches an installed local-scan game not in the curated list', () => {
    expect(detectGame('bg3.exe', 'Baldur’s Gate 3', [localTier, GAME_ALLOWLIST])).toEqual({
      detectedGame: 'Baldur’s Gate 3',
      confidence: 'high',
    })
  })

  it('matches a Steam-style title-only local entry with an unknown exe', () => {
    expect(
      detectGame('Stardew Valley.exe', 'Stardew Valley', [localTier, GAME_ALLOWLIST]).detectedGame
    ).toBe('Stardew Valley')
  })

  it('the earlier tier wins when both tiers could match', () => {
    // cs2.exe is in BOTH the local tier and the curated allowlist; local wins.
    expect(detectGame('cs2.exe', '', [localTier, GAME_ALLOWLIST]).detectedGame).toBe(
      'Counter-Strike 2 (local)'
    )
  })

  it('falls through to the curated allowlist tier when no local entry matches', () => {
    expect(detectGame('valorant.exe', '', [localTier, GAME_ALLOWLIST]).detectedGame).toBe('VALORANT')
  })

  it('denylist still short-circuits before any tier is checked', () => {
    const spoof = [{ game: 'Spoofed', title: ['youtube'] }]
    expect(detectGame('chrome.exe', 'Baldur’s Gate 3 - YouTube', [spoof, GAME_ALLOWLIST])).toEqual({
      detectedGame: null,
      confidence: 'low',
    })
  })

  it('an empty local tier leaves curated behaviour unchanged', () => {
    expect(detectGame('cs2.exe', '', [[], GAME_ALLOWLIST]).detectedGame).toBe('Counter-Strike 2')
    expect(detectGame('SlayTheSpire2.exe', 'Slay the Spire 2', [[], GAME_ALLOWLIST])).toEqual({
      detectedGame: null,
      confidence: 'low',
    })
  })
})

describe('detectGame (prelive > local-scan > curated priority)', () => {
  // The same game (by window title) present in all three tiers under different
  // display names, to prove which tier wins.
  const preliveTier = [{ game: 'Counter-Strike 2 (prelive)', title: ['counter-strike 2'] }]
  const localTier = [{ game: 'Counter-Strike 2 (local)', exe: ['cs2.exe'], title: ['counter-strike 2'] }]

  it('prelive wins over both local-scan and curated for a shared game', () => {
    expect(
      detectGame('cs2.exe', 'Counter-Strike 2', [preliveTier, localTier, GAME_ALLOWLIST]).detectedGame
    ).toBe('Counter-Strike 2 (prelive)')
  })

  it('local-scan wins over curated when prelive has no match', () => {
    expect(
      detectGame('cs2.exe', 'Counter-Strike 2', [[], localTier, GAME_ALLOWLIST]).detectedGame
    ).toBe('Counter-Strike 2 (local)')
  })

  it('falls through to curated when neither prelive nor local matches', () => {
    expect(
      detectGame('cs2.exe', 'Counter-Strike 2', [[], [], GAME_ALLOWLIST]).detectedGame
    ).toBe('Counter-Strike 2')
  })

  it('matches a prelive-only game (streamed, not installed, not curated)', () => {
    const prelive = [{ game: 'Slay the Spire', title: ['slay the spire'] }]
    expect(
      detectGame('somegame.exe', 'Slay the Spire', [prelive, [], GAME_ALLOWLIST]).detectedGame
    ).toBe('Slay the Spire')
  })

  it('an empty prelive tier (unpaired / disconnected) falls back cleanly', () => {
    expect(
      detectGame('valorant.exe', '', [[], localTier, GAME_ALLOWLIST]).detectedGame
    ).toBe('VALORANT')
  })
})

describe('GameDetector (polling wrapper, active-win mocked)', () => {
  const makeDetector = (winResult: unknown) =>
    new GameDetector({ intervalMs: 10_000, activeWindow: async () => winResult })

  it('maps active-win output shape to a game snapshot', async () => {
    const detector = makeDetector({
      title: 'VALORANT',
      owner: { name: 'VALORANT-Win64-Shipping.exe', path: 'C:\\Riot\\VALORANT-Win64-Shipping.exe' },
    })
    await detector._poll()
    expect(detector.getSnapshot()).toEqual({
      processName: 'VALORANT-Win64-Shipping.exe',
      windowTitle: 'VALORANT',
      detectedGame: 'VALORANT',
      confidence: 'high',
    })
  })

  it('falls back to the exe basename of owner.path when owner.name is missing', async () => {
    const detector = makeDetector({
      title: 'Counter-Strike 2',
      owner: { name: '', path: 'D:\\SteamLibrary\\steamapps\\common\\cs2.exe' },
    })
    await detector._poll()
    const snap = detector.getSnapshot()
    expect(snap.processName).toBe('cs2.exe')
    expect(snap.detectedGame).toBe('Counter-Strike 2')
  })

  it('reports an all-null snapshot when no window is focused', async () => {
    const detector = makeDetector(undefined)
    await detector._poll()
    expect(detector.getSnapshot()).toEqual({
      processName: null,
      windowTitle: null,
      detectedGame: null,
      confidence: 'low',
    })
  })

  it('reports unknown (not a crash) for a focused non-game app', async () => {
    const detector = makeDetector({
      title: 'Inbox - Gmail - Google Chrome',
      owner: { name: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' },
    })
    await detector._poll()
    const snap = detector.getSnapshot()
    expect(snap.processName).toBe('chrome.exe')
    expect(snap.detectedGame).toBeNull()
    expect(snap.confidence).toBe('low')
  })

  it('detects a scanned local-library game once a scan has populated the tier', async () => {
    const detector = new GameDetector({
      intervalMs: 10_000,
      activeWindow: async () => ({
        title: 'Baldur’s Gate 3',
        owner: { name: 'bg3.exe', path: 'C:\\Games\\bg3.exe' },
      }),
      scanLocalLibraries: async () => [{ game: 'Baldur’s Gate 3', exe: ['bg3.exe'], title: ["baldur's gate 3"] }],
    })

    // Before a scan, an unlisted game is unknown.
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBeNull()

    // After the scan populates the local tier, it's detected.
    await detector._runLocalScan()
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBe('Baldur’s Gate 3')
  })

  it('degrades to an empty tier (no throw) when the scanner rejects', async () => {
    const detector = new GameDetector({
      intervalMs: 10_000,
      activeWindow: async () => ({ title: '', owner: { name: 'valorant.exe', path: '' } }),
      scanLocalLibraries: async () => {
        throw new Error('scan blew up')
      },
    })
    await detector._runLocalScan() // must not throw
    await detector._poll()
    // Curated allowlist still works despite the failed scan.
    expect(detector.getSnapshot().detectedGame).toBe('VALORANT')
  })

  it('the injected prelive tier outranks the local scan and curated allowlist', async () => {
    const detector = new GameDetector({
      intervalMs: 10_000,
      activeWindow: async () => ({
        title: 'Counter-Strike 2',
        owner: { name: 'cs2.exe', path: 'C:\\Games\\cs2.exe' },
      }),
      // cs2 is also in the curated allowlist ('Counter-Strike 2'); prelive wins.
      getPreliveTier: () => [{ game: 'Counter-Strike 2 (prelive)', title: ['counter-strike 2'] }],
      scanLocalLibraries: async () => [{ game: 'Counter-Strike 2 (local)', exe: ['cs2.exe'] }],
    })
    await detector._runLocalScan()
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBe('Counter-Strike 2 (prelive)')
  })

  it('reads the prelive tier live: clearing it (disconnect) falls back next poll', async () => {
    let preliveTier: Array<{ game: string; title?: string[]; exe?: string[] }> = [
      { game: 'Streamed Game', title: ['counter-strike 2'] },
    ]
    const detector = new GameDetector({
      intervalMs: 10_000,
      activeWindow: async () => ({
        title: 'Counter-Strike 2',
        owner: { name: 'cs2.exe', path: 'C:\\Games\\cs2.exe' },
      }),
      getPreliveTier: () => preliveTier,
    })

    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBe('Streamed Game')

    // Disconnecting empties the prelive tier; the very next poll falls back to
    // the curated allowlist without any other change.
    preliveTier = []
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBe('Counter-Strike 2')
  })

  it('a throwing prelive getter degrades to no prelive tier (no crash)', async () => {
    const detector = new GameDetector({
      intervalMs: 10_000,
      activeWindow: async () => ({ title: '', owner: { name: 'valorant.exe', path: '' } }),
      getPreliveTier: () => {
        throw new Error('getter blew up')
      },
    })
    await detector._poll() // must not throw
    expect(detector.getSnapshot().detectedGame).toBe('VALORANT')
  })
})

describe('GameDetector.forcePoll (on-demand recheck)', () => {
  it('forces an immediate poll and returns the freshly-classified snapshot, not the cached one', async () => {
    let win: any = { title: 'Inbox - Chrome', owner: { name: 'chrome.exe', path: '' } }
    const detector = new GameDetector({ intervalMs: 10_000, activeWindow: async () => win })

    // Prime the cache with a non-game window.
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBeNull()

    // The window changes to a game; forcePoll must re-query active-win and
    // reclassify rather than hand back the stale cached snapshot.
    win = { title: 'VALORANT', owner: { name: 'VALORANT-Win64-Shipping.exe', path: '' } }
    const pollSpy = vi.spyOn(detector, '_poll')
    const snap = await detector.forcePoll()

    expect(pollSpy).toHaveBeenCalledTimes(1)
    expect(snap).toEqual({
      processName: 'VALORANT-Win64-Shipping.exe',
      windowTitle: 'VALORANT',
      detectedGame: 'VALORANT',
      confidence: 'high',
    })
  })

  it('leaves the background polling interval and its 3000ms cadence untouched', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const detector = new GameDetector({
      intervalMs: 3000,
      activeWindow: async () => ({ title: '', owner: { name: 'valorant.exe', path: '' } }),
      scanLocalLibraries: async () => [],
    })
    detector.start()

    const callsAfterStart = setIntervalSpy.mock.calls.length
    // The foreground poll interval is registered at exactly the 3000ms cadence.
    expect(setIntervalSpy.mock.calls.some((c) => c[1] === 3000)).toBe(true)

    await detector.forcePoll()

    // forcePoll must not create, reset, or otherwise touch any interval timer.
    expect(setIntervalSpy.mock.calls.length).toBe(callsAfterStart)
    expect(detector._intervalMs).toBe(3000)

    detector.stop()
    setIntervalSpy.mockRestore()
  })
})

describe('NowPlayingServer /current-game/recheck route', () => {
  const PORT = 3200
  let server: any
  let forcePollCalls = 0
  let freshState: any = null
  const cachedState = {
    processName: 'stale.exe',
    windowTitle: 'Stale Window',
    detectedGame: null,
    confidence: 'low',
  }

  beforeAll(async () => {
    forcePollCalls = 0
    server = new NowPlayingServer({
      port: PORT,
      getCurrentGame: () => cachedState,
      forcePoll: async () => {
        forcePollCalls++
        return freshState
      },
    })
    server.start()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  afterAll(() => server.shutdown())

  it('POST forces a recheck and returns the fresh snapshot, not the cached one', async () => {
    freshState = {
      processName: 'cs2.exe',
      windowTitle: 'Counter-Strike 2',
      detectedGame: 'Counter-Strike 2',
      confidence: 'high',
    }
    const res = await fetch(`http://127.0.0.1:${PORT}/current-game/recheck`, { method: 'POST' })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(forcePollCalls).toBe(1)
    expect(body).toEqual({
      processName: 'cs2.exe',
      windowTitle: 'Counter-Strike 2',
      detectedGame: 'Counter-Strike 2',
      confidence: 'high',
    })
  })

  it('normalises the fresh snapshot the same way as /current-game', async () => {
    freshState = {
      processName: 'randomapp.exe',
      windowTitle: 'Random App',
      detectedGame: null,
      confidence: 'high',
    }
    const res = await fetch(`http://127.0.0.1:${PORT}/current-game/recheck`, { method: 'POST' })
    const body = await res.json()
    expect(body.detectedGame).toBeNull()
    expect(body.confidence).toBe('low')
  })

  it('rejects a GET (non-POST) with 405 without triggering a recheck', async () => {
    const before = forcePollCalls
    const res = await fetch(`http://127.0.0.1:${PORT}/current-game/recheck`)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(forcePollCalls).toBe(before)
  })

  it('GET /current-game still returns the cached snapshot without forcing a poll', async () => {
    const before = forcePollCalls
    const res = await fetch(`http://127.0.0.1:${PORT}/current-game`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.processName).toBe('stale.exe')
    expect(body.detectedGame).toBeNull()
    // The cached GET path must never invoke forcePoll.
    expect(forcePollCalls).toBe(before)
  })
})

describe('NowPlayingServer /current-game route', () => {
  const PORT = 3198
  let server: any
  let gameState: any = null

  beforeAll(async () => {
    server = new NowPlayingServer({
      port: PORT,
      getCurrentGame: () => gameState,
    })
    server.start()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  afterAll(() => server.shutdown())

  const get = async (route: string) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${route}`)
    return { res, body: await res.json() }
  }

  it('returns the current game snapshot as JSON', async () => {
    gameState = { processName: 'cs2.exe', windowTitle: 'Counter-Strike 2', detectedGame: 'Counter-Strike 2', confidence: 'high' }
    const { res, body } = await get('/current-game')
    expect(res.status).toBe(200)
    expect(body).toEqual({
      processName: 'cs2.exe',
      windowTitle: 'Counter-Strike 2',
      detectedGame: 'Counter-Strike 2',
      confidence: 'high',
    })
  })

  it('normalises a null / missing snapshot to the unknown shape', async () => {
    gameState = null
    const { body } = await get('/current-game')
    expect(body).toEqual({ processName: null, windowTitle: null, detectedGame: null, confidence: 'low' })
  })

  it('forces confidence to low when there is no detected game', async () => {
    gameState = { processName: 'randomapp.exe', windowTitle: 'Random App', detectedGame: null, confidence: 'high' }
    const { body } = await get('/current-game')
    expect(body.detectedGame).toBeNull()
    expect(body.confidence).toBe('low')
  })

  it('applies the same CORS / Private Network Access headers as /now-playing', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/current-game`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })
})
