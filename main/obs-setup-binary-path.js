const path = require('path');

// PRE-392: resolves where the bundled OBS Setup tool lives, in both dev and a
// packaged build. In dev there is no `resources` dir to unpack into, so the
// resolver falls back to the same `build/obs-setup/` directory
// scripts/fetch-obs-setup-binary.js downloads into and
// .electron-builder.config.js's `extraResources` later copies from. Once
// packaged, electron-builder places `extraResources` under
// `process.resourcesPath/<to>` — see the `to: "obs-setup"` entry in that
// config — so the packaged path is `<resourcesPath>/obs-setup`.
//
// This module is pure and dependency-free (no 'electron' import) so it can be
// unit-tested without mocking `app.isPackaged` / `app.getPath` — the caller
// (main/index.js) passes in `app` and `__dirname`-derived project root
// directly. See __tests__/obs-setup-binary-path.test.ts.
const OBS_SETUP_DIR_NAME = 'obs-setup';
const OBS_SETUP_BINARY_NAME = 'prelive-obs-setup-windows-x64.exe';
const OBS_SETUP_VERSION_FILE_NAME = 'version.json';

/**
 * @param {{ isPackaged: boolean, resourcesPath: string }} app - the subset of
 *   Electron's `app` module this resolver needs.
 * @param {string} projectRoot - the project root to resolve the dev-mode
 *   `build/obs-setup` path against (i.e. `path.join(__dirname, '..')` from
 *   main/index.js).
 * @returns {string} the directory the bundled OBS Setup tool's binary and
 *   version.json live in, for the given packaged/dev state.
 */
function resolveObsSetupResourceDir(app, projectRoot) {
  if (app.isPackaged) {
    return path.join(app.resourcesPath, OBS_SETUP_DIR_NAME);
  }
  return path.join(projectRoot, 'build', OBS_SETUP_DIR_NAME);
}

/**
 * @param {{ isPackaged: boolean, resourcesPath: string }} app
 * @param {string} projectRoot
 * @returns {string} full path to the bundled OBS Setup executable.
 */
function resolveObsSetupBinaryPath(app, projectRoot) {
  return path.join(resolveObsSetupResourceDir(app, projectRoot), OBS_SETUP_BINARY_NAME);
}

/**
 * @param {{ isPackaged: boolean, resourcesPath: string }} app
 * @param {string} projectRoot
 * @returns {string} full path to the version.json written alongside the
 *   binary by scripts/fetch-obs-setup-binary.js.
 */
function resolveObsSetupVersionFilePath(app, projectRoot) {
  return path.join(resolveObsSetupResourceDir(app, projectRoot), OBS_SETUP_VERSION_FILE_NAME);
}

module.exports = {
  resolveObsSetupResourceDir,
  resolveObsSetupBinaryPath,
  resolveObsSetupVersionFilePath,
  OBS_SETUP_DIR_NAME,
  OBS_SETUP_BINARY_NAME,
  OBS_SETUP_VERSION_FILE_NAME,
};
