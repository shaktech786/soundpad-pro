import { BoardTemplate, SupportedDeviceId } from '../types/profile'
import { HAUTE42_DEVICE_ID } from '../config/constants'

/**
 * Resolving a template's default button mapping against reality.
 *
 * DEFAULT_SOURCE_TO_ID in main/hid-gamepad.js — the table that turns raw HID
 * bits into the renderer's button-ID space — is explicitly marked INFERRED
 * until a calibration run (PRE-366, not yet done) validates it. A wrong
 * mapping silently applied to a profile is worse than no mapping at all: the
 * user thinks their board is set up and it just doesn't respond. So a
 * template's defaultButtonMapping is only trusted when every one of these
 * holds:
 *   1. the template actually ships a default mapping
 *   2. a device is connected
 *   3. that device is one the template explicitly claims to support
 *   4. that device has been calibrated at least once (hidButtonCalibration
 *      has overrides — calibration is what promotes "inferred" to "confirmed")
 * Any failure applies the template's geometry with an EMPTY mapping instead,
 * so the caller can prompt the user to calibrate or map manually.
 */

export interface TemplateMappingResult {
  /**
   * null  = the template has no default mapping to offer (most templates) —
   *         callers should leave any existing buttonMapping alone.
   * []    = the template has one, but it couldn't be trusted for the
   *         current device — callers should apply an empty mapping and
   *         prompt for calibration.
   * [...] = the resolved, trustworthy mapping.
   */
  buttonMapping: [number, number][] | null
  /** True only when a default mapping existed but had to be withheld. */
  needsCalibration: boolean
}

/**
 * The HID poller (main/hid-gamepad.js) only ever opens the Haute42
 * (HAUTE42_DEVICE_ID) — there is no other device this app currently
 * establishes a HID connection to. So the `connected` flag surfaced by
 * useSimpleGamepad()/hidGetState() is already a Haute42-identity signal, not
 * merely "some controller is plugged in". This turns that boolean into the
 * VID/PID shape BoardTemplate.supportedDevices expects, so the gating logic
 * stays driven by the declared device marker instead of hardcoding "Haute42"
 * as a special case in the resolver itself.
 */
export function connectedDeviceId(haute42Connected: boolean): SupportedDeviceId | null {
  return haute42Connected ? HAUTE42_DEVICE_ID : null
}

function deviceIsSupported(template: BoardTemplate, device: SupportedDeviceId | null): boolean {
  if (!template.supportedDevices) return false
  if (template.supportedDevices === 'generic') return true
  if (!device) return false
  return template.supportedDevices.some(d => d.vid === device.vid && d.pid === device.pid)
}

export function resolveTemplateMapping(
  template: BoardTemplate,
  device: SupportedDeviceId | null,
  isCalibrated: boolean
): TemplateMappingResult {
  const hasDefault = !!template.defaultButtonMapping && template.defaultButtonMapping.length > 0

  if (!hasDefault) {
    return { buttonMapping: null, needsCalibration: false }
  }

  if (!device || !deviceIsSupported(template, device) || !isCalibrated) {
    return { buttonMapping: [], needsCalibration: true }
  }

  return { buttonMapping: [...template.defaultButtonMapping!], needsCalibration: false }
}

/** True once the user has run calibration at least once (any overrides saved). */
export function hasCalibratedDevice(overrides: Record<string, number> | null | undefined): boolean {
  return !!overrides && Object.keys(overrides).length > 0
}
