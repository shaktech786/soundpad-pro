import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseVdf } = require('../main/vdf-parser')

describe('parseVdf (KeyValues parser)', () => {
  it('parses flat "key" "value" pairs', () => {
    const input = `
      "appid"      "730"
      "name"       "Counter-Strike 2"
      "installdir" "Counter-Strike Global Offensive"
    `
    expect(parseVdf(input)).toEqual({
      appid: '730',
      name: 'Counter-Strike 2',
      installdir: 'Counter-Strike Global Offensive',
    })
  })

  it('parses nested brace blocks into nested objects', () => {
    const input = `
      "AppState"
      {
        "appid" "570"
        "name"  "Dota 2"
        "UserConfig"
        {
          "language" "english"
        }
      }
    `
    expect(parseVdf(input)).toEqual({
      AppState: {
        appid: '570',
        name: 'Dota 2',
        UserConfig: { language: 'english' },
      },
    })
  })

  it('ignores // line comments', () => {
    const input = `
      // this is the app name
      "name" "Portal 2" // trailing comment
      "appid" "620"
    `
    expect(parseVdf(input)).toEqual({ name: 'Portal 2', appid: '620' })
  })

  it('handles the newer nested libraryfolders.vdf shape', () => {
    const input = `
      "libraryfolders"
      {
        "0"
        {
          "path" "C:\\\\Program Files (x86)\\\\Steam"
          "label" ""
          "apps" { "730" "12345" }
        }
        "1"
        {
          "path" "D:\\\\SteamLibrary"
        }
      }
    `
    const parsed = parseVdf(input)
    expect(parsed.libraryfolders['0'].path).toBe('C:\\Program Files (x86)\\Steam')
    expect(parsed.libraryfolders['1'].path).toBe('D:\\SteamLibrary')
  })

  it('handles the older flat LibraryFolders shape', () => {
    const input = `
      "LibraryFolders"
      {
        "TimeNextStatsReport" "1700000000"
        "0" "C:\\\\Program Files (x86)\\\\Steam"
        "1" "E:\\\\Games\\\\Steam"
      }
    `
    const parsed = parseVdf(input)
    expect(parsed.LibraryFolders['0']).toBe('C:\\Program Files (x86)\\Steam')
    expect(parsed.LibraryFolders['1']).toBe('E:\\Games\\Steam')
  })

  it('keeps values containing spaces and special characters intact', () => {
    const input = `"name" "Grand Theft Auto: San Andreas — Definitive"`
    expect(parseVdf(input)).toEqual({ name: 'Grand Theft Auto: San Andreas — Definitive' })
  })

  it('decodes backslash escapes inside quoted strings', () => {
    const input = `"path" "C:\\\\Games\\\\Steam"`
    expect(parseVdf(input)).toEqual({ path: 'C:\\Games\\Steam' })
  })

  it('returns an empty object for empty input', () => {
    expect(parseVdf('')).toEqual({})
    expect(parseVdf('   \n  // just a comment\n')).toEqual({})
  })

  it('throws on an unterminated quoted string so the caller can skip the file', () => {
    expect(() => parseVdf('"name" "unterminated')).toThrow()
  })

  it('rejects non-string input', () => {
    // @ts-expect-error deliberately wrong type
    expect(() => parseVdf(null)).toThrow()
  })
})
