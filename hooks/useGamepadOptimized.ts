import { useEffect, useState, useCallback, useRef } from 'react'
import { APP_CONFIG } from '../config/constants'
import logger from '../utils/logger'

interface GamepadState {
  controllers: Gamepad[]
  buttonStates: Map<number, boolean>
}

const AXIS_THRESHOLD = APP_CONFIG.CONTROLLER.AXIS_THRESHOLD
const MAX_BUTTONS = APP_CONFIG.CONTROLLER.MAX_BUTTONS
const MAX_AXES = APP_CONFIG.CONTROLLER.MAX_AXES
const RECONNECT_INTERVAL = APP_CONFIG.CONTROLLER.RECONNECT_INTERVAL

// Optimized polling with minimal delay
export function useGamepad() {
  const [controllers, setControllers] = useState<Gamepad[]>([])
  const [buttonStates, setButtonStates] = useState<Map<number, boolean>>(new Map())
  const previousButtonStatesRef = useRef<Map<number, boolean>>(new Map())
  const previousAxisStatesRef = useRef<Map<string, boolean>>(new Map())
  const isPollingRef = useRef(false)
  const lastScanTimeRef = useRef(0)
  const controllerCacheRef = useRef<Gamepad[]>([])
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastControllerCountRef = useRef(0)

  // Optimized scan that minimizes state updates
  const scanGamepads = useCallback(() => {
    const now = performance.now()
    
    // Skip if scanned too recently (max 144fps for smoother response)
    if (now - lastScanTimeRef.current < 7) {
      return
    }
    lastScanTimeRef.current = now

    try {
      const gamepads = navigator.getGamepads()
      if (!gamepads) return

      const activeGamepads: Gamepad[] = []

      // Fast loop through gamepads
      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i]
        if (!gamepad || !gamepad.connected) continue

        activeGamepads.push(gamepad)

        // Track button states for edge detection
        for (let btnIndex = 0; btnIndex < Math.min(gamepad.buttons.length, MAX_BUTTONS); btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          const isPressed = button.pressed || button.value > 0.5

          // Update ref for next scan
          previousButtonStatesRef.current.set(btnIndex, isPressed)
        }

        // Track axes states for edge detection
        for (let axisIndex = 0; axisIndex < Math.min(gamepad.axes.length, MAX_AXES); axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          const virtualButtonIndex = MAX_BUTTONS + (axisIndex * 2)

          // Positive direction
          const isPosPressed = axisValue > AXIS_THRESHOLD
          const positiveKey = `axis_${axisIndex}_pos`
          previousAxisStatesRef.current.set(positiveKey, isPosPressed)

          // Negative direction
          const isNegPressed = axisValue < -AXIS_THRESHOLD
          const negativeKey = `axis_${axisIndex}_neg`
          previousAxisStatesRef.current.set(negativeKey, isNegPressed)
        }
      }

      // Only update state if there are actual changes
      if (activeGamepads.length !== controllerCacheRef.current.length) {
        setControllers(activeGamepads)
        controllerCacheRef.current = activeGamepads

        // Log controller change
        if (activeGamepads.length > lastControllerCountRef.current) {
          logger.info(`✅ Controller connected! Total: ${activeGamepads.length}`)
        } else if (activeGamepads.length < lastControllerCountRef.current) {
          logger.info(`❌ Controller disconnected. Remaining: ${activeGamepads.length}`)
        }
        lastControllerCountRef.current = activeGamepads.length
      }

      // Always update button states to reflect current state
      // Build complete button state map
      const currentButtonStates = new Map<number, boolean>()
      let hasActiveGamepad = false

      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i]
        if (!gamepad || !gamepad.connected) continue
        hasActiveGamepad = true

        // Include ALL button states - both pressed and released
        for (let btnIndex = 0; btnIndex < Math.min(gamepad.buttons.length, MAX_BUTTONS); btnIndex++) {
          const button = gamepad.buttons[btnIndex]
          const isPressed = button.pressed || button.value > 0.5

          // Log any button press for debugging
          if (isPressed && !previousButtonStatesRef.current.get(btnIndex)) {
            console.log(`🎮 Gamepad button ${btnIndex} detected as pressed (value: ${button.value})`)
          }

          // Always set the state, not just when pressed
          currentButtonStates.set(btnIndex, isPressed)
        }

        // Include axis states
        for (let axisIndex = 0; axisIndex < Math.min(gamepad.axes.length, MAX_AXES); axisIndex++) {
          const axisValue = gamepad.axes[axisIndex]
          const virtualButtonIndex = MAX_BUTTONS + (axisIndex * 2)

          // Set both positive and negative axis states
          currentButtonStates.set(virtualButtonIndex, axisValue > AXIS_THRESHOLD)
          currentButtonStates.set(virtualButtonIndex + 1, axisValue < -AXIS_THRESHOLD)
        }
      }

      // Always update with current state
      setButtonStates(currentButtonStates)
    } catch (error) {
      console.error('Gamepad scan error:', error)
    }
  }, [])

  // High-frequency polling loop
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.getGamepads) {
      console.error('Gamepad API not available')
      return
    }

    let rafId: number
    
    const pollLoop = () => {
      scanGamepads()
      rafId = requestAnimationFrame(pollLoop)
    }

    // Event handlers for immediate response
    const handleGamepadConnected = (e: GamepadEvent) => {
      logger.info('🎮 Controller connected:', e.gamepad.id)
      isPollingRef.current = true
      scanGamepads()
    }

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      logger.info('🎮 Controller disconnected:', e.gamepad.id)
      scanGamepads()
    }

    // Start polling immediately
    window.addEventListener('gamepadconnected', handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)
    
    // Force initial scan on user interaction
    const forceDetection = () => {
      const gamepads = navigator.getGamepads()
      let found = false
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          logger.debug('🎮 Controller detected via user interaction')
          isPollingRef.current = true
          found = true
          break
        }
      }
      if (!found) {
          logger.debug('🔍 Scanning for controllers...')
      }
    }
    
    // Auto-reconnect logic for controllers
    const startReconnectCheck = () => {
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current)
      }
      
      reconnectIntervalRef.current = setInterval(() => {
        const gamepads = navigator.getGamepads()
        let hasController = false
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i] && gamepads[i]!.connected) {
            hasController = true
            break
          }
        }
        
        if (hasController && controllerCacheRef.current.length === 0) {
          logger.info('🔄 Controller reconnected!')
          scanGamepads()
        } else if (!hasController && controllerCacheRef.current.length > 0) {
          logger.warn('⚠️ Controller connection lost, waiting for reconnection...')
        }
      }, RECONNECT_INTERVAL)
    }

    document.addEventListener('click', forceDetection)
    document.addEventListener('keypress', forceDetection)
    
    // Try to detect immediately multiple times for faster initial detection
    forceDetection()
    setTimeout(forceDetection, 100)
    setTimeout(forceDetection, 300)
    setTimeout(forceDetection, 500)
    
    // Start auto-reconnect checking
    startReconnectCheck()
    
    // Start high-frequency polling
    pollLoop()

    return () => {
      isPollingRef.current = false
      if (rafId) cancelAnimationFrame(rafId)
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current)
      }
      window.removeEventListener('gamepadconnected', handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
      document.removeEventListener('click', forceDetection)
      document.removeEventListener('keypress', forceDetection)
    }
  }, [scanGamepads])

  return {
    controllers,
    buttonStates,
    isConnected: controllers.length > 0
  }
}