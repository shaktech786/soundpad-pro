import { useState, useEffect, useRef, useCallback } from 'react'

export function useSimpleGamepad() {
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [connected, setConnected] = useState(false)
  const lastStateRef = useRef<string>('')

  const scanGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    let hasGamepad = false
    const pressedButtons: number[] = []

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (gamepad && gamepad.connected) {
        hasGamepad = true

        // Collect only pressed buttons
        for (let btnIndex = 0; btnIndex < gamepad.buttons.length; btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          if (button.pressed || button.value > 0.5) {
            pressedButtons.push(btnIndex)
          }
        }

        // Collect only active axis states
        for (let axisIndex = 0; axisIndex < gamepad.axes.length; axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          const threshold = 0.5

          if (axisValue > threshold) {
            pressedButtons.push(100 + (axisIndex * 2))
          }
          if (axisValue < -threshold) {
            pressedButtons.push(100 + (axisIndex * 2) + 1)
          }
        }

        break // Use first connected gamepad
      }
    }

    // Only update state if something changed
    const stateString = pressedButtons.sort((a, b) => a - b).join(',') + '|' + hasGamepad
    if (stateString !== lastStateRef.current) {
      lastStateRef.current = stateString

      const newStates = new Map<number, boolean>()
      pressedButtons.forEach(btn => newStates.set(btn, true))

      setConnected(hasGamepad)
      setButtonStates(newStates)
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
