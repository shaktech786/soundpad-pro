/**
 * Background HID poller for the Haute42 / Pokken Controller.
 *
 * Opens the device via node-hid and emits each distinct 8-byte report to the
 * caller. That's it — no decoding, no "virtual gamepad button indices", no
 * attempt to match Chrome's Web Gamepad API numbering. Callers do raw byte
 * matching, which is the only approach that doesn't get tripped by Chrome's
 * mystery mapping and that works for axis-based buttons.
 */

const POKKEN_VID = 0x0F0D; // HORI CO.,LTD.
const POKKEN_PID = 0x0092; // POKKEN CONTROLLER

// Neutral 8-byte report: nothing pressed, sticks centered.
const NEUTRAL = [0x00, 0x00, 0x08, 0x80, 0x80, 0x80, 0x80, 0x00];

// ---------------------------------------------------------------------------
// Report decoding
//
// The renderer's button-ID space (unchanged from the old Web Gamepad path, so
// existing user bindings keep working):
//   0-99     standard buttons, using Chrome's gamepad button index
//   100-199  analog axes: 100 + axisIndex*2 (positive), +1 (negative)
//   300-303  hat switch: Up, Right, Down, Left
//
// A "source" is a stable name for one physical input in the raw HID report:
//   'b0.3'   byte 0, bit 3          (digital button bytes are 0 and 1)
//   'hat.up' hat direction          (byte 2, values 0-7 = N,NE,E,SE,S,SW,W,NW; 8 = neutral)
//   'a3+'    byte 3 deflected high  (analog stick bytes are 3-6, neutral 0x80)
//   'a3-'    byte 3 deflected low
//
// DEFAULT_SOURCE_TO_ID maps each source to the ID Chrome *is expected* to have
// reported for it. It is derived from the Nintendo Switch / HORI Pokken HID
// report layout plus Chrome's generic HID mapper, which assigns button indices
// in report bit order and axis indices in report descriptor order.
//
// CONFIRMED vs INFERRED — see docs. Every entry below is INFERRED until a
// calibration run validates it. Calibration (pages/calibrate.tsx) records the
// real Chrome index for each source and persists overrides in electron-store
// under 'hidButtonCalibration', which are overlaid on top of this table at
// runtime. So a wrong guess here is fixable by the user without a rebuild.
//
// Confidence notes:
//  - hat.*  HIGH. The old Web Gamepad path decoded the hat from an axis whose
//           neutral read ~1.286, which is exactly (8*2/7)-1 — i.e. Chrome was
//           already reporting this same 0-7/8 hat byte. The direction order is
//           pinned by decodeHatSwitch()'s thresholds in the old hook.
//  - b0.*/b1.*  MEDIUM. Bit order (Y,B,A,X,L,R,ZL,ZR / Minus,Plus,L3,R3,Home,
//           Capture) is standard for Switch-mode reports, and Chrome's generic
//           mapper walks bits in order. But note this does NOT agree with
//           ACTION_TO_GAMEPAD_INDEX in main/gp2040ce-api.js:163, which is a
//           nominal/standard-mapping table (B1->0) rather than Switch bit order
//           (Y->0). Do not "fix" one against the other without calibration data.
//  - a3..a6  LOW. Which axis index Chrome assigns to each stick byte depends on
//           the report descriptor's usage order (assumed X, Y, Z, Rz). On an
//           all-buttons Haute42 the sticks usually sit neutral anyway — the hat
//           carries the directions — so this rarely matters in practice.
// ---------------------------------------------------------------------------

const DIGITAL_BYTES = [0, 1];
const DIGITAL_BIT_COUNT = { 0: 8, 1: 6 }; // byte 1 only uses bits 0-5
const HAT_BYTE = 2;
const AXIS_BYTES = [3, 4, 5, 6];

// Chrome normalizes an axis byte to (b / 127.5) - 1. The old hook treated
// |value| > 0.5 as a press, which is b > 191.25 / b < 63.75.
const AXIS_HIGH = 191;
const AXIS_LOW = 64;

// Hat byte value (0-7) -> which directions are held. Index 8+ is neutral.
const HAT_DIRECTIONS = [
  ['up'],
  ['up', 'right'],
  ['right'],
  ['right', 'down'],
  ['down'],
  ['down', 'left'],
  ['left'],
  ['up', 'left'],
];

const DEFAULT_SOURCE_TO_ID = {
  // byte 0 — Y, B, A, X, L, R, ZL, ZR
  'b0.0': 0,
  'b0.1': 1,
  'b0.2': 2,
  'b0.3': 3,
  'b0.4': 4,
  'b0.5': 5,
  'b0.6': 6,
  'b0.7': 7,
  // byte 1 — Minus(S1), Plus(S2), L3, R3, Home(A1), Capture(A2)
  'b1.0': 8,
  'b1.1': 9,
  'b1.2': 10,
  'b1.3': 11,
  'b1.4': 12,
  'b1.5': 13,
  // hat
  'hat.up': 300,
  'hat.right': 301,
  'hat.down': 302,
  'hat.left': 303,
  // sticks — LX, LY, RX, RY assumed to be Chrome axes 0, 1, 2, 3
  'a3+': 100, 'a3-': 101,
  'a4+': 102, 'a4-': 103,
  'a5+': 104, 'a5-': 105,
  'a6+': 106, 'a6-': 107,
};

/**
 * Which raw inputs are active in this report, as source names.
 * @param {number[]} report 8-byte report
 * @returns {string[]}
 */
function reportSources(report) {
  const sources = [];

  for (const byte of DIGITAL_BYTES) {
    const value = report[byte] || 0;
    for (let bit = 0; bit < DIGITAL_BIT_COUNT[byte]; bit++) {
      if (value & (1 << bit)) sources.push(`b${byte}.${bit}`);
    }
  }

  const hat = report[HAT_BYTE];
  if (hat >= 0 && hat < HAT_DIRECTIONS.length) {
    for (const dir of HAT_DIRECTIONS[hat]) sources.push(`hat.${dir}`);
  }

  for (const byte of AXIS_BYTES) {
    const value = report[byte];
    if (value > AXIS_HIGH) sources.push(`a${byte}+`);
    else if (value < AXIS_LOW) sources.push(`a${byte}-`);
  }

  return sources;
}

/**
 * Decode a raw report into the renderer's button-ID space.
 * @param {number[]} report 8-byte report
 * @param {Record<string, number>} [overrides] calibration overrides, source -> id
 * @returns {number[]} sorted, de-duplicated button IDs currently held
 */
function decodeReport(report, overrides) {
  const ids = new Set();
  for (const source of reportSources(report)) {
    const id = overrides && Object.prototype.hasOwnProperty.call(overrides, source)
      ? overrides[source]
      : DEFAULT_SOURCE_TO_ID[source];
    if (typeof id === 'number') ids.add(id);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

class HIDGamepad {
  /**
   * @param {(report: number[]) => void} onReport
   * @param {(connected: boolean) => void} [onStatus]
   */
  constructor(onReport, onStatus) {
    this._onReport = onReport;
    this._onStatus = onStatus || (() => {});
    this._device = null;
    this._reconnectTimer = null;
    this._stopped = false;
    this._prev = null;
    this._HID = null;
    this._connected = false;
  }

  start() {
    this._stopped = false;
    this._connect();
  }

  isConnected() {
    return this._connected;
  }

  stop() {
    this._stopped = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._close();
  }

  _connect() {
    if (this._stopped) return;
    try {
      if (!this._HID) this._HID = require('node-hid');
      this._device = new this._HID.HID(POKKEN_VID, POKKEN_PID);
      console.log('[HIDGamepad] Connected to POKKEN CONTROLLER');
      this._setConnected(true);
      this._device.on('data', (d) => this._onData(d));
      this._device.on('error', (err) => {
        console.error('[HIDGamepad] Device error:', err.message);
        this._close();
        this._reconnectTimer = setTimeout(() => this._connect(), 2000);
      });
    } catch (_) {
      this._reconnectTimer = setTimeout(() => this._connect(), 2000);
    }
  }

  _close() {
    if (this._device) {
      try { this._device.close(); } catch (_) {}
      this._device = null;
    }
    // Emit neutral so any held pattern releases cleanly
    this._prev = null;
    this._onReport(NEUTRAL.slice());
    this._setConnected(false);
  }

  _setConnected(connected) {
    if (this._connected === connected) return;
    this._connected = connected;
    this._onStatus(connected);
  }

  _onData(data) {
    const report = [0, 0, 0, 0, 0, 0, 0, 0];
    const n = Math.min(8, data.length);
    for (let i = 0; i < n; i++) report[i] = data[i];

    if (this._prev) {
      let same = true;
      for (let i = 0; i < 8; i++) { if (report[i] !== this._prev[i]) { same = false; break; } }
      if (same) return;
    }
    this._prev = report;
    this._onReport(report);
  }
}

module.exports = {
  HIDGamepad,
  NEUTRAL,
  decodeReport,
  reportSources,
  DEFAULT_SOURCE_TO_ID,
};
