import { ButtonPosition, BoardTemplate } from '../types/profile'

// Application configuration constants

export const APP_CONFIG = {
  // Controller settings
  CONTROLLER: {
    MAX_BUTTONS: 32,
    MAX_AXES: 4,
    AXIS_THRESHOLD: 0.5,
    RECONNECT_INTERVAL: 500, // ms
    POLLING_RATE: 60, // fps
    BUTTON_RELEASE_DELAY: 30, // ms
  },
  
  // Audio settings
  AUDIO: {
    SUPPORTED_FORMATS: ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'flac', 'aac', 'opus', 'weba'],
    SUPPORTED_MIME_TYPES: [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac',
      'audio/opus', 'audio/x-m4a'
    ],
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    PRELOAD: true,
    HTML5: true,
    DEFAULT_VOLUME: 1.0,
  },
  
  // UI settings
  UI: {
    DEFAULT_PAD_COUNT: 16,
    MAX_PAD_COUNT: 32,
    GRID_COLS: {
      SMALL: 4,   // <= 16 pads
      MEDIUM: 5,  // <= 20 pads
      LARGE: 6,   // <= 24 pads
      XLARGE: 8,  // > 24 pads
    },
    PAD_HEIGHT: 'h-20',
    ANIMATION_DURATION: 300, // ms
  },
  
  // Storage settings
  STORAGE: {
    KEYS: {
      SOUND_MAPPINGS: 'soundpad-mappings',
      HOTKEY_MAPPINGS: 'soundpad-hotkeys',
      GLOBAL_HOTKEYS_ENABLED: 'soundpad-global-hotkeys',
      SETTINGS: 'soundpad-settings',
      WINDOW_BOUNDS: 'soundpad-window-bounds',
    },
    BACKUP_PREFIX: 'soundpad-backup',
  },
  
  // Window settings
  WINDOW: {
    DEFAULT_WIDTH: 1400,
    DEFAULT_HEIGHT: 900,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600,
    TITLE: 'SoundPad Pro',
  },
  
  // Development settings
  DEV: {
    PORT: 3005,
    HOT_RELOAD: true,
  },
  
  // Performance settings
  PERFORMANCE: {
    DEBOUNCE_DELAY: 100, // ms
    THROTTLE_DELAY: 50, // ms
    MAX_CONCURRENT_LOADS: 5,
  },

  // Profile settings
  PROFILES: {
    MAX_PROFILES: 20,
    DEFAULT_PROFILE_NAME: 'Default',
    STORAGE_KEYS: {
      PROFILES: 'soundpad-profiles',
      ACTIVE_PROFILE: 'soundpad-active-profile',
      BOARD_LAYOUT: 'soundpad-board-layout',
      BUTTON_SHAPE: 'soundpad-button-shape',
    },
  },
}

// Haute42 original 16-button layout
export const HAUTE42_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 191, y: 125 },
  { id: 1, x: 550, y: 111 },
  { id: 2, x: 388, y: 249 },
  { id: 3, x: 202, y: 44 },
  { id: 4, x: 261, y: 152 },
  { id: 5, x: 340, y: 119 },
  { id: 6, x: 479, y: 110 },
  { id: 7, x: 532, y: 187 },
  { id: 8, x: 117, y: 121 },
  { id: 9, x: 345, y: 41 },
  { id: 10, x: 293, y: 289 },
  { id: 11, x: 217, y: 273 },
  { id: 12, x: 413, y: 113 },
  { id: 13, x: 323, y: 197 },
  { id: 14, x: 390, y: 183 },
  { id: 15, x: 460, y: 183 },
]

// Hitbox-style leverless directional cluster: Left, two redundant Down buttons
// (one under each hand — the real Hitbox's signature feature), and Right, laid
// out in a single row rather than a cross.
const HITBOX_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 40, y: 380 },   // Left
  { id: 1, x: 110, y: 380 },  // Down (left hand)
  { id: 2, x: 180, y: 380 },  // Down (right hand)
  { id: 3, x: 250, y: 380 },  // Right
  // 8 action buttons, staggered in two curved rows to the upper right
  { id: 4, x: 340, y: 200 },
  { id: 5, x: 400, y: 190 },
  { id: 6, x: 460, y: 185 },
  { id: 7, x: 520, y: 185 },
  { id: 8, x: 340, y: 270 },
  { id: 9, x: 400, y: 260 },
  { id: 10, x: 460, y: 250 },
  { id: 11, x: 520, y: 245 },
]

// Stickless WASD: classic inverted-T arrow-key cluster (Up centered above Down)
// plus a blocky 2x4 action grid — squarer and less curved than an arcade cluster.
const STICKLESS_WASD_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 110, y: 300 }, // Up
  { id: 1, x: 40, y: 370 },  // Left
  { id: 2, x: 110, y: 370 }, // Down
  { id: 3, x: 180, y: 370 }, // Right
  { id: 4, x: 320, y: 300 },
  { id: 5, x: 380, y: 300 },
  { id: 6, x: 440, y: 300 },
  { id: 7, x: 500, y: 300 },
  { id: 8, x: 320, y: 360 },
  { id: 9, x: 380, y: 360 },
  { id: 10, x: 440, y: 360 },
  { id: 11, x: 500, y: 360 },
]

// Vewlix 8-button: the classic arcade-cabinet "banana" curve — two staggered
// rows of 4 that sweep upward left-to-right.
const VEWLIX_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 100, y: 280 },
  { id: 1, x: 170, y: 260 },
  { id: 2, x: 240, y: 245 },
  { id: 3, x: 310, y: 235 },
  { id: 4, x: 150, y: 180 },
  { id: 5, x: 220, y: 165 },
  { id: 6, x: 290, y: 155 },
  { id: 7, x: 360, y: 150 },
]

// Sega / Astro City 6-button: a gentler, shallower curve than Vewlix, 3x2.
const ASTRO_CITY_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 100, y: 280 },
  { id: 1, x: 170, y: 270 },
  { id: 2, x: 240, y: 265 },
  { id: 3, x: 130, y: 200 },
  { id: 4, x: 200, y: 190 },
  { id: 5, x: 270, y: 185 },
]

// Noir 8-button: near-straight rows (minimal curve), distinct from Vewlix's
// pronounced diagonal sweep.
const NOIR_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 100, y: 270 },
  { id: 1, x: 170, y: 268 },
  { id: 2, x: 240, y: 266 },
  { id: 3, x: 310, y: 264 },
  { id: 4, x: 100, y: 200 },
  { id: 5, x: 170, y: 198 },
  { id: 6, x: 240, y: 196 },
  { id: 7, x: 310, y: 194 },
]

// Gamepad face layout: ABXY-style diamond, 4 shoulder buttons (bumper+trigger
// per side), and start/select in the middle.
const GAMEPAD_FACE_LAYOUT: ButtonPosition[] = [
  { id: 0, x: 560, y: 150 }, // face: top
  { id: 1, x: 600, y: 190 }, // face: right
  { id: 2, x: 560, y: 230 }, // face: bottom
  { id: 3, x: 520, y: 190 }, // face: left
  { id: 4, x: 80, y: 30 },   // left trigger
  { id: 5, x: 80, y: 90 },   // left bumper
  { id: 6, x: 650, y: 30 },  // right trigger
  { id: 7, x: 650, y: 90 },  // right bumper
  { id: 8, x: 340, y: 200 }, // select
  { id: 9, x: 420, y: 200 }, // start
]

const MPC_4X4_LAYOUT: ButtonPosition[] = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: 80 + (i % 4) * 120,
  y: 60 + Math.floor(i / 4) * 120,
}))

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'haute42-16',
    name: 'Haute42 (16 buttons)',
    description: 'Original Haute42 leverless controller layout',
    layout: HAUTE42_LAYOUT,
    buttonShape: 'circle',
    category: 'leverless',
  },
  {
    id: 'hitbox-12',
    name: 'Hitbox / All-Button',
    description: 'Leverless all-button layout with dual Down buttons and 8 action buttons',
    layout: HITBOX_LAYOUT,
    buttonShape: 'circle',
    category: 'leverless',
  },
  {
    id: 'stickless-wasd-12',
    name: 'Stickless WASD',
    description: 'Keyboard-style inverted-T direction cluster with a blocky action grid',
    layout: STICKLESS_WASD_LAYOUT,
    buttonShape: 'square',
    category: 'leverless',
  },
  {
    id: 'vewlix-8',
    name: 'Vewlix 8-Button',
    description: 'The classic curved 2x4 Vewlix arcade cabinet cluster',
    layout: VEWLIX_LAYOUT,
    buttonShape: 'circle',
    category: 'arcade',
  },
  {
    id: 'astro-city-6',
    name: 'Sega / Astro City 6-Button',
    description: 'Gently curved 2x3 Astro City cabinet cluster',
    layout: ASTRO_CITY_LAYOUT,
    buttonShape: 'circle',
    category: 'arcade',
  },
  {
    id: 'noir-8',
    name: 'Noir 8-Button',
    description: 'Straight-row 2x4 arcade cluster, flatter than the Vewlix curve',
    layout: NOIR_LAYOUT,
    buttonShape: 'circle',
    category: 'arcade',
  },
  {
    id: 'gamepad-face-10',
    name: 'Gamepad Face Layout',
    description: 'ABXY-style face diamond, 4 shoulder buttons, and start/select',
    layout: GAMEPAD_FACE_LAYOUT,
    buttonShape: 'circle',
    category: 'gamepad',
  },
  {
    id: 'mpc-4x4',
    name: 'MPC 4x4 Grid',
    description: '16 buttons in a 4x4 MPC-style pad grid',
    layout: MPC_4X4_LAYOUT,
    buttonShape: 'square',
    category: 'grid',
  },
  {
    id: 'blank-canvas',
    name: 'Blank Canvas',
    description: 'Start from scratch - add buttons manually',
    layout: [],
    buttonShape: 'circle',
    category: 'grid',
  },
]

/** @deprecated use BOARD_TEMPLATES — kept as an alias so old imports keep compiling. */
export const LAYOUT_PRESETS = BOARD_TEMPLATES

export default APP_CONFIG