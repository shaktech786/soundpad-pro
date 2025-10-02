import { useState, useEffect, useCallback } from 'react'

export function useSimpleGamepad() {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)

  const scanGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    const newStates = new Map<number, boolean>()
    let hasGamepad = false

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (gamepad && gamepad.connected) {
        hasGamepad = true

        // Get all button states
        for (let btnIndex = 0; btnIndex < gamepad.buttons.length; btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          newStates.set(btnIndex, button.pressed || button.value > 0.5)
        }

        // Get all axis states (treat as virtual buttons)
        // Axes use indices starting at 100 to avoid collision with regular buttons
        // 100 = axis0+, 101 = axis0-, 102 = axis1+, 103 = axis1-, etc.
        for (let axisIndex = 0; axisIndex < gamepad.axes.length; axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          const threshold = 0.5

          // Positive direction (pushing right/down)
          const posButtonId = 100 + (axisIndex * 2)
          newStates.set(posButtonId, axisValue > threshold)

          // Negative direction (pushing left/up)
          const negButtonId = 100 + (axisIndex * 2) + 1
          newStates.set(negButtonId, axisValue < -threshold)
        }

        break // Use first connected gamepad
      }
    }

    setConnected(hasGamepad)
    setButtonStates(newStates)
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
