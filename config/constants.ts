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
}

export default APP_CONFIG