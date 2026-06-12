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
  constructor({ port = 3006, getAsioPlaying, getWdmPlaying } = {}) {
    this.port = port;
    this.getAsioPlaying = getAsioPlaying || (() => []);
    this.getWdmPlaying = getWdmPlaying || (() => []);
    this.server = null;
    this._startedAt = new Map(); // filePath -> epoch ms when first seen playing
    this._manifestCache = new Map(); // dir -> { mtimeMs, tracks }
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
  }

  shutdown() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
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
    } else if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, app: 'soundpad-pro' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  _snapshot() {
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
    return {
      nowPlaying: [...playing].map((filePath) => ({
        filePath,
        fileName: path.basename(filePath),
        mode: modeOf(filePath),
        startedAt: this._startedAt.get(filePath),
        attribution: this._lookupAttribution(filePath),
      })),
      timestamp: now,
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
