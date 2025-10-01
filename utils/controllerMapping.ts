// Xbox Controller button mapping
// Reference: https://w3c.github.io/gamepad/#remapping
export const XBOX_BUTTON_MAPPING = {
  0: 'A',           // Bottom face button (green)
  1: 'B',           // Right face button (red)
  2: 'X',           // Left face button (blue)
  3: 'Y',           // Top face button (yellow)
  4: 'LB',          // Left Bumper
  5: 'RB',          // Right Bumper
  6: 'LT',          // Left Trigger
  7: 'RT',          // Right Trigger
  8: 'Back/View',   // Back/View button
  9: 'Start/Menu',  // Start/Menu button
  10: 'LS',         // Left Stick (click)
  11: 'RS',         // Right Stick (click)
  12: 'DPad Up',    // D-Pad Up
  13: 'DPad Down',  // D-Pad Down
  14: 'DPad Left',  // D-Pad Left
  15: 'DPad Right', // D-Pad Right
  16: 'Home/Xbox',  // Xbox/Home button (if available)
} as const

// PlayStation Controller mapping (similar structure)
export const PS_BUTTON_MAPPING = {
  0: 'Cross (X)',    // Bottom face button
  1: 'Circle',       // Right face button
  2: 'Square',       // Left face button
  3: 'Triangle',     // Top face button
  4: 'L1',           // Left Bumper
  5: 'R1',           // Right Bumper
  6: 'L2',           // Left Trigger
  7: 'R2',           // Right Trigger
  8: 'Share',        // Share/Create button
  9: 'Options',      // Options button
  10: 'L3',          // Left Stick (click)
  11: 'R3',          // Right Stick (click)
  12: 'DPad Up',     // D-Pad Up
  13: 'DPad Down',   // D-Pad Down
  14: 'DPad Left',   // D-Pad Left
  15: 'DPad Right',  // D-Pad Right
  16: 'PS',          // PlayStation button
} as const

export type ButtonIndex = keyof typeof XBOX_BUTTON_MAPPING

export function getButtonName(index: number, controllerType: 'xbox' | 'playstation' = 'xbox'): string {
  const mapping = controllerType === 'xbox' ? XBOX_BUTTON_MAPPING : PS_BUTTON_MAPPING
  return mapping[index as ButtonIndex] || `Button ${index}`
}

// Helper to log button press with proper name
export function logButtonPress(index: number, pressed: boolean, controllerType: 'xbox' | 'playstation' = 'xbox') {
  const buttonName = getButtonName(index, controllerType)
  const state = pressed ? 'PRESSED' : 'RELEASED'
  console.log(`🎮 ${controllerType.toUpperCase()} Controller: ${buttonName} (Button ${index}) ${state}`)
}