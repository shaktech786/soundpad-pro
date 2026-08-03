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
  // The pre-rename folder is "soundpad-pro", NOT the "SoundPad Pro" display
  // name. electron-builder keeps productName in .electron-builder.config.js and
  // never writes it into the bundled package.json, so app.getName() has always
  // fallen through to package.json's `name` field. Verified against the shipped
  // bundle: `asar extract-file app.asar package.json` -> {"name":"soundpad-pro"}
  // with no productName key at all.
  test('resolves to the pre-rename "soundpad-pro" folder under the given appData root', () => {
    const appData = 'C:\\Users\\someone\\AppData\\Roaming'

    const result = resolveLegacyUserDataPath(appData)

    expect(result).toBe(path.join(appData, 'soundpad-pro'))
    expect(result.endsWith('soundpad-pro')).toBe(true)
  })

  test('never resolves to the new "Prelive Deck" name, regardless of appData root', () => {
    const result = resolveLegacyUserDataPath('/home/someone/.config')

    expect(result).not.toContain('Prelive Deck')
    expect(result).toBe(path.join('/home/someone/.config', 'soundpad-pro'))
  })

  // The display name is a real directory on machines that launched a build with
  // the bad pin, but it only ever held a freshly-initialised store.
  test('does not resolve to the "SoundPad Pro" display name', () => {
    expect(resolveLegacyUserDataPath('/appdata')).not.toContain('SoundPad Pro')
  })

  test('exposes the legacy directory name as a named constant used by the resolver', () => {
    expect(LEGACY_USER_DATA_DIR_NAME).toBe('soundpad-pro')
    expect(resolveLegacyUserDataPath('/appdata')).toBe(path.join('/appdata', LEGACY_USER_DATA_DIR_NAME))
  })
})
