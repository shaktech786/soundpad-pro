import { describe, test, expect } from 'vitest'
import { connectedDeviceId, resolveTemplateMapping, hasCalibratedDevice } from '../utils/templateMapping'
import { BOARD_TEMPLATES, HAUTE42_DEVICE_ID, HAUTE42_DEFAULT_BUTTON_MAPPING } from '../config/constants'
import type { BoardTemplate } from '../types/profile'

const haute42Template = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
const OTHER_DEVICE = { vid: 0x1234, pid: 0x5678 }

describe('connectedDeviceId', () => {
  test('maps a connected Haute42 HID signal to its VID/PID', () => {
    expect(connectedDeviceId(true)).toEqual(HAUTE42_DEVICE_ID)
  })

  test('returns null when no device is connected', () => {
    expect(connectedDeviceId(false)).toBeNull()
  })
})

describe('resolveTemplateMapping', () => {
  test('a template with no defaultButtonMapping never offers one, regardless of device state', () => {
    const template = BOARD_TEMPLATES.find(t => t.id === 'vewlix-8')!
    expect(template.defaultButtonMapping).toBeUndefined()

    const result = resolveTemplateMapping(template, HAUTE42_DEVICE_ID, true)
    expect(result).toEqual({ buttonMapping: null, needsCalibration: false })
  })

  test('a supported, connected, calibrated device gets the full default mapping', () => {
    const result = resolveTemplateMapping(haute42Template, HAUTE42_DEVICE_ID, true)
    expect(result.needsCalibration).toBe(false)
    expect(result.buttonMapping).toEqual(HAUTE42_DEFAULT_BUTTON_MAPPING)
    expect(result.buttonMapping!.length).toBeGreaterThan(0)
  })

  test('no device connected falls back to an empty mapping with a calibration prompt', () => {
    const result = resolveTemplateMapping(haute42Template, null, true)
    expect(result).toEqual({ buttonMapping: [], needsCalibration: true })
  })

  test('a device the template does not claim to support falls back to an empty mapping', () => {
    const result = resolveTemplateMapping(haute42Template, OTHER_DEVICE, true)
    expect(result).toEqual({ buttonMapping: [], needsCalibration: true })
  })

  test('a supported but never-calibrated device falls back to an empty mapping', () => {
    const result = resolveTemplateMapping(haute42Template, HAUTE42_DEVICE_ID, false)
    expect(result).toEqual({ buttonMapping: [], needsCalibration: true })
  })

  test('never derives a mapping from a template with an empty defaultButtonMapping array', () => {
    const template: BoardTemplate = {
      ...haute42Template,
      defaultButtonMapping: [],
    }
    const result = resolveTemplateMapping(template, HAUTE42_DEVICE_ID, true)
    expect(result).toEqual({ buttonMapping: null, needsCalibration: false })
  })

  test('supportedDevices: "generic" applies regardless of device identity, once calibrated', () => {
    const template: BoardTemplate = {
      ...haute42Template,
      supportedDevices: 'generic',
    }
    const result = resolveTemplateMapping(template, OTHER_DEVICE, true)
    expect(result.buttonMapping).toEqual(haute42Template.defaultButtonMapping)
    expect(result.needsCalibration).toBe(false)
  })

  test('the resolved mapping is a copy, not a reference to the template constant', () => {
    const result = resolveTemplateMapping(haute42Template, HAUTE42_DEVICE_ID, true)
    expect(result.buttonMapping).not.toBe(haute42Template.defaultButtonMapping)
  })
})

describe('hasCalibratedDevice', () => {
  test('false for missing or empty overrides', () => {
    expect(hasCalibratedDevice(undefined)).toBe(false)
    expect(hasCalibratedDevice(null)).toBe(false)
    expect(hasCalibratedDevice({})).toBe(false)
  })

  test('true once at least one override has been saved', () => {
    expect(hasCalibratedDevice({ 'b0.0': 0 })).toBe(true)
  })
})

describe('Haute42 default mapping does not derive from ACTION_TO_GAMEPAD_INDEX', () => {
  test('every mapped physical id stays within hid-gamepad.js\'s documented ID space', () => {
    // 0-99 standard buttons, 100-199 analog axes, 300-303 hat switch.
    // ACTION_TO_GAMEPAD_INDEX (main/gp2040ce-api.js) uses id 16/17 for
    // A1/A2 (Home/Capture) which this mapping deliberately excludes.
    for (const [, physicalId] of HAUTE42_DEFAULT_BUTTON_MAPPING) {
      const inDigitalRange = physicalId >= 0 && physicalId <= 13
      const inHatRange = physicalId >= 300 && physicalId <= 303
      expect(inDigitalRange || inHatRange).toBe(true)
    }
  })

  test('maps every visual pad id in the Haute42 layout exactly once', () => {
    const layoutIds = haute42Template.layout.map(b => b.id).sort((a, b) => a - b)
    const mappedIds = HAUTE42_DEFAULT_BUTTON_MAPPING.map(([visualId]) => visualId).sort((a, b) => a - b)
    expect(mappedIds).toEqual(layoutIds)
  })

  test('maps to distinct physical ids (no two pads fight over one button)', () => {
    const physicalIds = HAUTE42_DEFAULT_BUTTON_MAPPING.map(([, physicalId]) => physicalId)
    expect(new Set(physicalIds).size).toBe(physicalIds.length)
  })
})
