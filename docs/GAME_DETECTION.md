# Foreground Game Detection

SoundPad Pro detects which game currently has OS focus and exposes it over the
same local HTTP server used for now-playing attribution
(`http://127.0.0.1:3006`, `127.0.0.1`-only, never exposed to the network).

External tools — OBS docks, browser sources, prelive — can poll this to, for
example, switch scenes or overlays based on the game being played.

## Endpoint

```
GET http://127.0.0.1:3006/current-game
```

Response:

```json
{
  "processName": "cs2.exe",
  "windowTitle": "Counter-Strike 2",
  "detectedGame": "Counter-Strike 2",
  "confidence": "high"
}
```

| Field          | Type                | Notes                                                                 |
| -------------- | ------------------- | --------------------------------------------------------------------- |
| `processName`  | `string \| null`    | Executable basename of the focused window (e.g. `cs2.exe`).           |
| `windowTitle`  | `string \| null`    | Title of the focused window.                                          |
| `detectedGame` | `string \| null`    | Human-readable game name, or `null` when unknown / not a game.        |
| `confidence`   | `'high' \| 'low'`   | `'high'` for an allowlist hit; `'low'` for unknown / denylisted apps. |

CORS and Private Network Access headers are identical to `/now-playing`
(`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Private-Network: true`),
so it can be fetched from an OBS browser dock or an `https` overlay page.

## How it works

- The main process polls the focused window every ~3 seconds via
  [`active-win`](https://www.npmjs.com/package/active-win) and caches the result,
  so the HTTP handler never blocks on the OS query and audio playback is
  unaffected.
- The focused process name and window title are run through a pure classifier
  (`main/game-detection.js`):
  - A **denylist** of common non-game foreground apps (browsers, Discord, OBS,
    Explorer, IDEs/terminals) always reports `detectedGame: null`, so a game
    name appearing in a browser tab or Discord status is never misreported. The
    denylist short-circuits **before** any tier below is consulted.
  - An ordered list of **tiers** is then checked top-to-bottom; the first tier
    with a match wins (`detectedGame` set, `confidence: 'high'`). Each tier is a
    `{game, exe?, title?}[]` list. The priority order is data, not code — the
    `GameDetector` receives each tier through dependency injection and never
    knows how they're built. Current tiers, highest priority first:
    1. **Prelive history tier** — games the user has actually streamed,
       pulled from their prelive account over an authenticated API (see
       [Prelive pairing](#prelive-pairing) below). Empty until a key is paired.
    2. **Local-scan tier** — games actually installed via Steam / Epic,
       discovered by a periodic background scan (see below). Recognises titles
       far beyond the curated six.
    3. **Curated allowlist tier** (`GAME_ALLOWLIST`) — the hand-picked starter
       set, used as the final fallback.
  - Because higher tiers win, a game present in more than one tier is reported
    under its highest-priority source (prelive over local over curated). The
    prelive tier is read **live on every poll**, so pairing or unpairing a key
    takes effect on the next 3s poll with no restart.
  - Anything the denylist and all three tiers miss is reported as
    `detectedGame: null` (unknown) — the detector **never guesses**.

## Prelive pairing

The highest-priority tier is personalized to the user: the games they have
previously streamed, read from prelive's history API.

```
GET https://prelive.ai/api/v1/games/history
Authorization: Bearer <games:read API key>
```

The response envelope is `{ "data": { "games": string[] } }`; the client unwraps
`data.games` (with defensive fallbacks) and turns each name into a title-only
classifier entry (`{game, title: [name.toLowerCase()]}`) — the same
title-substring-only limitation as Steam local-scan entries, since the history
endpoint returns names only, no executable info.

### Setup

1. Go to **prelive.ai/settings?tab=api-keys**.
2. Create a new key and check **only** the **`games:read`** scope.
3. Copy the key (it is shown in plaintext only once — format `prl_live_…` /
   `prl_test_…`).
4. In SoundPad Pro, open **Integrations → Prelive**, paste the key, and click
   **Connect**. Once the first fetch succeeds the panel shows
   **"Connected — N games"**.

### How it fetches

- `main/prelive-client.js` stores the key via `electron-store` (flat key
  `prelive-api-key`) and calls the history endpoint over Node's built-in `https`
  module — the same convention as the Discord token exchange, no new HTTP
  dependency.
- A first fetch fires a few seconds after launch (never blocking startup), then
  the history refreshes on a slow ~45-minute interval — streamed-game lists
  change rarely.
- **Auth failure (HTTP 401/403)** — a revoked key, or one lacking `games:read` —
  clears the cached tier and surfaces a clear error ("API key was rejected…").
  It is **not** fast-retried, since the key won't fix itself.
- **Network failure** (prelive unreachable) keeps the last-good tier so a
  transient outage doesn't wipe personalization, reports a disconnected status,
  and retries on a shorter ~5-minute backoff. Neither case ever crashes or
  tight-loops.
- **Disconnecting** clears the stored key and the cached tier immediately; the
  next poll falls back to local-scan + curated only.

### Security

- **Treat the key like a password.** It is a credential: SoundPad Pro stores it
  locally, **never logs it**, and **never returns it to the UI** once stored —
  the status the renderer sees only reports whether a key is configured, the
  last fetch's success, and the cached game count, never the key itself.
- **Grant it nothing but `games:read`.** The key needs no other scope; do not
  check any additional scope boxes when minting it.
- **Revoking is instant.** Deleting the key in prelive's settings cuts off
  access on the very next fetch — no uninstall needed.

### Local library scanning

The `GameDetector` also runs a much slower background scan (every ~12 minutes —
installed-game lists change rarely) that builds the local-scan tier and caches
it in memory. It is fully isolated from the 3s foreground poll: a scan failure
(Steam not installed, missing registry key, permission error, malformed
manifest) degrades to an empty result for that source and never blocks or
crashes detection (`main/local-game-scan.js`).

- **Steam** — the install path is read from `HKCU\Software\Valve\Steam\SteamPath`
  via plain `reg.exe` (no native registry package). `steamapps/libraryfolders.vdf`
  is parsed (both the older flat and newer nested `"path"` shapes are handled),
  then each `steamapps/appmanifest_*.acf` is parsed for its `AppState.name`.
  Steam manifests expose no executable, so Steam-sourced entries are
  **title-substring only** — a documented limitation, not a bug.
- **Epic Games** — every `.item` JSON under
  `C:\ProgramData\Epic\EpicGamesLauncherData\Manifests\` (falling back to
  `…\EpicGamesLauncher\Data\Manifests\`) is read for `DisplayName` /
  `LaunchExecutable`. Epic gives a real exe name, so Epic entries support **both
  exe and title** matching, like the curated allowlist.
- VDF/KeyValues is parsed by a small hand-rolled, dependency-free pure-JS parser
  (`main/vdf-parser.js`) — no new native/compiled dependency, avoiding the
  ESM/asar packaging risk that burned `audio-decode` (see
  `docs/audio-routing-architecture.md`).

## Current limitations

- **Coverage beyond installed games.** With a paired prelive key, the history
  tier recognises any game the user has streamed (even if not currently
  installed). The local-scan tier recognises any game installed via Steam or
  Epic. The curated fallback (`GAME_ALLOWLIST` in
  `main/game-detection.js`) still covers a small hand-picked set (League of
  Legends, VALORANT, Counter-Strike 2, Fortnite, Minecraft, Apex Legends) for
  users without those launchers, and is trivial to extend — add an entry with
  the game's `exe` basename(s) and/or distinctive `title` substring(s). A game
  that is neither installed via a scanned launcher nor curated reports
  `detectedGame: null` even though `processName` / `windowTitle` are still
  returned.
- **Steam entries are title-only.** Steam's `appmanifest` files carry no
  executable name, so a Steam-sourced game is matched only by its window-title
  substring, never by exe. Epic entries (and curated entries) match on both.
- **Confidence is binary.** For this iteration a plain allowlist hit is always
  `'high'`; there is no fuzzy / low-confidence matching yet.
- **Windows-focused.** `processName` is the executable basename as reported by
  `active-win`. The allowlist entries use Windows executable names.
- **Native dependency.** `active-win` v8 ships an N-API native addon (ABI-stable
  across Electron, so no `electron-rebuild` step is needed) and is added to
  `asarUnpack` for packaged builds. If the native binary ever fails to load, the
  endpoint degrades gracefully to `detectedGame: null` and logs the failure
  rather than crashing.
