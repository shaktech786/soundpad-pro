import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
