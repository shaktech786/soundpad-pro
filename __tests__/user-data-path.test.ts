import { describe, test, expect } from 'vitest'
import path from 'path'

// Pure module — no 'electron' import, so it can be required directly without
// mocking app.getPath(). See main/user-data-path.js for why this exists:
// PRE-385 renamed productName to "Prelive Deck", and Electron's default
// userData path is derived from productName, so without this pin every
// existing user's profiles/mappings/Discord token/API key/HID calibration
// would be orphaned in a folder the renamed app never looks at again.
const { resolveLegacyUserDataPath, LEGACY_USER_DATA_DIR_NAME } = require('../main/user-data-path')

describe('resolveLegacyUserDataPath', () => {
  test('resolves to the pre-rename "SoundPad Pro" folder under the given appData root', () => {
    const appData = 'C:\\Users\\someone\\AppData\\Roaming'

    const result = resolveLegacyUserDataPath(appData)

    expect(result).toBe(path.join(appData, 'SoundPad Pro'))
    expect(result.endsWith('SoundPad Pro')).toBe(true)
  })

  test('never resolves to the new "Prelive Deck" name, regardless of appData root', () => {
    const result = resolveLegacyUserDataPath('/home/someone/.config')

    expect(result).not.toContain('Prelive Deck')
    expect(result).toBe(path.join('/home/someone/.config', 'SoundPad Pro'))
  })

  test('exposes the legacy directory name as a named constant used by the resolver', () => {
    expect(LEGACY_USER_DATA_DIR_NAME).toBe('SoundPad Pro')
    expect(resolveLegacyUserDataPath('/appdata')).toBe(path.join('/appdata', LEGACY_USER_DATA_DIR_NAME))
  })
})
