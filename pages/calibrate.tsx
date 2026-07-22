import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'

// Controller calibration harness.
//
// This is the ONE place that still reads the Web Gamepad API, and it needs to:
// it exists to learn what button ID Chrome reports for each raw HID input, so
// the main-process decoder can emit those same IDs and every binding the user
// already saved keeps working.
//
// Run it with the window FOCUSED (the Gamepad API is dead otherwise — that is
// the entire bug this is helping fix). Press each button one at a time. Each
// press records: HID source (e.g. 'b0.2') -> Chrome button ID (e.g. 2).

const HAT_NEUTRAL_MIN = 1.1

function decodeHatSwitch(value: number) {
  if (value >= 1.143) return { up: false, right: false, down: false, left: false }
  if (value < -0.857) return { up: true, right: false, down: false, left: false }
  if (value < -0.571) return { up: true, right: true, down: false, left: false }
  if (value < -0.286) return { up: false, right: true, down: false, left: false }
  if (value < 0.0) return { up: false, right: true, down: true, left: false }
  if (value < 0.286) return { up: false, right: false, down: true, left: false }
  if (value < 0.571) return { up: false, right: false, down: true, left: true }
  if (value < 0.857) return { up: false, right: false, down: false, left: true }
  return { up: true, right: false, down: false, left: true }
}

/** Chrome-side button IDs currently held, in the app's ID space. */
function readChromeIds(hatAxes: Set<string>): number[] {
  const ids = new Set<number>()
  const gamepads = navigator.getGamepads()

  for (let i = 0; i < gamepads.length; i++) {
    const gamepad = gamepads[i]
    if (!gamepad?.connected) continue

    for (let b = 0; b < gamepad.buttons.length; b++) {
      const btn = gamepad.buttons[b]
      if (btn.pressed || btn.value > 0.5) ids.add(b)
    }

    for (let a = 0; a < gamepad.axes.length; a++) {
      const val = gamepad.axes[a]
      const hatKey = `${i}:${a}`
      if (val > HAT_NEUTRAL_MIN) hatAxes.add(hatKey)

      if (hatAxes.has(hatKey)) {
        const d = decodeHatSwitch(val)
        if (d.up) ids.add(300)
        if (d.right) ids.add(301)
        if (d.down) ids.add(302)
        if (d.left) ids.add(303)
      } else {
        if (val > 0.5) ids.add(100 + a * 2)
        if (val < -0.5) ids.add(100 + a * 2 + 1)
      }
    }
  }

  return Array.from(ids).sort((a, b) => a - b)
}

interface Row {
  source: string
  chromeId: number | null
  reportHex: string
}

export default function CalibratePage() {
  const [rows, setRows] = useState<Map<string, Row>>(new Map())
  const [defaults, setDefaults] = useState<Record<string, number>>({})
  const [liveSources, setLiveSources] = useState<string[]>([])
  const [liveChromeIds, setLiveChromeIds] = useState<number[]>([])
  const [focused, setFocused] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')

  const hatAxesRef = useRef<Set<string>>(new Set())
  const chromeIdsRef = useRef<number[]>([])
  const prevSourcesRef = useRef<string[]>([])

  // Chrome-side poll. Only meaningful while focused, which is exactly why this
  // whole harness exists — do not copy this pattern anywhere else.
  useEffect(() => {
    const id = setInterval(() => {
      const ids = readChromeIds(hatAxesRef.current)
      chromeIdsRef.current = ids
      setLiveChromeIds(ids)
      setFocused(document.hasFocus())
    }, 16)
    return () => clearInterval(id)
  }, [])

  // HID-side reports from the main process.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.onHidRawReport) return

    const off = api.onHidRawReport(({ report, sources }) => {
      setLiveSources(sources)
      const reportHex = report.map((b) => b.toString(16).padStart(2, '0')).join(' ')
      const previous = prevSourcesRef.current
      const newlyHeld = sources.filter((s) => !previous.includes(s))
      prevSourcesRef.current = sources

      if (newlyHeld.length === 0) return

      // Correlate against whatever Chrome reports right now. Chrome's poll runs
      // on its own cadence, so take the most recent sample.
      const chromeIds = chromeIdsRef.current
      setRows((prev) => {
        const next = new Map(prev)
        for (const source of newlyHeld) {
          const claimed = new Set(
            Array.from(next.values())
              .filter((r) => r.source !== source && r.chromeId !== null)
              .map((r) => r.chromeId as number)
          )
          const unclaimed = chromeIds.filter((id) => !claimed.has(id))
          next.set(source, {
            source,
            chromeId: unclaimed.length === 1 ? unclaimed[0] : (chromeIds.length === 1 ? chromeIds[0] : null),
            reportHex,
          })
        }
        return next
      })
    })

    api.hidGetCalibration?.().then((res) => {
      if (res?.success) setDefaults(res.defaults || {})
    }).catch(() => { /* non-fatal */ })

    return off
  }, [])

  const sortedRows = Array.from(rows.values()).sort((a, b) => a.source.localeCompare(b.source))
  const resolved = sortedRows.filter((r) => r.chromeId !== null)
  const mismatches = resolved.filter((r) => defaults[r.source] !== r.chromeId)

  const report = [
    '=== SoundPad Pro controller calibration ===',
    `captured: ${resolved.length} inputs, ${mismatches.length} disagree with the inferred defaults`,
    '',
    'source   chrome-id   inferred   status      raw report',
    ...sortedRows.map((r) => {
      const inferred = defaults[r.source]
      const status = r.chromeId === null
        ? 'AMBIGUOUS'
        : inferred === undefined ? 'NEW'
        : inferred === r.chromeId ? 'ok' : 'MISMATCH'
      return [
        r.source.padEnd(8),
        String(r.chromeId ?? '?').padEnd(11),
        String(inferred ?? '-').padEnd(10),
        status.padEnd(11),
        r.reportHex,
      ].join(' ')
    }),
  ].join('\n')

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(report).then(
      () => setSaveMsg('Copied to clipboard.'),
      () => setSaveMsg('Copy failed — select the text manually.')
    )
  }, [report])

  const handleSave = useCallback(async () => {
    const overrides: Record<string, number> = {}
    for (const r of resolved) overrides[r.source] = r.chromeId as number
    const res = await window.electronAPI?.hidSetCalibration?.(overrides)
    setSaveMsg(res?.success
      ? `Saved ${Object.keys(overrides).length} mappings. Controller input now uses them.`
      : `Save failed: ${res?.error || 'unknown error'}`)
  }, [resolved])

  const handleReset = useCallback(async () => {
    setRows(new Map())
    prevSourcesRef.current = []
    await window.electronAPI?.hidClearCalibration?.()
    setSaveMsg('Cleared saved calibration — back to inferred defaults.')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#eee', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>Controller Calibration</title></Head>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Controller Calibration</h1>
      <p style={{ color: '#aaa', maxWidth: 720, lineHeight: 1.5 }}>
        Keep this window focused, then press every button on your controller once, one at a time,
        releasing between presses. Include the D-pad / directions and both stick clicks.
        Then click Save, or Copy and send the output back.
      </p>

      {!focused && (
        <div style={{ background: '#5a2020', padding: 12, borderRadius: 6, margin: '12px 0' }}>
          Window is not focused — Chrome is not reporting gamepad input. Click this window first.
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, margin: '16px 0', fontFamily: 'monospace', fontSize: 13 }}>
        <div>HID sources held: <b>{liveSources.join(', ') || '—'}</b></div>
        <div>Chrome IDs held: <b>{liveChromeIds.join(', ') || '—'}</b></div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button onClick={handleSave} disabled={resolved.length === 0} style={btn}>Save calibration</button>
        <button onClick={handleCopy} style={btn}>Copy report</button>
        <button onClick={handleReset} style={btn}>Reset</button>
        <button onClick={() => window.electronAPI?.navigate?.('/')} style={btn}>Back</button>
      </div>

      {saveMsg && <div style={{ color: '#7fd', margin: '8px 0', fontSize: 13 }}>{saveMsg}</div>}

      <pre style={{
        background: '#111', padding: 16, borderRadius: 6, fontSize: 12,
        overflowX: 'auto', border: '1px solid #333', whiteSpace: 'pre',
      }}>{report}</pre>
    </div>
  )
}

const btn: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
  fontSize: 13,
}
