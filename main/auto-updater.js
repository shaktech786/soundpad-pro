// Default cadence: an initial check a few seconds after launch (so it never
// blocks startup), then a re-check every 4 hours for long-running sessions.
const DEFAULT_INITIAL_DELAY_MS = 5000;
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// IPC push channel the renderer subscribes to for update state. Mirrors the
// 'discord:status-changed' convention (main emits via webContents.send).
const UPDATE_STATUS_CHANNEL = 'app:update-status';

/**
 * Wraps electron-updater's autoUpdater with the SoundPad Pro update policy:
 * silently download updates in the background, but NEVER restart the app on our
 * own — a restart is only ever triggered by an explicit user action
 * (the "Restart to install" button → quitAndInstall) or by the user quitting
 * the app themselves (handled by autoInstallOnAppQuit). This is a live
 * soundboard used mid-broadcast; a surprise relaunch would drop the stream's
 * audio, so the install step is always user-gated.
 *
 * The `updater` dependency is injectable so the event-forwarding logic can be
 * unit-tested against a fake autoUpdater (see __tests__/auto-updater.test.ts).
 */
class AutoUpdaterManager {
  constructor({
    updater,
    getMainWindow,
    logger = console,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  } = {}) {
    // Lazy-require the real autoUpdater only when one isn't injected. This keeps
    // electron-updater (which touches electron's `app` on construction) out of
    // the module's import path, so it can be unit-tested with a fake updater.
    this.updater = updater || require('electron-updater').autoUpdater;
    this.getMainWindow = getMainWindow;
    this.logger = logger;
    this.initialDelayMs = initialDelayMs;
    this.checkIntervalMs = checkIntervalMs;

    this._initialTimer = null;
    this._interval = null;
    // Latest state so the renderer can query it on mount — the 'downloaded'
    // event can fire before the UI has subscribed to the push channel.
    this._status = { state: 'idle', version: null, error: null };

    // Download updates as soon as one is found...
    this.updater.autoDownload = true;
    // ...but only install a downloaded update when the app quits (a
    // user-initiated action). Combined with never calling quitAndInstall() from
    // the 'update-downloaded' handler, this guarantees the app is never
    // force-restarted mid-session. See class doc above.
    this.updater.autoInstallOnAppQuit = true;
    this.updater.logger = this.logger;

    this._registerEvents();
  }

  _registerEvents() {
    this.updater.on('update-available', (info) => {
      this._emitStatus({ state: 'available', version: info && info.version ? info.version : null, error: null });
    });

    this.updater.on('update-downloaded', (info) => {
      // NOTE: deliberately do NOT call quitAndInstall() here. Installing now
      // would relaunch the app mid-broadcast. The renderer shows a dismissible
      // "Restart to install" control instead; the user decides when.
      this._emitStatus({ state: 'downloaded', version: info && info.version ? info.version : null, error: null });
    });

    this.updater.on('error', (err) => {
      this._emitStatus({ state: 'error', version: null, error: err && err.message ? err.message : String(err) });
    });
  }

  _emitStatus(status) {
    this._status = status;
    const win = this.getMainWindow ? this.getMainWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send(UPDATE_STATUS_CHANNEL, status);
    }
  }

  getStatus() {
    return this._status;
  }

  /** Kick off the delayed first check and the periodic re-check. */
  start() {
    this._initialTimer = setTimeout(() => {
      this.checkForUpdates();
    }, this.initialDelayMs);

    this._interval = setInterval(() => {
      this.checkForUpdates();
    }, this.checkIntervalMs);
  }

  /** Clear timers (mirrors gameDetector.stop() teardown on window-all-closed). */
  stop() {
    if (this._initialTimer) {
      clearTimeout(this._initialTimer);
      this._initialTimer = null;
    }
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  checkForUpdates() {
    try {
      const result = this.updater.checkForUpdates();
      // checkForUpdates() rejects (rather than emitting 'error') when there is
      // no update feed configured or the network is down; swallow it so a
      // failed check never crashes the main process.
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          this.logger.error('[AutoUpdater] checkForUpdates failed:', err && err.message ? err.message : err);
        });
      }
      return result;
    } catch (err) {
      this.logger.error('[AutoUpdater] checkForUpdates threw:', err && err.message ? err.message : err);
      return null;
    }
  }

  /** Apply a downloaded update now — quits and relaunches into the installer.
   * Only ever called from the explicit user-facing "Restart to install" IPC. */
  quitAndInstall() {
    this.updater.quitAndInstall();
  }
}

module.exports = { AutoUpdaterManager, UPDATE_STATUS_CHANNEL };
