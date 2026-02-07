const HID = require('node-hid');

// Known gamepad devices (add more as needed)
const KNOWN_GAMEPADS = [
  { vendorId: 0x0F0D, productId: 0x0092, name: 'HORI POKKEN / Haute42' },
  { vendorId: 0x0F0D, productId: 0x00C1, name: 'HORI Fighting Stick' },
  { vendorId: 0x0F0D, productId: 0x011C, name: 'HORI Fighting Commander' },
];

class HIDGamepad {
  constructor(onButtonChange) {
    this.onButtonChange = onButtonChange;
    this.device = null;
    this.buttonStates = new Map();
    this.lastData = null;
    this.reconnectTimer = null;
  }

  findGamepad() {
    const devices = HID.devices();

    // Debug: log all matching devices
    const matchingDevices = devices.filter(d =>
      d.vendorId === 0x0F0D && d.productId === 0x0092
    );
    console.log('[HID Gamepad] All matching interfaces:', JSON.stringify(matchingDevices.map(d => ({
      path: d.path,
      usagePage: d.usagePage,
      usage: d.usage,
      interface: d.interface
    })), null, 2));

    // Try known gamepads first
    for (const known of KNOWN_GAMEPADS) {
      const device = devices.find(d =>
        d.vendorId === known.vendorId &&
        d.productId === known.productId &&
        d.usagePage === 1 &&
        (d.usage === 4 || d.usage === 5) // Joystick or Gamepad
      );
      if (device) {
        console.log(`[HID Gamepad] Found known device: ${known.name}`);
        console.log(`[HID Gamepad] Using path: ${device.path}`);
        return device;
      }
    }

    // Fallback: find any gamepad-like device
    const gamepad = devices.find(d =>
      d.usagePage === 1 &&
      (d.usage === 4 || d.usage === 5) &&
      !d.product?.toLowerCase().includes('vjoy') // Exclude virtual joysticks
    );

    if (gamepad) {
      console.log(`[HID Gamepad] Found device: ${gamepad.product || 'Unknown'}`);
    }

    return gamepad;
  }

  connect() {
    try {
      const deviceInfo = this.findGamepad();

      if (!deviceInfo) {
        console.log('[HID Gamepad] No gamepad found, will retry...');
        this.scheduleReconnect();
        return false;
      }

      this.device = new HID.HID(deviceInfo.path);
      console.log(`[HID Gamepad] Connected to: ${deviceInfo.product || deviceInfo.path}`);

      // Use polling instead of events - more reliable on Windows
      this.startPolling();

      return true;
    } catch (err) {
      console.error('[HID Gamepad] Connection failed:', err.message);
      this.scheduleReconnect();
      return false;
    }
  }

  startPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    // Debug: try one read immediately to see what happens
    try {
      console.log('[HID Gamepad] Attempting initial read...');
      const testData = this.device.readTimeout(100);
      console.log('[HID Gamepad] Initial read result:', testData, 'type:', typeof testData, 'length:', testData?.length);
    } catch (err) {
      console.error('[HID Gamepad] Initial read error:', err.message);
    }

    // Poll at ~60fps
    this.pollTimer = setInterval(() => {
      if (!this.device) {
        this.stopPolling();
        return;
      }

      try {
        // Non-blocking read with timeout
        const data = this.device.readTimeout(16);
        if (data && data.length > 0) {
          if (!this.dataReceived) {
            console.log('[HID Gamepad] First data received via polling, length:', data.length);
            this.dataReceived = true;
          }
          this.handleData(data);
        }
      } catch (err) {
        console.error('[HID Gamepad] Read error:', err.message);
        this.stopPolling();
        this.disconnect();
        this.scheduleReconnect();
      }
    }, 16);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  disconnect() {
    this.stopPolling();
    if (this.device) {
      try {
        this.device.close();
      } catch (e) {
        // Ignore close errors
      }
      this.device = null;
    }
    this.buttonStates.clear();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  handleData(data) {
    // Debug: log raw HID data occasionally
    if (!this.debugCounter) this.debugCounter = 0;
    this.debugCounter++;
    if (this.debugCounter % 100 === 1) {
      console.log('[HID Gamepad] Raw data:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }

    const newStates = new Map();

    // Parse buttons - need to determine correct byte positions
    // Log when any byte changes to help identify button bytes
    if (this.lastData) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== this.lastData[i]) {
          console.log(`[HID Gamepad] Byte ${i} changed: ${this.lastData[i].toString(16)} -> ${data[i].toString(16)}`);
        }
      }
    }

    // Parse buttons (bytes 3-4 typically contain button bits)
    // This is a generic parser - may need adjustment for specific controllers
    if (data.length >= 5) {
      const buttons1 = data[3] || 0;
      const buttons2 = data[4] || 0;

      // Map individual bits to button indices
      for (let i = 0; i < 8; i++) {
        newStates.set(i, (buttons1 & (1 << i)) !== 0);
        newStates.set(i + 8, (buttons2 & (1 << i)) !== 0);
      }

      // Parse hat switch / D-pad (byte 5 or embedded in other bytes)
      // Common hat values: 0=up, 1=upright, 2=right, 3=downright, 4=down, 5=downleft, 6=left, 7=upleft, 8/15=neutral
      const hat = data[5] !== undefined ? data[5] & 0x0F : 8;

      // D-pad as virtual buttons (indices 100-103: up, down, left, right)
      newStates.set(100, hat === 0 || hat === 1 || hat === 7); // Up
      newStates.set(101, hat === 4 || hat === 3 || hat === 5); // Down
      newStates.set(102, hat === 6 || hat === 5 || hat === 7); // Left
      newStates.set(103, hat === 2 || hat === 1 || hat === 3); // Right
    }

    // Check for changes and emit
    let hasChanges = false;
    for (const [btn, pressed] of newStates) {
      if (this.buttonStates.get(btn) !== pressed) {
        hasChanges = true;
        this.buttonStates.set(btn, pressed);
        if (pressed) {
          console.log(`[HID Gamepad] Button ${btn} PRESSED`);
        }
      }
    }

    // Save for next comparison
    this.lastData = Buffer.from(data);

    if (hasChanges && this.onButtonChange) {
      this.onButtonChange(Object.fromEntries(this.buttonStates));
    }
  }

  getButtonStates() {
    return Object.fromEntries(this.buttonStates);
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnect();
  }
}

module.exports = { HIDGamepad };
