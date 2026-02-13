import { useState, useEffect, useCallback, useRef } from 'react'

// Hat switch axes encode 8 directions as specific values on a single axis.
// Neutral value is ~1.286 (9/7). Standard values: N=-1, NE=-5/7, E=-3/7,
// SE=-1/7, S=1/7, SW=3/7, W=5/7, NW=1. Virtual button IDs: 300-303.
function decodeHatSwitch(value: number): { up: boolean, right: boolean, down: boolean, left: boolean } {
  if (value >= 1.143) return { up: false, right: false, down: false, left: false } // neutral
  if (value < -0.857) return { up: true, right: false, down: false, left: false } // N
  if (value < -0.571) return { up: true, right: true, down: false, left: false } // NE
  if (value < -0.286) return { up: false, right: true, down: false, left: false } // E
  if (value < 0.0) return { up: false, right: true, down: true, left: false } // SE
  if (value < 0.286) return { up: false, right: false, down: true, left: false } // S
  if (value < 0.571) return { up: false, right: false, down: true, left: true } // SW
  if (value < 0.857) return { up: false, right: false, down: false, left: true } // W
  return { up: true, right: false, down: false, left: true } // NW
}

export function useSimpleGamepad() {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)

  // Store HID states separately so they can be merged with Web Gamepad states
  const hidStates = useRef<Map<number, boolean>>(new Map())

  // Store keyboard states for controllers that send key events (e.g. GP2040-CE keyboard mode)
  // IDs: 200 + keyCode to avoid collision with gamepad buttons (0-99) and axes (100-199)
  const keyboardStates = useRef<Map<number, boolean>>(new Map())

  // Track which axes are hat switches (detected by value > 1.1)
  const hatSwitchAxes = useRef<Set<string>>(new Set())

  const scanGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    const newStates = new Map<number, boolean>()
    let hasGamepad = false

    // Check ALL connected gamepads and merge their button states
    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (gamepad && gamepad.connected) {
        hasGamepad = true

        // Get all button states (merge with existing - if ANY gamepad has button pressed, it's pressed)
        for (let btnIndex = 0; btnIndex < gamepad.buttons.length; btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          const isPressed = button.pressed || button.value > 0.5
          const currentState = newStates.get(btnIndex) || false
          newStates.set(btnIndex, currentState || isPressed)
        }

        // Get all axis states (treat as virtual buttons)
        for (let axisIndex = 0; axisIndex < gamepad.axes.length; axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          const hatKey = `${i}:${axisIndex}`

          // Detect hat switch: value > 1.1 means neutral position of a hat switch
          if (axisValue > 1.1) {
            hatSwitchAxes.current.add(hatKey)
          }

          if (hatSwitchAxes.current.has(hatKey)) {
            // Hat switch: decode to Up/Down/Left/Right virtual buttons (IDs 300-303)
            const dirs = decodeHatSwitch(axisValue)
            const base = 300
            newStates.set(base, (newStates.get(base) || false) || dirs.up)
            newStates.set(base + 1, (newStates.get(base + 1) || false) || dirs.right)
            newStates.set(base + 2, (newStates.get(base + 2) || false) || dirs.down)
            newStates.set(base + 3, (newStates.get(base + 3) || false) || dirs.left)
          } else {
            // Normal axis: threshold-based detection
            // Axes use indices starting at 100 to avoid collision with regular buttons
            // 100 = axis0+, 101 = axis0-, 102 = axis1+, 103 = axis1-, etc.
            const threshold = 0.5

            // Positive direction (pushing right/down)
            const posButtonId = 100 + (axisIndex * 2)
            const currentPos = newStates.get(posButtonId) || false
            newStates.set(posButtonId, currentPos || axisValue > threshold)

            // Negative direction (pushing left/up)
            const negButtonId = 100 + (axisIndex * 2) + 1
            const currentNeg = newStates.get(negButtonId) || false
            newStates.set(negButtonId, currentNeg || axisValue < -threshold)
          }
        }

        // DON'T break - check ALL gamepads and merge their button states
      }
    }

    // Merge HID gamepad states (these work even when window is unfocused)
    for (const [btnIndex, isPressed] of hidStates.current) {
      if (isPressed) {
        newStates.set(btnIndex, true)
        hasGamepad = true
      }
    }

    // Merge keyboard states (for controllers sending key events)
    for (const [keyId, isPressed] of keyboardStates.current) {
      if (isPressed) {
        newStates.set(keyId, true)
      }
    }

    setConnected(hasGamepad)
    setButtonStates(newStates)
  }, [])

  // Listen for keyboard events from controllers that send key events
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      // Don't capture when typing in text inputs
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Prevent browser from consuming arrow keys for focus/scroll navigation
      if (e.keyCode >= 37 && e.keyCode <= 40) e.preventDefault()
      keyboardStates.current.set(200 + e.keyCode, true)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keyboardStates.current.set(200 + e.keyCode, false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Listen for HID gamepad events from main process (works when window unfocused)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.onHIDGamepadState) return

    electronAPI.onHIDGamepadState((states: Record<string, boolean>) => {
      // Convert object to Map for consistency
      const newHidStates = new Map<number, boolean>()
      for (const [key, value] of Object.entries(states)) {
        newHidStates.set(Number(key), value)
      }
      hidStates.current = newHidStates
    })

    return () => {
      // Cleanup is handled by removeAllListeners
    }
  }, [])

  useEffect(() => {
    // Poll at 60fps
    const interval = setInterval(scanGamepads, 16)
    return () => clearInterval(interval)
  }, [scanGamepads])

  return {
    buttonStates,
    connected
  }
}
