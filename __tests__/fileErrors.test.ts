import { describe, test, expect } from 'vitest'
import { formatSoundError } from '../components/OBSActionAssigner'
import { extractFilename } from '../components/Haute42Layout'

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

describe('buttonFileErrors derivation', () => {
  function deriveErrors(
    soundMappings: Map<number, string>,
    loadErrors: Map<string, string>
  ): Map<number, string> {
    const errors = new Map<number, string>()
    soundMappings.forEach((filePath, buttonId) => {
      const err = loadErrors.get(filePath)
      if (err) errors.set(buttonId, err)
    })
    return errors
  }

  test('maps button IDs to their file errors', () => {
    const soundMappings = new Map([[0, 'C:\\missing.mp3'], [1, 'C:\\present.wav']])
    const loadErrors = new Map([['C:\\missing.mp3', 'ENOENT: no such file']])

    const result = deriveErrors(soundMappings, loadErrors)

    expect(result.get(0)).toBe('ENOENT: no such file')
    expect(result.has(1)).toBe(false)
  })

  test('returns empty map when no errors exist', () => {
    const soundMappings = new Map([[0, 'C:\\working.mp3']])
    const loadErrors = new Map<string, string>()

    expect(deriveErrors(soundMappings, loadErrors).size).toBe(0)
  })

  test('ignores load errors for files not in soundMappings', () => {
    const soundMappings = new Map<number, string>()
    const loadErrors = new Map([['C:\\orphan.mp3', 'ENOENT']])

    expect(deriveErrors(soundMappings, loadErrors).size).toBe(0)
  })

  test('handles multiple errored buttons', () => {
    const soundMappings = new Map([[0, 'a.mp3'], [1, 'b.mp3'], [2, 'c.mp3']])
    const loadErrors = new Map([['a.mp3', 'ENOENT'], ['c.mp3', 'ENOENT']])

    const result = deriveErrors(soundMappings, loadErrors)
    expect(result.size).toBe(2)
    expect(result.has(0)).toBe(true)
    expect(result.has(1)).toBe(false)
    expect(result.has(2)).toBe(true)
  })

  test('uses filePath as key, not buttonId, for error lookup', () => {
    const path = 'C:\\shared.mp3'
    const soundMappings = new Map([[5, path]])
    const loadErrors = new Map([[path, 'ENOENT']])

    const result = deriveErrors(soundMappings, loadErrors)
    expect(result.get(5)).toBe('ENOENT')
  })
})
