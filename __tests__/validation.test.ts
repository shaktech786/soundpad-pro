import { describe, test, expect } from 'vitest'
import {
  isValidButtonIndex,
  isValidFilePath,
  hasValidAudioExtension,
  isValidFileSize,
  sanitizePathForDisplay,
  isValidHotkey,
  isValidVolume,
  sanitizeInput,
} from '../utils/validation'

describe('isValidButtonIndex', () => {
  test('accepts valid indices within range', () => {
    expect(isValidButtonIndex(0)).toBe(true)
    expect(isValidButtonIndex(15)).toBe(true)
    expect(isValidButtonIndex(31)).toBe(true)
  })

  test('rejects out-of-range values', () => {
    expect(isValidButtonIndex(-1)).toBe(false)
    expect(isValidButtonIndex(32)).toBe(false)
    expect(isValidButtonIndex(100)).toBe(false)
  })

  test('rejects non-numbers', () => {
    expect(isValidButtonIndex(NaN)).toBe(false)
    expect(isValidButtonIndex('5')).toBe(false)
    expect(isValidButtonIndex(null)).toBe(false)
    expect(isValidButtonIndex(undefined)).toBe(false)
  })
})

describe('isValidFilePath', () => {
  test('accepts Windows backslash paths', () => {
    expect(isValidFilePath('C:\\Users\\shake\\sounds\\hello.mp3')).toBe(true)
    expect(isValidFilePath('D:\\audio\\boom.ogg')).toBe(true)
  })

  test('accepts Unix paths', () => {
    expect(isValidFilePath('/home/user/sounds/hello.ogg')).toBe(true)
    expect(isValidFilePath('/tmp/audio.mp3')).toBe(true)
  })

  test('accepts URL schemes', () => {
    expect(isValidFilePath('https://example.com/sound.mp3')).toBe(true)
    expect(isValidFilePath('http://cdn.example.com/audio.wav')).toBe(true)
    expect(isValidFilePath('file:///C:/sounds/hello.mp3')).toBe(true)
    expect(isValidFilePath('blob:http://localhost/abc-123')).toBe(true)
  })

  test('rejects path traversal attempts', () => {
    expect(isValidFilePath('../../../etc/passwd')).toBe(false)
    expect(isValidFilePath('sounds/../../../system')).toBe(false)
    expect(isValidFilePath('~/Documents/sound.mp3')).toBe(false)
  })

  test('rejects empty or non-string values', () => {
    expect(isValidFilePath('')).toBe(false)
    expect(isValidFilePath(null)).toBe(false)
    expect(isValidFilePath(42)).toBe(false)
  })
})

describe('hasValidAudioExtension', () => {
  test('accepts supported extensions', () => {
    expect(hasValidAudioExtension('sound.mp3')).toBe(true)
    expect(hasValidAudioExtension('sound.wav')).toBe(true)
    expect(hasValidAudioExtension('sound.ogg')).toBe(true)
    expect(hasValidAudioExtension('sound.flac')).toBe(true)
    expect(hasValidAudioExtension('sound.m4a')).toBe(true)
    expect(hasValidAudioExtension('sound.aac')).toBe(true)
    expect(hasValidAudioExtension('sound.opus')).toBe(true)
    expect(hasValidAudioExtension('sound.webm')).toBe(true)
    expect(hasValidAudioExtension('sound.weba')).toBe(true)
  })

  test('is case-insensitive', () => {
    expect(hasValidAudioExtension('sound.MP3')).toBe(true)
    expect(hasValidAudioExtension('sound.WAV')).toBe(true)
    expect(hasValidAudioExtension('sound.OGG')).toBe(true)
  })

  test('rejects unsupported extensions', () => {
    expect(hasValidAudioExtension('sound.txt')).toBe(false)
    expect(hasValidAudioExtension('sound.exe')).toBe(false)
    expect(hasValidAudioExtension('sound.mp4')).toBe(false)
    expect(hasValidAudioExtension('sound.avi')).toBe(false)
  })

  test('rejects empty or extension-less names', () => {
    expect(hasValidAudioExtension('')).toBe(false)
    expect(hasValidAudioExtension('nosound')).toBe(false)
  })
})

describe('isValidFileSize', () => {
  const MAX = 50 * 1024 * 1024

  test('accepts valid sizes', () => {
    expect(isValidFileSize(1)).toBe(true)
    expect(isValidFileSize(1024)).toBe(true)
    expect(isValidFileSize(MAX)).toBe(true)
  })

  test('rejects zero and negative', () => {
    expect(isValidFileSize(0)).toBe(false)
    expect(isValidFileSize(-1)).toBe(false)
  })

  test('rejects sizes over 50MB', () => {
    expect(isValidFileSize(MAX + 1)).toBe(false)
    expect(isValidFileSize(100 * 1024 * 1024)).toBe(false)
  })
})

describe('isValidHotkey', () => {
  test('accepts standard combinations', () => {
    expect(isValidHotkey('ctrl+a')).toBe(true)
    expect(isValidHotkey('ctrl+shift+a')).toBe(true)
    expect(isValidHotkey('alt+f')).toBe(true)
  })

  test('accepts function keys and special keys', () => {
    expect(isValidHotkey('f1')).toBe(true)
    expect(isValidHotkey('f12')).toBe(true)
    expect(isValidHotkey('escape')).toBe(true)
    expect(isValidHotkey('enter')).toBe(true)
    expect(isValidHotkey('space')).toBe(true)
    expect(isValidHotkey('tab')).toBe(true)
  })

  test('rejects empty or null', () => {
    expect(isValidHotkey('')).toBe(false)
    expect(isValidHotkey(null as any)).toBe(false)
  })

  test('rejects unknown key names longer than one character', () => {
    expect(isValidHotkey('unknownkey')).toBe(false)
    expect(isValidHotkey('ctrl+unknownkey')).toBe(false)
  })
})

describe('isValidVolume', () => {
  test('accepts values in 0–1 range', () => {
    expect(isValidVolume(0)).toBe(true)
    expect(isValidVolume(0.5)).toBe(true)
    expect(isValidVolume(1)).toBe(true)
    expect(isValidVolume(0.1)).toBe(true)
  })

  test('rejects out-of-range values', () => {
    expect(isValidVolume(-0.1)).toBe(false)
    expect(isValidVolume(1.1)).toBe(false)
    expect(isValidVolume(100)).toBe(false)
  })

  test('rejects non-numbers', () => {
    expect(isValidVolume(NaN)).toBe(false)
    expect(isValidVolume('0.5')).toBe(false)
    expect(isValidVolume(null)).toBe(false)
  })
})

describe('sanitizePathForDisplay', () => {
  test('shortens deep paths to last two segments', () => {
    const result = sanitizePathForDisplay('C:/Users/shake/Documents/sounds/hello.mp3')
    expect(result).toBe('...sounds/hello.mp3')
  })

  test('leaves short paths unchanged', () => {
    expect(sanitizePathForDisplay('sounds/hello.mp3')).toBe('sounds/hello.mp3')
    expect(sanitizePathForDisplay('hello.mp3')).toBe('hello.mp3')
  })

  test('handles empty string', () => {
    expect(sanitizePathForDisplay('')).toBe('')
  })
})

describe('sanitizeInput', () => {
  test('strips angle brackets', () => {
    const result = sanitizeInput('<script>alert(1)</script>')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  test('removes javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).not.toContain('javascript:')
  })

  test('removes inline event handler attributes', () => {
    const result = sanitizeInput('onclick=evil() onmouseover=bad()')
    expect(result).not.toMatch(/on\w+=/i)
  })

  test('trims surrounding whitespace', () => {
    expect(sanitizeInput('  hello world  ')).toBe('hello world')
  })

  test('handles empty input', () => {
    expect(sanitizeInput('')).toBe('')
  })

  test('leaves safe input unchanged', () => {
    expect(sanitizeInput('Hello World')).toBe('Hello World')
  })
})
