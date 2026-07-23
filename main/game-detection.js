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

// Match a focused window against a single tier — a `{game, exe?, title?}[]`
// list. `exe` values match the process's executable basename; `title` values
// are case-insensitive substrings of the window title.
//
// An exe hit is exact, so the first one wins. Title hits are substring matches
// and therefore ambiguous — a Steam library containing both "Counter-Strike"
// and "Counter-Strike 2" would match the shorter, wrong entry for a window
// titled "Counter-Strike 2" purely on manifest ordering. The LONGEST matching
// title wins instead, which is always the more specific entry.
function matchTier(tier, procBase, title) {
  if (!Array.isArray(tier)) return null;
  let bestTitleGame = null;
  let bestTitleLength = 0;
  for (const entry of tier) {
    if (!entry) continue;
    if (procBase && Array.isArray(entry.exe) && entry.exe.some((e) => stripExe(e) === procBase)) {
      return entry.game;
    }
    if (title && Array.isArray(entry.title)) {
      for (const t of entry.title) {
        if (t && title.includes(t) && t.length > bestTitleLength) {
          bestTitleLength = t.length;
          bestTitleGame = entry.game;
        }
      }
    }
  }
  return bestTitleGame;
}

// Pure classifier. Returns { detectedGame: string | null, confidence: 'high' | 'low' }.
//
// `tiers` is an ORDERED list of tiers, each a `{game, exe?, title?}[]`-shaped
// list, checked top-to-bottom; the first tier with a match wins. This makes the
// priority order data, not code: a caller can prepend a higher-priority tier
// (e.g. a live local-library scan, or — in a future story — a prelive-history
// tier) without touching this function. The denylist still short-circuits
// everything before any tier is consulted. Default is the curated allowlist
// alone, preserving the original single-list behaviour.
function detectGame(processName, windowTitle, tiers = [GAME_ALLOWLIST]) {
  const proc = (processName || '').trim();
  const title = (windowTitle || '').trim().toLowerCase();
  if (!proc && !title) return { detectedGame: null, confidence: 'low' };

  // Denylist wins: a game name in a browser tab or Discord status never counts.
  if (proc && DENYLIST.has(stripExe(proc))) {
    return { detectedGame: null, confidence: 'low' };
  }

  const procBase = proc ? stripExe(proc) : '';
  for (const tier of tiers) {
    const game = matchTier(tier, procBase, title);
    if (game) return { detectedGame: game, confidence: 'high' };
  }
  return { detectedGame: null, confidence: 'low' };
}

const EMPTY_SNAPSHOT = Object.freeze({
  processName: null,
  windowTitle: null,
  detectedGame: null,
  confidence: 'low',
});

// Local-library scans change rarely (installed-game lists don't churn), so we
// rescan far less often than the 3s foreground poll — every 12 minutes.
const DEFAULT_SCAN_INTERVAL_MS = 12 * 60 * 1000;

class GameDetector {
  // `activeWindow` is injectable for tests; in production it's lazily required
  // from active-win (8.x — CommonJS + N-API, ABI-stable across Electron so no
  // electron-rebuild is needed). `scanLocalLibraries` is likewise injectable; in
  // production it lazily loads the Steam/Epic scanner. It must resolve to a
  // `{game, exe?, title?}[]` tier and never reject (the scanner swallows its own
  // errors), but we still guard against rejection here.
  //
  // `getPrelivetier` is a synchronous getter returning the current prelive
  // game-history tier (a `{game, title?}[]` list), checked AHEAD of the local
  // scan and curated allowlist. It's dependency-injected the same way — this
  // class never touches HTTP or the API key, it just reads a tier each poll — so
  // clearing the prelive key (empty tier) immediately drops that priority level.
  constructor({
    intervalMs = 3000,
    scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS,
    activeWindow,
    scanLocalLibraries,
    getPreliveTier,
    lastGoodTtlMs = 5 * 60 * 1000,
    now,
  } = {}) {
    this._intervalMs = intervalMs;
    this._scanIntervalMs = scanIntervalMs;
    this._activeWindow = activeWindow || null;
    this._scanLocalLibraries = scanLocalLibraries || null;
    this._getPreliveTier = typeof getPreliveTier === 'function' ? getPreliveTier : () => [];
    this._timer = null;
    this._scanTimer = null;
    this._polling = false;
    this._scanning = false;
    this._snapshot = { ...EMPTY_SNAPSHOT };
    this._available = true;
    // Cached, dynamically-scanned tier. Checked BEFORE the curated allowlist so
    // an actually-installed game outranks the hand-picked six. Starts empty and
    // is replaced wholesale by each successful scan.
    this._localTier = [];
    // Most recent poll whose foreground was NOT a denylisted app, plus the time
    // it was seen. forcePoll() falls back to it when an on-demand recheck lands
    // on a denylisted foreground (see forcePoll). Injectable clock keeps it
    // testable.
    this._lastGoodTtlMs = lastGoodTtlMs;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._lastForeground = null;
  }

  start() {
    if (this._timer) return;
    // Kick an immediate poll so /current-game has data before the first interval.
    this._poll();
    this._timer = setInterval(() => this._poll(), this._intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();

    // Local-library scanning runs on its own, much slower cadence and must never
    // block or crash the foreground poll above.
    this._runLocalScan();
    this._scanTimer = setInterval(() => this._runLocalScan(), this._scanIntervalMs);
    if (typeof this._scanTimer.unref === 'function') this._scanTimer.unref();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._scanTimer) {
      clearInterval(this._scanTimer);
      this._scanTimer = null;
    }
  }

  _resolveScanner() {
    if (this._scanLocalLibraries) return this._scanLocalLibraries;
    try {
      this._scanLocalLibraries = require('./local-game-scan').scanAll;
    } catch (err) {
      this._scanLocalLibraries = async () => [];
      console.error(`[GameDetection] local-game-scan unavailable: ${err.message}`);
    }
    return this._scanLocalLibraries;
  }

  async _runLocalScan() {
    if (this._scanning) return; // never overlap scans
    this._scanning = true;
    try {
      const scan = this._resolveScanner();
      const entries = await scan();
      // Degrade gracefully: a non-array / bad result becomes an empty tier
      // rather than corrupting classification.
      this._localTier = Array.isArray(entries) ? entries : [];
    } catch (err) {
      // The scanner is supposed to swallow its own errors; if one still escapes,
      // keep the previous tier and log — never let it bubble into the poll loop.
      console.error(`[GameDetection] local library scan failed: ${err.message}`);
    } finally {
      this._scanning = false;
    }
  }

  getSnapshot() {
    return { ...this._snapshot };
  }

  // Run one immediate foreground poll and return the resulting snapshot. Reuses
  // the exact same classification path as the interval-driven poll (no duplicated
  // logic) and awaits its completion so the caller sees the freshly-classified
  // window, not the previous cached snapshot. Used by the /current-game/recheck
  // endpoint for on-demand rechecks; the background interval is untouched.
  //
  // Recheck is triggered from the Meta dock — an OBS browser panel — so the
  // click that fires it pulls OS focus onto OBS (or the browser), both on the
  // DENYLIST. A naive fresh poll then lands on that denylisted app and returns
  // null, masking the game the background poll already caught while the user was
  // actually playing. So: when the freshly-sampled foreground is a known
  // non-game app, hand back the last non-denylisted foreground instead.
  //
  // The fallback keeps unrecognized foregrounds too, not just classified games:
  // processName/windowTitle are what the dock turns into a Twitch-catalog
  // search, and OBS's own window title would resolve to nothing.
  //
  // A genuinely unknown *game* in the foreground (unrecognized exe, not
  // denylisted) is NOT overridden — it falls through with its own process/title.
  async forcePoll() {
    await this._poll();
    const snapshot = this.getSnapshot();
    if (snapshot.detectedGame) return snapshot;

    const procBase = snapshot.processName ? stripExe(snapshot.processName) : '';
    const focusStolen = procBase && DENYLIST.has(procBase);
    if (focusStolen && this._lastForeground) {
      const { at, ...lastGood } = this._lastForeground;
      if (this._now() - at <= this._lastGoodTtlMs) return lastGood;
    }
    return snapshot;
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
      // Prefer the exe basename: on Windows active-win sets owner.name to the
      // friendly app name ("OBS Studio"), which never matches DENYLIST's exe
      // basenames ("obs64"), silently disabling the focus-stolen fallback.
      const exeBase = win.owner.path ? path.basename(win.owner.path) : '';
      const processName = exeBase || win.owner.name || '';
      const windowTitle = win.title || '';
      // Priority order: prelive game-history tier (highest — games the user has
      // actually streamed) → local Steam/Epic scan → curated allowlist fallback.
      // The prelive tier is read live each poll, so pairing/unpairing a key takes
      // effect on the next poll with no other change. A getter throwing (or
      // returning a non-array) degrades to an empty tier rather than breaking the
      // poll.
      let preliveTier = [];
      try {
        const t = this._getPreliveTier();
        if (Array.isArray(t)) preliveTier = t;
      } catch (err) {
        console.error(`[GameDetection] prelive tier getter failed: ${err.message}`);
      }
      const tiers = [preliveTier, this._localTier, GAME_ALLOWLIST];
      const { detectedGame, confidence } = detectGame(processName, windowTitle, tiers);
      this._snapshot = {
        processName: processName || null,
        windowTitle: windowTitle || null,
        detectedGame,
        confidence,
      };
      // Remember the last poll whose foreground wasn't a denylisted app so an
      // on-demand recheck fired from OBS (which steals focus) can fall back to it.
      const procBase = processName ? stripExe(processName) : '';
      if (procBase && !DENYLIST.has(procBase)) {
        this._lastForeground = { ...this._snapshot, at: this._now() };
      }
    } catch (err) {
      console.error(`[GameDetection] poll failed: ${err.message}`);
    } finally {
      this._polling = false;
    }
  }
}

module.exports = {
  GameDetector,
  detectGame,
  matchTier,
  GAME_ALLOWLIST,
  DENYLIST,
  EMPTY_SNAPSHOT,
  DEFAULT_SCAN_INTERVAL_MS,
};
