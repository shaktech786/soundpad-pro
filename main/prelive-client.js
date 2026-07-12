/**
 * Prelive API-key pairing + personalized game-history detection tier.
 *
 * Users mint a `games:read`-scoped Bearer API key in prelive's settings
 * (https://prelive.ai/settings?tab=api-keys) and paste it into SoundPad Pro.
 * With a key configured, this module periodically calls
 *
 *   GET https://prelive.ai/api/v1/games/history
 *   Authorization: Bearer <key>
 *
 * caches the returned list of game names in memory, and exposes it as a
 * classifier tier ({game, title:[name.toLowerCase()]}[]) that main/game-detection.js
 * checks AHEAD of the local Steam/Epic scan and the curated allowlist — so a game
 * the user has actually streamed is the highest-priority match.
 *
 * The key is a credential: it is stored via electron-store, NEVER logged, and
 * NEVER sent back to the renderer once stored (getStatus() only reports whether
 * one is configured and whether the last fetch succeeded).
 *
 * Outbound HTTP uses Node's built-in `https` module (same convention as
 * discord-rpc-client.js's `_tokenRequest`) — no new HTTP-client dependency. The
 * low-level JSON GET is injectable (`httpGetJson`) so the fetch/cache/error
 * logic can be unit-tested without a live network.
 */
const https = require('https');
const EventEmitter = require('events');

// electron-store key the plaintext API key is persisted under. Flat, credential.
const API_KEY_STORE_KEY = 'prelive-api-key';

const HISTORY_URL = 'https://prelive.ai/api/v1/games/history';

// A short initial fetch shortly after startup (never blocks launch), then a slow
// periodic refresh — streamed-game history changes rarely, so there's no need to
// poll aggressively. Mirrors the auto-updater's "initial delay + interval" shape.
const DEFAULT_INITIAL_DELAY_MS = 8000;
const DEFAULT_FETCH_INTERVAL_MS = 45 * 60 * 1000; // 45 min

// On a transient network failure we retry sooner than the full refresh interval
// (but never in a tight loop). Consistent with discord-rpc-client's
// RECONNECT_INTERVAL_MS reconnect cadence. An AUTH failure (revoked / wrong-scope
// key) is NOT fast-retried — the key won't fix itself — it waits the full interval.
const DEFAULT_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const REQUEST_TIMEOUT_MS = 15000;

// Extract the game-name array from the response envelope, defensively supporting
// a couple of shapes so a minor API change doesn't silently zero out detection:
//   - expected: { data: { games: ["Halo", ...] } }
//   - flatter fallbacks: { games: [...] } or a bare [...]
// Entries may be plain strings or objects carrying a `name`/`title` field.
function extractGames(parsed) {
  if (!parsed) return [];
  const container =
    (parsed.data && Array.isArray(parsed.data.games) && parsed.data.games) ||
    (Array.isArray(parsed.games) && parsed.games) ||
    (parsed.data && Array.isArray(parsed.data) && parsed.data) ||
    (Array.isArray(parsed) && parsed) ||
    [];

  const names = [];
  for (const item of container) {
    if (typeof item === 'string') {
      names.push(item);
    } else if (item && typeof item === 'object') {
      const name = item.name || item.title || item.game;
      if (typeof name === 'string') names.push(name);
    }
  }
  return names;
}

// Turn raw game names into a classifier tier. Title-only matching, same
// shape/limitation as the Story 2 Steam entries — the history endpoint returns
// names only, no exe info. Trims, drops blanks, and dedupes case-insensitively.
function buildTier(names) {
  const tier = [];
  const seen = new Set();
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tier.push({ game: name, title: [key] });
  }
  return tier;
}

class PreliveClient extends EventEmitter {
  constructor({
    store,
    httpGetJson,
    historyUrl = HISTORY_URL,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    fetchIntervalMs = DEFAULT_FETCH_INTERVAL_MS,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    logger = console,
  } = {}) {
    super();
    this.store = store || null;
    this._historyUrl = historyUrl;
    this._initialDelayMs = initialDelayMs;
    this._fetchIntervalMs = fetchIntervalMs;
    this._retryIntervalMs = retryIntervalMs;
    this._logger = logger;
    // Injectable low-level GET (url, headers) -> Promise<parsed JSON>. Defaults to
    // the built-in https implementation; tests pass a fake to avoid the network.
    this._httpGetJson = httpGetJson || this._httpsGetJson.bind(this);

    this._tier = []; // cached classifier tier from the last successful fetch
    this._connected = false;
    this._error = null;
    this._lastFetchAt = null;

    this._timer = null;
    this._fetching = false;
  }

  // --- api key (credential) -----------------------------------------------

  /** Whether an API key is currently configured. Never exposes the key itself. */
  hasApiKey() {
    return !!this._getApiKey();
  }

  _getApiKey() {
    const key = this.store ? this.store.get(API_KEY_STORE_KEY) : null;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
  }

  // --- status (never includes the key) ------------------------------------

  getStatus() {
    return {
      connected: this._connected,
      error: this._error,
      gameCount: this._tier.length,
      lastFetchAt: this._lastFetchAt,
    };
  }

  _emitStatus() {
    this.emit('status', this.getStatus());
  }

  /** Live classifier tier (a copy so callers can't mutate the cache). */
  getTier() {
    return this._tier.map((entry) => ({ game: entry.game, title: [...entry.title] }));
  }

  // --- lifecycle ----------------------------------------------------------

  /** Kick off the delayed initial fetch (only if a key is configured) and keep
   * the periodic refresh scheduled. Safe to call once at startup. */
  start() {
    if (!this.hasApiKey()) {
      // No key yet: sit disconnected without error until the user pairs one.
      this._connected = false;
      this._error = null;
      return;
    }
    this._scheduleNext(this._initialDelayMs);
  }

  /** Clear the refresh timer (mirrors gameDetector.stop() teardown). */
  stop() {
    this._clearTimer();
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  // Single self-rescheduling timer: never overlaps, never tight-loops. Unref'd so
  // it can't keep the process alive on its own.
  _scheduleNext(delayMs) {
    this._clearTimer();
    this._timer = setTimeout(() => {
      this._timer = null;
      this.refresh();
    }, delayMs);
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref();
  }

  // --- pairing ------------------------------------------------------------

  /**
   * Store a new API key, trigger an immediate fetch, and return the resulting
   * status. Rejects an empty/blank key without touching the stored one.
   */
  async setApiKey(key) {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed) {
      this._connected = false;
      this._error = 'API key is required';
      this._emitStatus();
      return this.getStatus();
    }
    if (this.store) this.store.set(API_KEY_STORE_KEY, trimmed);
    return this.refresh();
  }

  /** Clear the stored key, the cached tier, and reset status to disconnected.
   * Detection immediately falls back to local-scan + curated only. */
  disconnect() {
    this._clearTimer();
    if (this.store) this.store.delete(API_KEY_STORE_KEY);
    this._tier = [];
    this._connected = false;
    this._error = null;
    this._lastFetchAt = null;
    this._emitStatus();
    return this.getStatus();
  }

  // --- fetch --------------------------------------------------------------

  /**
   * Fetch the game history once, update the cache/status, emit 'status', and
   * schedule the next refresh. Never throws and never rejects — all failures are
   * captured into the status object.
   */
  async refresh() {
    if (this._fetching) return this.getStatus();

    const key = this._getApiKey();
    if (!key) {
      this._clearTimer();
      this._tier = [];
      this._connected = false;
      this._error = null;
      this._lastFetchAt = null;
      this._emitStatus();
      return this.getStatus();
    }

    this._fetching = true;
    try {
      const parsed = await this._httpGetJson(this._historyUrl, {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      });
      const tier = buildTier(extractGames(parsed));
      this._tier = tier;
      this._connected = true;
      this._error = null;
      this._lastFetchAt = Date.now();
      this._emitStatus();
      this._scheduleNext(this._fetchIntervalMs);
    } catch (err) {
      this._applyFetchError(err);
    } finally {
      this._fetching = false;
    }
    return this.getStatus();
  }

  _applyFetchError(err) {
    const statusCode = err && typeof err.statusCode === 'number' ? err.statusCode : null;
    if (statusCode === 401 || statusCode === 403) {
      // Revoked key or one missing the games:read scope. Stop using its (now
      // untrustworthy) data and surface a clear, actionable error. No fast retry —
      // the key won't fix itself; wait for the user to re-pair.
      this._tier = [];
      this._connected = false;
      this._error =
        'API key was rejected. Create a new key in prelive with the "games:read" scope and reconnect.';
      this._emitStatus();
      this._scheduleNext(this._fetchIntervalMs);
      return;
    }

    // Network / prelive-unreachable / bad-response: keep the last good tier (a
    // transient outage shouldn't wipe personalization) but report disconnected,
    // and retry sooner than the full refresh interval.
    this._connected = false;
    this._error = this._describeError(err, statusCode);
    // NOTE: intentionally never log the API key; only the error message is logged.
    if (this._logger && typeof this._logger.error === 'function') {
      this._logger.error(`[Prelive] history fetch failed: ${this._error}`);
    }
    this._emitStatus();
    this._scheduleNext(this._retryIntervalMs);
  }

  _describeError(err, statusCode) {
    if (statusCode) return `prelive returned HTTP ${statusCode}`;
    const msg = err && err.message ? err.message : String(err);
    return `Could not reach prelive (${msg})`;
  }

  // --- built-in https transport ------------------------------------------

  /** Default transport: HTTPS GET returning parsed JSON. Rejects with an Error
   * whose `.statusCode` is set for non-2xx responses so auth failures are
   * distinguishable from network failures. */
  _httpsGetJson(url, headers) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        { method: 'GET', headers, timeout: REQUEST_TIMEOUT_MS },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const { statusCode } = res;
            if (statusCode < 200 || statusCode >= 300) {
              const err = new Error(`prelive request failed (HTTP ${statusCode})`);
              err.statusCode = statusCode;
              reject(err);
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch (_) {
              reject(new Error('prelive returned a malformed JSON response'));
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('prelive request timed out'));
      });
      req.end();
    });
  }
}

module.exports = { PreliveClient, extractGames, buildTier, API_KEY_STORE_KEY, HISTORY_URL };
