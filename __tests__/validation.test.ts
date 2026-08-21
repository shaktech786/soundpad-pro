import { describe, test, expect } from 'vitest'
import {
  isValidButtonIndex,
  sanitizePathForDisplay,
  isValidHotkey,
  isGameRiskyHotkey,
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

// isValidFilePath, hasValidAudioExtension, and isValidFileSize were removed
// from utils/validation.ts (PRE-466): they were tested but never called in
// production. Path/extension/size enforcement now lives at the actual IPC
// boundary in main/audio-file-guard.js — see __tests__/audio-file-guard.test.ts —
// which additionally normalizes with path.resolve() so a traversal payload
// can't pass just because its raw string starts with an allowed prefix
// (isValidFilePath here only ever did a substring check for '..').

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

  test('accepts F13-F24', () => {
    expect(isValidHotkey('f13')).toBe(true)
    expect(isValidHotkey('f24')).toBe(true)
    expect(isValidHotkey('ctrl+f20')).toBe(true)
  })

  test('accepts numpad key names', () => {
    expect(isValidHotkey('ctrl+num0')).toBe(true)
    expect(isValidHotkey('ctrl+numenter')).toBe(true)
    expect(isValidHotkey('numadd')).toBe(true)
  })
})

describe('isGameRiskyHotkey', () => {
  test('warns on bare function keys F1-F12', () => {
    expect(isGameRiskyHotkey('F5')).toBe(true)
    expect(isGameRiskyHotkey('f1')).toBe(true)
    expect(isGameRiskyHotkey('F12')).toBe(true)
  })

  test('warns on bare letters and digits', () => {
    expect(isGameRiskyHotkey('M')).toBe(true)
    expect(isGameRiskyHotkey('q')).toBe(true)
    expect(isGameRiskyHotkey('1')).toBe(true)
  })

  test('warns on bare Tab, Space, Enter, and arrow keys', () => {
    expect(isGameRiskyHotkey('Tab')).toBe(true)
    expect(isGameRiskyHotkey('Space')).toBe(true)
    expect(isGameRiskyHotkey('Enter')).toBe(true)
    expect(isGameRiskyHotkey('Up')).toBe(true)
    expect(isGameRiskyHotkey('Left')).toBe(true)
  })

  test('does not warn once a modifier is present', () => {
    expect(isGameRiskyHotkey('Ctrl+Alt+F5')).toBe(false)
    expect(isGameRiskyHotkey('Ctrl+M')).toBe(false)
    expect(isGameRiskyHotkey('Shift+Tab')).toBe(false)
  })

  test('warns on numpad keys even with a modifier — Raw Input games read the bare scancode regardless of what else is held', () => {
    expect(isGameRiskyHotkey('CommandOrControl+num0')).toBe(true)
    expect(isGameRiskyHotkey('Ctrl+numenter')).toBe(true)
    expect(isGameRiskyHotkey('num5')).toBe(true)
    expect(isGameRiskyHotkey('numadd')).toBe(true)
  })

  test('never warns on F13-F24, with or without modifiers', () => {
    expect(isGameRiskyHotkey('F13')).toBe(false)
    expect(isGameRiskyHotkey('f24')).toBe(false)
    expect(isGameRiskyHotkey('Ctrl+F15')).toBe(false)
    expect(isGameRiskyHotkey('Shift+F13')).toBe(false)
  })

  test('is case-insensitive', () => {
    expect(isGameRiskyHotkey('tab')).toBe(true)
    expect(isGameRiskyHotkey('TAB')).toBe(true)
  })

  test('rejects empty or non-string input', () => {
    expect(isGameRiskyHotkey('')).toBe(false)
    expect(isGameRiskyHotkey(null as unknown as string)).toBe(false)
  })

  test('does not warn on keys outside the commonly-bound set', () => {
    expect(isGameRiskyHotkey('Escape')).toBe(false)
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
