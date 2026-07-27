const path = require('path');

// Electron's default userData directory is `<appData>/<app.name>`, and in a
// packaged electron-builder app, app.name resolves to `productName` out of
// the bundled package.json. Renaming productName from "SoundPad Pro" to
// "Prelive Deck" (PRE-385) would therefore silently move userData to a brand
// new, empty folder on every existing install — orphaning every user's
// profiles, sound mappings, Discord token, prelive API key and HID
// calibration, all of which live under the electron-store file in that
// directory (see main/index.js's `new Store({ name: 'soundpad-pro-settings' })`).
//
// To prevent that, main/index.js pins userData to this exact pre-rename
// folder name via `app.setPath('userData', resolveLegacyUserDataPath(...))`
// before anything else (electron-store, the Discord RPC client, the prelive
// client) can read or write to it. This module is the pure, dependency-free
// piece of that decision so it can be unit-tested without requiring
// 'electron' — see __tests__/user-data-path.test.ts.
const LEGACY_USER_DATA_DIR_NAME = 'SoundPad Pro';

/**
 * @param {string} appDataPath - the OS-level roaming app-data root, i.e.
 *   Electron's `app.getPath('appData')` (e.g. `C:\Users\<user>\AppData\Roaming`).
 * @returns {string} the userData path every SoundPad Pro / Prelive Deck
 *   release must use, regardless of the current productName.
 */
function resolveLegacyUserDataPath(appDataPath) {
  return path.join(appDataPath, LEGACY_USER_DATA_DIR_NAME);
}

module.exports = { resolveLegacyUserDataPath, LEGACY_USER_DATA_DIR_NAME };
