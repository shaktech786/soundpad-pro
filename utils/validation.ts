// Input validation utilities

import { APP_CONFIG } from '../config/constants'

/**
 * Validates a button index is within valid range
 */
export function isValidButtonIndex(index: unknown): index is number {
  return typeof index === 'number' &&
         !isNaN(index) &&
         index >= 0 &&
         index < APP_CONFIG.CONTROLLER.MAX_BUTTONS
}

/**
 * Sanitizes a file path for display
 */
export function sanitizePathForDisplay(path: string): string {
  if (!path) return ''
  
  // Remove sensitive parts of the path
  const parts = path.split(/[/\\]/)
  if (parts.length > 3) {
    return '...' + parts.slice(-2).join('/')
  }
  
  return path
}

/**
 * Validates hotkey combination
 */
export function isValidHotkey(key: string): boolean {
  if (!key || typeof key !== 'string') return false

  // Basic validation for key combinations
  const validModifiers = ['ctrl', 'alt', 'shift', 'cmd', 'meta']
  const parts = key.toLowerCase().split('+')

  // Must have at least one part
  if (parts.length === 0) return false

  // Check each part
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) return false

    // Either a modifier or a single character/function key
    const isModifier = validModifiers.includes(trimmed)
    const isFunctionKey = /^f([1-9]|1[0-9]|2[0-4])$/.test(trimmed)
    const isSingleChar = trimmed.length === 1
    const isSpecialKey = ['escape', 'enter', 'space', 'tab', 'backspace', 'delete'].includes(trimmed)
    const isNumpadKey = /^num(dec|add|sub|mult|div|enter|[0-9])$/.test(trimmed)

    if (!isModifier && !isFunctionKey && !isSingleChar && !isSpecialKey && !isNumpadKey) {
      return false
    }
  }

  return true
}

/**
 * F13-F24 have no physical presence on standard keyboards, so essentially no
 * game binds them — they're the recommended "safe" hotkey range for this app
 * (see docs/limitation note next to the global hotkeys toggle).
 */
const F13_TO_F24 = /^f(1[3-9]|2[0-4])$/

// Bare (no-modifier) keys that a huge share of PC games bind by default.
// Anything in this set fired without a modifier will very likely also reach
// the game via Raw Input/DirectInput, which globalShortcut cannot suppress.
const COMMONLY_GAME_BOUND_BARE_KEYS = new Set([
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'tab', 'space', 'enter', 'return',
  'up', 'down', 'left', 'right',
  ...('abcdefghijklmnopqrstuvwxyz'.split('')),
  ...('0123456789'.split('')),
])

// Confirmed 2026-08: a Ctrl+Numpad hotkey still fires the in-game action bound
// to the bare numpad key (e.g. Ctrl+Num5 opens the map AND plays the pad).
// Raw Input games read the numpad scancode on its own and don't care whether
// a modifier is also physically held, so — unlike other keys — a modifier
// prefix does not make a numpad binding any safer.
const NUMPAD_KEY_NAMES = new Set([
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
  'numdec', 'numadd', 'numsub', 'nummult', 'numdiv', 'numenter',
])

/**
 * Flags hotkeys that are likely to also trigger an in-game action, because
 * Windows Raw Input/DirectInput games read keys directly and never consult
 * the Win32 RegisterHotKey table that Electron's globalShortcut relies on.
 * A modifier (Ctrl/Alt/Shift/Cmd) makes a collision much less likely for most
 * keys — numpad keys are the confirmed exception, see NUMPAD_KEY_NAMES — and
 * F13-F24 are effectively never bound by games. Advisory only — never used
 * to block a binding.
 */
export function isGameRiskyHotkey(key: string): boolean {
  if (!key || typeof key !== 'string') return false

  const parts = key.toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return false

  const baseKey = parts[parts.length - 1]
  const hasModifier = parts.length > 1

  if (F13_TO_F24.test(baseKey)) return false
  if (NUMPAD_KEY_NAMES.has(baseKey)) return true
  if (hasModifier) return false

  return COMMONLY_GAME_BOUND_BARE_KEYS.has(baseKey)
}

/**
 * Validates volume level
 */
export function isValidVolume(volume: unknown): volume is number {
  return typeof volume === 'number' && 
         !isNaN(volume) && 
         volume >= 0 && 
         volume <= 1
}

/**
 * Validates controller index
 */
export function isValidControllerIndex(index: unknown): index is number {
  return typeof index === 'number' && 
         !isNaN(index) && 
         index >= 0 && 
         index < 4 // Maximum 4 controllers
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
}

export default {
  isValidButtonIndex,
  sanitizePathForDisplay,
  isValidHotkey,
  isGameRiskyHotkey,
  isValidVolume,
  isValidControllerIndex,
  sanitizeInput,
}