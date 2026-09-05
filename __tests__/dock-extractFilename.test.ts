import { describe, test, expect } from 'vitest'
import { extractFilename } from '../utils/audioUtils'

// PRE-473: pages/dock.tsx used to have a fourth inline copy of
// extractFilename (left alone by PRE-471) that additionally replaced
// underscores with spaces after stripping the extension. Characterizing it
// first showed that behaviour was load-bearing — sound files are routinely
// named with underscores (e.g. "air_horn.mp3") — so rather than picking a
// winner, utils/audioUtils.ts's canonical extractFilename gained an opt-in
// `humanize` option that reproduces it exactly, and dock.tsx now calls the
// canonical function with `{ stripExtension: true, humanize: true }`.
//
// These cases pin the canonical function (with humanize) to the exact
// outputs the old inline dock copy produced, so the migration is a no-op
// for every pad label already on screen.

describe('canonical extractFilename with humanize (dock.tsx migration, PRE-473)', () => {
  const dockOptions = { stripExtension: true, humanize: true } as const

  test('local Windows path with no underscore', () => {
    expect(extractFilename('C:\\Users\\shake\\sounds\\hello.mp3', dockOptions)).toBe('hello')
  })

  test('POSIX path', () => {
    expect(extractFilename('/home/user/sounds/alert.ogg', dockOptions)).toBe('alert')
  })

  test('URL with a ?query string', () => {
    expect(extractFilename('https://example.com/audio/ding.mp3?token=abc', dockOptions)).toBe('ding')
  })

  test('URL with a #fragment (url#filename metadata format)', () => {
    expect(extractFilename('https://example.com/audio/ding.mp3#My Song.mp3', dockOptions)).toBe('My Song')
  })

  test('multi-dot filename', () => {
    expect(extractFilename('C:\\sounds\\my.cool.track.mp3', dockOptions)).toBe('my.cool.track')
  })

  test('filename with no extension', () => {
    expect(extractFilename('C:\\sounds\\noext', dockOptions)).toBe('noext')
  })

  test('empty input', () => {
    // dock.tsx only ever calls this when soundFile is truthy
    // (`hasSound = !!soundFile`), so '' never reaches it in practice — this
    // just pins the canonical fallback stays 'Unknown' regardless of humanize.
    expect(extractFilename('', dockOptions)).toBe('Unknown')
  })

  test('null input', () => {
    expect(extractFilename(null as any, dockOptions)).toBe('Unknown')
  })

  test('humanize replaces underscores with spaces after extension stripping (the old dock behaviour)', () => {
    expect(extractFilename('C:\\sounds\\air_horn.mp3', dockOptions)).toBe('air horn')
  })

  test('humanize=false (the default) leaves underscores intact, so other callers are unaffected', () => {
    expect(extractFilename('C:\\sounds\\air_horn.mp3', { stripExtension: true })).toBe('air_horn')
    expect(extractFilename('C:\\sounds\\air_horn.mp3', { stripExtension: true, humanize: false })).toBe('air_horn')
  })
})
