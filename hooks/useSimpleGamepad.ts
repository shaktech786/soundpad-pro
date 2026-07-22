import { useState, useEffect, useRef, MutableRefObject } from 'react'

// Button ID ranges:
//   0-99:    Standard gamepad buttons
//   100-199: Analog axes (100 + axisIndex*2 = positive, +1 = negative)
//   300-303: Hat switch directions (Up, Right, Down, Left)
//
// Controller input is read by the MAIN process via node-hid (main/hid-gamepad.js)
// and pushed here over IPC. It is deliberately NOT read with the Web Gamepad API:
// Chromium only delivers gamepad input to a focused document, so navigator
// .getGamepads() freezes the moment another app (OBS, a game, anything) takes
// foreground focus. Reading in the main process is what makes bindings work while
// unfocused. backgroundThrottling:false does not help — the timer keeps firing,
// it just reads stale state.
//
// The two sources are never mixed. Running both concurrently is what previously
// caused index-mismatch bugs (the same physical button reporting different IDs
// depending on which source won the race). The main process decodes into this
// exact ID space; a calibration table (see pages/calibrate.tsx) reconciles the
// raw HID bits with the Chrome button indices that existing bindings were saved
// against. The stop button keeps its separate raw-byte snapshot path in
// main/index.js, which is unaffected by any of this.

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
  const prevStatesRef = useRef<Map<number, boolean>>(new Map())

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.onHidButtons) return

    const applyButtonIds = (buttonIds: number[]) => {
      const newStates = new Map<number, boolean>()
      for (const id of buttonIds) newStates.set(id, true)

      // Fire direct callbacks for NEW presses synchronously — bypasses React
      // scheduling entirely for drum pad audio, eliminating render-cycle latency.
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
    }

    const offButtons = api.onHidButtons(applyButtonIds)
    const offConnection = api.onHidConnectionChanged?.((isConnected) => {
      setConnected(isConnected)
      if (!isConnected) {
        prevStatesRef.current = new Map()
        setButtonStates(new Map())
      }
    })

    // Seed from current main-process state — this hook can mount long after the
    // controller connected and sent its last report.
    let cancelled = false
    api.hidGetState?.().then((state) => {
      if (cancelled || !state?.success) return
      setConnected(state.connected)
      if (state.buttonIds?.length) applyButtonIds(state.buttonIds)
    }).catch(() => { /* main not ready yet; events will catch us up */ })

    return () => {
      cancelled = true
      offButtons?.()
      offConnection?.()
    }
  }, [buttonDownRef, stopButtonIdRef, onStopDownRef])

  return { buttonStates, connected }
}
