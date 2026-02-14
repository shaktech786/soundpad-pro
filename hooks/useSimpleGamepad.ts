import { useState, useEffect, useCallback, useRef } from 'react'

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

export function useSimpleGamepad() {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)
  const hidStates = useRef<Map<number, boolean>>(new Map())
  const hatSwitchAxes = useRef<Set<string>>(new Set())

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
          // Hat switch → 4 cardinal direction buttons (IDs 300-303)
          const d = decodeHatSwitch(val)
          if (d.up) newStates.set(300, true)
          if (d.right) newStates.set(301, true)
          if (d.down) newStates.set(302, true)
          if (d.left) newStates.set(303, true)
        } else {
          // Normal analog axis → 2 virtual buttons per axis (IDs 100+)
          if (val > 0.5) newStates.set(100 + a * 2, true)
          if (val < -0.5) newStates.set(100 + a * 2 + 1, true)
        }
      }
    }

    // Merge HID states (works when window is unfocused)
    for (const [id, pressed] of hidStates.current) {
      if (pressed) {
        newStates.set(id, true)
        hasGamepad = true
      }
    }

    setConnected(hasGamepad)
    setButtonStates(newStates)
  }, [])

  // HID gamepad events from main process
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = (window as any).electronAPI
    if (!api?.onHIDGamepadState) return

    api.onHIDGamepadState((states: Record<string, boolean>) => {
      const m = new Map<number, boolean>()
      for (const [k, v] of Object.entries(states)) m.set(Number(k), v)
      hidStates.current = m
    })
  }, [])

  // Poll at 60fps
  useEffect(() => {
    const id = setInterval(scanGamepads, 16)
    return () => clearInterval(id)
  }, [scanGamepads])

  return { buttonStates, connected }
}
