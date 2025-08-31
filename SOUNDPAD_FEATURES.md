# SoundPad Pro - Enhanced Features

## Fixed & New Features

### 1. **Full Controller Support**
- Now detects ALL controller buttons including:
  - Standard buttons (A, B, X, Y, etc.)
  - Triggers (LT, RT)
  - Bumpers (LB, RB)
  - D-Pad buttons
  - Analog stick clicks
  - Analog stick movements (mapped as virtual buttons)
- Visual feedback shows button values and active states
- Support for up to 32 buttons + 8 axis directions

### 2. **Persistent Storage**
- Sound mappings are automatically saved to localStorage
- Settings and configurations persist between sessions
- No need to reconfigure after app restart
- Automatic sound preloading on startup

### 3. **Universal Stop Button**
- Press **ESC** key anytime to stop all playing audio
- Works globally even when app is not in focus
- Visual indicator in the UI shows the hotkey

### 4. **Global Hotkey System**
- Assign keyboard shortcuts to any sound button
- Hotkeys work even when app is not in focus
- Overrides conflicting shortcuts in other applications
- Support for modifier keys (Ctrl, Alt, Shift, Meta)
- Easy hotkey recording - just click "Set Hotkey" and press your desired key combination

### 5. **Settings Panel**
- Access via the Settings button in the header
- **Global Hotkeys Toggle**: Enable/disable global hotkey capture
  - When enabled: Hotkeys override other applications
  - When disabled: Normal keyboard behavior
- **Hotkey Management**: View and manage all assigned hotkeys
- **Bypass Option**: Temporarily disable global capture without losing configurations

## How to Use

### Starting the Application
```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start
```

### Configuring Sounds
1. Click "Configure" button
2. Press a controller button or click a pad
3. Select an audio file to map to that button
4. Click "Done" when finished

### Setting Up Hotkeys
1. Open Settings (gear icon)
2. Find the sound you want to assign a hotkey to
3. Click "Set Hotkey"
4. Press your desired key combination
5. The hotkey is instantly active

### Global Hotkey Behavior
- **With Global Hotkeys Enabled**: 
  - Your hotkeys work from any application
  - They override the same shortcuts in other apps
  - Perfect for streaming/gaming scenarios

- **With Global Hotkeys Disabled**:
  - Hotkeys only work when the app is focused
  - Other applications' shortcuts work normally

### Controller Tips
- Connect your controller before starting the app
- All buttons should be detected automatically
- Check the Controller Status panel to see active buttons
- Analog sticks can be used as buttons (push them past 50% threshold)

## Technical Details

### Storage Locations
- Sound mappings: `localStorage['soundpad-mappings']`
- Hotkey mappings: `localStorage['hotkey-mappings']`
- Global hotkeys state: `localStorage['global-hotkeys-enabled']`

### Supported Audio Formats
- MP3, WAV, OGG, M4A, FLAC
- Uses Howler.js for cross-platform audio playback
- HTML5 Audio with Web Audio API fallback

### Electron Integration
- Global shortcuts via `globalShortcut` API
- IPC communication for hotkey events
- Runs on Windows, macOS, and Linux

## Troubleshooting

### Controller Not Detected
- Ensure controller is connected before launching app
- Try pressing a button to activate detection
- Check browser/Electron console for errors

### Hotkeys Not Working
- Verify Global Hotkeys are enabled in Settings
- Check for conflicts with system shortcuts
- Some keys may be reserved by the OS

### Audio Issues
- Ensure audio files are in supported formats
- Check file paths are correct
- Verify system audio is not muted