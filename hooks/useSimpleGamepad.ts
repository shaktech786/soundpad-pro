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
