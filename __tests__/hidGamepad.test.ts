import { describe, it, expect } from 'vitest'

const {
  decodeReport,
  reportSources,
  NEUTRAL,
  DEFAULT_SOURCE_TO_ID,
} = require('../main/hid-gamepad')

/** Build an 8-byte report from a partial byte map, defaulting to neutral. */
function report(overrides: Record<number, number> = {}): number[] {
  const bytes = NEUTRAL.slice()
  for (const [index, value] of Object.entries(overrides)) {
    bytes[Number(index)] = value
  }
  return bytes
}

describe('reportSources', () => {
  it('reports nothing held for a neutral report', () => {
    expect(reportSources(NEUTRAL.slice())).toEqual([])
  })

  it('names each digital button bit in byte 0', () => {
    expect(reportSources(report({ 0: 0b0000_0100 }))).toEqual(['b0.2'])
    expect(reportSources(report({ 0: 0b1000_0000 }))).toEqual(['b0.7'])
  })

  it('names simultaneous bits across both digital bytes', () => {
    expect(reportSources(report({ 0: 0b0000_0011, 1: 0b0001_0000 })))
      .toEqual(['b0.0', 'b0.1', 'b1.4'])
  })

  it('ignores the unused high bits of byte 1', () => {
    expect(reportSources(report({ 1: 0b1100_0000 }))).toEqual([])
  })

  it('decodes the four cardinal hat directions', () => {
    expect(reportSources(report({ 2: 0 }))).toEqual(['hat.up'])
    expect(reportSources(report({ 2: 2 }))).toEqual(['hat.right'])
    expect(reportSources(report({ 2: 4 }))).toEqual(['hat.down'])
    expect(reportSources(report({ 2: 6 }))).toEqual(['hat.left'])
  })

  it('decodes diagonal hat values as two directions', () => {
    expect(reportSources(report({ 2: 1 }))).toEqual(['hat.up', 'hat.right'])
    expect(reportSources(report({ 2: 7 }))).toEqual(['hat.up', 'hat.left'])
  })

  it('treats hat value 8 as neutral', () => {
    expect(reportSources(report({ 2: 8 }))).toEqual([])
  })

  it('reports an axis only past the deflection threshold', () => {
    expect(reportSources(report({ 3: 0x90 }))).toEqual([])
    expect(reportSources(report({ 3: 0xff }))).toEqual(['a3+'])
    expect(reportSources(report({ 3: 0x00 }))).toEqual(['a3-'])
  })
})

describe('decodeReport', () => {
  it('maps digital bits to their default Chrome button indices', () => {
    expect(decodeReport(report({ 0: 0b0000_0100 }))).toEqual([2])
    expect(decodeReport(report({ 1: 0b0000_0001 }))).toEqual([8])
  })

  it('maps hat directions into the 300-303 range', () => {
    expect(decodeReport(report({ 2: 0 }))).toEqual([300])
    expect(decodeReport(report({ 2: 3 }))).toEqual([301, 302])
  })

  it('returns no buttons held for a neutral report', () => {
    expect(decodeReport(NEUTRAL.slice())).toEqual([])
  })

  it('returns sorted, de-duplicated IDs for a multi-button press', () => {
    const ids = decodeReport(report({ 0: 0b0000_1001, 2: 4 }))
    expect(ids).toEqual([0, 3, 302])
  })

  it('prefers a calibration override over the inferred default', () => {
    expect(DEFAULT_SOURCE_TO_ID['b0.0']).toBe(0)
    expect(decodeReport(report({ 0: 0b0000_0001 }), { 'b0.0': 3 })).toEqual([3])
  })

  it('leaves uncalibrated sources on their defaults', () => {
    expect(decodeReport(report({ 0: 0b0000_0011 }), { 'b0.0': 3 })).toEqual([1, 3])
  })

  it('collapses two sources calibrated to the same ID', () => {
    expect(decodeReport(report({ 0: 0b0000_0011 }), { 'b0.0': 5, 'b0.1': 5 })).toEqual([5])
  })
})
