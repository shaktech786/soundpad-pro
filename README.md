# SoundPad Pro

Professional soundboard application for streamers with gamepad/controller support. Features a Haute42-style 4x4 pad layout with color-coded rows and modern visual design.

## Features

- 🎮 **Controller Support** - Full gamepad/controller integration with button mapping
- 🎨 **Professional UI** - MPC/Haute42-inspired 4x4 pad layout with color-coded rows
- 🔊 **Audio Engine** - Powered by Howler.js for reliable audio playback
- ⌨️ **Global Hotkeys** - Control sounds even when app is in background
- 💾 **Persistent Storage** - Saves all your mappings and settings
- 🎯 **Stop Button** - Configurable controller button to stop all audio
- 📁 **Easy Mapping** - Simple interface to assign sounds to controller buttons

## Installation

### From Installer (Recommended)

1. Run `npm run build:deploy` to build and create a desktop shortcut
2. Double-click the "SoundPad Pro Installer" shortcut on your desktop
3. The app will be installed and a shortcut created in your Start Menu

### Manual Build

```bash
# Install dependencies
npm install

# Build the installer
npm run build:win

# Create desktop shortcut to installer (optional)
npm run shortcut
```

## Development

```bash
# Start development server (Next.js + Electron)
npm run dev

# Run type checking
npm run type-check
```

## Building for Production

### Quick Deploy (Recommended)

```bash
# Build installer and create desktop shortcut in one command
npm run build:deploy
```

This will:
1. Build the Next.js application
2. Create Windows installer (.exe)
3. Automatically create/update desktop shortcut to latest installer

### Manual Build Steps

```bash
# Build Next.js app
npm run build

# Build Windows installer
npm run build:win

# Build portable version (optional)
npm run build:win:portable

# Create/update desktop shortcut
npm run shortcut
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes or major redesigns
- **MINOR** (0.X.0): New features (backwards compatible)
- **PATCH** (0.0.X): Bug fixes (backwards compatible)

Version history is maintained in [CHANGELOG.md](./CHANGELOG.md).

## Project Structure

```
soundpad-pro/
├── components/          # React components
│   ├── SoundPad.tsx    # Main 4x4 pad grid
│   ├── MappingConfig.tsx # Button mapping interface
│   └── Settings.tsx    # App settings and configuration
├── hooks/              # Custom React hooks
│   ├── useAudioEngine.ts # Audio playback engine
│   └── useGamepad.ts   # Controller input handling
├── main/               # Electron main process
├── pages/              # Next.js pages
├── styles/             # Global styles and Tailwind CSS
├── utils/              # Utility functions
└── dist/               # Build output (generated)
```

## Technologies

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Desktop**: Electron 27
- **Audio**: Howler.js
- **Storage**: electron-store
- **Build**: electron-builder

## Configuration

### Controller Setup

1. Connect your gamepad/controller
2. Click "Configure" in the app
3. Click "Click to map a button"
4. Press the controller button you want to map
5. Select an audio file

### Stop Button

Configure a controller button to stop all playing audio:
1. Open Settings
2. Under "Stop All Audio" > "Controller Button"
3. Click "Assign Controller Button"
4. Press the button you want to use

### Global Hotkeys

Enable keyboard shortcuts that work even when the app is in background:
1. Open Settings
2. Toggle "Global Hotkeys" to Enabled
3. Set hotkeys for individual buttons in the "Button Hotkey Mappings" section

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE: address already in use :::3005`:

```bash
# Windows
netstat -ano | findstr :3005
taskkill //PID <PID> //F
```

### Audio Not Playing

1. Check that audio files are in a supported format (MP3, WAV, OGG, M4A, FLAC, WebM, AAC, OPUS)
2. Verify the audio file path is valid
3. Check the browser console for error messages

### Controller Not Detected

1. Ensure controller is connected before starting the app
2. Try disconnecting and reconnecting the controller
3. Press any button on the controller to activate it
4. Check controller is recognized by Windows (Game Controllers in Control Panel)

## License

MIT

## Author

SoundPad Pro Team

---

**Current Version**: 2.1.0

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.