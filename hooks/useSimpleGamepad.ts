import { useState, useEffect, useCallback, useRef } from 'react'

export function useSimpleGamepad() {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)

  // Store HID states separately so they can be merged with Web Gamepad states
  const hidStates = useRef<Map<number, boolean>>(new Map())

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
        // Axes use indices starting at 100 to avoid collision with regular buttons
        // 100 = axis0+, 101 = axis0-, 102 = axis1+, 103 = axis1-, etc.
        for (let axisIndex = 0; axisIndex < gamepad.axes.length; axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
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

    setConnected(hasGamepad)
    setButtonStates(newStates)
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
