import { useEffect, useState, useCallback } from 'react'

interface GamepadState {
  controllers: Gamepad[]
  buttonStates: Map<number, boolean>
}

const AXIS_THRESHOLD = 0.5 // Threshold for analog stick activation
const MAX_BUTTONS = 32 // Support up to 32 buttons
const MAX_AXES = 4 // Support up to 4 axes (2 analog sticks)

export function useGamepad() {
  const [controllers, setControllers] = useState<Gamepad[]>([])
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [previousButtonStates, setPreviousButtonStates] = useState<Map<number, boolean>>(new Map())
  const [previousAxisStates, setPreviousAxisStates] = useState<Map<string, boolean>>(new Map())

  const scanGamepads = useCallback(() => {
    if (typeof window === 'undefined' || !window.navigator.getGamepads) return

    const gamepads = navigator.getGamepads()
    const activeGamepads: Gamepad[] = []
    const newButtonStates = new Map<number, boolean>()
    const currentAxisStates = new Map<string, boolean>()

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (gamepad) {
        activeGamepads.push(gamepad)
        
        // Check all button states (including triggers and bumpers)
        for (let btnIndex = 0; btnIndex < Math.min(gamepad.buttons.length, MAX_BUTTONS); btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          const isPressed = button.pressed || button.value > 0.5 // Support analog triggers
          const wasPressed = previousButtonStates.get(btnIndex) || false
          
          // Only trigger on button press, not hold
          if (isPressed && !wasPressed) {
            newButtonStates.set(btnIndex, true)
          } else {
            newButtonStates.set(btnIndex, false)
          }
        }
        
        // Check axes (analog sticks) and map them to virtual buttons
        for (let axisIndex = 0; axisIndex < Math.min(gamepad.axes.length, MAX_AXES); axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          
          // Map each axis direction to a virtual button
          const positiveKey = `axis_${axisIndex}_pos`
          const negativeKey = `axis_${axisIndex}_neg`
          const virtualButtonIndex = MAX_BUTTONS + (axisIndex * 2)
          
          // Positive direction
          const isPosPressed = axisValue > AXIS_THRESHOLD
          const wasPosPressed = previousAxisStates.get(positiveKey) || false
          currentAxisStates.set(positiveKey, isPosPressed)
          if (isPosPressed && !wasPosPressed) {
            newButtonStates.set(virtualButtonIndex, true)
          } else {
            newButtonStates.set(virtualButtonIndex, false)
          }
          
          // Negative direction
          const isNegPressed = axisValue < -AXIS_THRESHOLD
          const wasNegPressed = previousAxisStates.get(negativeKey) || false
          currentAxisStates.set(negativeKey, isNegPressed)
          if (isNegPressed && !wasNegPressed) {
            newButtonStates.set(virtualButtonIndex + 1, true)
          } else {
            newButtonStates.set(virtualButtonIndex + 1, false)
          }
        }
      }
    }

    setControllers(activeGamepads)
    setButtonStates(newButtonStates)
    setPreviousButtonStates(new Map(
      Array.from(gamepads).filter(g => g).flatMap((gamepad) => 
        gamepad!.buttons.map((button, index) => [index, button.pressed || button.value > 0.5])
      )
    ))
    setPreviousAxisStates(currentAxisStates)
  }, [previousButtonStates, previousAxisStates])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleGamepadConnected = (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id)
      console.log('Index:', e.gamepad.index)
      console.log('Buttons:', e.gamepad.buttons.length)
      console.log('Axes:', e.gamepad.axes.length)
      scanGamepads()
    }

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      console.log('Gamepad disconnected:', e.gamepad.id)
      scanGamepads()
    }

    window.addEventListener('gamepadconnected', handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)

    // Poll for gamepad state changes
    const intervalId = setInterval(scanGamepads, 16) // ~60fps

    // Initial scan
    scanGamepads()

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
      clearInterval(intervalId)
    }
  }, [scanGamepads])

  return {
    controllers,
    buttonStates,
    isConnected: controllers.length > 0
  }
}