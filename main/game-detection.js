const path = require('path');
const { execFile } = require('child_process');

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
  // this app — it serves the dock that triggers rechecks, so its own window is a
  // routine foreground. Both names: the packaged exe was renamed in PRE-385.
  'prelive deck', 'soundpad pro',
  // shell / file manager / OS surfaces
  'explorer', 'searchhost', 'searchui', 'shellexperiencehost', 'startmenuexperiencehost',
  // IDEs / editors / terminals
  'code', 'cursor', 'devenv', 'idea64', 'pycharm64', 'webstorm64', 'rider64',
  'sublime_text', 'notepad', 'notepad++', 'windowsterminal', 'wt', 'powershell',
  'pwsh', 'cmd', 'conhost', 'alacritty', 'wezterm-gui',
]);

// Game launchers, storefronts, overlays, and installers. These own transient
// windows ("Launching <Game>...", "Updating <Game>", a splash dialog) that appear
// for a few seconds during game startup. Their titles routinely CONTAIN a real
// game name, so without this they substring-match a detection tier and get
// reported as the game — and worse, get cached as the last-good foreground and
// served long after the dialog is gone. Kept separate from DENYLIST because the
// intent differs: DENYLIST is "this app is not a game", this is "this window is
// a transient artifact of starting a game".
const LAUNCHER_PROCESSES = new Set([
  // Steam
  'steam', 'steamwebhelper', 'steamerrorreporter', 'gameoverlayui', 'steamservice',
  // Epic
  'epicgameslauncher', 'epicwebhelper',
  // Battle.net
  'battle.net', 'battle.net helper', 'blizzardbrowser', 'blizzarderror',
  // GOG / Ubisoft / EA / Riot
  'galaxyclient', 'galaxyclient helper', 'upc', 'ubisoftconnect', 'ubisoftgamelauncher',
  'uplaywebcore', 'eadesktop', 'eabackgroundservice', 'ealauncher', 'origin',
  'riotclientservices', 'riotclientux', 'riotclientuxrender', 'riotclientcrashhandler',
  // generic installers / updaters
  'setup', 'installer', 'msiexec', 'unins000', 'uninstall',
]);

// Window titles that describe an in-progress operation rather than a running
// game. Anchored at the start so a game legitimately named e.g. "Starbound" is
// unaffected (`\b` after the verb prevents "Starting" matching "Starbound").
const LAUNCHER_TITLE_PATTERN =
  /^(?:launching|starting|preparing|updating|installing|downloading|verifying|validating|extracting|unpacking|syncing|configuring|initializing|loading|checking|please wait)\b/i;

// Progress dialogs end in an ellipsis ("Launching...", "Syncing files…"). A real
// game window title effectively never does.
const PROGRESS_ELLIPSIS_PATTERN = /(?:\.{3}|…)\s*$/;

// exe-name / title-substring -> human-readable game name. Deliberately a starter
// set; extend by adding entries. `exe` values are matched against the focused
// process's executable basename; `title` values are case-insensitive substrings
// of the window title. Either kind of hit is a match. Title entries are only
// listed where they're specific enough not to collide with non-game apps.
const GAME_ALLOWLIST = [
  { game: 'League of Legends', exe: ['league of legends.exe', 'leagueclient.exe'], title: ['league of legends'] },
  { game: 'VALORANT', exe: ['valorant.exe', 'valorant-win64-shipping.exe'], title: ['valorant'] },
  { game: 'Counter-Strike 2', exe: ['cs2.exe'], title: ['counter-strike 2'] },
  // CS 1.6 runs as hl.exe (GoldSrc) with the window title "Counter-Strike". No
  // exe entry: hl.exe is also plain Half-Life, so only the title identifies it.
  // "counter-strike" is a substring of the CS2 / CS:GO titles too, but
  // longest-title-wins in matchTier means those still resolve to their own entry.
  { game: 'Counter-Strike', title: ['counter-strike 1.6', 'counter-strike'] },
  { game: 'Counter-Strike: Global Offensive', title: ['counter-strike: global offensive'] },
  { game: 'Fortnite', exe: ['fortniteclient-win64-shipping.exe'], title: ['fortnite'] },
  { game: 'Minecraft', exe: ['minecraft.exe', 'minecraftlauncher.exe'], title: ['minecraft'] },
  { game: 'Apex Legends', exe: ['r5apex.exe'], title: ['apex legends'] },
];

function stripExe(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.exe') ? lower.slice(0, -4) : lower;
}

const PROCESS_CHECK_TIMEOUT_MS = 2000;

/**
 * Whether a process with this executable basename is still running.
 *
 * Tri-state on purpose: `true`/`false` are answers, `null` means "can't tell"
 * (unsupported platform, spawn failure, timeout, unparseable output). Callers
 * must treat null as "assume running" — a probe that cannot run must never make
 * detection worse than it was before the probe existed.
 *
 * Only consulted on forcePoll's fallback path, so this costs one short-lived
 * child process per recheck click, never one per background poll.
 */
function defaultIsProcessRunning(exeName) {
  const name = String(exeName || '').trim();
  if (!name) return Promise.resolve(null);

  const windows = process.platform === 'win32';
  const file = windows ? 'tasklist' : 'pgrep';
  const args = windows
    ? ['/FI', `IMAGENAME eq ${name}`, '/NH']
    : ['-x', stripExe(name)];

  return new Promise(resolve => {
    execFile(file, args, { timeout: PROCESS_CHECK_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (windows) {
        // tasklist exits 0 either way; a miss prints "INFO: No tasks are
        // running which match the specified criteria."
        if (err) return resolve(null);
        const out = String(stdout || '');
        if (/no tasks are running/i.test(out)) return resolve(false);
        return resolve(out.toLowerCase().includes(name.toLowerCase()));
      }
      // pgrep: exit 0 = at least one match, 1 = none, anything else = broken.
      if (!err) return resolve(true);
      return resolve(err.code === 1 ? false : null);
    });
  });
}

// PowerShell cold-starts in about half a second here; the budget leaves room
// for a slow disk without letting a hung shell pin a recheck for long.
const PROCESS_LIST_TIMEOUT_MS = 8000;

// Windows only lists the fields tasklist can't: the executable path (which
// places a process inside a game's install directory), the main window title
// (which names a game that has never held focus), and the start time (which
// orders two games that are up at once). tasklist's one flag that adds window
// titles, /V, resolves the owning user of every process first and took 27
// seconds on an ordinary desktop; Get-Process answers in about half a second.
const POWERSHELL_LIST_SCRIPT =
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
  "Get-Process | Select-Object Name,Path,MainWindowTitle," +
  "@{n='StartedAt';e={try{[int64](($_.StartTime.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds)}catch{$null}}} " +
  '| ConvertTo-Json -Compress';

/**
 * Parses Get-Process JSON into `{ name, path, title, startedAt }[]` — `name` is
 * the lowercase executable basename without `.exe`, the other three are null
 * when Windows withheld them (system processes have no readable path or start
 * time; most processes have no window). Returns null for unparseable input.
 */
function parseGetProcessOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const procs = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const procPath = typeof row.Path === 'string' && row.Path ? row.Path : null;
    const fromPath = procPath ? procPath.split(/[\\/]/).pop() : '';
    const name = stripExe(fromPath || (typeof row.Name === 'string' ? row.Name : ''));
    if (!name) continue;
    procs.push({
      name,
      path: procPath,
      title: typeof row.MainWindowTitle === 'string' && row.MainWindowTitle ? row.MainWindowTitle : null,
      startedAt: Number.isFinite(row.StartedAt) ? row.StartedAt : null,
    });
  }
  return procs.length > 0 ? procs : null;
}

/**
 * Every running process as `{ name, path, title, startedAt }` (see
 * parseGetProcessOutput), or `null` when the list can't be obtained
 * (unsupported platform, spawn failure, timeout, unparseable output). Off
 * Windows only `name` is populated.
 *
 * One child process per call, and only ever called from the resolve chain's
 * last-resort fallback — never from the 3s background poll.
 */
function defaultListRunningProcesses() {
  const windows = process.platform === 'win32';
  const file = windows ? 'powershell' : 'ps';
  const args = windows
    ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_LIST_SCRIPT]
    : ['-A', '-o', 'comm='];

  return new Promise(resolve => {
    execFile(file, args, { timeout: PROCESS_LIST_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      if (windows) return resolve(parseGetProcessOutput(stdout));
      const procs = [];
      for (const line of String(stdout).split(/\r?\n/)) {
        const base = line.trim().split(/[\\/]/).pop();
        if (base) procs.push({ name: stripExe(base), path: null, title: null, startedAt: null });
      }
      return resolve(procs.length > 0 ? procs : null);
    });
  });
}

// A transient launcher/installer window: the storefront process itself, or any
// window whose title reads as an in-progress operation. Checked independently of
// process name because Steam's "Launching <Game>..." dialog is owned by
// steamwebhelper.exe on some builds and by the game's own bootstrapper on others.
function isTransientLauncherWindow(procBase, title) {
  if (procBase && LAUNCHER_PROCESSES.has(procBase)) return true;
  if (!title) return false;
  return LAUNCHER_TITLE_PATTERN.test(title) || PROGRESS_ELLIPSIS_PATTERN.test(title);
}

/**
 * Whether a foreground window must never be classified as, or remembered as, a
 * game. Covers both "this app is not a game" (DENYLIST) and "this window is a
 * transient artifact of launching one" (LAUNCHER_*).
 *
 * Shared by the classifier, the `_lastForeground` cache write, and the
 * focus-stolen fallback so all three agree on what counts as unusable — a window
 * the classifier refuses must also never poison the cache.
 */
function isRejectedForeground(processName, windowTitle) {
  const procBase = processName ? stripExe(String(processName).trim()) : '';
  const title = (windowTitle || '').trim();
  if (procBase && DENYLIST.has(procBase)) return true;
  return isTransientLauncherWindow(procBase, title);
}

// Whether an executable lives inside a game's install directory. Separators are
// folded so a forward-slash path from active-win compares against a backslash
// path from a Steam manifest.
function pathUnderDir(procPath, dir) {
  if (!procPath || !dir) return false;
  const p = String(procPath).replace(/\//g, '\\').toLowerCase();
  const d = String(dir).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return d.length > 0 && p.startsWith(d + '\\');
}

// How a tier entry was matched, strongest first. An exe name is exact; an
// install directory is exact too but shared by a few games (every GoldSrc title
// lives in "Half-Life"); a title is a substring of whatever the window says.
const MATCH_KIND_RANK = { exe: 3, dir: 2, title: 1 };

// Match a process against a single tier — a `{game, exe?, title?, dir?}[]`
// list. `exe` values match the executable basename; `title` values are
// case-insensitive substrings of the window title; `dir` is an install
// directory the executable's path must sit under.
//
// An exe hit is exact, so the first one wins. Title hits are substring matches
// and therefore ambiguous — a Steam library containing both "Counter-Strike"
// and "Counter-Strike 2" would match the shorter, wrong entry for a window
// titled "Counter-Strike 2" purely on manifest ordering. The LONGEST matching
// title wins instead, which is always the more specific entry. A directory hit
// comes last, and only when exactly one entry claims that directory: it is what
// identifies a game whose window is titled after an internal codename, or that
// is still on a splash screen with no title at all, but Counter-Strike and
// Half-Life share one install directory and a title is the only thing that
// tells them apart.
//
// Returns `{ game, kind }` with kind in MATCH_KIND_RANK, or null.
function matchTierDetailed(tier, procBase, title, procPath) {
  if (!Array.isArray(tier)) return null;
  let bestTitleGame = null;
  let bestTitleLength = 0;
  let dirGame = null;
  let dirHits = 0;
  for (const entry of tier) {
    if (!entry) continue;
    if (procBase && Array.isArray(entry.exe) && entry.exe.some((e) => stripExe(e) === procBase)) {
      return { game: entry.game, kind: 'exe' };
    }
    if (title && Array.isArray(entry.title)) {
      for (const t of entry.title) {
        if (t && title.includes(t) && t.length > bestTitleLength) {
          bestTitleLength = t.length;
          bestTitleGame = entry.game;
        }
      }
    }
    if (procPath && entry.dir && pathUnderDir(procPath, entry.dir)) {
      dirHits += 1;
      dirGame = entry.game;
    }
  }
  if (bestTitleGame) return { game: bestTitleGame, kind: 'title' };
  if (dirHits === 1) return { game: dirGame, kind: 'dir' };
  return null;
}

function matchTier(tier, procBase, title, procPath) {
  const match = matchTierDetailed(tier, procBase, title, procPath);
  return match ? match.game : null;
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
//
// `processPath`, when known, lets an entry's install directory identify the
// process — see matchTierDetailed.
function detectGame(processName, windowTitle, tiers = [GAME_ALLOWLIST], processPath = null) {
  const proc = (processName || '').trim();
  const title = (windowTitle || '').trim().toLowerCase();
  if (!proc && !title) return { detectedGame: null, confidence: 'low' };

  // Rejection wins: a game name in a browser tab, a Discord status, or a Steam
  // "Launching <Game>..." dialog never counts.
  if (isRejectedForeground(proc, windowTitle)) {
    return { detectedGame: null, confidence: 'low' };
  }

  const procBase = proc ? stripExe(proc) : '';
  for (const tier of tiers) {
    const game = matchTier(tier, procBase, title, processPath);
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

// How long a cached foreground stays servable. Deliberately long: the cache is
// already gated on the process still being alive (_lastForegroundAlive), which
// is a far stronger staleness guard than a clock, and the original five minutes
// was the single biggest source of "detection is stuck on my last game" — launch
// a game, then spend twenty minutes in OBS and the browser setting the stream up,
// and every recheck reported nothing at all. A game you have not quit is still
// the game you are playing, however long ago you alt-tabbed away from it.
const DEFAULT_LAST_GOOD_TTL_MS = 12 * 60 * 60 * 1000;

/** How long a running-process scan result is reused before rescanning. */
const RUNNING_SCAN_TTL_MS = 10 * 1000;

/**
 * Floor between library rescans triggered by a manual recheck that found no
 * game. The scheduled scan runs every twelve minutes, so a game installed since
 * the last one is invisible to every tier until then — and a recheck click is
 * exactly when the streamer is looking. A scan is cheap (well under a second)
 * but rechecks come every fifteen seconds from the dock, so keep it bounded.
 */
const RESCAN_ON_MISS_MIN_INTERVAL_MS = 60 * 1000;

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
    lastGoodTtlMs = DEFAULT_LAST_GOOD_TTL_MS,
    isProcessRunning,
    listRunningProcesses,
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
    // { result, at } of the last running-process scan — see _detectRunningGame.
    this._runningScan = null;
    // When the local-library tier was last rebuilt — see _rescanLibraryIfStale.
    this._lastScanAt = null;
    this._isProcessRunning =
      typeof isProcessRunning === 'function' ? isProcessRunning : defaultIsProcessRunning;
    this._listRunningProcesses =
      typeof listRunningProcesses === 'function' ? listRunningProcesses : defaultListRunningProcesses;
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
      this._lastScanAt = this._now();
      this._scanning = false;
    }
  }

  /**
   * Rebuilds the local-library tier now unless it was rebuilt within the last
   * minute. Returns whether a rescan ran, so the caller knows a retry is worth
   * anything. The scan start() kicks off is the baseline: until it has
   * completed there is nothing stale to refresh.
   */
  async _rescanLibraryIfStale() {
    if (this._lastScanAt == null || this._now() - this._lastScanAt < RESCAN_ON_MISS_MIN_INTERVAL_MS) {
      return false;
    }
    await this._runLocalScan();
    return true;
  }

  /** The detection tiers in priority order: prelive history → local library → curated. */
  _tiers() {
    let preliveTier = [];
    try {
      const t = this._getPreliveTier();
      if (Array.isArray(t)) preliveTier = t;
    } catch (err) {
      console.error(`[GameDetection] prelive tier getter failed: ${err.message}`);
    }
    return [preliveTier, this._localTier, GAME_ALLOWLIST];
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
  // actually playing. So: when the freshly-sampled foreground is unusable (a
  // known non-game app, or a transient launcher/installer dialog), hand back the
  // last usable foreground instead — which, because the cache write applies the
  // same rejection, is always a window backed by a real process.
  //
  // The fallback keeps unrecognized foregrounds too, not just classified games:
  // processName/windowTitle are what the dock turns into a Twitch-catalog
  // search, and OBS's own window title would resolve to nothing.
  //
  // A genuinely unknown *game* in the foreground (unrecognized exe, not
  // denylisted) is NOT overridden — it falls through with its own process/title.
  //
  // A recheck is a click, so it gets the freshest answer the machine can give:
  // the running-process scan bypasses its throttle, and when nothing at all is
  // recognised the local library is rescanned (rate-limited) and the chain is
  // run once more — a game installed since the last scheduled scan is otherwise
  // invisible for up to twelve minutes, which reads as "detection is slow".
  async forcePoll() {
    await this._poll();
    const first = await this.resolve({ fresh: true });
    if (first.detectedGame) return first;
    if (!(await this._rescanLibraryIfStale())) return first;
    await this._poll();
    return this.resolve({ fresh: true });
  }

  /**
   * The best answer available right now WITHOUT forcing a fresh foreground
   * sample: latest poll -> cached last-good foreground -> running-process scan.
   *
   * This is the same chain forcePoll() applies, and it has to be, because the
   * passive GET /current-game reading is what the Meta dock's background poll
   * follows every few seconds. Serving it the raw snapshot meant the dock was
   * blind in exactly the situation it exists for: the dock lives in an OBS
   * browser panel, so the foreground is OBS or a browser essentially all the
   * time, the snapshot's detectedGame is therefore null, and the dock kept
   * showing whatever game was last written to the field. Detection looked stuck
   * on the previous game while a recheck click — the one path that ran this
   * chain — answered correctly.
   *
   * When the cache and the running-process scan disagree, the cached game wins
   * unless the other one was launched after the cached one last held focus:
   * that is the streamer quitting one game and starting the next, and the old
   * process is either lingering on its way out or was deliberately left open.
   *
   * `fresh` skips the running-scan throttle — for a manual recheck.
   */
  async resolve({ fresh = false } = {}) {
    const snapshot = this.getSnapshot();
    if (snapshot.detectedGame) return snapshot;

    const unusable = isRejectedForeground(snapshot.processName, snapshot.windowTitle);
    const lastGood = unusable ? await this._usableLastForeground() : null;

    if (lastGood && lastGood.snapshot.detectedGame) {
      const running = await this._detectRunningGame(fresh);
      if (
        running &&
        running.snapshot.detectedGame !== lastGood.snapshot.detectedGame &&
        running.startedAt != null &&
        running.startedAt > lastGood.at
      ) {
        return running.snapshot;
      }
      return lastGood.snapshot;
    }

    // Nothing recognised in the foreground and nothing recognised in the cache,
    // but a known game may still be RUNNING. This covers the cold start (Prelive
    // Deck launched while the game is already up, never alt-tabbed back into it)
    // and the freshly launched game that has not held focus yet, or is still on
    // a splash screen that gave the foreground path nothing to go on.
    const running = await this._detectRunningGame(fresh);
    if (running) return running.snapshot;

    // An unrecognised but real foreground is still worth handing back: its
    // process name and title are what the dock searches Twitch's catalog for,
    // and OBS's own window title would resolve to nothing.
    if (lastGood) return lastGood.snapshot;

    return snapshot;
  }

  /**
   * The cached last-good foreground as `{ snapshot, at }`, re-classified
   * against the CURRENT tiers so a library rescan or a prelive-history refresh
   * takes effect on it without the window having to be focused again. Null
   * when there is none, it has expired, or its process has exited.
   */
  async _usableLastForeground() {
    if (!this._lastForeground) return null;
    const { at, processPath, ...lastGood } = this._lastForeground;
    if (this._now() - at > this._lastGoodTtlMs) return null;
    if (!(await this._lastForegroundAlive(lastGood))) return null;
    const { detectedGame, confidence } = detectGame(
      lastGood.processName,
      lastGood.windowTitle,
      this._tiers(),
      processPath,
    );
    return { snapshot: { ...lastGood, detectedGame, confidence }, at };
  }

  /**
   * A game from the detection tiers that is running right now, regardless of
   * what has ever held focus, as `{ snapshot, startedAt }` — or null. Every
   * running process is matched the way a focused window is (executable name,
   * then window title, then install directory), minus the ones the foreground
   * path rejects: storefronts, overlays, chat apps and progress dialogs.
   *
   * Tier priority is preserved (prelive history -> local library scan ->
   * curated allowlist), so the same game wins as it would in the foreground
   * path. Confidence is 'low': the process being alive is real evidence, but
   * unlike a focused window it does not prove this is what's on screen.
   */
  async _detectRunningGame(fresh = false) {
    // Throttled because resolve() runs on the periodic passive read, not just a
    // manual recheck, and this is the one step that spawns a process. The
    // steady state where it fires is "no game detected at all", i.e. exactly
    // when a dock polls repeatedly and learns nothing new.
    if (!fresh && this._runningScan && this._now() - this._runningScan.at <= RUNNING_SCAN_TTL_MS) {
      return this._runningScan.result;
    }
    const result = await this._scanRunningGame();
    this._runningScan = { result, at: this._now() };
    return result;
  }

  async _scanRunningGame() {
    let procs;
    try {
      procs = await this._listRunningProcesses();
    } catch (err) {
      console.error(`[GameDetection] running-process scan failed: ${err.message}`);
      return null;
    }
    if (!Array.isArray(procs) || procs.length === 0) return null;

    const candidates = procs.filter(
      (p) => p && p.name && !isRejectedForeground(`${p.name}.exe`, p.title || ''),
    );
    if (candidates.length === 0) return null;

    for (const tier of this._tiers()) {
      let best = null;
      for (const proc of candidates) {
        const match = matchTierDetailed(tier, proc.name, (proc.title || '').toLowerCase(), proc.path);
        if (!match) continue;
        // An exact match beats a title substring from some other window; among
        // equals — two games up at once, say the one just quit still winding
        // down beside the one just launched — the newest process wins.
        const rank = MATCH_KIND_RANK[match.kind];
        if (
          !best ||
          rank > best.rank ||
          (rank === best.rank && proc.startedAt != null && (best.startedAt == null || proc.startedAt > best.startedAt))
        ) {
          best = { game: match.game, proc, rank, startedAt: proc.startedAt };
        }
      }
      if (best) {
        return {
          snapshot: {
            processName: `${best.proc.name}.exe`,
            windowTitle: best.proc.title || null,
            detectedGame: best.game,
            confidence: 'low',
          },
          startedAt: best.startedAt == null ? null : best.startedAt,
        };
      }
    }
    return null;
  }

  // The cached foreground is only worth serving while its process is still
  // alive. Switching games is the case that matters: quit A, launch B, then hit
  // recheck from the OBS dock before B has ever held focus for a poll tick — it
  // is usually still on a launcher splash, which the cache write rejects — and
  // every recheck confidently reported A for the full five-minute TTL. Pushing
  // that publishes the previous game's category to a live stream.
  //
  // A probe that can't answer (unsupported platform, spawn failure, timeout)
  // leaves the cache trusted, so a broken check never regresses detection.
  async _lastForegroundAlive(lastGood) {
    if (!lastGood.processName) return true;
    let running;
    try {
      running = await this._isProcessRunning(lastGood.processName);
    } catch (err) {
      console.error(`[GameDetection] process liveness check failed: ${err.message}`);
      return true;
    }
    if (running === false) {
      this._lastForeground = null;
      return false;
    }
    return true;
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
      const processPath = win.owner.path || null;
      const exeBase = processPath ? path.basename(processPath) : '';
      const processName = exeBase || win.owner.name || '';
      const windowTitle = win.title || '';
      // Priority order: prelive game-history tier (highest — games the user has
      // actually streamed) → local Steam/Epic scan → curated allowlist fallback.
      // The prelive tier is read live each poll, so pairing/unpairing a key takes
      // effect on the next poll with no other change.
      const { detectedGame, confidence } = detectGame(processName, windowTitle, this._tiers(), processPath);
      this._snapshot = {
        processName: processName || null,
        windowTitle: windowTitle || null,
        detectedGame,
        confidence,
      };
      // Remember the last usable foreground so an on-demand recheck fired from
      // OBS (which steals focus) can fall back to it. A rejected read must leave
      // the previous value intact: caching a Steam "Launching <Game>..." dialog
      // here made every subsequent recheck report the launcher instead of the
      // game that was actually running. The path rides along so the cache can
      // be re-classified against a rescanned library.
      if (processName && !isRejectedForeground(processName, windowTitle)) {
        this._lastForeground = { ...this._snapshot, processPath, at: this._now() };
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
  DEFAULT_LAST_GOOD_TTL_MS,
  RUNNING_SCAN_TTL_MS,
  RESCAN_ON_MISS_MIN_INTERVAL_MS,
  matchTier,
  matchTierDetailed,
  parseGetProcessOutput,
  isRejectedForeground,
  GAME_ALLOWLIST,
  DENYLIST,
  LAUNCHER_PROCESSES,
  EMPTY_SNAPSHOT,
  DEFAULT_SCAN_INTERVAL_MS,
};
