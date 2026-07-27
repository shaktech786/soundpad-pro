import { describe, test, expect } from 'vitest'
import path from 'path'

// Pure module — no 'electron' import, so it can be required directly without
// mocking app.isPackaged / process.resourcesPath. See
// main/obs-setup-binary-path.js for why this exists (PRE-392: bundling the
// standalone obs-setup binary into the Deck installer needs a path that
// resolves correctly both in dev and once packaged by electron-builder).
const {
  resolveObsSetupResourceDir,
  resolveObsSetupBinaryPath,
  resolveObsSetupVersionFilePath,
  OBS_SETUP_DIR_NAME,
  OBS_SETUP_BINARY_NAME,
  OBS_SETUP_VERSION_FILE_NAME,
} = require('../main/obs-setup-binary-path')

const PROJECT_ROOT = 'C:\\Users\\someone\\Projects\\soundpad-pro'
const RESOURCES_PATH = 'C:\\Users\\someone\\AppData\\Local\\Programs\\Prelive Deck\\resources'

describe('resolveObsSetupResourceDir', () => {
  test('resolves under process.resourcesPath when packaged', () => {
    const result = resolveObsSetupResourceDir({ isPackaged: true, resourcesPath: RESOURCES_PATH }, PROJECT_ROOT)

    expect(result).toBe(path.join(RESOURCES_PATH, OBS_SETUP_DIR_NAME))
  })

  test('resolves under <projectRoot>/build in dev, ignoring resourcesPath', () => {
    const result = resolveObsSetupResourceDir(
      { isPackaged: false, resourcesPath: RESOURCES_PATH },
      PROJECT_ROOT
    )

    expect(result).toBe(path.join(PROJECT_ROOT, 'build', OBS_SETUP_DIR_NAME))
    expect(result).not.toContain(RESOURCES_PATH)
  })
})

describe('resolveObsSetupBinaryPath', () => {
  test('appends the known binary filename to the packaged resource dir', () => {
    const result = resolveObsSetupBinaryPath({ isPackaged: true, resourcesPath: RESOURCES_PATH }, PROJECT_ROOT)

    expect(result).toBe(path.join(RESOURCES_PATH, OBS_SETUP_DIR_NAME, OBS_SETUP_BINARY_NAME))
    expect(result.endsWith('prelive-obs-setup-windows-x64.exe')).toBe(true)
  })

  test('appends the known binary filename to the dev build dir', () => {
    const result = resolveObsSetupBinaryPath({ isPackaged: false, resourcesPath: RESOURCES_PATH }, PROJECT_ROOT)

    expect(result).toBe(path.join(PROJECT_ROOT, 'build', OBS_SETUP_DIR_NAME, OBS_SETUP_BINARY_NAME))
  })
})

describe('resolveObsSetupVersionFilePath', () => {
  test('points at version.json alongside the binary, packaged', () => {
    const result = resolveObsSetupVersionFilePath({ isPackaged: true, resourcesPath: RESOURCES_PATH }, PROJECT_ROOT)

    expect(result).toBe(path.join(RESOURCES_PATH, OBS_SETUP_DIR_NAME, OBS_SETUP_VERSION_FILE_NAME))
  })

  test('points at version.json alongside the binary, dev', () => {
    const result = resolveObsSetupVersionFilePath({ isPackaged: false, resourcesPath: RESOURCES_PATH }, PROJECT_ROOT)

    expect(result).toBe(path.join(PROJECT_ROOT, 'build', OBS_SETUP_DIR_NAME, OBS_SETUP_VERSION_FILE_NAME))
  })
})
