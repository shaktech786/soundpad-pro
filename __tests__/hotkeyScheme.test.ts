import { describe, test, expect } from 'vitest'
import { getPadHotkeys, countRiskyPadHotkeys, HOTKEY_SCHEMES } from '../utils/hotkeyScheme'

describe('getPadHotkeys', () => {
  test('numpad scheme returns the existing Ctrl+Numpad bindings for all 16 pads', () => {
    expect(getPadHotkeys('numpad')).toEqual([
      'CommandOrControl+num0', 'CommandOrControl+num1', 'CommandOrControl+num2', 'CommandOrControl+num3',
      'CommandOrControl+num4', 'CommandOrControl+num5', 'CommandOrControl+num6', 'CommandOrControl+num7',
      'CommandOrControl+num8', 'CommandOrControl+num9', 'CommandOrControl+numdec', 'CommandOrControl+numadd',
      'CommandOrControl+numsub', 'CommandOrControl+nummult', 'CommandOrControl+numdiv', 'CommandOrControl+numenter',
    ])
  })

  test('function-keys scheme uses F13-F24 for the first 12 pads, Shift+F13-F16 for the rest', () => {
    expect(getPadHotkeys('function-keys')).toEqual([
      'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
      'Shift+F13', 'Shift+F14', 'Shift+F15', 'Shift+F16',
    ])
  })

  test('both schemes cover exactly 16 pads', () => {
    expect(getPadHotkeys('numpad')).toHaveLength(16)
    expect(getPadHotkeys('function-keys')).toHaveLength(16)
  })
})

describe('countRiskyPadHotkeys', () => {
  test('numpad scheme is entirely risky — Raw Input games see the scancode regardless of the Ctrl modifier', () => {
    expect(countRiskyPadHotkeys('numpad')).toBe(16)
  })

  test('function-keys scheme has zero risky bindings', () => {
    expect(countRiskyPadHotkeys('function-keys')).toBe(0)
  })
})

describe('HOTKEY_SCHEMES', () => {
  test('lists both supported schemes', () => {
    expect(HOTKEY_SCHEMES).toEqual(['numpad', 'function-keys'])
  })
})
