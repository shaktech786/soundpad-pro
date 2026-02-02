import { ButtonPosition, LayoutPreset } from '../types/profile'

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

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    name: 'Haute42 (16 buttons)',
    description: 'Original Haute42 controller layout',
    layout: HAUTE42_LAYOUT,
  },
  {
    name: '4x4 Grid',
    description: '16 buttons in a 4x4 grid',
    layout: Array.from({ length: 16 }, (_, i) => ({
      id: i,
      x: 80 + (i % 4) * 120,
      y: 60 + Math.floor(i / 4) * 120,
    })),
  },
  {
    name: '3x3 Grid',
    description: '9 buttons in a 3x3 grid',
    layout: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      x: 140 + (i % 3) * 120,
      y: 80 + Math.floor(i / 3) * 120,
    })),
  },
  {
    name: '2x4 Grid',
    description: '8 buttons in a 2-row, 4-column grid',
    layout: Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 80 + (i % 4) * 120,
      y: 120 + Math.floor(i / 4) * 120,
    })),
  },
  {
    name: 'Blank Canvas',
    description: 'Start from scratch - add buttons manually',
    layout: [],
  },
]

export default APP_CONFIG