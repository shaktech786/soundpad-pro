import { describe, test, expect } from 'vitest'
import { formatSoundError } from '../components/OBSActionAssigner'
import { extractFilename } from '../components/Haute42Layout'
import { deriveButtonFileErrors } from '../utils/soundErrors'

// --- formatSoundError ---

describe('formatSoundError', () => {
  test('ENOENT maps to "File not found"', () => {
    const msg = formatSoundError('ENOENT: no such file or directory, open C:\\sounds\\hello.mp3')
    expect(msg).toContain('File not found')
  })

  test('"no such file" phrase maps to "File not found"', () => {
    expect(formatSoundError('Error: no such file')).toContain('File not found')
  })

  test('EACCES maps to "Permission denied"', () => {
    expect(formatSoundError('EACCES: permission denied')).toContain('Permission denied')
  })

  test('"permission" phrase maps to "Permission denied"', () => {
    expect(formatSoundError('Access permission denied reading file')).toContain('Permission denied')
  })

  test('decode errors map to corrupt/format message', () => {
    expect(formatSoundError('Unable to decode audio data')).toContain('decoded')
    expect(formatSoundError('Unsupported audio format')).toContain('decoded')
    expect(formatSoundError('Invalid format: bad header')).toContain('decoded')
  })

  test('unrecognised errors fall back to generic message', () => {
    expect(formatSoundError('Some unknown engine error 42')).toBe('Failed to load this file.')
  })

  test('empty string falls back to generic message', () => {
    expect(formatSoundError('')).toBe('Failed to load this file.')
  })
})

// --- extractFilename ---

describe('extractFilename', () => {
  test('extracts name from Windows backslash path', () => {
    expect(extractFilename('C:\\Users\\shake\\sounds\\hello.mp3')).toBe('hello')
  })

  test('extracts name from Windows forward-slash path', () => {
    expect(extractFilename('C:/Users/shake/sounds/boom.wav')).toBe('boom')
  })

  test('extracts name from Unix path', () => {
    expect(extractFilename('/home/user/sounds/alert.ogg')).toBe('alert')
  })

  test('extracts name from URL', () => {
    expect(extractFilename('https://example.com/audio/ding.mp3')).toBe('ding')
  })

  test('strips file extension', () => {
    expect(extractFilename('C:\\sounds\\ambience.flac')).toBe('ambience')
  })

  test('returns "Unknown" for empty string', () => {
    expect(extractFilename('')).toBe('Unknown')
  })

  test('returns "Unknown" for non-string input', () => {
    expect(extractFilename(null as any)).toBe('Unknown')
  })
})

// --- buttonFileErrors derivation ---
// Exercises the real deriveButtonFileErrors used by pages/index.tsx, not a
// local re-implementation.

describe('buttonFileErrors derivation', () => {
  test('maps button IDs to their file errors', () => {
    const soundMappings = new Map([[0, 'C:\\missing.mp3'], [1, 'C:\\present.wav']])
    const loadErrors = new Map([['C:\\missing.mp3', 'ENOENT: no such file']])

    const result = deriveButtonFileErrors(soundMappings, loadErrors)

    expect(result.get(0)).toBe('ENOENT: no such file')
    expect(result.has(1)).toBe(false)
  })

  test('returns empty map when no errors exist', () => {
    const soundMappings = new Map([[0, 'C:\\working.mp3']])
    const loadErrors = new Map<string, string>()

    expect(deriveButtonFileErrors(soundMappings, loadErrors).size).toBe(0)
  })

  test('ignores load errors for files not in soundMappings', () => {
    const soundMappings = new Map<number, string>()
    const loadErrors = new Map([['C:\\orphan.mp3', 'ENOENT']])

    expect(deriveButtonFileErrors(soundMappings, loadErrors).size).toBe(0)
  })

  test('handles multiple errored buttons', () => {
    const soundMappings = new Map([[0, 'a.mp3'], [1, 'b.mp3'], [2, 'c.mp3']])
    const loadErrors = new Map([['a.mp3', 'ENOENT'], ['c.mp3', 'ENOENT']])

    const result = deriveButtonFileErrors(soundMappings, loadErrors)
    expect(result.size).toBe(2)
    expect(result.has(0)).toBe(true)
    expect(result.has(1)).toBe(false)
    expect(result.has(2)).toBe(true)
  })

  test('uses filePath as key, not buttonId, for error lookup', () => {
    const path = 'C:\\shared.mp3'
    const soundMappings = new Map([[5, path]])
    const loadErrors = new Map([[path, 'ENOENT']])

    const result = deriveButtonFileErrors(soundMappings, loadErrors)
    expect(result.get(5)).toBe('ENOENT')
  })

  test('relinking a button to a new, error-free path clears its error', () => {
    // Simulates what happens after the user relinks button 0: soundMappings
    // now points it at a fresh path that has no entry in loadErrors yet.
    const loadErrors = new Map([['C:\\old-missing.mp3', 'ENOENT: no such file']])

    const before = deriveButtonFileErrors(new Map([[0, 'C:\\old-missing.mp3']]), loadErrors)
    expect(before.get(0)).toBe('ENOENT: no such file')

    const after = deriveButtonFileErrors(new Map([[0, 'C:\\replacement.mp3']]), loadErrors)
    expect(after.has(0)).toBe(false)
  })
})
