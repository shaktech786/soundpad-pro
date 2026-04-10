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

class HIDGamepad {
  /** @param {(report: number[]) => void} onReport */
  constructor(onReport) {
    this._onReport = onReport;
    this._device = null;
    this._reconnectTimer = null;
    this._stopped = false;
    this._prev = null;
    this._HID = null;
  }

  start() {
    this._stopped = false;
    this._connect();
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

module.exports = { HIDGamepad, NEUTRAL };
