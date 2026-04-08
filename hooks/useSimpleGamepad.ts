import { useState, useEffect, useCallback, useRef, MutableRefObject } from 'react'

// Button ID ranges:
//   0-99:    Standard gamepad buttons
//   100-199: Analog axes (100 + axisIndex*2 = positive, +1 = negative)
//   300-303: Hat switch directions (Up, Right, Down, Left)

// Hat switch: single axis encodes 8 directions. Neutral ~1.286, directions from -1 to 1.
function decodeHatSwitch(value: number) {
  if (value >= 1.143) return { up: false, right: false, down: false, left: false }
  if (value < -0.857) return { up: true, right: false, down: false, left: false }
  if (value < -0.571) return { up: true, right: true, down: false, left: false }
  if (value < -0.286) return { up: false, right: true, down: false, left: false }
  if (value < 0.0)    return { up: false, right: true, down: true, left: false }
  if (value < 0.286)  return { up: false, right: false, down: true, left: false }
  if (value < 0.571)  return { up: false, right: false, down: true, left: true }
  if (value < 0.857)  return { up: false, right: false, down: false, left: true }
  return { up: true, right: false, down: false, left: true }
}

// Compare two button state maps — returns true if identical
function mapsEqual(a: Map<number, boolean>, b: Map<number, boolean>): boolean {
  if (a.size !== b.size) return false
  for (const [key, val] of a) {
    if (b.get(key) !== val) return false
  }
  return true
}

export function useSimpleGamepad(
  buttonDownRef?: MutableRefObject<(id: number) => void>,
  stopButtonIdRef?: MutableRefObject<number | null>,
  onStopDownRef?: MutableRefObject<() => void>
) {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)
  const hidStates = useRef<Map<number, boolean>>(new Map())
  const hatSwitchAxes = useRef<Set<string>>(new Set())
  const prevStatesRef = useRef<Map<number, boolean>>(new Map())
  const prevConnectedRef = useRef(false)

  const scanGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    const newStates = new Map<number, boolean>()
    let hasGamepad = false

    // Use document.hasFocus() to decide which source to trust.
    //
    // When FOCUSED: Web Gamepad API is fully operational. Use it exclusively.
    //   HID can report button IDs that differ from Chrome's gamepad button ordering
    //   (due to BYTE0_MAP differences), causing the same physical press to appear
    //   as two distinct IDs — one per source — and fire two sounds (the triangle bug).
    //
    // When UNFOCUSED: Chrome freezes Web Gamepad API state. Use HID exclusively.
    //   HID polls the controller directly via node-hid regardless of window focus.
    //
    // Never merge both sources simultaneously — that's what causes duplicate IDs.
    const windowFocused = document.hasFocus()

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (!gamepad?.connected) continue
      hasGamepad = true

      if (windowFocused) {
        // Standard buttons (IDs 0-99)
        for (let b = 0; b < gamepad.buttons.length; b++) {
          const btn = gamepad.buttons[b]
          if (btn.pressed || btn.value > 0.5) {
            newStates.set(b, true)
          }
        }

        // Axes
        for (let a = 0; a < gamepad.axes.length; a++) {
          const val = gamepad.axes[a]
          const hatKey = `${i}:${a}`

          // Auto-detect hat switch axes (neutral value > 1.1, outside normal -1 to 1 range)
          if (val > 1.1) hatSwitchAxes.current.add(hatKey)

          if (hatSwitchAxes.current.has(hatKey)) {
            // Hat switch → 4 cardinal direction buttons (IDs 300-303)
            const d = decodeHatSwitch(val)
            if (d.up)    newStates.set(300, true)
            if (d.right) newStates.set(301, true)
            if (d.down)  newStates.set(302, true)
            if (d.left)  newStates.set(303, true)
          } else {
            // Normal analog axis → 2 virtual buttons per axis (IDs 100+)
            if (val > 0.5)  newStates.set(100 + a * 2, true)
            if (val < -0.5) newStates.set(100 + a * 2 + 1, true)
          }
        }
      }
    }

    // HID states (sourced from node-hid in the main process, always active).
    // Only merge when unfocused — when focused, Web Gamepad API handles everything.
    if (!windowFocused) {
      for (const [id, pressed] of hidStates.current) {
        if (pressed) {
          newStates.set(id, true)
          hasGamepad = true
        }
      }
    }

    // Fire direct callbacks for NEW button presses synchronously — bypasses React scheduling
    // entirely for drum pad audio, eliminating the ~16ms React render cycle latency.
    // Stop button also fires synchronously here so it works when window is unfocused.
    for (const [id] of newStates) {
      if (!prevStatesRef.current.get(id)) {
        if (stopButtonIdRef?.current !== null && stopButtonIdRef?.current !== undefined && id === stopButtonIdRef.current) {
          onStopDownRef?.current?.()
        }
        if (buttonDownRef?.current) {
          buttonDownRef.current(id)
        }
      }
    }

    // Only trigger React re-renders when state actually changed
    if (!mapsEqual(newStates, prevStatesRef.current)) {
      prevStatesRef.current = newStates
      setButtonStates(newStates)
    }
    if (hasGamepad !== prevConnectedRef.current) {
      prevConnectedRef.current = hasGamepad
      setConnected(hasGamepad)
    }
  }, [buttonDownRef, stopButtonIdRef, onStopDownRef])

  // HID gamepad events from main process
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = (window as any).electronAPI
    if (!api?.onHIDGamepadState) return

    const cleanup = api.onHIDGamepadState((states: Record<string, boolean>) => {
      const m = new Map<number, boolean>()
      for (const [k, v] of Object.entries(states)) m.set(Number(k), v)
      hidStates.current = m
    })
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [])

  // Listen for gamepad connect/disconnect so newly plugged-in controllers are recognized
  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      console.log('[Gamepad] connected:', e.gamepad.id, 'index:', e.gamepad.index)
      // Reset hat switch detection for this gamepad since axes may differ
      for (const key of hatSwitchAxes.current) {
        if (key.startsWith(`${e.gamepad.index}:`)) hatSwitchAxes.current.delete(key)
      }
      scanGamepads()
    }
    const onDisconnect = (e: GamepadEvent) => {
      console.log('[Gamepad] disconnected:', e.gamepad.id, 'index:', e.gamepad.index)
      // Clean up hat switch tracking for this gamepad
      for (const key of hatSwitchAxes.current) {
        if (key.startsWith(`${e.gamepad.index}:`)) hatSwitchAxes.current.delete(key)
      }
      scanGamepads()
    }
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    return () => {
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [scanGamepads])

  // Poll at 125Hz (8ms) — halves input detection latency vs 60fps for tighter drum pad response
  useEffect(() => {
    const id = setInterval(scanGamepads, 8)
    return () => clearInterval(id)
  }, [scanGamepads])

  return { buttonStates, connected }
}
