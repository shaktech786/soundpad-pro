const http = require('http');
const fs = require('fs');
const path = require('path');

// Local HTTP server that broadcasts which sounds are currently playing so
// external tools (OBS docks, prelive) can show/push music attribution.
// Binds to 127.0.0.1 only — never exposed to the network.
//
// Attribution metadata is read from an `attribution.json` file sitting in the
// same directory as the audio file being played:
//   { "tracks": { "<filename>": { "title", "artist", "license",
//                                 "requiresAttribution", "credit", "url" } } }
class NowPlayingServer {
  constructor({
    port = 3006,
    getAsioPlaying,
    getWdmPlaying,
    getCurrentGame,
    onNowPlayingChange,
    pollIntervalMs = 2000,
  } = {}) {
    this.port = port;
    this.getAsioPlaying = getAsioPlaying || (() => []);
    this.getWdmPlaying = getWdmPlaying || (() => []);
    this.getCurrentGame = getCurrentGame || (() => null);
    // Fired when the primary now-playing sound changes (or stops → null), so
    // consumers like Discord Rich Presence can react without polling the HTTP
    // endpoint themselves.
    this.onNowPlayingChange = onNowPlayingChange || null;
    this.pollIntervalMs = pollIntervalMs;
    this.server = null;
    this._startedAt = new Map(); // filePath -> epoch ms when first seen playing
    this._manifestCache = new Map(); // dir -> { mtimeMs, tracks }
    this._pollTimer = null;
    this._lastPrimaryKey = null; // `${filePath}:${startedAt}` of last broadcast primary
  }

  start() {
    if (this.server) return;
    this.server = http.createServer((req, res) => this._handle(req, res));
    this.server.on('error', (err) => {
      console.error(`[NowPlaying] Server error: ${err.message}`);
    });
    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[NowPlaying] Listening on http://127.0.0.1:${this.port}`);
    });
    if (this.onNowPlayingChange && !this._pollTimer) {
      this._pollTimer = setInterval(() => this._pollNowPlaying(), this.pollIntervalMs);
      // Don't let the poll timer keep the process (or a test worker) alive.
      if (this._pollTimer.unref) this._pollTimer.unref();
    }
  }

  shutdown() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /** Recompute the current now-playing set and, if the primary track changed
   * (including a replay of the same file, or a stop → null), notify the
   * onNowPlayingChange listener exactly once per transition. */
  _pollNowPlaying() {
    const primary = this._pickPrimary(this._playingTracks());
    const key = primary ? `${primary.filePath}:${primary.startedAt}` : null;
    if (key === this._lastPrimaryKey) return;
    this._lastPrimaryKey = key;
    if (this.onNowPlayingChange) {
      try {
        this.onNowPlayingChange(primary);
      } catch (err) {
        console.error(`[NowPlaying] onNowPlayingChange listener failed: ${err.message}`);
      }
    }
  }

  /** The most-recently-started track is treated as the primary one to surface
   * (a newly triggered sound takes over the presence). */
  _pickPrimary(tracks) {
    let primary = null;
    for (const track of tracks) {
      if (!primary || track.startedAt > primary.startedAt) primary = track;
    }
    return primary;
  }

  _handle(req, res) {
    // CORS for OBS browser docks (including https pages fetching a local
    // address, which requires the Private Network Access preflight header).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = (req.url || '').split('?')[0];
    if (url === '/now-playing') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(this._snapshot()));
    } else if (url === '/current-game') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(this._currentGame()));
    } else if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, app: 'soundpad-pro' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  _snapshot() {
    return { nowPlaying: this._playingTracks(), timestamp: Date.now() };
  }

  /** Merge the ASIO + WDM playing sets, maintain per-file start timestamps, and
   * return the enriched track list. Shared by the HTTP snapshot and the poll
   * loop so both see identical state. */
  _playingTracks() {
    const playing = new Set();
    let asio = [];
    let wdm = [];
    try { asio = this.getAsioPlaying() || []; } catch (_) { /* ignore */ }
    try { wdm = this.getWdmPlaying() || []; } catch (_) { /* ignore */ }
    for (const fp of asio) playing.add(fp);
    for (const fp of wdm) playing.add(fp);

    const now = Date.now();
    for (const fp of playing) {
      if (!this._startedAt.has(fp)) this._startedAt.set(fp, now);
    }
    for (const fp of [...this._startedAt.keys()]) {
      if (!playing.has(fp)) this._startedAt.delete(fp);
    }

    const modeOf = (fp) => (asio.includes(fp) ? 'asio' : 'wdm');
    return [...playing].map((filePath) => ({
      filePath,
      fileName: path.basename(filePath),
      mode: modeOf(filePath),
      startedAt: this._startedAt.get(filePath),
      attribution: this._lookupAttribution(filePath),
    }));
  }

  _currentGame() {
    let state;
    try {
      state = this.getCurrentGame();
    } catch (_) {
      state = null;
    }
    if (!state || typeof state !== 'object') {
      return { processName: null, windowTitle: null, detectedGame: null, confidence: 'low' };
    }
    const detectedGame = state.detectedGame != null ? String(state.detectedGame) : null;
    return {
      processName: state.processName != null ? String(state.processName) : null,
      windowTitle: state.windowTitle != null ? String(state.windowTitle) : null,
      detectedGame,
      // Confidence is 'high' only for a real allowlist hit (non-null game).
      confidence: detectedGame && state.confidence === 'high' ? 'high' : 'low',
    };
  }

  _lookupAttribution(filePath) {
    const dir = path.dirname(filePath);
    const manifestPath = path.join(dir, 'attribution.json');
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(manifestPath).mtimeMs;
    } catch (_) {
      this._manifestCache.delete(dir);
      return null;
    }

    let cached = this._manifestCache.get(dir);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const tracks = {};
        for (const [name, info] of Object.entries(parsed.tracks || {})) {
          tracks[name.toLowerCase()] = info;
        }
        cached = { mtimeMs, tracks };
        this._manifestCache.set(dir, cached);
      } catch (err) {
        console.error(`[NowPlaying] Bad attribution.json in ${dir}: ${err.message}`);
        return null;
      }
    }

    return cached.tracks[path.basename(filePath).toLowerCase()] || null;
  }
}

module.exports = { NowPlayingServer };
