import { describe, test, expect } from 'vitest'
import { SUPPORTED_EXTENSIONS, MIME_BY_EXTENSION, MAX_FILE_SIZE_BYTES, MAX_DIRECTORY_ENTRIES } from '../config/audio-file-contract'
import { APP_CONFIG } from '../config/constants'
import { SUPPORTED_AUDIO_FORMATS } from '../utils/audioUtils'

// config/audio-file-contract.js is the single source of truth for what
// extensions/MIME types/size limits this app supports — PRE-466 replaced
// four drifting copies (main/index.js x2, config/constants.ts,
// utils/audioUtils.ts) with derivations from this one module. These tests
// pin that parity so a future edit can't silently reintroduce drift.

describe('audio-file-contract parity', () => {
  test('config/constants.ts AUDIO.SUPPORTED_FORMATS matches the contract, minus the leading dot', () => {
    expect(APP_CONFIG.AUDIO.SUPPORTED_FORMATS).toEqual(SUPPORTED_EXTENSIONS.map((ext) => ext.slice(1)))
  })

  test('utils/audioUtils.ts SUPPORTED_AUDIO_FORMATS matches the contract, minus the leading dot', () => {
    expect(SUPPORTED_AUDIO_FORMATS).toEqual(SUPPORTED_EXTENSIONS.map((ext) => ext.slice(1)))
  })

  test('main/audio-file-guard.js (requirable without booting Electron) enforces the identical extension list', () => {
    // main/index.js imports SUPPORTED_EXTENSIONS from this exact module
    // rather than restating it, so main/audio-file-guard.js's extension
    // check — requirable directly, unlike main/index.js which boots
    // Electron on require — proves the same list is enforced on the IPC
    // boundary as the one asserted above for the renderer.
    const { hasSupportedExtension } = require('../main/audio-file-guard')
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(hasSupportedExtension(`C:\\Users\\shake\\Music\\hello${ext}`)).toBe(true)
    }
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.notarealext')).toBe(false)
  })

  test('every extension has a leading dot and a MIME mapping', () => {
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(ext.startsWith('.')).toBe(true)
      expect(MIME_BY_EXTENSION[ext]).toBeTruthy()
    }
  })

  test('MAX_FILE_SIZE_BYTES and MAX_DIRECTORY_ENTRIES are positive integers', () => {
    expect(Number.isInteger(MAX_FILE_SIZE_BYTES)).toBe(true)
    expect(MAX_FILE_SIZE_BYTES).toBeGreaterThan(0)
    expect(Number.isInteger(MAX_DIRECTORY_ENTRIES)).toBe(true)
    expect(MAX_DIRECTORY_ENTRIES).toBeGreaterThan(0)
  })

  test('config/constants.ts AUDIO.MAX_FILE_SIZE matches the contract', () => {
    expect(APP_CONFIG.AUDIO.MAX_FILE_SIZE).toBe(MAX_FILE_SIZE_BYTES)
  })
})
