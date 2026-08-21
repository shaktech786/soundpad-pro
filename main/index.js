const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, dialog, session, powerSaveBlocker, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const Store = require('electron-store');
const {
  HIDGamepad,
  NEUTRAL: HID_NEUTRAL,
  decodeReport: decodeHidReport,
  reportSources: hidReportSources,
  DEFAULT_SOURCE_TO_ID: HID_DEFAULT_SOURCE_TO_ID,
} = require('./hid-gamepad');
const { AsioAudioEngine } = require('./asio-audio-engine');
const { GP2040ceApi } = require('./gp2040ce-api');
const { NowPlayingServer } = require('./now-playing-server');
const { GameDetector } = require('./game-detection');
const { DiscordRpcClient } = require('./discord-rpc-client');
const { PreliveClient } = require('./prelive-client');
const { AutoUpdaterManager } = require('./auto-updater');
const { resolveLegacyUserDataPath } = require('./user-data-path');
const {
  resolveObsSetupBinaryPath,
  resolveObsSetupVersionFilePath,
} = require('./obs-setup-binary-path');
const {
  SUPPORTED_EXTENSIONS: AUDIO_SUPPORTED_EXTENSIONS,
  MIME_BY_EXTENSION: AUDIO_MIME_BY_EXTENSION,
  MAX_FILE_SIZE_BYTES: AUDIO_MAX_FILE_SIZE_BYTES,
  MAX_DIRECTORY_ENTRIES: AUDIO_MAX_DIRECTORY_ENTRIES,
} = require('../config/audio-file-contract');
const audioFileGuard = require('./audio-file-guard');

// PRE-385 (rename to Prelive Deck): pin userData to the pre-rename path BEFORE
// anything below reads or writes it — the Store constructed a few lines down,
// the Discord RPC client, and the prelive client all persist through this
// directory. Electron derives userData from productName by default, so
// without this the rename would move every existing user's data to an empty
// folder. This must run before every consumer; see main/user-data-path.js.
app.setPath('userData', resolveLegacyUserDataPath(app.getPath('appData')));

let gp2040api = new GP2040ceApi();

// Enable Chromium audio output device selection (required for AudioContext.setSinkId)
app.commandLine.appendSwitch('enable-features', 'AudioServiceOutOfProcess,WebRtcAllowInputVolumeAdjustment');
// AudioServiceSandbox: audio stability; CalculateNativeWinOcclusion: prevents renderer throttling
// when another window covers SoundPad Pro (which caused audio stuttering on hotkey/gamepad trigger)
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox,CalculateNativeWinOcclusion');

// Prevent background throttling of timers and audio when window loses focus
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Prevent OS from throttling this process (keeps audio playback smooth)
powerSaveBlocker.start('prevent-app-suspension');

// Initialize electron-store for persistent storage
const store = new Store({
  name: 'soundpad-pro-settings',
  defaults: {
    soundMappings: [],
    globalHotkeysEnabled: true,
    hotkeyMappings: [],
    stopHotkey: '',
    windowBounds: { width: 1400, height: 900 }
  }
});

let mainWindow;
let globalHotkeysEnabled = true;
let registeredHotkeys = new Map();
let saveWindowBoundsTimeout = null;
let asioEngine = null;
let asioInitializing = false;

// Now-playing broadcast for external tools (prelive OBS dock).
// ASIO state is queried live from the engine; WDM (Howler in renderer)
// state is pushed up via the 'audio:wdm-playing' IPC event.
let nowPlayingServer = null;
let wdmPlaying = [];

// Foreground-window game detection for the /current-game endpoint on the same
// local server. Polls active-win on an interval; the HTTP handler reads the
// cached snapshot so it never blocks on the OS query.
let gameDetector = null;

// Discord RPC client (connection + OAuth handshake only). Talks to the local
// Discord IPC named pipe; pushes status changes to the renderer. Never blocks
// startup — it only connects when the renderer asks (DiscordContext).
const discordRpc = new DiscordRpcClient({ store });
discordRpc.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('discord:status-changed', status);
  }
  // Push the current now-playing presence once the connection settles (covers
  // both the first connect and background reconnects while a sound is playing).
  if (status.status === 'connected') applyDiscordActivity();
});

// Discord Rich Presence: reflect the currently playing sound in the user's
// Discord status. App-level toggle (default on); the actual now-playing signal
// is driven by NowPlayingServer's onNowPlayingChange hook below.
const DISCORD_RICH_PRESENCE_KEY = 'discord-rich-presence-enabled';
const DISCORD_LARGE_IMAGE_KEY = 'soundpad_pro';
let lastNowPlaying = null; // most recent primary track from the now-playing hook

function isRichPresenceEnabled() {
  return store.get(DISCORD_RICH_PRESENCE_KEY) !== false; // default enabled
}

/** Build the SET_ACTIVITY payload for a now-playing track. */
function buildDiscordActivity(track) {
  const attribution = track.attribution || {};
  const displayName = track.fileName.replace(/\.[^.]+$/, '');
  let state;
  if (attribution.artist) {
    state = `by ${attribution.artist}`;
  } else if (attribution.title) {
    state = attribution.title;
  }
  return {
    details: `Playing ${displayName}`,
    state,
    startTimestamp: track.startedAt,
    largeImageKey: DISCORD_LARGE_IMAGE_KEY,
  };
}

/** Re-evaluate and push (or clear) the Discord presence for the current track.
 * `enabledOverride` lets the toggle apply instantly without racing the store
 * write; otherwise the persisted setting is read. */
function applyDiscordActivity(enabledOverride) {
  if (discordRpc.getStatus().status !== 'connected') return;
  const enabled = typeof enabledOverride === 'boolean' ? enabledOverride : isRichPresenceEnabled();
  const activity = enabled && lastNowPlaying ? buildDiscordActivity(lastNowPlaying) : null;
  discordRpc.setActivity(activity).catch(() => { /* best-effort presence */ });
}
// Live mute/deafen state pushed from Discord's VOICE_SETTINGS_UPDATE
// subscription — keeps the UI in sync when the user mutes inside Discord.
discordRpc.on('voice-state', (state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('discord:voice-state-changed', state);
  }
});

// Prelive API-key pairing: periodically pulls the user's streamed-game history
// (with a games:read Bearer key they paste in) and exposes it as the highest-
// priority game-detection tier. Pushes status changes to the renderer. Never
// blocks startup — it only fetches when a key is configured, on a slow interval.
const preliveClient = new PreliveClient({ store });
preliveClient.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('prelive:status-changed', status);
  }
});

// Auto-updater: checks GitHub Releases on launch + every 4h, downloads updates
// silently in the background, and only ever installs on an explicit user action
// (see main/auto-updater.js). Started in app.whenReady (skipped in dev), torn
// down on window-all-closed alongside the other interval-driven services.
const autoUpdaterManager = new AutoUpdaterManager({
  getMainWindow: () => mainWindow,
});

// HID stop button — dead-simple raw-byte pattern matching.
// `hidStopSnapshot` is the 8-byte HID report taken when the user assigned
// their stop button. Incoming reports match if every byte that was
// non-neutral in the snapshot is still non-neutral in the report (digital
// button bytes are compared as subset bitmasks; hat/axis bytes must match
// exactly). This works for axis-based buttons AND sidesteps every Chrome
// vs HID index mismatch issue.
let hidStopSnapshot = null;          // number[8] or null
let hidStopMatchedLast = false;      // for rising-edge detection
let hidStopCaptureArmed = false;     // true while "assign stop button" is active

// Load persisted snapshot from store on startup
try {
  const saved = store.get('hidStopSnapshot', null);
  if (Array.isArray(saved) && saved.length === 8) hidStopSnapshot = saved;
} catch (_) { /* ignore */ }

// HID button calibration: source name -> Chrome gamepad button ID. Overlays the
// inferred defaults in main/hid-gamepad.js so a mis-guessed bit->index mapping
// can be corrected from the calibration page without a rebuild, preserving the
// user's existing bindings (which were recorded against Chrome's indices).
let hidButtonCalibration = {};
try {
  const saved = store.get('hidButtonCalibration', null);
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) hidButtonCalibration = saved;
} catch (_) { /* ignore */ }

// Last decoded button-ID set, so we only push to the renderer on real changes.
let hidLastButtonIds = [];
let hidGamepad = null;

function sameIdList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
  return true;
}

function hidReportMatchesStopSnapshot(report) {
  if (!hidStopSnapshot) return false;
  let anyDiff = false;
  for (let i = 0; i < 7; i++) {
    if (hidStopSnapshot[i] === HID_NEUTRAL[i]) continue; // unchanged in snapshot → ignore
    anyDiff = true;
    if (i <= 1) {
      // Digital button bytes: snapshot bits must all be present in current report
      if ((report[i] & hidStopSnapshot[i]) !== hidStopSnapshot[i]) return false;
    } else {
      // Hat (byte 2) and axes (bytes 3-6): exact byte value match
      if (report[i] !== hidStopSnapshot[i]) return false;
    }
  }
  return anyDiff; // snapshot that equals neutral is never a valid match
}

// Auto-initialize the Direct Audio engine on startup so it's always ready.
// Also pre-loads any sound mappings from the store so playback is instant.
async function autoInitDirectAudio() {
  if (asioInitializing) return;
  asioInitializing = true;
  try {
    asioEngine = new AsioAudioEngine();
    const device = asioEngine.findVoiceMeeterAsio();
    if (device) {
      const result = asioEngine.initialize();
      if (result.success) {
        console.log(`[DirectAudio] Auto-initialized: ${result.device} via ${result.mode} @ ${result.sampleRate}Hz`);

        // Notify renderer when ASIO stream is lost so it can show status
        asioEngine.onStreamLost((reason) => {
          console.error(`[DirectAudio] Stream lost: ${reason}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asio:stream-lost', reason);
          }
        });

        // Pre-load sounds from store so they're ready before renderer loads
        const audioMode = store.get('audio-output-mode');
        if (audioMode === 'asio') {
          const mappings = store.get('soundpad-mappings', []);
          if (Array.isArray(mappings) && mappings.length > 0) {
            console.log(`[DirectAudio] Pre-loading ${mappings.length} sounds...`);
            for (const [, filePath] of mappings) {
              if (typeof filePath === 'string') {
                try {
                  await asioEngine.loadSound(filePath);
                } catch (err) {
                  console.error(`[DirectAudio] Pre-load failed: ${filePath}:`, err.message);
                }
              }
            }
            console.log(`[DirectAudio] Pre-loaded ${asioEngine._soundCache.size} sounds`);
          }
        }
      } else {
        console.error('[DirectAudio] Auto-init failed:', result.error);
        asioEngine = null;
      }
    } else {
      console.log('[DirectAudio] VoiceMeeter AUX device not found, skipping auto-init');
      asioEngine = null;
    }
  } catch (err) {
    console.error('[DirectAudio] Auto-init error:', err.message);
    asioEngine = null;
  } finally {
    asioInitializing = false;
  }
}

function createWindow() {
  // Get saved window bounds or use defaults
  const windowBounds = store.get('windowBounds', { 
    width: 1400, 
    height: 900,
    x: undefined,
    y: undefined
  });

  mainWindow = new BrowserWindow({
    title: 'Prelive Deck',
    ...windowBounds,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false  // Keep gamepad polling active when unfocused
    },
    backgroundColor: '#1a1a1a'
  });
  
  // Debounced window bounds save - only saves 500ms after last resize/move
  function saveWindowBounds() {
    if (saveWindowBoundsTimeout) {
      clearTimeout(saveWindowBoundsTimeout);
    }
    saveWindowBoundsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized() && !mainWindow.isMinimized()) {
        store.set('windowBounds', mainWindow.getBounds());
      }
    }, 500);
  }

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // SOUNDPAD_START_ROUTE opens a specific page instead of the soundboard.
  // Used to reach the controller calibration harness ('calibrate'), which has no
  // in-app link because it's a diagnostic, not a feature.
  const startRoute = (process.env.SOUNDPAD_START_ROUTE || '').replace(/^\/+/, '');

  if (isDev) {
    mainWindow.loadURL(`http://localhost:3005/${startRoute}`);
  } else {
    // Clear cached code to ensure latest build is loaded
    session.defaultSession.clearCache().then(() => {
      mainWindow.loadFile(path.join(__dirname, `../out/${startRoute || 'index'}.html`));
    });
  }

  mainWindow.on('closed', () => {
    if (saveWindowBoundsTimeout) {
      clearTimeout(saveWindowBoundsTimeout);
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Grant only permissions the app needs (audio output device selection and media)
  const allowedPermissions = new Set(['speaker-selection', 'media', 'audioCapture']);
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return allowedPermissions.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  // Auto-init direct audio engine before creating window
  autoInitDirectAudio().then(() => {
    console.log('[Startup] Direct audio init complete');
  }).catch(err => {
    console.error('[Startup] Direct audio init error:', err.message);
  });

  createWindow();

  gameDetector = new GameDetector({
    intervalMs: 3000,
    // Highest-priority tier: games the user has actually streamed, per prelive.
    // Read live each poll so pairing/unpairing a key takes effect immediately.
    getPreliveTier: () => preliveClient.getTier(),
  });
  gameDetector.start();

  // Begin the slow background history refresh (no-op until a key is paired).
  preliveClient.start();

  nowPlayingServer = new NowPlayingServer({
    port: 3006,
    getAsioPlaying: () => (asioEngine && asioEngine.isInitialized() ? asioEngine.getActiveSounds() : []),
    getWdmPlaying: () => wdmPlaying,
    getCurrentGame: () => (gameDetector ? gameDetector.getSnapshot() : null),
    forcePoll: () => (gameDetector ? gameDetector.forcePoll() : null),
    onNowPlayingChange: (track) => {
      lastNowPlaying = track;
      applyDiscordActivity();
    },
  });
  nowPlayingServer.start();

  // Start checking for updates (never in dev — electron-updater has no feed there).
  if (!isDev) {
    autoUpdaterManager.start();
  }

  // Background HID gamepad polling — works even when OBS or another app has focus.
  // The Pokken Controller (GP2040-CE Switch mode) is a pure HID device, not XInput,
  // so node-hid can open it without conflict. Auto-reconnects if the controller
  // is unplugged and replugged.
  hidGamepad = new HIDGamepad((report) => {
    // Primary controller input path. Decode to the renderer's button-ID space
    // and push on change. This runs in the main process, so it keeps working
    // when OBS (or anything else) holds foreground focus — unlike the Web
    // Gamepad API, which Chromium freezes for unfocused documents.
    const ids = decodeHidReport(report, hidButtonCalibration);
    if (!sameIdList(ids, hidLastButtonIds)) {
      hidLastButtonIds = ids;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hid-buttons-changed', ids);
      }
    }
    // Raw reports for the calibration page only (it correlates these against
    // navigator.getGamepads() while the window is focused).
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hid-raw-report', { report, sources: hidReportSources(report) });
    }

    // Detect neutral vs any-press for capture mode
    let isNeutral = true;
    for (let i = 0; i < 7; i++) {
      if (report[i] !== HID_NEUTRAL[i]) { isNeutral = false; break; }
    }

    // Capture mode: the next non-neutral report becomes the stop snapshot
    if (hidStopCaptureArmed && !isNeutral) {
      hidStopSnapshot = report.slice();
      hidStopCaptureArmed = false;
      hidStopMatchedLast = true; // ignore this same press as a trigger
      try { store.set('hidStopSnapshot', hidStopSnapshot); } catch (_) {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hid-stop-captured', hidStopSnapshot);
      }
      return;
    }

    // Match current report against stored stop snapshot; fire on rising edge
    const matches = hidReportMatchesStopSnapshot(report);
    if (matches && !hidStopMatchedLast) {
      if (asioEngine) {
        try { asioEngine.stopAll(); } catch (_) { /* ignore */ }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('global-stop-audio');
      }
    }
    hidStopMatchedLast = matches;
  }, (connected) => {
    if (!connected) hidLastButtonIds = [];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hid-connection-changed', connected);
    }
  });
  hidGamepad.start();

  // No default global stop hotkey - user can configure in settings
});

app.on('window-all-closed', () => {
  // Unregister all shortcuts when app is closing
  globalShortcut.unregisterAll();
  if (nowPlayingServer) {
    nowPlayingServer.shutdown();
    nowPlayingServer = null;
  }
  if (gameDetector) {
    gameDetector.stop();
    gameDetector = null;
  }
  // Stop the prelive history refresh timer (the stored key persists; it resumes
  // on next launch).
  preliveClient.stop();
  // Stop the update check timers (a downloaded update still installs on quit
  // via autoInstallOnAppQuit — this only clears the polling intervals).
  autoUpdaterManager.stop();
  // HID gamepad is local to app.whenReady — no explicit cleanup needed (GC handles it)
  // Discord RPC cleanup
  discordRpc.disconnect();
  // ASIO engine cleanup
  if (asioEngine) {
    asioEngine.shutdown();
    asioEngine = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers for audio routing
ipcMain.handle('get-audio-devices', async () => {
  // This will get the system audio devices
  const sources = await desktopCapturer.getSources({ 
    types: ['window', 'screen'],
    fetchWindowIcons: false 
  });
  return sources;
});

// Virtual audio output handling
ipcMain.handle('setup-virtual-audio', async () => {
  // We'll use the system audio and route it through Electron
  // This makes the app appear as an audio source to OBS
  return { success: true, deviceName: 'Prelive Deck Virtual Audio' };
});

// Controller support
ipcMain.handle('get-controllers', async () => {
  // The renderer will use Web Gamepad API
  // We just need to enable it
  return { enabled: true };
});

// File dialog for audio selection. Extensions/MIME/size come from
// config/audio-file-contract.js (PRE-466) — the single source of truth
// shared with config/constants.ts and utils/audioUtils.ts, so this list can
// no longer drift out of sync with what the renderer thinks is supported.

// The audio-file IPC boundary (`read-audio-file`, `fs:listDirectory`) only
// trusts paths inside these roots — Music/Documents/Downloads/Desktop, the
// user's pinned library folder (electron-store key `audioLibrary:defaultDir`,
// set from the AudioFilePicker "pin as default" action), and any folder the
// user has explicitly granted by picking it via dialog:openDirectory or
// dialog:openFile (persisted below under `audioLibrary:grantedRoots`, so the
// grant survives restarts — soundMappings themselves persist raw file paths
// and get re-read via read-audio-file every launch). Recomputed on every
// call rather than cached, since the store can change mid-session.
function getAllowedAudioRoots() {
  return audioFileGuard.resolveAllowedRoots([
    app.getPath('music'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('desktop'),
    store.get('audioLibrary:defaultDir'),
    ...(store.get('audioLibrary:grantedRoots') || []),
  ])
}

// Persists `rootPath` as a granted root so future read-audio-file /
// fs:listDirectory calls trust it too. Never grants a drive root ("C:\",
// "D:\") even when the user explicitly picked one — the allowlist blocks
// drive roots unconditionally (see main/audio-file-guard.js's isDriveRoot).
function grantAudioRoot(rootPath) {
  if (!rootPath || audioFileGuard.isDriveRoot(rootPath)) return
  const resolved = path.resolve(rootPath)
  const granted = store.get('audioLibrary:grantedRoots') || []
  if (!granted.includes(resolved)) {
    store.set('audioLibrary:grantedRoots', [...granted, resolved])
  }
}

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths.length > 0) {
    const dirPath = result.filePaths[0]
    grantAudioRoot(dirPath)
    return dirPath
  }
  return null
})

ipcMain.handle('fs:listDirectory', async (event, dirPath) => {
  return audioFileGuard.listDirectoryGuarded(dirPath, {
    allowedRoots: getAllowedAudioRoots(),
    audioExtensions: AUDIO_SUPPORTED_EXTENSIONS,
    maxEntries: AUDIO_MAX_DIRECTORY_ENTRIES,
    readdir: (p, opts) => fs.readdir(p, opts),
  })
})

ipcMain.handle('fs:getDefaultAudioDir', () => app.getPath('music'))

// Parent directory of `p` via Node's path.dirname, computed in the main
// process so AudioFilePicker's "up" control doesn't have to string-split
// paths or guess at drive roots client-side (PRE-468 — the old renderer-side
// logic sliced `currentPath` on '/' and guessed the drive root at
// slice(0,3), which broke on UNC paths and anywhere the split heuristic
// didn't match reality). Pure path math — no filesystem access, so no
// allowlist check is needed here; the resulting path still goes through
// fs:listDirectory's own allowlist guard before anything is shown.
ipcMain.handle('path:dirname', (event, p) => path.dirname(p))

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: AUDIO_SUPPORTED_EXTENSIONS.map((ext) => ext.slice(1)) },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    // The user explicitly picked this file, so its containing folder becomes
    // a granted root (unless that folder is itself a drive root — see
    // grantAudioRoot). That's what lets read-audio-file succeed for it below
    // and on every future launch, without widening the allowlist to
    // "everything the user could ever pick".
    grantAudioRoot(path.dirname(filePath));
    // Return the raw file path - it will be converted to URL in the renderer
    return {
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  }
  return null;
});

// Read audio file and return as buffer. Enforces the same allowlist as
// fs:listDirectory, plus a supported-extension check and a size cap —
// stat()-ed BEFORE reading so an oversized file is never buffered into
// memory (PRE-466; MAX_FILE_SIZE was declared for years and never enforced).
ipcMain.handle('read-audio-file', async (event, filePath) => {
  return audioFileGuard.readAudioFileGuarded(filePath, {
    allowedRoots: getAllowedAudioRoots(),
    maxFileSizeBytes: AUDIO_MAX_FILE_SIZE_BYTES,
    mimeByExtension: AUDIO_MIME_BY_EXTENSION,
    stat: (p) => fs.stat(p),
    readFile: (p) => fs.readFile(p),
  });
});

// Navigation handler for static export
ipcMain.handle('navigate', (event, route) => {
  if (mainWindow && !isDev) {
    // Split route from query string (e.g. '/onboarding?remap=true')
    const [pathname, queryString] = route.split('?');
    const htmlFile = pathname === '/' ? 'index.html' : `${pathname}.html`;
    const filePath = path.join(__dirname, '../out', htmlFile);
    if (queryString) {
      mainWindow.loadFile(filePath, { query: Object.fromEntries(new URLSearchParams(queryString)) });
    } else {
      mainWindow.loadFile(filePath);
    }
  }
});

// Store management for persistent data
ipcMain.handle('store:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('store:delete', (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('store:clear', () => {
  store.clear();
  return true;
});

// HID stop button registration
ipcMain.handle('arm-hid-stop-capture', () => {
  hidStopCaptureArmed = true;
  return { success: true };
});

ipcMain.handle('clear-hid-stop-pattern', () => {
  hidStopSnapshot = null;
  hidStopCaptureArmed = false;
  hidStopMatchedLast = false;
  try { store.delete('hidStopSnapshot'); } catch (_) {}
  return { success: true };
});

ipcMain.handle('has-hid-stop-pattern', () => {
  return { success: true, present: !!hidStopSnapshot };
});

// Legacy no-op: old renderers call this but the new flow uses raw pattern match.
ipcMain.handle('set-hid-stop-button', () => {
  return { success: true };
});

// Current HID controller state, for renderers that mount after the last event.
ipcMain.handle('hid:get-state', () => {
  return {
    success: true,
    connected: hidGamepad ? hidGamepad.isConnected() : false,
    buttonIds: hidLastButtonIds.slice(),
  };
});

// Calibration: source name ('b0.3', 'hat.up', 'a3+') -> Chrome gamepad button ID.
ipcMain.handle('hid:get-calibration', () => {
  return {
    success: true,
    defaults: HID_DEFAULT_SOURCE_TO_ID,
    overrides: hidButtonCalibration,
  };
});

ipcMain.handle('hid:set-calibration', (event, overrides) => {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { success: false, error: 'calibration must be an object' };
  }
  const cleaned = {};
  for (const [source, id] of Object.entries(overrides)) {
    if (typeof id === 'number' && Number.isFinite(id)) cleaned[source] = id;
  }
  hidButtonCalibration = cleaned;
  hidLastButtonIds = [];
  try { store.set('hidButtonCalibration', cleaned); } catch (_) { /* ignore */ }
  return { success: true, overrides: cleaned };
});

ipcMain.handle('hid:clear-calibration', () => {
  hidButtonCalibration = {};
  hidLastButtonIds = [];
  try { store.delete('hidButtonCalibration'); } catch (_) { /* ignore */ }
  return { success: true };
});

// Global hotkey management
ipcMain.handle('register-hotkey', async (event, { key, buttonIndex }) => {
  try {
    // Unregister previous hotkey for this button if exists
    const previousKey = Array.from(registeredHotkeys.entries())
      .find(([k, v]) => v === buttonIndex)?.[0];
    if (previousKey) {
      globalShortcut.unregister(previousKey);
      registeredHotkeys.delete(previousKey);
    }
    
    // Register new hotkey
    const success = globalShortcut.register(key, () => {
      if (mainWindow && globalHotkeysEnabled) {
        mainWindow.webContents.send('hotkey-triggered', buttonIndex);
      }
    });
    
    if (success) {
      registeredHotkeys.set(key, buttonIndex);
    }
    
    return { success, key, buttonIndex };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unregister-hotkey', async (event, key) => {
  try {
    globalShortcut.unregister(key);
    registeredHotkeys.delete(key);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-global-hotkeys', async (event, enabled) => {
  globalHotkeysEnabled = enabled;
  return { enabled: globalHotkeysEnabled };
});

ipcMain.handle('get-registered-hotkeys', async () => {
  return Array.from(registeredHotkeys.entries()).map(([key, buttonIndex]) => ({
    key,
    buttonIndex
  }));
});

// Audio diagnostics - write to file for debugging
ipcMain.handle('write-audio-diag', async (event, data) => {
  const diagPath = path.join(app.getPath('userData'), 'audio-diag.log');
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${data}\n`;
  await fs.appendFile(diagPath, line);
  return diagPath;
});

// --- ASIO Audio Engine IPC Handlers ---

ipcMain.handle('asio:get-devices', async () => {
  try {
    const engine = new AsioAudioEngine();
    return { success: true, devices: engine.getAsioDevices() };
  } catch (err) {
    return { success: false, error: err.message, devices: [] };
  }
});

ipcMain.handle('asio:initialize', async (event, deviceId) => {
  if (asioInitializing) {
    return { success: false, error: 'ASIO initialization already in progress' };
  }
  asioInitializing = true;
  try {
    if (!asioEngine) {
      asioEngine = new AsioAudioEngine();
    }
    const result = asioEngine.initialize(deviceId);
    console.log('[IPC] asio:initialize result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[IPC] asio:initialize error:', err.message);
    return { success: false, error: err.message };
  } finally {
    asioInitializing = false;
  }
});

ipcMain.handle('asio:status', async () => {
  if (!asioEngine || !asioEngine.isInitialized()) {
    return { initialized: false };
  }
  return {
    initialized: true,
    device: asioEngine._deviceName,
    sampleRate: asioEngine._sampleRate,
    channels: asioEngine._channels,
    cachedSounds: asioEngine._soundCache.size,
    activeVoices: asioEngine._activeVoices.size,
    healthy: asioEngine.isStreamHealthy()
  };
});

ipcMain.handle('asio:reconnect', async () => {
  try {
    if (!asioEngine) {
      // Engine doesn't exist, do a full init
      asioEngine = new AsioAudioEngine();
      const result = asioEngine.initialize();
      if (result.success) {
        asioEngine.onStreamLost((reason) => {
          console.error(`[DirectAudio] Stream lost: ${reason}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asio:stream-lost', reason);
          }
        });
      }
      return result;
    }
    const result = asioEngine.reconnect();
    if (result.success && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('asio:stream-recovered', result.device);
    }
    return result;
  } catch (err) {
    console.error('[IPC] asio:reconnect error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:shutdown', async () => {
  try {
    if (asioEngine) {
      const result = asioEngine.shutdown();
      asioEngine = null;
      return result;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:load-sound', async (event, filePath) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      console.error('[IPC] asio:load-sound called but engine not initialized');
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = await asioEngine.loadSound(filePath);
    console.log(`[IPC] asio:load-sound ${filePath}: ${result.success ? 'OK' : result.error}`);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:load-sound ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:unload-sound', async (event, filePath) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.unloadSound(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:cache-pcm', async (event, filePath, pcmData) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = asioEngine.cachePcm(filePath, pcmData);
    console.log(`[IPC] asio:cache-pcm ${filePath}: ${result.success ? 'OK' : result.error} (${result.samples || 0} samples)`);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:cache-pcm ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:play-sound', async (event, filePath, options) => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'ASIO engine not initialized' };
    }
    const result = asioEngine.playSound(filePath, options);
    return result;
  } catch (err) {
    console.error(`[IPC] asio:play-sound ${filePath} error:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:stop-sound', async (event, filePath) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.stopSound(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:stop-all', async () => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.stopAll();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Renderer reports the set of WDM (Howler) sounds currently playing —
// covers play, natural end, stop, stop-all, and unload in one signal.
ipcMain.on('audio:wdm-playing', (event, filePaths) => {
  wdmPlaying = Array.isArray(filePaths) ? filePaths.filter(fp => typeof fp === 'string') : [];
});

ipcMain.handle('asio:set-volume', async (event, filePath, volume) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.setVolume(filePath, volume);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:set-master-volume', async (event, volume) => {
  try {
    if (!asioEngine) return { success: true };
    return asioEngine.setMasterVolume(volume);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:test-tone', async () => {
  try {
    if (!asioEngine || !asioEngine.isInitialized()) {
      return { success: false, error: 'Engine not initialized' };
    }
    const result = asioEngine.playTestTone();
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('asio:diag', async () => {
  if (!asioEngine) return { engine: null };
  return {
    initialized: asioEngine.isInitialized(),
    device: asioEngine._deviceName,
    sampleRate: asioEngine._sampleRate,
    framesPerBuffer: asioEngine._framesPerBuffer,
    cachedSounds: Array.from(asioEngine._soundCache.keys()),
    cachedSoundDetails: Array.from(asioEngine._soundCache.entries()).map(([k, v]) => ({
      key: k,
      length: v.length,
      channels: v.channels,
      sampleRate: v.sampleRate,
      maxAmp: Math.max(...Array.from(v.pcm[0].slice(0, 1000)).map(Math.abs))
    })),
    activeVoices: Array.from(asioEngine._activeVoices.entries()).map(([k, v]) => ({
      key: k,
      voices: v.map(voice => ({ cursor: voice.cursor, volume: voice.volume, loop: voice.loop }))
    })),
    masterVolume: asioEngine._masterVolume
  };
});

// --- GP2040-CE Controller Config IPC Handlers ---

ipcMain.handle('gp2040:check-connection', async () => {
  return gp2040api.checkConnection();
});

ipcMain.handle('gp2040:get-pin-mappings', async () => {
  return gp2040api.getPinMappings();
});

ipcMain.handle('gp2040:set-pin-mappings', async (event, mappings) => {
  return gp2040api.setPinMappings(mappings);
});

ipcMain.handle('gp2040:get-gamepad-options', async () => {
  return gp2040api.getGamepadOptions();
});

ipcMain.handle('gp2040:set-gamepad-options', async (event, options) => {
  return gp2040api.setGamepadOptions(options);
});

ipcMain.handle('gp2040:get-addons-options', async () => {
  return gp2040api.getAddonsOptions();
});

// Analyze controller mappings (placeholder — returns the mappings unchanged)
ipcMain.handle('gp2040:analyze-mappings', async (event, mappings) => {
  return { success: true, mappings };
});

// --- Discord RPC IPC Handlers ---

ipcMain.handle('discord:connect', async () => {
  return discordRpc.connect();
});

ipcMain.handle('discord:disconnect', async () => {
  return discordRpc.disconnect();
});

ipcMain.handle('discord:status', async () => {
  return discordRpc.getStatus();
});

ipcMain.handle('discord:get-config', async () => {
  return discordRpc.getPublicConfig();
});

ipcMain.handle('discord:set-voice-settings', async (event, settings) => {
  return discordRpc.setVoiceSettings(settings || {});
});

ipcMain.handle('discord:get-voice-settings', async () => {
  return discordRpc.getVoiceSettings();
});

// Rich Presence: direct pass-through (used for testing / manual control) and a
// refresh hook the settings toggle calls so enabling/disabling applies at once.
ipcMain.handle('discord:set-activity', async (event, activity) => {
  return discordRpc.setActivity(activity || null);
});

ipcMain.handle('discord:refresh-activity', async (event, enabled) => {
  applyDiscordActivity(typeof enabled === 'boolean' ? enabled : undefined);
  return { success: true };
});

// --- Prelive API-key pairing IPC Handlers ---

// Where a user creates a games:read API key. Opened via shell.openExternal
// (never renderer navigation) so the packaged app's window isn't hijacked.
const PRELIVE_API_KEYS_URL = 'https://prelive.ai/settings?tab=api-keys';

// Store the pasted games:read key, trigger an immediate fetch, and return the
// resulting status. The key is never returned to the renderer.
ipcMain.handle('prelive:set-api-key', async (event, apiKey) => {
  return preliveClient.setApiKey(typeof apiKey === 'string' ? apiKey : '');
});

// Current pairing/fetch status — never includes the API key.
ipcMain.handle('prelive:get-status', async () => {
  return preliveClient.getStatus();
});

// Clear the stored key and cached tier; detection falls back to local + curated.
ipcMain.handle('prelive:disconnect', async () => {
  return preliveClient.disconnect();
});

// --- OBS Setup tool IPC Handlers (PRE-392) ---
//
// The bundled standalone binary (see scripts/fetch-obs-setup-binary.js,
// .electron-builder.config.js's extraResources, and
// main/obs-setup-binary-path.js for where it lives in dev vs packaged) is
// normally launched from the installer's finish page
// (build/installer.nsh's customFinishPage). This is the fallback for anyone
// who skipped that checkbox or reinstalled OBS afterwards — see
// components/OBSSettings.tsx's "Set up my OBS" button.

const obsSetupProjectRoot = path.join(__dirname, '..');

// Spawns the bundled binary detached from this process (so it survives even
// if Prelive Deck is closed mid-setup) and unreferenced (so it doesn't keep
// the Electron event loop alive). The tool manages its own UI/browser flow;
// this handler only needs to know whether the spawn itself succeeded.
ipcMain.handle('obs-setup:run', async () => {
  const binaryPath = resolveObsSetupBinaryPath(app, obsSetupProjectRoot);

  try {
    await fs.access(binaryPath);
  } catch {
    return {
      success: false,
      error: `OBS Setup tool not found at ${binaryPath}. It may not have been bundled with this build.`,
    };
  }

  try {
    const child = spawn(binaryPath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(binaryPath),
    });
    child.unref();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Bundled version metadata (written by scripts/fetch-obs-setup-binary.js
// alongside the binary) so the settings UI can show which version shipped
// with this install. Returns null rather than throwing when absent — a dev
// checkout that hasn't run `npm run fetch:obs-setup` is a normal state, not
// an error.
ipcMain.handle('obs-setup:get-version-info', async () => {
  const versionFilePath = resolveObsSetupVersionFilePath(app, obsSetupProjectRoot);

  try {
    const contents = await fs.readFile(versionFilePath, 'utf8');
    return JSON.parse(contents);
  } catch {
    return null;
  }
});

// Open prelive's API-keys page in the user's default browser so pairing is
// discoverable from inside the app instead of requiring the user to already
// know where to go.
ipcMain.handle('prelive:open-api-keys-page', async () => {
  await shell.openExternal(PRELIVE_API_KEYS_URL);
  return { success: true };
});

// --- Auto-updater IPC Handlers ---

// Current update state, so the renderer can render the "Restart to install"
// badge on mount even if 'update-downloaded' fired before it subscribed.
ipcMain.handle('app:get-update-status', () => autoUpdaterManager.getStatus());

// Explicit, user-gated install: quits and relaunches into the downloaded
// installer. Only invoked from the renderer's "Restart to install" button.
ipcMain.handle('app:quit-and-install', () => {
  autoUpdaterManager.quitAndInstall();
  return { success: true };
});

// Log errors from renderer process
ipcMain.handle('log-error', async (event, errorData) => {
  const timestamp = new Date().toISOString();
  console.error(`[Renderer Error ${timestamp}]`, errorData.message || errorData);
  if (errorData.stack) console.error(errorData.stack);
  // Also write to error log file
  const logPath = path.join(app.getPath('userData'), 'error.log');
  const line = `[${timestamp}] ${errorData.message || JSON.stringify(errorData)}\n${errorData.stack || ''}\n${errorData.componentStack || ''}\n---\n`;
  await fs.appendFile(logPath, line).catch(() => {});
  return { success: true };
});

ipcMain.handle('gp2040:get-raw-api', async (event, endpoint) => {
  // Generic endpoint fetcher for debugging
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '192.168.7.1', port: 80, path: endpoint, timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ success: true, data: JSON.parse(data) }); }
        catch { resolve({ success: true, data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
  });
});