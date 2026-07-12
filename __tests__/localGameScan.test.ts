import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  parseSteamPathFromReg,
  parseLibraryFolders,
  parseAppManifest,
  parseEpicItem,
  resolveEpicManifestDir,
  scanSteam,
  scanEpic,
  scanAll,
} = require('../main/local-game-scan')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseVdf } = require('../main/vdf-parser')

describe('parseSteamPathFromReg', () => {
  it('extracts the SteamPath value from reg.exe output', () => {
    const stdout = [
      '',
      'HKEY_CURRENT_USER\\Software\\Valve\\Steam',
      '    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam',
      '',
    ].join('\r\n')
    expect(parseSteamPathFromReg(stdout)).toBe(path.normalize('C:\\Program Files (x86)\\Steam'))
  })

  it('handles forward-slash paths (Steam stores them that way)', () => {
    const stdout = '    SteamPath    REG_SZ    c:/games/steam\r\n'
    expect(parseSteamPathFromReg(stdout)).toBe(path.normalize('c:/games/steam'))
  })

  it('returns null when the value is absent', () => {
    expect(parseSteamPathFromReg('ERROR: The system was unable to find the specified registry key')).toBeNull()
  })
})

describe('parseLibraryFolders', () => {
  it('reads the newer nested "path" format', () => {
    const parsed = parseVdf(`
      "libraryfolders"
      {
        "0" { "path" "C:\\\\Steam" }
        "1" { "path" "D:\\\\SteamLibrary" }
        "contentstatsid" "999"
      }
    `)
    expect(parseLibraryFolders(parsed)).toEqual([
      path.normalize('C:\\Steam'),
      path.normalize('D:\\SteamLibrary'),
    ])
  })

  it('reads the older flat key-value format', () => {
    const parsed = parseVdf(`
      "LibraryFolders"
      {
        "TimeNextStatsReport" "170"
        "0" "C:\\\\Steam"
        "1" "E:\\\\Games\\\\Steam"
      }
    `)
    expect(parseLibraryFolders(parsed)).toEqual([
      path.normalize('C:\\Steam'),
      path.normalize('E:\\Games\\Steam'),
    ])
  })

  it('returns [] for a malformed / empty object', () => {
    expect(parseLibraryFolders(null)).toEqual([])
    expect(parseLibraryFolders({})).toEqual([])
    expect(parseLibraryFolders({ libraryfolders: 'nope' })).toEqual([])
  })
})

describe('parseAppManifest', () => {
  it('extracts name/installdir/appid from AppState', () => {
    const parsed = parseVdf(`
      "AppState"
      {
        "appid" "730"
        "name"  "Counter-Strike 2"
        "installdir" "Counter-Strike Global Offensive"
      }
    `)
    expect(parseAppManifest(parsed)).toEqual({
      name: 'Counter-Strike 2',
      installdir: 'Counter-Strike Global Offensive',
      appid: '730',
    })
  })

  it('returns null when AppState or name is missing', () => {
    expect(parseAppManifest({})).toBeNull()
    expect(parseAppManifest(parseVdf('"AppState" { "appid" "1" }'))).toBeNull()
  })
})

describe('parseEpicItem', () => {
  it('builds an exe+title entry from a well-formed .item payload', () => {
    const entry = parseEpicItem({
      DisplayName: 'Rocket League',
      InstallLocation: 'C:\\Games\\rocketleague',
      LaunchExecutable: 'Binaries\\Win64\\RocketLeague.exe',
    })
    expect(entry).toEqual({
      game: 'Rocket League',
      title: ['rocket league'],
      exe: ['rocketleague.exe'],
    })
  })

  it('falls back to title-only when LaunchExecutable is absent', () => {
    expect(parseEpicItem({ DisplayName: 'Some Game' })).toEqual({
      game: 'Some Game',
      title: ['some game'],
    })
  })

  it('returns null without a DisplayName', () => {
    expect(parseEpicItem({ LaunchExecutable: 'x.exe' })).toBeNull()
    expect(parseEpicItem(null)).toBeNull()
  })
})

describe('scanSteam (fixture library on disk)', () => {
  let steamPath: string

  beforeAll(() => {
    steamPath = fs.mkdtempSync(path.join(os.tmpdir(), 'spp-steam-'))
    const steamapps = path.join(steamPath, 'steamapps')
    fs.mkdirSync(steamapps, { recursive: true })

    fs.writeFileSync(
      path.join(steamapps, 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${steamPath.replace(/\\/g, '\\\\')}" } }`
    )
    fs.writeFileSync(
      path.join(steamapps, 'appmanifest_730.acf'),
      `"AppState" { "appid" "730" "name" "Counter-Strike 2" "installdir" "csgo" }`
    )
    fs.writeFileSync(
      path.join(steamapps, 'appmanifest_570.acf'),
      `"AppState" { "appid" "570" "name" "Dota 2" "installdir" "dota 2 beta" }`
    )
    // A malformed manifest must be skipped, not abort the scan.
    fs.writeFileSync(path.join(steamapps, 'appmanifest_999.acf'), '"AppState" { "name" "unterminated')
    // A non-manifest file must be ignored.
    fs.writeFileSync(path.join(steamapps, 'readme.txt'), 'hello')
  })

  afterAll(() => fs.rmSync(steamPath, { recursive: true, force: true }))

  it('returns title-only entries for each valid manifest and skips the bad one', async () => {
    const entries = await scanSteam({ steamPath })
    expect(entries).toContainEqual({ game: 'Counter-Strike 2', title: ['counter-strike 2'] })
    expect(entries).toContainEqual({ game: 'Dota 2', title: ['dota 2'] })
    expect(entries.every((e: any) => !('exe' in e))).toBe(true)
    // Only the two valid manifests survived.
    expect(entries).toHaveLength(2)
  })

  it('returns [] when Steam is not installed (no path)', async () => {
    expect(await scanSteam({ steamPath: path.join(os.tmpdir(), 'does-not-exist-spp') })).toEqual([])
  })
})

describe('scanEpic (fixture manifests on disk)', () => {
  let manifestDir: string

  beforeAll(() => {
    manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spp-epic-'))
    fs.writeFileSync(
      path.join(manifestDir, 'a.item'),
      JSON.stringify({
        DisplayName: 'Rocket League',
        InstallLocation: 'C:\\Games\\rl',
        LaunchExecutable: 'Binaries\\Win64\\RocketLeague.exe',
      })
    )
    fs.writeFileSync(
      path.join(manifestDir, 'b.item'),
      JSON.stringify({ DisplayName: 'Fall Guys', LaunchExecutable: 'FallGuys_client.exe' })
    )
    // Malformed JSON must be skipped.
    fs.writeFileSync(path.join(manifestDir, 'c.item'), '{ not valid json ')
    // Non-.item file ignored.
    fs.writeFileSync(path.join(manifestDir, 'ignore.json'), '{}')
  })

  afterAll(() => fs.rmSync(manifestDir, { recursive: true, force: true }))

  it('returns exe+title entries and skips malformed files', async () => {
    const entries = await scanEpic({ manifestDir })
    expect(entries).toContainEqual({
      game: 'Rocket League',
      title: ['rocket league'],
      exe: ['rocketleague.exe'],
    })
    expect(entries).toContainEqual({
      game: 'Fall Guys',
      title: ['fall guys'],
      exe: ['fallguys_client.exe'],
    })
    expect(entries).toHaveLength(2)
  })

  it('returns [] when the manifest directory does not exist', async () => {
    expect(await scanEpic({ manifestDir: path.join(os.tmpdir(), 'nope-spp-epic') })).toEqual([])
  })
})

describe('resolveEpicManifestDir', () => {
  it('returns null when none of the candidates exist', () => {
    expect(
      resolveEpicManifestDir([path.join(os.tmpdir(), 'nope-a'), path.join(os.tmpdir(), 'nope-b')])
    ).toBeNull()
  })

  it('returns the first candidate directory that exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spp-epicdir-'))
    try {
      expect(resolveEpicManifestDir([path.join(os.tmpdir(), 'nope-x'), dir])).toBe(dir)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scanAll (merge)', () => {
  it('merges Epic and Steam, de-duping by game name (Epic exe entry wins)', async () => {
    const steamDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spp-steam2-'))
    const epicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spp-epic2-'))
    try {
      const steamapps = path.join(steamDir, 'steamapps')
      fs.mkdirSync(steamapps, { recursive: true })
      fs.writeFileSync(
        path.join(steamapps, 'libraryfolders.vdf'),
        `"libraryfolders" { "0" { "path" "${steamDir.replace(/\\/g, '\\\\')}" } }`
      )
      // Same game as an Epic entry, plus a Steam-only game.
      fs.writeFileSync(path.join(steamapps, 'appmanifest_1.acf'), '"AppState" { "name" "Rocket League" }')
      fs.writeFileSync(path.join(steamapps, 'appmanifest_2.acf'), '"AppState" { "name" "Portal 2" }')

      fs.writeFileSync(
        path.join(epicDir, 'a.item'),
        JSON.stringify({ DisplayName: 'Rocket League', LaunchExecutable: 'RocketLeague.exe' })
      )

      const merged = await scanAll({ steam: { steamPath: steamDir }, epic: { manifestDir: epicDir } })
      const rl = merged.filter((e: any) => e.game === 'Rocket League')
      expect(rl).toHaveLength(1)
      expect(rl[0].exe).toEqual(['rocketleague.exe']) // Epic entry won
      expect(merged).toContainEqual({ game: 'Portal 2', title: ['portal 2'] })
    } finally {
      fs.rmSync(steamDir, { recursive: true, force: true })
      fs.rmSync(epicDir, { recursive: true, force: true })
    }
  })

  it('degrades to [] for a source that is absent, without throwing', async () => {
    const merged = await scanAll({
      steam: { steamPath: path.join(os.tmpdir(), 'nope-steam-spp') },
      epic: { manifestDir: path.join(os.tmpdir(), 'nope-epic-spp') },
    })
    expect(merged).toEqual([])
  })
})
