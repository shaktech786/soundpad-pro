// Global hotkey scheme for the 16 soundboard pads.
//
// 'numpad' is the original Ctrl+Numpad0-9(+ops) scheme. It's kept so anyone
// already relying on it is unaffected, but it is confirmed risky (see
// isGameRiskyHotkey in ./validation) — Raw Input games read the bare numpad
// scancode regardless of the Ctrl modifier, so the pad and the game both fire.
//
// 'function-keys' is the recommended scheme: F13-F24 have no physical key on
// standard keyboards, so essentially no game binds them. 16 pads need 16
// keys and F13-F24 is only 12, so the remaining 4 pads use Shift+F13-F16
// (verified accepted by Electron's globalShortcut.register on Windows).
import { isGameRiskyHotkey } from './validation'

export const HOTKEY_SCHEMES = ['numpad', 'function-keys'] as const
export type HotkeyScheme = typeof HOTKEY_SCHEMES[number]

const NUMPAD_KEYS = [
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
  'numdec', 'numadd', 'numsub', 'nummult', 'numdiv', 'numenter',
]

const NUMPAD_SCHEME_HOTKEYS = NUMPAD_KEYS.map(key => `CommandOrControl+${key}`)

const FUNCTION_KEYS_SCHEME_HOTKEYS = [
  'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
  'Shift+F13', 'Shift+F14', 'Shift+F15', 'Shift+F16',
]

/** Returns the 16 pad-index-ordered accelerator strings for a scheme. */
export function getPadHotkeys(scheme: HotkeyScheme): string[] {
  return scheme === 'function-keys' ? FUNCTION_KEYS_SCHEME_HOTKEYS : NUMPAD_SCHEME_HOTKEYS
}

/** How many of a scheme's 16 pad hotkeys are flagged as likely to leak into a game. */
export function countRiskyPadHotkeys(scheme: HotkeyScheme): number {
  return getPadHotkeys(scheme).filter(isGameRiskyHotkey).length
}
