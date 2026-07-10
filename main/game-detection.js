const path = require('path');

// Foreground game detection that backs the `/current-game` endpoint.
//
// Two pieces:
//  - `detectGame(processName, windowTitle)` — a pure classifier (allowlist +
//    denylist) that NEVER guesses: anything not on the allowlist is reported as
//    unknown (`detectedGame: null`).
//  - `GameDetector` — polls the OS focused window on an interval (via active-win)
//    and caches the latest classification so the HTTP handler stays synchronous
//    and the poll never blocks the event loop.

// exe basenames of common non-game foreground apps we explicitly ignore, so a
// browser tab, Discord window, or OBS preview titled after a game is never
// misreported as that game. Stored WITHOUT the `.exe` suffix; matching strips
// `.exe` before comparing.
const DENYLIST = new Set([
  // browsers
  'chrome', 'firefox', 'msedge', 'brave', 'opera', 'operagx', 'iexplore', 'vivaldi', 'arc',
  // chat / streaming / meeting tools
  'discord', 'discordptb', 'discordcanary', 'obs64', 'obs32', 'obs',
  'streamlabs obs', 'slack', 'teams', 'ms-teams', 'zoom', 'spotify',
  // shell / file manager / OS surfaces
  'explorer', 'searchhost', 'searchui', 'shellexperiencehost', 'startmenuexperiencehost',
  // IDEs / editors / terminals
  'code', 'cursor', 'devenv', 'idea64', 'pycharm64', 'webstorm64', 'rider64',
  'sublime_text', 'notepad', 'notepad++', 'windowsterminal', 'wt', 'powershell',
  'pwsh', 'cmd', 'conhost', 'alacritty', 'wezterm-gui',
]);

// exe-name / title-substring -> human-readable game name. Deliberately a starter
// set; extend by adding entries. `exe` values are matched against the focused
// process's executable basename; `title` values are case-insensitive substrings
// of the window title. Either kind of hit is a match. Title entries are only
// listed where they're specific enough not to collide with non-game apps.
const GAME_ALLOWLIST = [
  { game: 'League of Legends', exe: ['league of legends.exe', 'leagueclient.exe'], title: ['league of legends'] },
  { game: 'VALORANT', exe: ['valorant.exe', 'valorant-win64-shipping.exe'], title: ['valorant'] },
  { game: 'Counter-Strike 2', exe: ['cs2.exe'], title: ['counter-strike 2'] },
  { game: 'Fortnite', exe: ['fortniteclient-win64-shipping.exe'], title: ['fortnite'] },
  { game: 'Minecraft', exe: ['minecraft.exe', 'minecraftlauncher.exe'], title: ['minecraft'] },
  { game: 'Apex Legends', exe: ['r5apex.exe'], title: ['apex legends'] },
];

function stripExe(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.exe') ? lower.slice(0, -4) : lower;
}

// Pure classifier. Returns { detectedGame: string | null, confidence: 'high' | 'low' }.
// A plain allowlist hit is always 'high'; unknown or denylisted apps are 'low'.
function detectGame(processName, windowTitle) {
  const proc = (processName || '').trim();
  const title = (windowTitle || '').trim().toLowerCase();
  if (!proc && !title) return { detectedGame: null, confidence: 'low' };

  // Denylist wins: a game name in a browser tab or Discord status never counts.
  if (proc && DENYLIST.has(stripExe(proc))) {
    return { detectedGame: null, confidence: 'low' };
  }

  const procBase = proc ? stripExe(proc) : '';
  for (const entry of GAME_ALLOWLIST) {
    const exeHit = procBase && entry.exe.some((e) => stripExe(e) === procBase);
    const titleHit = title && entry.title.some((t) => title.includes(t));
    if (exeHit || titleHit) return { detectedGame: entry.game, confidence: 'high' };
  }
  return { detectedGame: null, confidence: 'low' };
}

const EMPTY_SNAPSHOT = Object.freeze({
  processName: null,
  windowTitle: null,
  detectedGame: null,
  confidence: 'low',
});

class GameDetector {
  // `activeWindow` is injectable for tests; in production it's lazily required
  // from active-win (8.x — CommonJS + N-API, ABI-stable across Electron so no
  // electron-rebuild is needed).
  constructor({ intervalMs = 3000, activeWindow } = {}) {
    this._intervalMs = intervalMs;
    this._activeWindow = activeWindow || null;
    this._timer = null;
    this._polling = false;
    this._snapshot = { ...EMPTY_SNAPSHOT };
    this._available = true;
  }

  start() {
    if (this._timer) return;
    // Kick an immediate poll so /current-game has data before the first interval.
    this._poll();
    this._timer = setInterval(() => this._poll(), this._intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getSnapshot() {
    return { ...this._snapshot };
  }

  _resolveActiveWindow() {
    if (this._activeWindow) return this._activeWindow;
    if (!this._available) return null;
    try {
      this._activeWindow = require('active-win');
    } catch (err) {
      this._available = false;
      this._activeWindow = null;
      console.error(`[GameDetection] active-win unavailable, /current-game will report unknown: ${err.message}`);
    }
    return this._activeWindow;
  }

  async _poll() {
    if (this._polling) return; // never overlap — active-win runs an async OS query
    this._polling = true;
    try {
      const activeWindow = this._resolveActiveWindow();
      if (!activeWindow) return;
      const win = await activeWindow();
      if (!win || !win.owner) {
        this._snapshot = { ...EMPTY_SNAPSHOT };
        return;
      }
      const processName =
        win.owner.name || (win.owner.path ? path.basename(win.owner.path) : '') || '';
      const windowTitle = win.title || '';
      const { detectedGame, confidence } = detectGame(processName, windowTitle);
      this._snapshot = {
        processName: processName || null,
        windowTitle: windowTitle || null,
        detectedGame,
        confidence,
      };
    } catch (err) {
      console.error(`[GameDetection] poll failed: ${err.message}`);
    } finally {
      this._polling = false;
    }
  }
}

module.exports = { GameDetector, detectGame, GAME_ALLOWLIST, DENYLIST, EMPTY_SNAPSHOT };
