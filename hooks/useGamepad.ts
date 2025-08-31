import { useEffect, useState, useCallback, useRef } from 'react'

interface GamepadState {
  controllers: Gamepad[]
  buttonStates: Map<number, boolean>
}

const AXIS_THRESHOLD = 0.5 // Threshold for analog stick activation
const MAX_BUTTONS = 32 // Support up to 32 buttons
const MAX_AXES = 4 // Support up to 4 axes (2 analog sticks)
const POLL_INTERVAL = 16 // ~60fps polling rate

export function useGamepad() {
  const [controllers, setControllers] = useState<Gamepad[]>([])
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const [previousButtonStates, setPreviousButtonStates] = useState<Map<number, boolean>>(new Map())
  const [previousAxisStates, setPreviousAxisStates] = useState<Map<string, boolean>>(new Map())
  const animationFrameRef = useRef<number>()
  const isPollingRef = useRef(false)

  const scanGamepads = useCallback(() => {
    if (typeof window === 'undefined' || !window.navigator.getGamepads) {
      console.warn('Gamepad API not available')
      return
    }

    try {
      const gamepads = navigator.getGamepads()
      const activeGamepads: Gamepad[] = []
      const newButtonStates = new Map<number, boolean>()
      const currentAxisStates = new Map<string, boolean>()

      // Process all gamepad slots
      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i]
        if (gamepad && gamepad.connected) {
          activeGamepads.push(gamepad)
          
          // Check all button states (including triggers and bumpers)
          for (let btnIndex = 0; btnIndex < Math.min(gamepad.buttons.length, MAX_BUTTONS); btnIndex++) {
            const button = gamepad.buttons[btnIndex]
            // Handle both digital and analog buttons
            const isPressed = button.pressed || button.value > 0.5
            const wasPressed = previousButtonStates.get(btnIndex) || false
            
            // Only trigger on button press, not hold
            if (isPressed && !wasPressed) {
              newButtonStates.set(btnIndex, true)
              console.log(`Button ${btnIndex} pressed on ${gamepad.id}`)
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
              console.log(`Axis ${axisIndex} positive triggered`)
            } else {
              newButtonStates.set(virtualButtonIndex, false)
            }
            
            // Negative direction
            const isNegPressed = axisValue < -AXIS_THRESHOLD
            const wasNegPressed = previousAxisStates.get(negativeKey) || false
            currentAxisStates.set(negativeKey, isNegPressed)
            if (isNegPressed && !wasNegPressed) {
              newButtonStates.set(virtualButtonIndex + 1, true)
              console.log(`Axis ${axisIndex} negative triggered`)
            } else {
              newButtonStates.set(virtualButtonIndex + 1, false)
            }
          }
        }
      }

      // Update state
      setControllers(activeGamepads)
      setButtonStates(newButtonStates)
      
      // Update previous states for next poll
      const newPrevButtonStates = new Map<number, boolean>()
      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i]
        if (gamepad && gamepad.connected) {
          for (let j = 0; j < gamepad.buttons.length; j++) {
            newPrevButtonStates.set(j, gamepad.buttons[j].pressed || gamepad.buttons[j].value > 0.5)
          }
        }
      }
      setPreviousButtonStates(newPrevButtonStates)
      setPreviousAxisStates(currentAxisStates)
    } catch (error) {
      console.error('Error scanning gamepads:', error)
    }
  }, [previousButtonStates, previousAxisStates])

  // Use requestAnimationFrame for smoother polling
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return
    
    isPollingRef.current = true
    
    const poll = () => {
      scanGamepads()
      if (isPollingRef.current) {
        animationFrameRef.current = requestAnimationFrame(poll)
      }
    }
    
    poll()
  }, [scanGamepads])

  const stopPolling = useCallback(() => {
    isPollingRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      console.warn('Running in non-browser environment')
      return
    }

    // Check for Gamepad API support
    if (!('getGamepads' in navigator)) {
      console.error('Gamepad API not supported in this browser')
      return
    }

    const handleGamepadConnected = (e: GamepadEvent) => {
      console.log('🎮 Gamepad connected:', {
        id: e.gamepad.id,
        index: e.gamepad.index,
        buttons: e.gamepad.buttons.length,
        axes: e.gamepad.axes.length,
        mapping: e.gamepad.mapping
      })
      scanGamepads()
      startPolling()
    }

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      console.log('🎮 Gamepad disconnected:', e.gamepad.id)
      scanGamepads()
      
      // Stop polling if no gamepads connected
      const gamepads = navigator.getGamepads()
      let hasConnected = false
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i]!.connected) {
          hasConnected = true
          break
        }
      }
      if (!hasConnected) {
        stopPolling()
      }
    }

    // Add event listeners
    window.addEventListener('gamepadconnected', handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)

    // Initial scan and start polling if gamepads already connected
    scanGamepads()
    const gamepads = navigator.getGamepads()
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]!.connected) {
        console.log('Found already connected gamepad:', gamepads[i]!.id)
        startPolling()
        break
      }
    }

    // Some browsers need interaction to detect gamepads
    const handleUserInteraction = () => {
      scanGamepads()
      const gamepads = navigator.getGamepads()
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i]!.connected) {
          startPolling()
          // Remove listener after first successful detection
          document.removeEventListener('click', handleUserInteraction)
          document.removeEventListener('keypress', handleUserInteraction)
          break
        }
      }
    }

    document.addEventListener('click', handleUserInteraction)
    document.addEventListener('keypress', handleUserInteraction)

    return () => {
      stopPolling()
      window.removeEventListener('gamepadconnected', handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keypress', handleUserInteraction)
    }
  }, [scanGamepads, startPolling, stopPolling])

  return {
    controllers,
    buttonStates,
    isConnected: controllers.length > 0
  }
}