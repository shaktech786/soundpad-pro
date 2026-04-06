/**
 * Background HID gamepad poller for SoundPad Pro.
 *
 * Reads the Pokken Controller (GP2040-CE Switch mode) directly via node-hid,
 * bypassing the Web Gamepad API which requires window focus.
 *
 * Sends button states to the renderer via IPC so gamepad triggers work
 * when OBS or any other app has focus.
 *
 * Report format (8 bytes, no report ID byte):
 *   byte 0: buttons high  — Y(0) B(1) A(2) X(3) L(4) R(5) ZL(6) ZR(7)
 *   byte 1: buttons low   — Minus(0) Plus(1) L3(2) R3(3) Home(4) Capture(5)
 *   byte 2: hat switch    — 0=Up 1=UpRight 2=Right 3=DownRight 4=Down 5=DownLeft 6=Left 7=UpLeft 8=Neutral
 *   byte 3: LX  (0-255, center=128)
 *   byte 4: LY  (0-255, center=128)
 *   byte 5: RX  (0-255, center=128)
 *   byte 6: RY  (0-255, center=128)
 *   byte 7: reserved
 *
 * Button IDs match Web Gamepad API indices so existing mappings keep working:
 *   0=B 1=A 2=Y 3=X 4=L 5=R 6=ZL 7=ZR 8=Minus 9=Plus 10=L3 11=R3 16=Home 17=Capture
 *   300=Up 301=Right 302=Down 303=Left
 */

const POKKEN_VID = 0x0F0D; // HORI CO.,LTD.
const POKKEN_PID = 0x0092; // POKKEN CONTROLLER

// HID byte0 bit → gamepad button index (matches Chrome Web Gamepad API mapping)
const BYTE0_MAP = [
  2,  // bit 0: Y → button 2
  0,  // bit 1: B → button 0
  1,  // bit 2: A → button 1
  3,  // bit 3: X → button 3
  4,  // bit 4: L → button 4
  5,  // bit 5: R → button 5
  6,  // bit 6: ZL → button 6
  7,  // bit 7: ZR → button 7
];

// HID byte1 bit → gamepad button index
const BYTE1_MAP = [
  8,  // bit 0: Minus → button 8
  9,  // bit 1: Plus  → button 9
  10, // bit 2: L3    → button 10
  11, // bit 3: R3    → button 11
  16, // bit 4: Home  → button 16
  17, // bit 5: Capture → button 17
];

// Hat switch byte → active direction button IDs (300=Up 301=Right 302=Down 303=Left)
const HAT_MAP = [
  [300],           // 0: Up
  [300, 301],      // 1: Up+Right
  [301],           // 2: Right
  [301, 302],      // 3: Down+Right
  [302],           // 4: Down
  [302, 303],      // 5: Down+Left
  [303],           // 6: Left
  [300, 303],      // 7: Up+Left
  [],              // 8: Neutral
];

class HIDGamepad {
  constructor(onStateChange) {
    this._onStateChange = onStateChange;
    this._device = null;
    this._reconnectTimer = null;
    this._stopped = false;
    this._prevStates = {};
    this._HID = null;
  }

  start() {
    this._stopped = false;
    this._tryConnect();
  }

  stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._closeDevice();
  }

  _tryConnect() {
    if (this._stopped) return;
    try {
      if (!this._HID) this._HID = require('node-hid');
      this._device = new this._HID.HID(POKKEN_VID, POKKEN_PID);
      console.log('[HIDGamepad] Connected to POKKEN CONTROLLER');

      this._device.on('data', (report) => this._onReport(report));
      this._device.on('error', (err) => {
        console.error('[HIDGamepad] Device error:', err.message);
        this._closeDevice();
        this._scheduleReconnect();
      });
    } catch (err) {
      // Device not found or can't open — retry later
      this._scheduleReconnect();
    }
  }

  _closeDevice() {
    if (this._device) {
      try { this._device.close(); } catch (_) {}
      this._device = null;
    }
    // Send all-released state so no buttons get stuck
    this._prevStates = {};
    this._onStateChange({});
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._tryConnect();
    }, 2000);
  }

  _onReport(report) {
    const states = {};

    // byte 0: buttons high
    const b0 = report[0];
    for (let i = 0; i < 8; i++) {
      if (b0 & (1 << i)) states[BYTE0_MAP[i]] = true;
    }

    // byte 1: buttons low
    const b1 = report[1];
    for (let i = 0; i < BYTE1_MAP.length; i++) {
      if (b1 & (1 << i)) states[BYTE1_MAP[i]] = true;
    }

    // byte 2: hat switch
    const hat = report[2];
    const dirs = (hat >= 0 && hat <= 7) ? HAT_MAP[hat] : [];
    for (const id of dirs) states[id] = true;

    // Only notify if state changed
    if (!this._statesEqual(states, this._prevStates)) {
      this._prevStates = states;
      this._onStateChange(states);
    }
  }

  _statesEqual(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => a[k] === b[k]);
  }
}

module.exports = { HIDGamepad };
