import { describe, test, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// Pure module — no 'electron' import, so it takes a fake `app` and a fake
// window. Two Decks at once fight over the same settings file, the same
// controller, the same global hotkeys and the same local port, so a second
// launch must hand over to the first and exit.
const { enforceSingleInstance, focusWindow } = require('../main/single-instance')

function fakeApp(gotLock: boolean) {
  const handlers: Record<string, () => void> = {}
  return {
    requestSingleInstanceLock: vi.fn(() => gotLock),
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler
    }),
    emit: (event: string) => handlers[event]?.(),
  }
}

function fakeWindow({ minimized = false, destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  }
}

describe('enforceSingleInstance', () => {
  test('the first launch keeps running', () => {
    const app = fakeApp(true)

    expect(enforceSingleInstance(app, vi.fn())).toBe(true)
  })

  test('a second launch is told to stop and registers nothing', () => {
    const app = fakeApp(false)
    const onSecondLaunch = vi.fn()

    expect(enforceSingleInstance(app, onSecondLaunch)).toBe(false)
    expect(app.on).not.toHaveBeenCalled()
  })

  test('the first launch is notified when a second one is attempted', () => {
    const app = fakeApp(true)
    const onSecondLaunch = vi.fn()
    enforceSingleInstance(app, onSecondLaunch)

    expect(onSecondLaunch).not.toHaveBeenCalled()
    app.emit('second-instance')

    expect(onSecondLaunch).toHaveBeenCalledTimes(1)
  })
})

describe('focusWindow', () => {
  test('brings a visible window to the front', () => {
    const win = fakeWindow()

    expect(focusWindow(win)).toBe(true)
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  test('restores a minimized window before focusing it', () => {
    const win = fakeWindow({ minimized: true })

    expect(focusWindow(win)).toBe(true)
    expect(win.restore).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  test('reports false when there is no usable window', () => {
    expect(focusWindow(null)).toBe(false)
    expect(focusWindow(fakeWindow({ destroyed: true }))).toBe(false)
  })
})

describe('main/index.js startup order', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main', 'index.js'), 'utf8')

  test('takes the lock after userData is pinned and before settings are opened', () => {
    const setPath = source.indexOf("app.setPath('userData'")
    const lock = source.indexOf('enforceSingleInstance(app')
    const store = source.indexOf('new Store(')

    expect(setPath).toBeGreaterThan(-1)
    expect(lock).toBeGreaterThan(setPath)
    expect(store).toBeGreaterThan(lock)
  })
})
