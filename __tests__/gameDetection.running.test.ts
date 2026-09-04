import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  GameDetector,
  detectGame,
  matchTierDetailed,
  parseGetProcessOutput,
  GAME_ALLOWLIST,
  RESCAN_ON_MISS_MIN_INTERVAL_MS,
} = require('../main/game-detection')

type Proc = { name: string; path?: string | null; title?: string | null; startedAt?: number | null }
const procs = (...list: Proc[]) =>
  list.map((p) => ({ name: p.name, path: p.path ?? null, title: p.title ?? null, startedAt: p.startedAt ?? null }))

const OBS = { title: 'OBS 31.0.0', owner: { name: 'OBS Studio', path: 'C:/obs/obs64.exe' } }
const STEAM_COMMON = 'C:/Steam/steamapps/common'

// A Steam game the library scanner can only describe by title and install
// directory: no Unreal shipping exe, no exe named after the game.
const HADES = { game: 'Hades II', title: ['hades ii'], dir: `${STEAM_COMMON}/Hades II` }
const HADES_EXE = `${STEAM_COMMON}/Hades II/x64/Hades2.exe`

describe('parseGetProcessOutput', () => {
  it('turns Get-Process JSON into lowercase basenames with path, title and start time', () => {
    const json =
      '\uFEFF' +
      JSON.stringify([
        { Name: 'hl', Path: 'C:/Steam/steamapps/common/Half-Life/hl.exe', MainWindowTitle: 'Counter-Strike', StartedAt: 1234 },
        { Name: 'System', Path: null, MainWindowTitle: '', StartedAt: null },
      ])
    expect(parseGetProcessOutput(json)).toEqual([
      { name: 'hl', path: 'C:/Steam/steamapps/common/Half-Life/hl.exe', title: 'Counter-Strike', startedAt: 1234 },
      { name: 'system', path: null, title: null, startedAt: null },
    ])
  })

  it('accepts the single object PowerShell emits for a one-process list', () => {
    expect(parseGetProcessOutput(JSON.stringify({ Name: 'Solo', Path: 'D:/g/Solo.exe' }))).toEqual([
      { name: 'solo', path: 'D:/g/Solo.exe', title: null, startedAt: null },
    ])
  })

  it('returns null for unparseable or empty output', () => {
    expect(parseGetProcessOutput('not json')).toBeNull()
    expect(parseGetProcessOutput('[]')).toBeNull()
    expect(parseGetProcessOutput('')).toBeNull()
  })
})

describe('matchTierDetailed', () => {
  const tier = [
    { game: 'Half-Life', title: ['half-life'], dir: `${STEAM_COMMON}/Half-Life` },
    { game: 'Counter-Strike', title: ['counter-strike'], dir: `${STEAM_COMMON}/Half-Life` },
    { game: 'Palworld', title: ['palworld'], dir: `${STEAM_COMMON}/Palworld`, exe: ['palworld-win64-shipping.exe'] },
  ]

  it('reports how the entry matched: exe, then title, then directory', () => {
    expect(matchTierDetailed(tier, 'palworld-win64-shipping', 'pal', null)).toEqual({ game: 'Palworld', kind: 'exe' })
    expect(matchTierDetailed(tier, 'hl', 'counter-strike', null)).toEqual({ game: 'Counter-Strike', kind: 'title' })
    expect(matchTierDetailed(tier, 'pal', 'pal', `${STEAM_COMMON}/Palworld/Pal/Binaries/Win64/Pal.exe`)).toEqual({
      game: 'Palworld',
      kind: 'dir',
    })
  })

  it('refuses a directory two games share unless a title tells them apart', () => {
    expect(matchTierDetailed(tier, 'hl', '', `${STEAM_COMMON}/Half-Life/hl.exe`)).toBeNull()
    expect(matchTierDetailed(tier, 'hl', 'counter-strike', `${STEAM_COMMON}/Half-Life/hl.exe`)).toEqual({
      game: 'Counter-Strike',
      kind: 'title',
    })
  })

  it('folds path separators and case when comparing directories', () => {
    expect(matchTierDetailed(tier, 'pal', '', 'c:\\steam\\STEAMAPPS\\common\\palworld\\Pal.exe')).toEqual({
      game: 'Palworld',
      kind: 'dir',
    })
    // A sibling directory that merely starts with the same characters is not inside it.
    expect(matchTierDetailed(tier, 'pal', '', `${STEAM_COMMON}/Palworld Mods/x.exe`)).toBeNull()
  })
})

describe('detectGame with the executable path', () => {
  it('recognises a focused game by install directory when its title is a codename', () => {
    const tier = [{ game: 'Palworld', title: ['palworld'], dir: `${STEAM_COMMON}/Palworld` }]
    expect(
      detectGame('Pal.exe', 'Pal', [tier, GAME_ALLOWLIST], `${STEAM_COMMON}/Palworld/Pal/Binaries/Win64/Pal.exe`)
    ).toEqual({ detectedGame: 'Palworld', confidence: 'high' })
  })

  it('still rejects a denylisted process inside a game directory', () => {
    const tier = [{ game: 'Palworld', title: ['palworld'], dir: `${STEAM_COMMON}/Palworld` }]
    expect(detectGame('setup.exe', 'Installing...', [tier], `${STEAM_COMMON}/Palworld/setup.exe`).detectedGame).toBeNull()
  })
})

describe('GameDetector running-process scan (title, directory, recency)', () => {
  const build = (opts: Record<string, unknown>) =>
    new GameDetector({ intervalMs: 10_000, activeWindow: async () => OBS, isProcessRunning: async () => true, ...opts })

  it('finds a title-only Steam game by its window title when it has never held focus', async () => {
    const detector = build({ listRunningProcesses: async () => procs({ name: 'hades2', title: 'Hades II' }) })
    detector._localTier = [HADES]

    expect(await detector.forcePoll()).toEqual({
      processName: 'hades2.exe',
      windowTitle: 'Hades II',
      detectedGame: 'Hades II',
      confidence: 'low',
    })
  })

  it('finds a game still on its untitled splash screen by its install directory', async () => {
    // The moment after launch: the process exists, the window has no title yet,
    // and the exe name matches nothing. This is the gap a streamer hits when
    // they click recheck right after pressing Play.
    const detector = build({ listRunningProcesses: async () => procs({ name: 'hades2', path: HADES_EXE }) })
    detector._localTier = [HADES]

    expect((await detector.forcePoll()).detectedGame).toBe('Hades II')
  })

  it('ignores a denylisted window whose title names a game', async () => {
    const detector = build({ listRunningProcesses: async () => procs({ name: 'chrome', title: 'Hades II - YouTube' }) })
    detector._localTier = [HADES]

    expect((await detector.forcePoll()).detectedGame).toBeNull()
  })

  it('lets an exact executable match beat a title substring from some other window', async () => {
    const detector = build({
      listRunningProcesses: async () => procs({ name: 'notion', title: 'VALORANT notes', startedAt: 9 }, { name: 'r5apex', startedAt: 1 }),
    })

    expect((await detector.forcePoll()).detectedGame).toBe('Apex Legends')
  })

  it('picks the most recently launched game when two are running', async () => {
    const detector = build({
      listRunningProcesses: async () => procs({ name: 'r5apex', startedAt: 1_000 }, { name: 'valorant', startedAt: 2_000 }),
    })

    expect((await detector.forcePoll()).detectedGame).toBe('VALORANT')
  })

  it('prefers a game launched after the cached foreground was last focused', async () => {
    // Quit Apex, launch VALORANT, hit recheck from OBS while Apex's process is
    // still winding down: the cache says Apex, but VALORANT started later.
    let clock = 1_000
    let win: any = { title: 'Apex Legends', owner: { name: '', path: 'C:/a/r5apex.exe' } }
    const detector = build({
      activeWindow: async () => win,
      now: () => clock,
      listRunningProcesses: async () => procs({ name: 'r5apex', startedAt: 500 }, { name: 'valorant', startedAt: 3_000 }),
    })
    await detector._poll()

    win = OBS
    clock = 5_000
    expect((await detector.forcePoll()).detectedGame).toBe('VALORANT')
  })

  it('keeps the cached foreground over a game that was already running when it was focused', async () => {
    let clock = 1_000
    let win: any = { title: 'Apex Legends', owner: { name: '', path: 'C:/a/r5apex.exe' } }
    const detector = build({
      activeWindow: async () => win,
      now: () => clock,
      listRunningProcesses: async () => procs({ name: 'r5apex', startedAt: 500 }, { name: 'valorant', startedAt: 800 }),
    })
    await detector._poll()

    win = OBS
    clock = 5_000
    expect((await detector.forcePoll()).detectedGame).toBe('Apex Legends')
  })

  it('a manual recheck bypasses the running-scan throttle; the passive read keeps it', async () => {
    let calls = 0
    const detector = build({
      now: () => 0,
      listRunningProcesses: async () => {
        calls += 1
        return procs()
      },
    })

    await detector.resolve()
    await detector.resolve()
    expect(calls).toBe(1)

    await detector.forcePoll()
    expect(calls).toBe(2)
    await detector.forcePoll()
    expect(calls).toBe(3)
  })

  it('a recheck that finds nothing rescans the library, at most once a minute', async () => {
    let clock = 0
    let scans = 0
    let libraryHasHades = false
    let processList: ReturnType<typeof procs> = procs()
    const detector = build({
      now: () => clock,
      scanLocalLibraries: async () => {
        scans += 1
        return libraryHasHades ? [HADES] : []
      },
      listRunningProcesses: async () => processList,
    })
    await detector._runLocalScan() // the scan start() performs at launch
    expect(scans).toBe(1)

    // The game is installed and launched after that scan.
    libraryHasHades = true
    processList = procs({ name: 'hades2', title: 'Hades II' })
    clock = RESCAN_ON_MISS_MIN_INTERVAL_MS + 1

    expect((await detector.forcePoll()).detectedGame).toBe('Hades II')
    expect(scans).toBe(2)

    // A second miss right away does not scan again.
    processList = procs()
    expect((await detector.forcePoll()).detectedGame).toBeNull()
    expect(scans).toBe(2)
  })

  it('never rescans before the launch scan has completed', async () => {
    let scans = 0
    const detector = build({
      scanLocalLibraries: async () => {
        scans += 1
        return []
      },
      listRunningProcesses: async () => procs(),
    })

    await detector.forcePoll()
    expect(scans).toBe(0)
  })

  it('re-classifies the cached foreground against a refreshed library', async () => {
    // The game was focused while the library tier did not know it yet, so the
    // cache holds an unrecognised window. Once the tier learns the game, the
    // cache must answer with it — no second visit to the game window required.
    let win: any = { title: 'Hades II', owner: { name: '', path: HADES_EXE } }
    const detector = build({ activeWindow: async () => win, listRunningProcesses: async () => procs() })
    await detector._poll()
    expect(detector.getSnapshot().detectedGame).toBeNull()

    win = OBS
    detector._localTier = [HADES]
    expect(await detector.forcePoll()).toEqual({
      processName: 'Hades2.exe',
      windowTitle: 'Hades II',
      detectedGame: 'Hades II',
      confidence: 'high',
    })
  })
})
