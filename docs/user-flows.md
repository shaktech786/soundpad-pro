# SoundPad Pro - User Flows

Complete reference for all user interaction paths. Use as a basis for manual QA or Playwright E2E tests.

---

## 1. App Launch & Initialization

### 1.1 First-Time Launch (No Profile)
1. App loads `pages/index.tsx`
2. `buttonMapping` is empty, `onboarding-complete` not set in localStorage
3. Auto-redirects to `/onboarding`
4. User completes onboarding wizard (see flow 2)
5. Returns to home with profile and mappings loaded

### 1.2 Returning Launch (Profile Exists)
1. App loads `pages/index.tsx`
2. `usePersistentStorage` reads `haute42-button-mapping` from electron-store
3. `useProfileManager` loads profiles and active profile
4. Sound mappings loaded from `soundpad-mappings`
5. All mapped sounds pre-loaded via `loadSound()`
6. Board renders with saved layout and shape
7. Gamepad polling starts at 60fps
8. Trigger polling starts at 100ms intervals
9. OBS auto-connects if saved config exists
10. LiveSplit auto-connects if saved config exists

### 1.3 Launch with Empty Mapping After Onboarding
1. `onboarding-complete` is set but `buttonMapping` is empty
2. Creates default 1:1 identity mapping (button N -> gamepad N)
3. Proceeds to normal home view

---

## 2. Onboarding Wizard (`/onboarding`)

### 2.1 Complete Onboarding
1. Step 1 - Profile Setup: Enter name, select button shape (circle/square)
2. Click "Next: Design Your Board Layout"
3. Step 2 - Board Builder: Drag buttons, use presets, adjust layout
4. Click "Save & Continue" in BoardBuilder
5. Step 3 - Button Mapping: Press highlighted button on controller for each position
6. Progress bar fills as buttons are mapped
7. Completion screen shows mapping summary
8. Click "Save & Continue to App"
9. Profile created, working state saved to electron-store, `onboarding-complete` set
10. Redirects to home

### 2.2 Cancel Onboarding (from Step 1)
1. Click "Cancel" on profile-setup step
2. Sets `onboarding-complete` in localStorage (prevents redirect loop)
3. Navigates to `/`

### 2.3 Go Back from Board Builder
1. On step 2, click "Cancel" in BoardBuilder
2. Returns to step 1 (profile-setup)

### 2.4 Go Back from Button Mapping
1. On step 3, click "Back to Layout"
2. Resets mapping progress
3. Returns to step 2 (board-builder)

### 2.5 Redo Button Mapping
1. Complete all button presses
2. On completion screen, click "Redo Mapping"
3. Resets all mapping state
4. Restarts step 3 from button 1

---

## 3. Sound Playback

### 3.1 Play Sound via Gamepad
1. Press physical button on controller
2. `useSimpleGamepad` detects button press edge (wasPressed=false, isPressed=true)
3. Reverse-maps gamepad button to visual button ID via `buttonMapping`
4. Checks linked buttons — if this is a secondary and primary is also held, ignores
5. Looks up `soundMappings` for visual button ID
6. Debounce check: skip if same button played within 150ms
7. Reads volume from `buttonVolumes` (default 100%)
8. Calls `playSound(cleanUrl, { restart: true, volume })`
9. WDM mode: Howler.js plays via Web Audio API
10. Direct mode: Main process plays via audify (RtAudio ASIO) to VoiceMeeter AUX Virtual ASIO

### 3.2 Play Sound via Mouse Click
1. Click a mapped button on the board (Haute42Layout)
2. `onPlaySound` called with file URL and button index
3. Same playback path as 3.1 step 8-10

### 3.3 Play Sound via Global Hotkey
1. Global hotkeys must be enabled (sidebar > Controller > Global Hotkeys)
2. Press Ctrl+Numpad key (0-9, decimal, add, sub, mult, div, enter)
3. Main process detects hotkey, sends IPC to renderer
4. `onHotkeyTriggered` callback fires with button index
5. Looks up sound and volume, plays sound

### 3.4 Play Sound via OBS Dock
1. OBS dock page (`/dock`) shows button grid
2. Click a pad in the dock
3. POST to `/api/trigger` with `{type: 'play', index, filePath, volume}`
4. Main app polls GET `/api/trigger` (100ms interval)
5. Receives trigger, debounces, plays sound

### 3.5 Stop All Sounds
- **Action bar button**: Click "STOP ALL" below the board
- **Gamepad stop button**: Press assigned stop button on controller
- **Global hotkey**: Ctrl+Escape (if global hotkeys enabled)
- **Dock**: Click stop button in dock (sends `{type: 'stop'}` trigger)
- All methods call `stopAll()` which unloads/stops all Howl instances or ASIO sounds

### 3.6 Long Press for LiveSplit
1. Press and hold a button with a LiveSplit "smart toggle" action
2. Release after < 2 seconds: Triggers start/split
3. Release after >= 2 seconds: Triggers reset

---

## 4. Sound Mapping

### 4.1 Map Sound via File Picker (Electron)
1. Click an empty pad on the board
2. `electronAPI.selectAudioFile()` opens native file dialog
3. Select a WAV/MP3/OGG file
4. File path saved to `soundMappings` for that button index
5. Sound pre-loaded into audio engine

### 4.2 Map Sound via File Picker (Ctrl+Click)
1. Ctrl+click any pad (empty or mapped)
2. Same file picker flow as 4.1
3. Overwrites existing mapping if present

### 4.3 Map Sound via URL (Shift+Click)
1. Shift+click any pad
2. URLInputModal opens
3. Enter a URL (direct audio URL or MyInstants.com link)
4. Modal validates and extracts audio URL if needed
5. URL saved to `soundMappings`
6. Sound loaded from remote URL

### 4.4 Map Sound via OBSActionAssigner (Sound Tab)
1. Alt+click or right-click any pad
2. OBSActionAssigner modal opens on Sound tab
3. Click "Choose File" for local file, or enter URL
4. Adjust volume slider (0-100%)
5. Click Save/Apply
6. Sound mapping and volume saved

### 4.5 Clear Sound from Button
1. Open OBSActionAssigner for a mapped button
2. Click "Clear Sound" button
3. Sound mapping removed for that button

### 4.6 Clear All Sounds
1. Click "Clear Sounds" text button in action bar
2. Confirmation dialog: "Clear all pad mappings?"
3. Accept: All sound mappings cleared, auto-load flag reset

---

## 5. OBS Integration

### 5.1 Connect to OBS
1. Click OBS badge in header, or OBS button in sidebar > Integrations
2. OBSSettings modal opens
3. Enter address (default: localhost), port (default: 4455), password
4. Click "Connect"
5. WebSocket connection established
6. Config saved to electron-store for auto-reconnect
7. Modal shows connected state with scenes/sources
8. Header badge turns purple

### 5.2 Disconnect from OBS
1. Open OBSSettings modal
2. Click "Disconnect"
3. WebSocket closed, config cleared
4. Badge reverts to gray

### 5.3 OBS Auto-Reconnect
1. If connection drops, retries with exponential backoff
2. Retry delays: 2s, 5s, 10s, 15s, 30s
3. Reconnection transparent to user

### 5.4 Assign OBS Action to Button
1. Alt+click or right-click a pad
2. OBSActionAssigner opens
3. Switch to "OBS" tab
4. Select action type from dropdown:
   - Start/Stop/Toggle Streaming
   - Start/Stop/Toggle Recording
   - Start/Stop/Toggle/Save Replay Buffer
   - Set Scene (select from available scenes)
   - Toggle Source Mute (select from available sources)
   - Trigger Hotkey (enter hotkey name)
5. Click Save
6. Action saved to `combinedActions` map
7. Button shows action indicator on board

### 5.5 Execute OBS Action via Gamepad
1. Press mapped button on controller
2. Sound plays (if mapped) AND action executes simultaneously
3. OBS action sent via WebSocket

### 5.6 Execute OBS Action via Dock
1. Click action pad in OBS dock
2. POST trigger with `{type: 'action', index}`
3. Main app executes action from `combinedActions`

---

## 6. LiveSplit Integration

### 6.1 Connect to LiveSplit
1. Click LiveSplit badge in header, or button in sidebar > Integrations
2. LiveSplitSettings modal opens
3. Enter address (default: localhost), port (default: 16834)
4. Click "Connect"
5. WebSocket connection established
6. Config saved to localStorage
7. Badge turns blue

### 6.2 Assign LiveSplit Action to Button
1. Alt+click or right-click a pad
2. OBSActionAssigner opens
3. Switch to "LiveSplit" tab
4. Select action type:
   - Smart Toggle (long-press aware: quick=split, long=reset)
   - Start Timer
   - Split
   - Reset
   - Pause / Resume
   - Undo Split / Skip Split
   - Toggle Pause
   - Init Game Time
5. Click Save
6. Button shows LiveSplit indicator

### 6.3 LiveSplit Long Press Detection
1. Button with "smart toggle" LiveSplit action
2. Press and hold on controller
3. Release timing determines action:
   - < 2000ms: Start timer or split
   - >= 2000ms: Reset timer

---

## 7. Profile Management

### 7.1 Switch Profile
1. Click ProfileSelector dropdown in header
2. Click a different profile name
3. Current working state saved to old profile
4. New profile's layout, shape, and mapping loaded
5. Page reloads to apply changes

### 7.2 Create New Profile
1. Click ProfileSelector dropdown
2. Click "+ New Profile"
3. Navigates to `/onboarding`
4. Complete onboarding wizard (flow 2.1)
5. New profile created and set as active

### 7.3 Rename Profile
1. Open ProfileSelector dropdown
2. Hover over profile, click "Ren"
3. Inline text input appears
4. Type new name, press Enter or click away
5. Profile name updated

### 7.4 Duplicate Profile
1. Open ProfileSelector dropdown
2. Hover over profile, click "Dup"
3. New profile created with "(Copy)" suffix
4. Same layout, shape, and mapping as original

### 7.5 Delete Profile
1. Open ProfileSelector dropdown
2. Hover over profile, click "Del" (not available if only 1 profile)
3. Confirmation dialog: "Delete profile 'X'?"
4. Accept: Profile removed, switches to another if deleted was active

---

## 8. Controller Configuration

### 8.1 Assign Stop Button
1. Sidebar > Controller > Stop Button > click "Not assigned"
2. Button enters assignment mode (yellow, pulsing)
3. Press any button on controller
4. That gamepad button is now the stop button
5. Saved to `haute42-stop-button`

### 8.2 Clear Stop Button
1. Sidebar > Controller > Stop Button > click "Clear"
2. Stop button removed

### 8.3 Link Dual-Press Buttons
1. Sidebar > Controller > Linked Buttons > click "Add Link"
2. Step 1: "Press PRIMARY..." — press the button you WANT to work
3. Step 2: "Press GHOST..." — press the ghost button to suppress
4. Link created: when both are held, ghost is ignored
5. Link appears as chip (e.g., "12 -> 5")

### 8.4 Remove Individual Link
1. Click X on a linked button chip
2. That link removed

### 8.5 Clear All Links
1. Click "Clear All" next to linked button chips
2. All links removed

### 8.6 Cancel Linking
1. While in linking mode, click the "Add Link" button again
2. Exits linking mode without creating a link

### 8.7 Toggle Global Hotkeys
1. Sidebar > Controller > Global Hotkeys > click "Disabled"/"Enabled"
2. Toggles registration of Ctrl+Numpad shortcuts
3. Persisted to localStorage

### 8.8 Remap All Buttons
1. Sidebar > Layout & Profile > click "Remap Buttons"
2. Confirmation: "Restart button mapping?"
3. Accept: Clears button mapping, `onboarding-complete`, navigates to `/onboarding`
4. Redo full button mapping wizard

---

## 9. Board Layout

### 9.1 Edit Layout via Modal
1. Sidebar > Layout & Profile > click "Edit Layout"
2. BoardBuilder modal opens with current layout
3. Drag buttons to reposition
4. Add/remove buttons (max 32)
5. Toggle snap-to-grid
6. Select presets (4x4, 2x3, etc.)
7. Toggle button shape (circle/square)
8. Click "Save"
9. Layout and shape saved to working state and electron-store
10. Board re-renders with new layout

### 9.2 Edit Layout via Dedicated Page
1. Navigate to `/layout-builder`
2. Same BoardBuilder component
3. Save writes to profile and working state

### 9.3 Delete a Button in Builder
1. In BoardBuilder, hover over a button
2. X appears on button
3. Click X to remove button
4. Layout updates immediately

### 9.4 Add a Button in Builder
1. In BoardBuilder, click "Add Button"
2. New button appears at default position
3. Drag to desired location

---

## 10. Audio Configuration

### 10.1 Switch to WDM Mode
1. Sidebar > Audio > click "WDM" button
2. Audio mode set to 'wdm'
3. All sounds reloaded through Howler.js
4. Routes through Windows Volume Mixer

### 10.2 Switch to Direct Mode
1. Sidebar > Audio > click "Direct" button
2. Audio mode set to 'asio'
3. Main process initializes audify (RtAudio) with VoiceMeeter AUX Virtual ASIO
4. Shows "Connecting..." until ASIO ready
5. WAV sounds loaded directly in main process; MP3/OGG/FLAC decoded in renderer via Web Audio API then cached as PCM in engine
6. If initialization fails, error shown below toggle

### 10.3 Per-Button Volume
1. Alt+click or right-click a pad
2. OBSActionAssigner opens on Sound tab
3. Adjust volume slider (0-100%)
4. Volume saved to `buttonVolumes` for that button

---

## 11. Theme

### 11.1 Toggle Theme
1. Sidebar > Layout & Profile > click "Theme" row
2. Switches between light and dark mode
3. Persisted to localStorage as `soundpad-theme`
4. All components respond to theme context

---

## 12. OBS Dock (`/dock`)

### 12.1 Dock Initial Load
1. OBS browser source navigates to `http://localhost:3005/dock`
2. Dock fetches mappings from `/api/mappings`
3. Renders button grid matching board layout
4. Refreshes mappings every 5 seconds

### 12.2 Play Sound from Dock
1. Click a sound pad
2. POST `/api/trigger` with `{type: 'play', index, filePath, volume}`
3. Main app polls and plays the sound
4. Audio context resumed on first click (browser dock requirement)

### 12.3 Trigger Action from Dock
1. Click an action pad (OBS or LiveSplit indicator)
2. POST `/api/trigger` with `{type: 'action', index}`
3. Main app executes the combined action

### 12.4 Stop All from Dock
1. Click stop pad (if stop button configured)
2. POST `/api/trigger` with `{type: 'stop'}`
3. Main app stops all sounds

---

## 13. Mapper Debug Page (`/mapper`)

### 13.1 View Button Presses
1. Navigate to `/mapper`
2. Press buttons on controller
3. Currently pressed buttons shown as large badges
4. Press history shows last 20 presses

### 13.2 Clear History
1. Click "Clear History" button
2. Press history list emptied

---

## 14. Edge Cases & Error States

### 14.1 No Controller Connected
- All board buttons render but don't respond to gamepad
- Header shows gray "No Controller" badge
- Mouse clicks and global hotkeys still work
- Gamepad polling continues in background

### 14.2 Controller Disconnects Mid-Session
- Active sounds continue playing
- Badge updates to "No Controller"
- Mouse and hotkey input unaffected
- Reconnection detected automatically when controller plugged back in

### 14.3 Sound File Missing/Corrupt
- `loadSound` call fails silently (logged to console)
- Button appears mapped but produces no audio
- Can re-map to a valid file

### 14.4 OBS Disconnects Unexpectedly
- Badge reverts to gray
- OBS actions silently fail (no crash)
- Auto-reconnect attempts begin (exponential backoff)

### 14.5 Audio Mode Switch During Playback
- Current sounds stop
- All sounds reloaded with new engine
- Brief silence during reload

### 14.6 Profile Switch During Playback
- Page reloads, stopping all audio
- New profile's mappings loaded fresh

### 14.7 Dock Without Main App Running
- `/api/mappings` returns empty defaults
- Dock shows empty/loading grid
- Triggers have no effect (no polling consumer)

### 14.8 Multiple Gamepad Buttons Pressed Simultaneously
- Each button processed independently in same frame
- Linked button suppression applies per-pair
- Multiple sounds can play concurrently

### 14.9 Rapid Button Presses (< 150ms)
- Debounce prevents double-triggers
- Same button: second press ignored within 150ms window
- Different buttons: both play normally

### 14.10 Window Unfocused
- Web Gamepad API stops working (browser limitation)
- HID gamepad input still works (via main process IPC)
- Global hotkeys still work (registered in main process)
- Audio playback continues
- Trigger polling continues

---

## 15. Persistence & Storage

### 15.1 Data Saved to electron-store
| Key | Type | Description |
|-----|------|-------------|
| `soundpad-mappings` | `[number, string][]` | Button ID to file path |
| `combined-action-mappings` | `[number, CombinedAction][]` | Button ID to OBS/LiveSplit action |
| `button-volumes` | `[number, number][]` | Button ID to volume (0-100) |
| `haute42-button-mapping` | `[number, number][]` | Visual ID to gamepad button ID |
| `haute42-linked-buttons` | `[number, number][]` | Ghost button to primary button |
| `haute42-stop-button` | `number \| null` | Gamepad button ID for stop |
| `soundpad-board-layout` | `ButtonPosition[]` | Board layout positions |
| `soundpad-button-shape` | `ButtonShape` | 'circle' or 'square' |
| `profiles` | `BoardProfile[]` | All saved profiles |
| `active-profile-id` | `string` | Current active profile ID |
| `obs-connection-config` | `OBSConnectionConfig` | OBS WebSocket connection settings |

### 15.2 Data Saved to localStorage
| Key | Type | Description |
|-----|------|-------------|
| `soundpad-theme` | `string` | 'light' or 'dark' |
| `onboarding-complete` | `string` | 'true' if onboarding done |
| `global-hotkeys-enabled` | `string` | 'true' or 'false' |
| `livesplit-connection-config` | `string` | JSON connection config |
