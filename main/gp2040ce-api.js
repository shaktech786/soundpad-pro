/**
 * GP2040-CE REST API client (v0.7.x format)
 * Communicates with the controller's built-in web server at 192.168.7.1
 * when the controller is in web config mode (hold S2 on boot).
 *
 * v0.7.x API returns pin-based mappings: { pin00: actionId, pin01: actionId, ... }
 * where actionId is the GpioAction enum value.
 */
const http = require('http');

const GP2040_HOST = '192.168.7.1';
const GP2040_PORT = 80;
const TIMEOUT_MS = 3000;

// GpioAction enum from GP2040-CE proto/enums.proto
const GPIO_ACTION = {
  NONE: -10,
  RESERVED: -5,
  ASSIGNED_TO_ADDON: 0,
  BUTTON_PRESS_UP: 1,
  BUTTON_PRESS_DOWN: 2,
  BUTTON_PRESS_LEFT: 3,
  BUTTON_PRESS_RIGHT: 4,
  BUTTON_PRESS_B1: 5,
  BUTTON_PRESS_B2: 6,
  BUTTON_PRESS_B3: 7,
  BUTTON_PRESS_B4: 8,
  BUTTON_PRESS_L1: 9,
  BUTTON_PRESS_R1: 10,
  BUTTON_PRESS_L2: 11,
  BUTTON_PRESS_R2: 12,
  BUTTON_PRESS_S1: 13,
  BUTTON_PRESS_S2: 14,
  BUTTON_PRESS_A1: 15,
  BUTTON_PRESS_A2: 16,
  BUTTON_PRESS_L3: 17,
  BUTTON_PRESS_R3: 18,
  BUTTON_PRESS_FN: 19,
  BUTTON_PRESS_DDI_UP: 20,
  BUTTON_PRESS_DDI_DOWN: 21,
  BUTTON_PRESS_DDI_LEFT: 22,
  BUTTON_PRESS_DDI_RIGHT: 23,
  SUSTAIN_DP_MODE_DP: 24,
  SUSTAIN_DP_MODE_LS: 25,
  SUSTAIN_DP_MODE_RS: 26,
  SUSTAIN_SOCD_MODE_UP_PRIO: 27,
  SUSTAIN_SOCD_MODE_NEUTRAL: 28,
  SUSTAIN_SOCD_MODE_SECOND_WIN: 29,
  SUSTAIN_SOCD_MODE_FIRST_WIN: 30,
  SUSTAIN_SOCD_MODE_BYPASS: 31,
  BUTTON_PRESS_TURBO: 32,
  BUTTON_PRESS_MACRO: 33,
  BUTTON_PRESS_MACRO_1: 34,
  BUTTON_PRESS_MACRO_2: 35,
  BUTTON_PRESS_MACRO_3: 36,
  BUTTON_PRESS_MACRO_4: 37,
  BUTTON_PRESS_MACRO_5: 38,
  BUTTON_PRESS_MACRO_6: 39,
  CUSTOM_BUTTON_COMBO: 40,
  BUTTON_PRESS_A3: 41,
  BUTTON_PRESS_A4: 42,
  BUTTON_PRESS_E1: 43,
  BUTTON_PRESS_E2: 44,
  BUTTON_PRESS_E3: 45,
  BUTTON_PRESS_E4: 46,
  BUTTON_PRESS_E5: 47,
  BUTTON_PRESS_E6: 48,
  BUTTON_PRESS_E7: 49,
  BUTTON_PRESS_E8: 50,
  BUTTON_PRESS_E9: 51,
  BUTTON_PRESS_E10: 52,
  BUTTON_PRESS_E11: 53,
  BUTTON_PRESS_E12: 54,
  DIGITAL_DIRECTION_UP: 55,
  DIGITAL_DIRECTION_DOWN: 56,
  DIGITAL_DIRECTION_LEFT: 57,
  DIGITAL_DIRECTION_RIGHT: 58,
  ANALOG_DIRECTION_LS_X_NEG: 59,
  ANALOG_DIRECTION_LS_X_POS: 60,
  ANALOG_DIRECTION_LS_Y_NEG: 61,
  ANALOG_DIRECTION_LS_Y_POS: 62,
  ANALOG_DIRECTION_RS_X_NEG: 63,
  ANALOG_DIRECTION_RS_X_POS: 64,
  ANALOG_DIRECTION_RS_Y_NEG: 65,
  ANALOG_DIRECTION_RS_Y_POS: 66,
  ANALOG_DIRECTION_MOD_LOW: 67,
  ANALOG_DIRECTION_MOD_HIGH: 68,
  BUTTON_PRESS_INPUT_REVERSE: 69,
  SUSTAIN_FOCUS_MODE: 70,
  SUSTAIN_4_8_WAY_MODE: 71,
};

// Reverse lookup: actionId → action name
const ACTION_ID_TO_NAME = {};
for (const [name, id] of Object.entries(GPIO_ACTION)) {
  ACTION_ID_TO_NAME[id] = name;
}

// Human-readable labels for actions
const ACTION_LABELS = {
  NONE: 'None',
  RESERVED: 'Reserved',
  ASSIGNED_TO_ADDON: 'Addon',
  BUTTON_PRESS_UP: 'Up',
  BUTTON_PRESS_DOWN: 'Down',
  BUTTON_PRESS_LEFT: 'Left',
  BUTTON_PRESS_RIGHT: 'Right',
  BUTTON_PRESS_B1: 'B1 (B/Cross)',
  BUTTON_PRESS_B2: 'B2 (A/Circle)',
  BUTTON_PRESS_B3: 'B3 (Y/Triangle)',
  BUTTON_PRESS_B4: 'B4 (X/Square)',
  BUTTON_PRESS_L1: 'L1 (L/LB)',
  BUTTON_PRESS_R1: 'R1 (R/RB)',
  BUTTON_PRESS_L2: 'L2 (ZL/LT)',
  BUTTON_PRESS_R2: 'R2 (ZR/RT)',
  BUTTON_PRESS_S1: 'S1 (Minus/Select)',
  BUTTON_PRESS_S2: 'S2 (Plus/Start)',
  BUTTON_PRESS_A1: 'A1 (Home)',
  BUTTON_PRESS_A2: 'A2 (Capture)',
  BUTTON_PRESS_L3: 'L3 (LS Click)',
  BUTTON_PRESS_R3: 'R3 (RS Click)',
  BUTTON_PRESS_FN: 'Function',
  BUTTON_PRESS_DDI_UP: 'DDI Up',
  BUTTON_PRESS_DDI_DOWN: 'DDI Down',
  BUTTON_PRESS_DDI_LEFT: 'DDI Left',
  BUTTON_PRESS_DDI_RIGHT: 'DDI Right',
  BUTTON_PRESS_TURBO: 'Turbo',
  BUTTON_PRESS_A3: 'A3',
  BUTTON_PRESS_A4: 'A4',
  BUTTON_PRESS_E1: 'Extra 1',
  BUTTON_PRESS_E2: 'Extra 2',
  BUTTON_PRESS_E3: 'Extra 3',
  BUTTON_PRESS_E4: 'Extra 4',
  BUTTON_PRESS_E5: 'Extra 5',
  BUTTON_PRESS_E6: 'Extra 6',
  BUTTON_PRESS_E7: 'Extra 7',
  BUTTON_PRESS_E8: 'Extra 8',
  BUTTON_PRESS_E9: 'Extra 9',
  BUTTON_PRESS_E10: 'Extra 10',
  BUTTON_PRESS_E11: 'Extra 11',
  BUTTON_PRESS_E12: 'Extra 12',
  DIGITAL_DIRECTION_UP: 'Digital Up',
  DIGITAL_DIRECTION_DOWN: 'Digital Down',
  DIGITAL_DIRECTION_LEFT: 'Digital Left',
  DIGITAL_DIRECTION_RIGHT: 'Digital Right',
  ANALOG_DIRECTION_LS_X_NEG: 'LS X-',
  ANALOG_DIRECTION_LS_X_POS: 'LS X+',
  ANALOG_DIRECTION_LS_Y_NEG: 'LS Y-',
  ANALOG_DIRECTION_LS_Y_POS: 'LS Y+',
  ANALOG_DIRECTION_RS_X_NEG: 'RS X-',
  ANALOG_DIRECTION_RS_X_POS: 'RS X+',
  ANALOG_DIRECTION_RS_Y_NEG: 'RS Y-',
  ANALOG_DIRECTION_RS_Y_POS: 'RS Y+',
  ANALOG_DIRECTION_MOD_LOW: 'Mod Low',
  ANALOG_DIRECTION_MOD_HIGH: 'Mod High',
  BUTTON_PRESS_INPUT_REVERSE: 'Input Reverse',
  SUSTAIN_FOCUS_MODE: 'Focus Mode',
  SUSTAIN_4_8_WAY_MODE: '4/8-Way Mode',
  BUTTON_PRESS_TURBO: 'Turbo',
};

// Which actions produce a gamepad button in Switch mode
const ACTION_TO_GAMEPAD_INDEX = {
  BUTTON_PRESS_B1: 0,
  BUTTON_PRESS_B2: 1,
  BUTTON_PRESS_B3: 2,
  BUTTON_PRESS_B4: 3,
  BUTTON_PRESS_L1: 4,
  BUTTON_PRESS_R1: 5,
  BUTTON_PRESS_L2: 6,
  BUTTON_PRESS_R2: 7,
  BUTTON_PRESS_S1: 8,
  BUTTON_PRESS_S2: 9,
  BUTTON_PRESS_L3: 10,
  BUTTON_PRESS_R3: 11,
  BUTTON_PRESS_A1: 16,
  BUTTON_PRESS_A2: 17,
  BUTTON_PRESS_UP: 300,
  BUTTON_PRESS_DOWN: 302,
  BUTTON_PRESS_LEFT: 303,
  BUTTON_PRESS_RIGHT: 301,
};

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: GP2040_HOST,
      port: GP2040_PORT,
      path,
      timeout: TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.on('error', reject);
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: GP2040_HOST,
      port: GP2040_PORT,
      path,
      method: 'POST',
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

class GP2040ceApi {
  async checkConnection() {
    try {
      const version = await httpGet('/api/getFirmwareVersion');
      return { connected: true, version };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  /**
   * Get pin mappings. Handles both old (button→pin) and new v0.7.x (pin→action) formats.
   */
  async getPinMappings() {
    try {
      const data = await httpGet('/api/getPinMappings');

      // Always include raw data for debugging
      const rawData = data;

      // Detect format: v0.7.x has "pin00", "pin01", etc.
      const isNewFormat = typeof data === 'object' && Object.keys(data).some(k => /^pin\d{2}$/.test(k));

      let result;
      if (isNewFormat) {
        result = this._parseNewFormat(data);
      } else {
        result = this._parseOldFormat(data);
      }
      result.rawData = rawData;
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  _parseNewFormat(data) {
    // v0.7.x: { pin00: { action, customButtonMask, customDpadMask }, ..., profileLabel, enabled }
    // Also handles plain number format: { pin00: actionId, ... }
    const pins = [];
    const metadata = {};

    for (const [key, value] of Object.entries(data)) {
      const pinMatch = key.match(/^pin(\d{2})$/);
      if (pinMatch) {
        const gpioNum = parseInt(pinMatch[1], 10);
        // Handle both object { action: N } and plain number N formats
        let actionId;
        if (typeof value === 'object' && value !== null && 'action' in value) {
          actionId = value.action;
        } else if (typeof value === 'number') {
          actionId = value;
        } else {
          actionId = parseInt(value, 10);
        }
        const actionName = ACTION_ID_TO_NAME[actionId] || `UNKNOWN_${actionId}`;
        const label = ACTION_LABELS[actionName] || actionName;
        const gamepadIndex = ACTION_TO_GAMEPAD_INDEX[actionName] ?? null;

        pins.push({
          gpio: gpioNum,
          actionId,
          actionName,
          label,
          gamepadIndex,
          isActive: actionId > 0, // > 0 means assigned to a button action
        });
      } else {
        metadata[key] = value;
      }
    }

    // Sort by GPIO number
    pins.sort((a, b) => a.gpio - b.gpio);

    // Find duplicates: multiple GPIOs mapped to the same button action
    const actionToGpios = {};
    for (const pin of pins) {
      if (pin.actionId <= 0) continue; // skip NONE/RESERVED/ADDON
      if (!actionToGpios[pin.actionName]) actionToGpios[pin.actionName] = [];
      actionToGpios[pin.actionName].push(pin.gpio);
    }

    const duplicates = {};
    const issues = [];
    for (const [action, gpios] of Object.entries(actionToGpios)) {
      if (gpios.length > 1) {
        duplicates[action] = gpios;
        const label = ACTION_LABELS[action] || action;
        const gamepadId = ACTION_TO_GAMEPAD_INDEX[action];
        issues.push({
          type: 'duplicate',
          action,
          label,
          gpios,
          gamepadIndex: gamepadId ?? null,
          message: `${label} is mapped to ${gpios.length} GPIO pins: ${gpios.join(', ')} — these will appear as the SAME button (ID ${gamepadId ?? '?'})`,
        });
      }
    }

    // Find extra buttons (E1-E12) that won't produce gamepad output in Switch mode
    for (const pin of pins) {
      if (pin.actionName.startsWith('BUTTON_PRESS_E') && pin.gamepadIndex === null) {
        issues.push({
          type: 'no_gamepad_output',
          action: pin.actionName,
          gpio: pin.gpio,
          label: pin.label,
          message: `GPIO ${pin.gpio} → ${pin.label}: Extra buttons have NO output in Switch mode. This button is dead.`,
        });
      }
    }

    return {
      success: true,
      format: 'v07x',
      pins,
      metadata,
      duplicates,
      issues,
      actionToGpios,
    };
  }

  _parseOldFormat(data) {
    // Old format: { "Up": 2, "Down": 3, "B1": 5, ... }
    const pins = [];
    for (const [action, pin] of Object.entries(data)) {
      const gpioNum = typeof pin === 'number' ? pin : parseInt(pin, 10);
      const actionName = `BUTTON_PRESS_${action.toUpperCase()}`;
      pins.push({
        gpio: gpioNum,
        actionId: GPIO_ACTION[actionName] ?? -1,
        actionName,
        label: ACTION_LABELS[actionName] || action,
        gamepadIndex: ACTION_TO_GAMEPAD_INDEX[actionName] ?? null,
        isActive: gpioNum >= 0,
      });
    }
    return { success: true, format: 'legacy', pins, metadata: {}, duplicates: {}, issues: [], actionToGpios: {} };
  }

  async setPinMappings(mappings) {
    try {
      const result = await httpPost('/api/setPinMappings', mappings);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getGamepadOptions() {
    try {
      const data = await httpGet('/api/getGamepadOptions');
      return { success: true, options: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async setGamepadOptions(options) {
    try {
      const result = await httpPost('/api/setGamepadOptions', options);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getAddonsOptions() {
    try {
      const data = await httpGet('/api/getAddonsOptions');
      return { success: true, options: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { GP2040ceApi, GPIO_ACTION, ACTION_ID_TO_NAME, ACTION_LABELS, ACTION_TO_GAMEPAD_INDEX };
