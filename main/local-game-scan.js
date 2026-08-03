// Local game-library scanning for Steam and Epic Games.
//
// Builds a "local-scan tier" of {game, exe?, title?} entries the foreground
// classifier (main/game-detection.js) checks BEFORE its curated allowlist, so a
// game the user actually has installed is recognised even though it's not one of
// the hand-picked six.
//
// Everything here is best-effort and defensive: a missing launcher, an absent
// registry key, a permission error, or a malformed manifest degrades to an empty
// result for THAT source and never throws out of `scanAll` — the 3s foreground
// poll must never be blocked or crashed by a library scan.
//
// No native/FFI/compiled dependency is used: Steam's install path is read via
// plain `reg.exe` through child_process, VDF is parsed by our own pure-JS parser
// (main/vdf-parser.js), and Epic manifests are ordinary JSON.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { parseVdf } = require('./vdf-parser');

// ---------------------------------------------------------------------------
// Steam
// ---------------------------------------------------------------------------

// Read HKCU\Software\Valve\Steam\SteamPath via reg.exe. Resolves to the install
// path string, or null if Steam isn't installed / the key is missing / reg fails.
function getSteamPath() {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        resolve(parseSteamPathFromReg(stdout));
      }
    );
  });
}

// Parse the `SteamPath  REG_SZ  C:\Program Files (x86)\Steam` line from reg.exe
// output. reg reports the value type then the data; the data is everything after
// the type token, which lets paths contain spaces.
function parseSteamPathFromReg(stdout) {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*SteamPath\s+REG_[A-Z_]+\s+(.+?)\s*$/);
    if (match) {
      // Steam stores this with forward slashes; normalise to the OS separator.
      return path.normalize(match[1]);
    }
  }
  return null;
}

// Extract library-folder paths from a parsed libraryfolders.vdf object,
// defensively supporting both historical shapes:
//   - Older flat: { "LibraryFolders": { "0": "C:\\path", "1": "D:\\path", ... } }
//   - Newer nested: { "libraryfolders": { "0": { "path": "C:\\path", ... }, ... } }
// The top-level key's casing has also varied, so match it case-insensitively.
function parseLibraryFolders(vdfObject) {
  if (!vdfObject || typeof vdfObject !== 'object') return [];

  const rootKey = Object.keys(vdfObject).find(
    (k) => k.toLowerCase() === 'libraryfolders'
  );
  const root = rootKey ? vdfObject[rootKey] : vdfObject;
  if (!root || typeof root !== 'object') return [];

  const paths = [];
  for (const [key, value] of Object.entries(root)) {
    // Numeric index keys hold the folders; skip metadata like
    // "contentstatsid" / "timenextstatsreport" that appear at this level.
    if (!/^\d+$/.test(key)) continue;

    if (typeof value === 'string') {
      paths.push(path.normalize(value)); // flat format
    } else if (value && typeof value === 'object' && typeof value.path === 'string') {
      paths.push(path.normalize(value.path)); // nested format
    }
  }
  return paths;
}

// Parse one appmanifest_*.acf into a display name, or null if it lacks a usable
// AppState.name. installdir/appid are read too but only name is needed for the
// title-substring entry Steam supports.
function parseAppManifest(vdfObject) {
  if (!vdfObject || typeof vdfObject !== 'object') return null;
  const stateKey = Object.keys(vdfObject).find(
    (k) => k.toLowerCase() === 'appstate'
  );
  const appState = stateKey ? vdfObject[stateKey] : null;
  if (!appState || typeof appState !== 'object') return null;

  const name = typeof appState.name === 'string' ? appState.name.trim() : '';
  if (!name) return null;

  return {
    name,
    installdir: typeof appState.installdir === 'string' ? appState.installdir : null,
    appid: typeof appState.appid === 'string' ? appState.appid : null,
  };
}

// Steam manifests never expose a launch executable, so Steam entries fall back
// to title-substring matching — but some games' actual runtime window title is
// an internal project codename that doesn't contain the Steam display name at
// all (e.g. Palworld's window title is just "Pal"), which silently defeats
// substring matching. Unreal Engine packaged builds always name their real
// game executable "<Something>-Win64-Shipping.exe" (or Win32), regardless of
// the project's internal name or the Steam store name — a highly specific,
// low-false-positive-risk convention. When present, this gives the entry a
// real `exe` match so detection doesn't depend on window-title wording at all.
const SHIPPING_EXE_PATTERN = /-win(?:32|64)-shipping\.exe$/i;
const MAX_SHIPPING_EXE_SCAN_DEPTH = 5;

// The shipping-exe convention is Unreal-only. Godot, Unity and GameMaker titles
// name their executable after the game itself, so an exe whose filename matches
// the Steam manifest name is just as reliable a signal and covers every other
// engine. Slay the Spire 2 is the case that forced this: a Godot game shipping
// SlayTheSpire2.exe, detected via nothing but a window-title substring of
// "slay the spire 2" — which the game never produces, since it brands itself
// "Slay the Spire II".
//
// Comparison is on alphanumerics only, with a trailing Roman numeral folded to
// its Arabic form, so all the ways one game gets spelled line up:
//   "Slay the Spire 2" (Steam manifest) / "SlayTheSpire2.exe" / "SlayTheSpireII.exe"
// Folding is restricted to a trailing *word* — camel case and digit boundaries
// split the exe name into words first — so a single-word name that merely ends
// in numeral letters ("Phoenix.exe") is never mangled.
const TRAILING_ROMAN = {
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
  xi: '11', xii: '12', xiii: '13',
};

function canonicalGameKey(name) {
  const words = String(name || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length > 1) {
    const arabic = TRAILING_ROMAN[words[words.length - 1]];
    if (arabic) words[words.length - 1] = arabic;
  }
  return words.join('');
}

// Breadth-first, depth-bounded search for the real game executable under an
// install directory. A *-Win64/32-Shipping.exe wins outright: the convention is
// specific enough that a match is essentially guaranteed to be the game and
// never engine tooling (CrashReportClient, EpicWebHelper, etc). Failing that,
// and only when `gameName` is supplied, an exe whose filename canonicalises to
// the same key as the game name is used. Bounded depth keeps this cheap even
// for many-GB installs.
function findGameExe(rootDir, gameName) {
  const wantedKey = gameName ? canonicalGameKey(gameName) : '';
  let nameMatch = null;
  let queue = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable/missing — skip this branch
    }
    for (const dirent of entries) {
      if (!dirent.isFile()) continue;
      if (SHIPPING_EXE_PATTERN.test(dirent.name)) {
        return dirent.name.toLowerCase();
      }
      if (
        !nameMatch &&
        wantedKey &&
        /\.exe$/i.test(dirent.name) &&
        canonicalGameKey(dirent.name.slice(0, -4)) === wantedKey
      ) {
        nameMatch = dirent.name.toLowerCase();
      }
    }
    if (depth < MAX_SHIPPING_EXE_SCAN_DEPTH) {
      for (const dirent of entries) {
        if (dirent.isDirectory()) {
          queue.push({ dir: path.join(dir, dirent.name), depth: depth + 1 });
        }
      }
    }
  }
  return nameMatch;
}

// Scan every Steam library folder for installed apps. Steam manifests expose no
// executable name, so entries are title-substring by default, upgraded to a
// real exe match when a *-Shipping.exe is found under the install directory.
// Never throws: any failure yields [].
async function scanSteam({ steamPath } = {}) {
  try {
    const root = steamPath || (await getSteamPath());
    if (!root) return [];

    const libraryVdfPath = path.join(root, 'steamapps', 'libraryfolders.vdf');
    let libraryFolders;
    try {
      libraryFolders = parseLibraryFolders(parseVdf(fs.readFileSync(libraryVdfPath, 'utf8')));
    } catch {
      // No/malformed libraryfolders.vdf — fall back to the primary library only.
      libraryFolders = [];
    }
    // The install root itself is always a library, even if it's not listed.
    if (!libraryFolders.some((p) => path.normalize(p) === path.normalize(root))) {
      libraryFolders.push(root);
    }

    const entries = [];
    const seen = new Set();

    for (const folder of libraryFolders) {
      const steamappsDir = path.join(folder, 'steamapps');
      let files;
      try {
        files = fs.readdirSync(steamappsDir);
      } catch {
        continue; // library folder gone / unreadable — skip it
      }

      for (const file of files) {
        if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
        try {
          const manifest = parseAppManifest(
            parseVdf(fs.readFileSync(path.join(steamappsDir, file), 'utf8'))
          );
          if (!manifest) continue;
          const key = manifest.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          const entry = { game: manifest.name, title: [manifest.name.toLowerCase()] };
          if (manifest.installdir) {
            const commonDir = path.join(folder, 'steamapps', 'common');
            const installDir = path.resolve(commonDir, manifest.installdir);
            // installdir comes from an on-disk manifest and is untrusted; reject
            // anything that resolves outside steamapps/common (e.g. "../../..").
            if (installDir === commonDir || installDir.startsWith(commonDir + path.sep)) {
              const gameExe = findGameExe(installDir, manifest.name);
              if (gameExe) entry.exe = [gameExe];
            }
          }
          entries.push(entry);
        } catch {
          // Stale / partial / malformed manifest — skip this one, keep going.
          continue;
        }
      }
    }

    return entries;
  } catch (err) {
    console.error(`[LocalGameScan] Steam scan failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Epic Games
// ---------------------------------------------------------------------------

// The manifests directory name has varied across launcher versions; check both
// candidates and use whichever exists.
const EPIC_MANIFEST_DIRS = [
  path.join('C:\\', 'ProgramData', 'Epic', 'EpicGamesLauncherData', 'Manifests'),
  path.join('C:\\', 'ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
];

function resolveEpicManifestDir(candidates = EPIC_MANIFEST_DIRS) {
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      continue;
    }
  }
  return null;
}

// Parse one Epic `.item` JSON payload into a classifier entry, or null if it's
// missing the fields we need. Epic gives a real executable, so entries support
// both exe and title matching (like the curated allowlist).
function parseEpicItem(json) {
  if (!json || typeof json !== 'object') return null;
  const displayName = typeof json.DisplayName === 'string' ? json.DisplayName.trim() : '';
  const launchExe = typeof json.LaunchExecutable === 'string' ? json.LaunchExecutable.trim() : '';
  if (!displayName) return null;

  const entry = { game: displayName, title: [displayName.toLowerCase()] };
  if (launchExe) {
    // LaunchExecutable is relative to InstallLocation; we only need its basename.
    const exeBase = path.basename(launchExe.replace(/\\/g, '/')).toLowerCase();
    if (exeBase) entry.exe = [exeBase];
  }
  return entry;
}

// Scan Epic's manifest folder for installed games. Never throws: any failure
// yields [].
async function scanEpic({ manifestDir } = {}) {
  try {
    const dir = manifestDir || resolveEpicManifestDir();
    if (!dir) return [];

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      return [];
    }

    const entries = [];
    const seen = new Set();

    for (const file of files) {
      if (!/\.item$/i.test(file)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const entry = parseEpicItem(json);
        if (!entry) continue;
        const key = entry.game.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
      } catch {
        // Malformed / partial .item — skip it, keep scanning the rest.
        continue;
      }
    }

    return entries;
  } catch (err) {
    console.error(`[LocalGameScan] Epic scan failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

// Run every source and return a single merged local-scan tier. Each source is
// isolated, so one failing doesn't drop the others. Epic entries (which carry an
// exe) win over a Steam entry for the same game name.
async function scanAll(opts = {}) {
  const [epic, steam] = await Promise.all([
    scanEpic(opts.epic),
    scanSteam(opts.steam),
  ]);

  const merged = [];
  const seen = new Set();
  for (const entry of [...epic, ...steam]) {
    const key = entry.game.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

module.exports = {
  getSteamPath,
  parseSteamPathFromReg,
  parseLibraryFolders,
  parseAppManifest,
  findGameExe,
  scanSteam,
  resolveEpicManifestDir,
  parseEpicItem,
  scanEpic,
  scanAll,
  EPIC_MANIFEST_DIRS,
};
