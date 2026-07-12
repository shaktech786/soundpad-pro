import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// The manager takes an injected updater in tests, so main/auto-updater.js never
// requires the real electron-updater (which touches electron's `app`).
import { AutoUpdaterManager, UPDATE_STATUS_CHANNEL } from '../main/auto-updater'

// Stand-in for electron-updater's autoUpdater: an EventEmitter that also records
// the config flags the manager sets and exposes spy-able command methods.
class FakeUpdater extends EventEmitter {
  autoDownload: boolean | undefined
  autoInstallOnAppQuit: boolean | undefined
  logger: unknown
  checkForUpdates = vi.fn(() => Promise.resolve(null))
  quitAndInstall = vi.fn()
}

// Stand-in for the BrowserWindow: records what was pushed on the update channel.
class FakeWindow {
  sent: Array<{ channel: string; payload: any }> = []
  private _destroyed: boolean
  constructor(destroyed = false) {
    this._destroyed = destroyed
  }
  isDestroyed() {
    return this._destroyed
  }
  webContents = {
    send: (channel: string, payload: any) => {
      this.sent.push({ channel, payload })
    },
  }
}

const silentLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

function makeManager(overrides: Record<string, any> = {}) {
  const updater = new FakeUpdater()
  const win = new FakeWindow()
  const manager = new AutoUpdaterManager({
    updater: updater as any,
    getMainWindow: () => win,
    logger: silentLogger,
    ...overrides,
  })
  return { manager, updater, win }
}

describe('AutoUpdaterManager configuration', () => {
  test('enables background download but gates install on app quit', () => {
    const { updater } = makeManager()
    // Download silently as soon as an update is found...
    expect(updater.autoDownload).toBe(true)
    // ...but only ever install on a user-initiated quit (never mid-session).
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })
})

describe('AutoUpdaterManager event forwarding', () => {
  test('forwards update-available with the version on the status channel', () => {
    const { updater, win } = makeManager()

    updater.emit('update-available', { version: '3.0.0' })

    expect(win.sent).toEqual([
      { channel: UPDATE_STATUS_CHANNEL, payload: { state: 'available', version: '3.0.0', error: null } },
    ])
  })

  test('forwards update-downloaded and does NOT auto-install (never mid-session)', () => {
    const { updater, win } = makeManager()

    updater.emit('update-downloaded', { version: '3.1.0' })

    expect(win.sent).toEqual([
      { channel: UPDATE_STATUS_CHANNEL, payload: { state: 'downloaded', version: '3.1.0', error: null } },
    ])
    // The whole point: a finished download must never trigger a restart itself.
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  test('forwards error events with the message', () => {
    const { updater, win } = makeManager()

    updater.emit('error', new Error('feed unreachable'))

    expect(win.sent).toEqual([
      { channel: UPDATE_STATUS_CHANNEL, payload: { state: 'error', version: null, error: 'feed unreachable' } },
    ])
  })

  test('getStatus reflects the most recent forwarded status', () => {
    const { manager, updater } = makeManager()

    expect(manager.getStatus()).toEqual({ state: 'idle', version: null, error: null })

    updater.emit('update-available', { version: '3.0.0' })
    expect(manager.getStatus()).toEqual({ state: 'available', version: '3.0.0', error: null })

    updater.emit('update-downloaded', { version: '3.0.0' })
    expect(manager.getStatus()).toEqual({ state: 'downloaded', version: '3.0.0', error: null })
  })

  test('does not push to a destroyed window', () => {
    const updater = new FakeUpdater()
    const destroyed = new FakeWindow(true)
    new AutoUpdaterManager({ updater: updater as any, getMainWindow: () => destroyed, logger: silentLogger })

    updater.emit('update-downloaded', { version: '3.0.0' })

    expect(destroyed.sent).toHaveLength(0)
  })
})

describe('AutoUpdaterManager scheduling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('start() checks after the initial delay and then on the interval', () => {
    const { manager, updater } = makeManager({ initialDelayMs: 5000, checkIntervalMs: 60_000 })

    manager.start()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    // Initial delayed check.
    vi.advanceTimersByTime(5000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    // Periodic re-checks.
    vi.advanceTimersByTime(60_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
  })

  test('stop() cancels both the initial and periodic checks', () => {
    const { manager, updater } = makeManager({ initialDelayMs: 5000, checkIntervalMs: 60_000 })

    manager.start()
    manager.stop()

    vi.advanceTimersByTime(5000 + 60_000 * 3)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })
})

describe('AutoUpdaterManager commands', () => {
  test('quitAndInstall delegates to the updater', () => {
    const { manager, updater } = makeManager()
    manager.quitAndInstall()
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  test('checkForUpdates swallows a rejected check without throwing', async () => {
    const { manager, updater } = makeManager()
    updater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error('offline')))

    expect(() => manager.checkForUpdates()).not.toThrow()
    // Let the swallowed rejection settle; it must be logged, not re-thrown.
    await Promise.resolve()
    expect(silentLogger.error).toHaveBeenCalled()
  })
})
