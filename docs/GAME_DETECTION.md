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
  - An **allowlist** maps known game executables / title substrings to display
    names (`detectedGame` set, `confidence: 'high'`).
  - A **denylist** of common non-game foreground apps (browsers, Discord, OBS,
    Explorer, IDEs/terminals) always reports `detectedGame: null`, so a game
    name appearing in a browser tab or Discord status is never misreported.
  - Anything neither allowlisted nor denylisted is reported as
    `detectedGame: null` (unknown) — the detector **never guesses**.

## Current limitations

- **Starter game list.** The allowlist currently covers a small set of popular
  titles (League of Legends, VALORANT, Counter-Strike 2, Fortnite, Minecraft,
  Apex Legends). Games not on the list report `detectedGame: null` even though
  `processName` / `windowTitle` are still returned. The list lives in
  `GAME_ALLOWLIST` in `main/game-detection.js` and is trivial to extend — add an
  entry with the game's `exe` basename(s) and/or distinctive `title`
  substring(s).
- **Confidence is binary.** For this iteration a plain allowlist hit is always
  `'high'`; there is no fuzzy / low-confidence matching yet.
- **Windows-focused.** `processName` is the executable basename as reported by
  `active-win`. The allowlist entries use Windows executable names.
- **Native dependency.** `active-win` v8 ships an N-API native addon (ABI-stable
  across Electron, so no `electron-rebuild` step is needed) and is added to
  `asarUnpack` for packaged builds. If the native binary ever fails to load, the
  endpoint degrades gracefully to `detectedGame: null` and logs the failure
  rather than crashing.
