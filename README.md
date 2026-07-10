# SoundPad Pro

Professional soundboard application for streamers with gamepad/controller support. Features a Haute42-style 4x4 pad layout with color-coded rows and modern visual design. Doubles as a stream-control surface — a single pad can play a sound *and* switch an OBS scene, split a LiveSplit timer, or toggle your Discord mute at the same time.

SoundPad Pro is the desktop companion to [prelive](https://prelive.ai) — see [Part of the Prelive Ecosystem](#part-of-the-prelive-ecosystem) below.

## Features

### Soundboard

- 🎮 **Controller Support** - Full gamepad/controller integration with button mapping (Web Gamepad API + native HID via `node-hid` for GP2040-CE controllers)
- 🎨 **Professional UI** - MPC/Haute42-inspired 4x4 pad layout with color-coded rows
- 🔊 **Dual Audio Engines** - Howler.js for standard WDM playback, plus a low-latency ASIO engine (see below)
- ⌨️ **Global Hotkeys** - Control sounds even when app is in background
- 💾 **Persistent Storage** - Saves all your mappings, profiles, and settings
- 🎯 **Stop Button** - Configurable controller button to stop all audio
- 📁 **Easy Mapping** - Simple interface to assign sounds to controller buttons

### Streaming & Integrations

Each pad is dual-purpose: it can trigger a sound *and* an integration action on the same press.

- 🎬 **OBS Integration** - Scene switching, start/stop streaming and recording, replay-buffer control, source mute, and custom hotkeys over OBS WebSocket v5. See [docs/OBS_INTEGRATION.md](docs/OBS_INTEGRATION.md).
- 🏁 **LiveSplit Integration** - Drive a LiveSplit timer (start / split / reset / pause / skip / undo, plus smart-toggle) over the LiveSplit Server WebSocket.
- 🎙️ **Discord Integration** - Controller-mapped mute / deafen / push-to-talk voice control and now-playing Rich Presence, over Discord's local RPC pipe. See [docs/DISCORD_INTEGRATION.md](docs/DISCORD_INTEGRATION.md).
- 🕹️ **Foreground Game Detection** - Detects the focused game via `active-win` and exposes it at `GET http://127.0.0.1:3006/current-game` for OBS docks and overlays. See [docs/GAME_DETECTION.md](docs/GAME_DETECTION.md).
- 🎚️ **ASIO / VoiceMeeter Audio Routing** - Optional low-latency Direct mode (audify / RtAudio ASIO, ~10.7 ms buffer) that routes soundboard audio straight into VoiceMeeter for the stream mix. See [docs/audio-routing-architecture.md](docs/audio-routing-architecture.md).
- 📡 **OBS Dock Mode** - Compact browser-dock UI at `http://localhost:3005/dock` for controlling the pad from inside OBS. See [docs/OBS_INTEGRATION.md](docs/OBS_INTEGRATION.md).

## Part of the Prelive Ecosystem

SoundPad Pro is the desktop companion to **[prelive](https://prelive.ai)** — a web platform for stream prep, cross-posting, and OBS tooling for Twitch / YouTube / Kick streamers. The two apps integrate through a local-only HTTP server that SoundPad Pro runs on `127.0.0.1:3006` (bound to loopback, never exposed to the network):

- **Music Attribution** — SoundPad Pro broadcasts the currently-playing sound (with any `attribution.json` credits) at `GET /now-playing`. Prelive's [Music Attribution OBS dock](https://prelive.ai/dock/music-attribution) polls it to auto-credit CC-BY music to YouTube descriptions and Twitch chat.
- **Game / category auto-fill** — SoundPad Pro's [foreground game detection](docs/GAME_DETECTION.md) exposes the focused game at `GET /current-game`. Prelive's Quick Metadata Editor dock (`/dock/metadata`) uses it to auto-fill the streamer's currently-playing game/category.
- **Downloads** — Prelive's settings (Downloads tab) links to SoundPad Pro's GitHub releases.

SoundPad Pro's own [Discord integration](docs/DISCORD_INTEGRATION.md) (controller-mapped voice control + Rich Presence) is a distinct, complementary feature from prelive's Discord integration (account linking, community server, per-alert webhook routing); the two are not the same system.

Neither the local server nor prelive is required to use SoundPad Pro as a standalone soundboard.

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

Version history is tracked in the git commit log and GitHub releases.

## Project Structure

```
soundpad-pro/
├── components/          # React components (SoundPad, BoardBuilder, OBS/Discord/LiveSplit settings, ...)
├── contexts/            # React context providers for integrations
│   ├── OBSContext.tsx      # OBS WebSocket connection + actions
│   ├── DiscordContext.tsx  # Discord RPC voice control + Rich Presence
│   ├── LiveSplitContext.tsx # LiveSplit Server WebSocket
│   └── ThemeContext.tsx
├── hooks/              # Custom React hooks
│   ├── useAudioEngine.ts    # Audio playback engine (WDM + ASIO)
│   ├── useSimpleGamepad.ts  # Controller input handling
│   ├── useProfileManager.ts # Profile switching
│   └── usePersistentStorage.ts
├── main/               # Electron main process
│   ├── index.js             # App entry, IPC, lifecycle
│   ├── asio-audio-engine.js # audify/RtAudio ASIO Direct-mode engine
│   ├── discord-rpc-client.js # Discord RPC over local IPC pipe
│   ├── game-detection.js    # active-win foreground game classifier
│   ├── now-playing-server.js # Local 127.0.0.1:3006 HTTP server (prelive tie-in)
│   ├── gp2040ce-api.js      # GP2040-CE controller config
│   ├── hid-gamepad.js       # Native HID gamepad input (node-hid)
│   └── preload.js
├── types/              # TypeScript type definitions (electron.d.ts, profile.ts, ...)
├── config/             # App configuration
├── pages/              # Next.js pages (main app + /dock)
├── scripts/            # Setup/launch helper scripts
├── styles/             # Global styles and Tailwind CSS
├── utils/              # Utility functions
├── docs/               # Integration and architecture docs
├── __tests__/ · test/  # Vitest tests
└── dist/               # Build output (generated)
```

## Technologies

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Desktop**: Electron 40
- **Audio**: Howler.js (WDM mode) + audify / RtAudio ASIO (Direct mode)
- **Integrations**: obs-websocket-js (OBS), Discord RPC over local IPC, LiveSplit Server WebSocket, active-win (game detection), node-hid (native gamepad)
- **Storage**: electron-store
- **Build**: electron-builder
- **Tests**: Vitest

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

**Current Version**: 2.27.1

See the git commit log and GitHub releases for version history and updates.