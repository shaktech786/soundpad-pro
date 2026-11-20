// Two Decks running at once share one settings file, one controller, one set
// of global hotkeys and one local port (the OBS dock talks to whichever Deck
// bound it first), so the second one silently half-works and can overwrite the
// first one's saved setup. Only one may run; a second launch hands over to the
// first and exits.
//
// Pure and dependency-free (no 'electron' import) so it can be unit-tested
// with a fake `app` — see __tests__/single-instance.test.ts. Electron keys the
// lock on the userData directory, so the caller must pin userData first.

/**
 * @param {{ requestSingleInstanceLock: () => boolean, on: (event: string, handler: () => void) => void }} app
 * @param {() => void} onSecondLaunch - runs in the first instance each time
 *   another launch is attempted.
 * @returns {boolean} false when another Deck already holds the lock and this
 *   process must quit without starting anything.
 */
function enforceSingleInstance(app, onSecondLaunch) {
  if (!app.requestSingleInstanceLock()) {
    return false;
  }
  app.on('second-instance', () => onSecondLaunch());
  return true;
}

/**
 * @param {import('electron').BrowserWindow | null | undefined} win
 * @returns {boolean} false when there is no usable window to bring forward.
 */
function focusWindow(win) {
  if (!win || win.isDestroyed()) {
    return false;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
  return true;
}

module.exports = { enforceSingleInstance, focusWindow };
