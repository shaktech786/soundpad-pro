# OBS Studio Integration

SoundPad Pro now supports full integration with OBS Studio, allowing you to control your stream directly from your Haute42 controller!

## Features

- **Dual-Purpose Buttons**: Each pad can trigger both sounds AND OBS actions simultaneously
- **Real-time OBS Status**: See streaming, recording, and replay buffer status at a glance
- **Scene Switching**: Change scenes instantly with controller buttons
- **Source Control**: Toggle mute on audio sources
- **Stream Control**: Start/stop streaming and recording
- **Replay Buffer**: Start, stop, and save replay buffer clips
- **Custom Hotkeys**: Trigger any OBS hotkey
- **Visual Indicators**: Pads with OBS actions show a 🎬 badge

## Setup Instructions

### 1. Enable OBS WebSocket

1. Open OBS Studio
2. Go to **Tools** → **WebSocket Server Settings**
3. Check **Enable WebSocket server**
4. Note the **Server Port** (default: 4455)
5. Set a **Server Password** (recommended for security)
6. Click **OK**

### 2. Connect SoundPad Pro to OBS

1. In SoundPad Pro, click the **CONNECT TO OBS** button
2. Enter your OBS connection details:
   - **Server Address**: `localhost` (if OBS is on the same computer)
   - **Port**: `4455` (or your custom port)
   - **Password**: Enter the password you set in OBS
3. Click **Connect to OBS**
4. You should see a green "Connected to OBS" indicator

### 3. Assign OBS Actions to Pads

Once connected, you can assign OBS actions to any pad:

**Method 1: Right-Click**
- Right-click any pad to open the OBS Action Assigner

**Method 2: Alt+Click**
- Hold Alt and click any pad

**Available Actions:**
- 🔴 Start Stream
- ⚫ Stop Stream
- ⏺️ Start Recording
- ⏹️ Stop Recording
- ▶️ Start Replay Buffer
- ⏹️ Stop Replay Buffer
- 💾 Save Replay
- 🎬 Switch Scene
- 🔇 Toggle Mute (for audio sources)
- ⌨️ Trigger Hotkey

## Usage Examples

### Example 1: Stream Control Pad
**Pad 0**: Start Streaming
- Assign: Start Stream action
- Press controller button 0 to go live

**Pad 1**: Stop Streaming
- Assign: Stop Stream action
- Press controller button 1 to end stream

### Example 2: Scene Switching
**Pad 2**: "Gaming" Scene
- Assign: Set Scene → "Gaming"
- Press to switch to your gaming scene

**Pad 3**: "BRB" Scene
- Assign: Set Scene → "BRB"
- Press to show your "Be Right Back" scene

### Example 3: Quick Replay Save
**Pad 15**: Save Replay
- Assign: Save Replay Buffer
- Sound: Add a "Nice!" sound effect
- When pressed: Saves replay clip AND plays sound

### Example 4: Mute Microphone
**Pad 14**: Toggle Mic Mute
- Assign: Toggle Mute → "Microphone"
- Sound: Add a mute beep sound
- Quick mic mute with audio feedback

## Dual-Purpose Pads

The power of this integration is that **each pad can do BOTH**:
1. Play a sound
2. Execute an OBS action

**Example**: A pad assigned to:
- Sound: "Going Live" audio clip
- OBS Action: Start Stream

When you press this pad, it will:
1. ✅ Start your stream in OBS
2. ✅ Play the "Going Live" sound to your audience

## OBS Status Display

When connected to OBS, you'll see:

**Connection Badge**
- Shows streaming status (🔴 LIVE)
- Shows recording status (⏺️ REC)
- Current scene name

**OBS Settings Panel**
- Current scene
- Available scenes list
- Available sources list
- Streaming status
- Recording status
- Replay buffer status

## Troubleshooting

### Cannot Connect to OBS
1. Make sure OBS is running
2. Verify WebSocket server is enabled in OBS
3. Check the port number matches (default: 4455)
4. Try the password again (copy/paste recommended)
5. If using firewall, allow port 4455

### Actions Not Working
1. Verify you're connected (green status indicator)
2. Check that the scene/source name exists in OBS
3. For hotkeys, verify the exact hotkey name in OBS Settings → Hotkeys

### Scene/Source Not Listed
1. Click "Disconnect" then "Connect to OBS" to refresh
2. Make sure the scene/source exists in OBS
3. Try restarting OBS

## Advanced: Custom Hotkeys

To use custom OBS hotkeys:

1. In OBS, go to **Settings** → **Hotkeys**
2. Find the hotkey you want (e.g., "Start Streaming")
3. The hotkey name is usually: `OBSBasic.[ActionName]`
4. Common hotkey names:
   - `OBSBasic.StartStreaming`
   - `OBSBasic.StopStreaming`
   - `OBSBasic.StartRecording`
   - `OBSBasic.StopRecording`
   - `OBSBasic.SaveReplayBuffer`

## Technical Details

**Protocol**: OBS WebSocket v5.x
**Package**: obs-websocket-js
**Connection**: WebSocket (ws://)
**Default Port**: 4455
**Storage**: OBS action mappings saved in localStorage

## Privacy & Security

- OBS connection details are stored locally in your browser
- Password is required for OBS WebSocket connection
- Connection is local (localhost) by default
- No data is sent to external servers

## Tips & Best Practices

1. **Test Your Actions**: Test each OBS action before using it live
2. **Scene Names**: Keep scene names simple and easy to remember
3. **Backup Mappings**: Export your pad configurations regularly
4. **Audio Feedback**: Add sounds to OBS actions for confirmation
5. **Stop Button**: Assign a dedicated stop button for emergencies
6. **Replay Buffer**: Keep replay buffer running for quick highlights

## Future Enhancements

Potential features being considered:
- Filter control (show/hide filters)
- Studio mode support
- Virtual camera control
- Stream marker creation
- Audio mixer level adjustments
- Source property changes

## Support

For issues or feature requests:
- Check the troubleshooting section above
- Review OBS WebSocket documentation
- Ensure OBS is up to date (supports WebSocket v5)

---

**Happy Streaming!** 🎬🎮🔊

## OBS Dock Mode

SoundPad Pro includes a compact dock mode designed specifically for OBS browser docks. This lets you control your soundpad directly from within OBS!

### Setting Up the OBS Dock

1. **Ensure SoundPad Pro is running** (or set it to auto-start - see below)

2. **Add Custom Browser Dock in OBS:**
   - Go to **View** > **Docks** > **Custom Browser Docks**
   - Add a new dock:
     - **Dock Name**: `SoundPad Pro`
     - **URL**: `http://localhost:3005/dock`
   - Click **Apply**

3. **Position the dock** wherever you like in OBS

OBS will remember this dock and load it automatically on future launches.

### Auto-Start SoundPad Pro with Windows

For the dock to work, SoundPad Pro must be running before OBS tries to load it.

**Option 1: Run the Auto-Start Setup Script**
\`\`\`powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-auto-start.ps1
\`\`\`

**Option 2: Manual Setup**
1. Press Win+R, type shell:startup, press Enter
2. Create a shortcut to SoundPad Pro.exe in this folder

### Start Both Apps Together

Use the included batch script to launch both apps in the correct order:

\`\`\`batch
scripts\start-streaming.bat
\`\`\`

This script:
1. Launches SoundPad Pro
2. Waits 4 seconds for it to initialize
3. Launches OBS Studio

**Tip:** Create a desktop shortcut to this batch file for one-click streaming setup.

### Dock Mode Features

The dock mode provides a compact interface with:
- All 16 sound pads in a smaller layout
- Visual feedback for button presses
- OBS/LiveSplit action indicators
- Stop All button
- Connection status indicators
- Full sound playback support
- Full OBS/LiveSplit action support

### Dock Mode Limitations

The OBS browser dock has some limitations compared to the full app:
- No file picker (cannot assign new sounds - use main app)
- No settings dialogs (configure in main app first)
- No gamepad API (controller buttons work via main app)
- Limited keyboard shortcuts

**Recommendation:** Keep the main SoundPad Pro window open (can be minimized) and use the OBS dock for quick access during streams.
