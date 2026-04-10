import { useState, useEffect, useCallback, useRef, MutableRefObject } from 'react'

// Button ID ranges:
//   0-99:    Standard gamepad buttons
//   100-199: Analog axes (100 + axisIndex*2 = positive, +1 = negative)
//   300-303: Hat switch directions (Up, Right, Down, Left)
//
// This hook is Web-Gamepad-API-only. It does NOT use HID state from the main
// process. Unfocused gamepad input is out of scope: Chrome freezes the API
// when the window loses focus, and mixing in HID data caused a cascade of
// index-mismatch bugs (same physical button reporting different IDs from
// different sources). The stop button has its own HID-based path implemented
// in main/index.js via raw byte pattern matching.

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
  const hatSwitchAxes = useRef<Set<string>>(new Set())
  const prevStatesRef = useRef<Map<number, boolean>>(new Map())
  const prevConnectedRef = useRef(false)

  const scanGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    const newStates = new Map<number, boolean>()
    let hasGamepad = false

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (!gamepad?.connected) continue
      hasGamepad = true

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
          const d = decodeHatSwitch(val)
          if (d.up)    newStates.set(300, true)
          if (d.right) newStates.set(301, true)
          if (d.down)  newStates.set(302, true)
          if (d.left)  newStates.set(303, true)
        } else {
          if (val > 0.5)  newStates.set(100 + a * 2, true)
          if (val < -0.5) newStates.set(100 + a * 2 + 1, true)
        }
      }
    }

    // Fire direct callbacks for NEW button presses synchronously — bypasses React
    // scheduling entirely for drum pad audio, eliminating ~16ms render cycle latency.
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

    if (!mapsEqual(newStates, prevStatesRef.current)) {
      prevStatesRef.current = newStates
      setButtonStates(newStates)
    }
    if (hasGamepad !== prevConnectedRef.current) {
      prevConnectedRef.current = hasGamepad
      setConnected(hasGamepad)
    }
  }, [buttonDownRef, stopButtonIdRef, onStopDownRef])

  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      console.log('[Gamepad] connected:', e.gamepad.id, 'index:', e.gamepad.index)
      for (const key of hatSwitchAxes.current) {
        if (key.startsWith(`${e.gamepad.index}:`)) hatSwitchAxes.current.delete(key)
      }
      scanGamepads()
    }
    const onDisconnect = (e: GamepadEvent) => {
      console.log('[Gamepad] disconnected:', e.gamepad.id, 'index:', e.gamepad.index)
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

  // Poll at 125Hz (8ms) for tight drum-pad response
  useEffect(() => {
    const id = setInterval(scanGamepads, 8)
    return () => clearInterval(id)
  }, [scanGamepads])

  return { buttonStates, connected }
}
