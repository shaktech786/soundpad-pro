/**
 * Discord RPC client (connection + OAuth handshake only).
 *
 * Speaks the Discord IPC protocol directly over the local named pipe
 * (\\?\pipe\discord-ipc-{0..9} on Windows) using Node's built-in `net`
 * module — no native dependency. This is the same wire protocol used by the
 * `discord-rpc` / `@xhayper/discord-rpc` npm packages:
 *
 *   frame = [opcode: int32 LE][length: int32 LE][payload: UTF-8 JSON]
 *
 * Flow:
 *   1. Connect to the first pipe index that accepts a connection.
 *   2. Send opcode 0 HANDSHAKE with the app's client_id, wait for the READY
 *      dispatch.
 *   3. AUTHENTICATE with a stored access token, or AUTHORIZE (pops Discord's
 *      native consent dialog) then exchange the returned code at
 *      https://discord.com/api/oauth2/token for an access token.
 *   4. Persist the token so later launches skip re-authorization (refreshing
 *      silently via the refresh_token grant when expired).
 *
 * This module implements the connection + auth handshake, voice control
 * (SET_VOICE_SETTINGS / GET_VOICE_SETTINGS for mute/deafen), and Rich Presence
 * (SET_ACTIVITY — needs only the base `rpc` scope).
 */
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const EventEmitter = require('events');

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

// 'rpc.voice.write' is required for SET_VOICE_SETTINGS (mute/deafen control).
// Users who authorized before this scope was added are transparently
// re-authorized the first time a voice command hits a permissions error.
const SCOPES = ['rpc', 'identify', 'rpc.voice.write'];
const RECONNECT_INTERVAL_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const AUTHORIZE_TIMEOUT_MS = 120000; // user has to click "Authorize" in Discord
const DEFAULT_REDIRECT_URI = 'http://localhost';

const CONFIG_KEY = 'discord-client-config';
const AUTH_KEY = 'discord-rpc-auth';

// Valid status values: disconnected | connecting | awaiting-authorization | connected | error

/** Encode a single Discord IPC frame. */
function encodeFrame(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

/**
 * Decode as many complete frames as are present in `buffer`.
 * Returns the parsed frames and any trailing partial bytes to keep buffered.
 */
function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const op = buffer.readInt32LE(offset);
    const len = buffer.readInt32LE(offset + 4);
    if (buffer.length - offset - 8 < len) break; // wait for the rest
    const payload = buffer.slice(offset + 8, offset + 8 + len);
    let data = null;
    try {
      data = JSON.parse(payload.toString('utf8'));
    } catch (_) {
      data = null;
    }
    frames.push({ op, data });
    offset += 8 + len;
  }
  return { frames, rest: buffer.slice(offset) };
}

function pipePath(index) {
  return `\\\\?\\pipe\\discord-ipc-${index}`;
}

class DiscordRpcClient extends EventEmitter {
  constructor({ store } = {}) {
    super();
    this.store = store || null;
    this.socket = null;
    this.status = 'disconnected';
    this.error = null;
    this.user = null;
    this.voiceState = null; // { muted, deafened } from VOICE_SETTINGS_UPDATE

    this._desired = false; // true once connect() is called, until disconnect()
    this._connecting = false;
    this._reconnectTimer = null;
    this._readBuffer = Buffer.alloc(0);
    this._pending = new Map(); // nonce -> { resolve, reject }
    this._readyResolve = null;
    this._readyReject = null;
  }

  // --- config -------------------------------------------------------------

  getConfig() {
    const cfg = (this.store && this.store.get(CONFIG_KEY)) || {};
    return {
      clientId: cfg.clientId || '',
      clientSecret: cfg.clientSecret || '',
      redirectUri: cfg.redirectUri || DEFAULT_REDIRECT_URI,
    };
  }

  /** Merge and persist config. Never returns the secret to callers. */
  setConfig(partial) {
    const current = this.getConfig();
    const next = {
      clientId: partial && partial.clientId !== undefined ? partial.clientId.trim() : current.clientId,
      clientSecret:
        partial && partial.clientSecret !== undefined && partial.clientSecret !== ''
          ? partial.clientSecret.trim()
          : current.clientSecret,
      redirectUri:
        partial && partial.redirectUri !== undefined && partial.redirectUri !== ''
          ? partial.redirectUri.trim()
          : current.redirectUri,
    };
    if (this.store) this.store.set(CONFIG_KEY, next);
    return this.getPublicConfig();
  }

  /** Config safe to hand to the renderer — no secret material. */
  getPublicConfig() {
    const cfg = this.getConfig();
    return {
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      hasSecret: !!cfg.clientSecret,
      hasAuth: !!(this._loadAuth() && this._loadAuth().access_token),
    };
  }

  getStatus() {
    return { status: this.status, error: this.error, user: this.user };
  }

  _setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit('status', this.getStatus());
  }

  // --- public API ---------------------------------------------------------

  async connect() {
    this._desired = true;
    const { clientId } = this.getConfig();
    if (!clientId) {
      this._setStatus('error', 'Discord client ID not configured');
      return this.getStatus();
    }
    if (this.status === 'connected' || this._connecting) return this.getStatus();
    await this._openConnection();
    return this.getStatus();
  }

  disconnect() {
    this._desired = false;
    this._clearReconnect();
    this._rejectAllPending(new Error('Disconnected'));
    this._teardownSocket();
    this.user = null;
    this.voiceState = null;
    this._setStatus('disconnected');
    return this.getStatus();
  }

  // --- voice control ------------------------------------------------------

  /**
   * Apply mute/deafen state via Discord's SET_VOICE_SETTINGS command. Pass any
   * subset of { mute, deaf } — only the boolean keys provided are sent.
   * Returns Discord's resulting voice-settings object.
   */
  async setVoiceSettings(settings = {}) {
    return this._voiceCommand('SET_VOICE_SETTINGS', this._voiceArgs(settings));
  }

  /** Read Discord's current voice settings (mute, deaf, and more). */
  async getVoiceSettings() {
    return this._voiceCommand('GET_VOICE_SETTINGS', {});
  }

  // --- rich presence ------------------------------------------------------

  /**
   * Set (or clear) the user's Discord Rich Presence via the SET_ACTIVITY RPC
   * command. Pass an activity object to show a status, or `null`/omit it to
   * clear the current presence (Discord's convention: `activity: null` clears).
   *
   * Only the base `rpc` scope (already requested at connect) is required — this
   * works even if the user never granted `rpc.voice.write`.
   *
   * @param {null | {
   *   details?: string,
   *   state?: string,
   *   startTimestamp?: number,   // epoch ms; shown as an elapsed "for HH:MM"
   *   largeImageKey?: string,    // asset key registered on the Discord app
   * }} activity
   */
  async setActivity(activity) {
    return this._request('SET_ACTIVITY', {
      pid: process.pid,
      activity: activity ? this._activityArgs(activity) : null,
    });
  }

  /** Map our activity shape to Discord's SET_ACTIVITY `activity` payload,
   * dropping any fields the caller left undefined. */
  _activityArgs(activity) {
    const a = {};
    if (activity.details != null) a.details = String(activity.details);
    if (activity.state != null) a.state = String(activity.state);
    if (activity.startTimestamp != null) {
      a.timestamps = { start: Math.floor(activity.startTimestamp) };
    }
    if (activity.largeImageKey != null) {
      a.assets = { large_image: String(activity.largeImageKey) };
    }
    return a;
  }

  /** Keep only the boolean mute/deaf keys Discord accepts. */
  _voiceArgs(settings) {
    const args = {};
    if (settings && typeof settings.mute === 'boolean') args.mute = settings.mute;
    if (settings && typeof settings.deaf === 'boolean') args.deaf = settings.deaf;
    return args;
  }

  /**
   * Run a voice RPC command, transparently re-authorizing once if it fails
   * because the stored token lacks the rpc.voice.write scope (older tokens).
   */
  async _voiceCommand(cmd, args) {
    try {
      return await this._request(cmd, args);
    } catch (err) {
      if (this._isPermissionError(err)) {
        await this._reauthorize();
        return this._request(cmd, args);
      }
      throw err;
    }
  }

  _isPermissionError(err) {
    if (!err) return false;
    // 4006 = insufficient permissions, 4007 = OAuth2 scope error.
    if (err.code === 4006 || err.code === 4007) return true;
    return /permission|scope|unauthor/i.test(err.message || '');
  }

  /**
   * Drop the stored token and run a fresh AUTHORIZE + AUTHENTICATE on the live
   * connection. Pops Discord's consent dialog so the user can grant the new
   * scope; on success the connection returns to 'connected'.
   */
  async _reauthorize() {
    this._clearAuth();
    const freshToken = await this._authorize();
    const result = await this._request('AUTHENTICATE', { access_token: freshToken });
    this.user = (result && result.user) || null;
    this._setStatus('connected');
    this._subscribeVoiceState();
  }

  // --- connection lifecycle ----------------------------------------------

  async _openConnection() {
    if (this._connecting) return;
    this._connecting = true;
    this._setStatus('connecting');
    try {
      await this._connectPipe();
      await this._authenticateFlow();
      this._connecting = false;
      this._setStatus('connected');
      // Fire-and-forget: subscribing must not gate the connected transition,
      // and the renderer seeds initial state via getVoiceSettings() regardless.
      this._subscribeVoiceState();
    } catch (err) {
      this._connecting = false;
      this._teardownSocket();
      if (this._desired) {
        this._setStatus('error', err.message);
        this._scheduleReconnect();
      } else {
        this._setStatus('disconnected');
      }
    }
  }

  /** Try each pipe index in order; resolve once the READY dispatch arrives. */
  _connectPipe() {
    return new Promise((resolve, reject) => {
      const tryIndex = (index) => {
        if (index > 9) {
          reject(new Error('Discord IPC pipe not found (is Discord running?)'));
          return;
        }

        const socket = net.createConnection(pipePath(index));

        const onError = () => {
          socket.removeListener('connect', onConnect);
          socket.destroy();
          tryIndex(index + 1);
        };

        const onConnect = () => {
          socket.removeListener('error', onError);
          this.socket = socket;
          this._readBuffer = Buffer.alloc(0);
          this._bindSocket(socket);
          // The READY dispatch (see _handleFrame) resolves this promise.
          this._readyResolve = resolve;
          this._readyReject = reject;
          const { clientId } = this.getConfig();
          this._send(OP_HANDSHAKE, { v: 1, client_id: clientId });
        };

        socket.once('error', onError);
        socket.once('connect', onConnect);
      };

      tryIndex(0);
    });
  }

  _bindSocket(socket) {
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
    socket.on('error', () => {
      // A 'close' event always follows; that path handles teardown/reconnect.
    });
  }

  _onData(chunk) {
    this._readBuffer = Buffer.concat([this._readBuffer, chunk]);
    const { frames, rest } = decodeFrames(this._readBuffer);
    this._readBuffer = rest;
    for (const f of frames) this._handleFrame(f.op, f.data);
  }

  _onClose() {
    const err = new Error('Discord connection closed');
    this._rejectAllPending(err);
    this._rejectReady(err);
    this.socket = null;
    this._readBuffer = Buffer.alloc(0);
    if (this._connecting) return; // _openConnection's catch owns this case
    if (this._desired) {
      this._setStatus('error', 'Discord connection lost');
      this._scheduleReconnect();
    } else {
      this._setStatus('disconnected');
    }
  }

  _teardownSocket() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch (_) {
        /* already gone */
      }
      this.socket = null;
    }
    this._readBuffer = Buffer.alloc(0);
    this._rejectReady(new Error('Connection torn down'));
  }

  _scheduleReconnect() {
    if (!this._desired || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._desired && this.status !== 'connected') this._openConnection();
    }, RECONNECT_INTERVAL_MS);
  }

  _clearReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // --- framing ------------------------------------------------------------

  _send(op, data) {
    if (this.socket) this.socket.write(encodeFrame(op, data));
  }

  _handleFrame(op, msg) {
    if (op === OP_PING) {
      this._send(OP_PONG, msg);
      return;
    }
    if (op === OP_PONG) return;
    if (op === OP_CLOSE) {
      const err = new Error(msg && msg.message ? msg.message : 'Discord closed the connection');
      this._rejectAllPending(err);
      this._rejectReady(err);
      this._teardownSocket();
      return;
    }

    // OP_FRAME
    if (!msg) return;

    if (msg.evt === 'READY') {
      this._resolveReady(msg.data);
      return;
    }

    if (msg.nonce && this._pending.has(msg.nonce)) {
      const pending = this._pending.get(msg.nonce);
      this._pending.delete(msg.nonce);
      if (msg.evt === 'ERROR') {
        pending.reject(this._frameError(msg));
      } else {
        pending.resolve(msg.data);
      }
      return;
    }

    // Unsolicited push event from a SUBSCRIBE (no matching nonce): Discord
    // reports every manual mute/deafen change here so the UI stays in sync.
    if (msg.evt === 'VOICE_SETTINGS_UPDATE') {
      this._emitVoiceState(msg.data);
      return;
    }

    if (msg.evt === 'ERROR') {
      this.error = this._frameErrorMessage(msg);
    }
  }

  /** Normalize Discord's voice-settings payload to the renderer's shape and
   * broadcast it. `mute`/`deaf` are Discord's field names. */
  _emitVoiceState(data) {
    if (!data) return;
    const state = { muted: !!data.mute, deafened: !!data.deaf };
    this.voiceState = state;
    this.emit('voice-state', state);
  }

  /** Subscribe to VOICE_SETTINGS_UPDATE push events. Failure degrades the
   * bidirectional sync gracefully without tearing down the connection. */
  async _subscribeVoiceState() {
    try {
      await this._dispatch({ cmd: 'SUBSCRIBE', evt: 'VOICE_SETTINGS_UPDATE' });
    } catch (_) {
      /* subscription is best-effort; commands still work without it */
    }
  }

  _frameErrorMessage(msg) {
    return (msg.data && msg.data.message) || 'Discord RPC error';
  }

  /** Build an Error carrying Discord's numeric error code (used to detect
   * missing-scope/permission failures for transparent re-authorization). */
  _frameError(msg) {
    const err = new Error(this._frameErrorMessage(msg));
    if (msg.data && typeof msg.data.code === 'number') err.code = msg.data.code;
    return err;
  }

  _resolveReady(data) {
    const resolve = this._readyResolve;
    this._readyResolve = null;
    this._readyReject = null;
    if (resolve) resolve(data);
  }

  _rejectReady(err) {
    const reject = this._readyReject;
    this._readyResolve = null;
    this._readyReject = null;
    if (reject) reject(err);
  }

  _request(cmd, args, timeoutMs = REQUEST_TIMEOUT_MS) {
    return this._dispatch({ cmd, args }, timeoutMs);
  }

  /**
   * Send an OP_FRAME command carrying a fresh nonce and resolve when Discord
   * replies to that nonce. `payload` is the command body sans nonce — plain
   * commands pass { cmd, args }; SUBSCRIBE also carries a top-level `evt`.
   */
  _dispatch(payload, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to Discord'));
        return;
      }
      const nonce = crypto.randomUUID();
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this._pending.delete(nonce);
          reject(new Error(`Discord RPC command ${payload.cmd} timed out`));
        }, timeoutMs);
      }
      this._pending.set(nonce, {
        resolve: (data) => {
          if (timer) clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
      });
      this._send(OP_FRAME, { ...payload, nonce });
    });
  }

  _rejectAllPending(err) {
    for (const [, pending] of this._pending) pending.reject(err);
    this._pending.clear();
  }

  // --- authentication -----------------------------------------------------

  async _authenticateFlow() {
    const accessToken = await this._resolveAccessToken();
    if (accessToken) {
      try {
        const result = await this._request('AUTHENTICATE', { access_token: accessToken });
        this.user = (result && result.user) || null;
        return;
      } catch (_) {
        // Stored/refreshed token rejected — drop it and run the full flow.
        this._clearAuth();
      }
    }

    const freshToken = await this._authorize();
    const result = await this._request('AUTHENTICATE', { access_token: freshToken });
    this.user = (result && result.user) || null;
  }

  /** Return a usable access token from storage, refreshing if near expiry. */
  async _resolveAccessToken() {
    const auth = this._loadAuth();
    if (!auth || !auth.access_token) return null;
    const nearExpiry = auth.expires_at && auth.expires_at <= Date.now() + 60000;
    if (!nearExpiry) return auth.access_token;
    const refreshed = await this._refreshToken(auth.refresh_token).catch(() => null);
    return refreshed ? refreshed.access_token : null;
  }

  async _authorize() {
    this._setStatus('awaiting-authorization');
    const { clientId } = this.getConfig();
    const response = await this._request(
      'AUTHORIZE',
      { client_id: clientId, scopes: SCOPES },
      AUTHORIZE_TIMEOUT_MS,
    );
    const code = response && response.code;
    if (!code) throw new Error('Discord authorization was declined');
    const token = await this._exchangeCode(code);
    this._saveAuth(token);
    return token.access_token;
  }

  async _exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = this.getConfig();
    if (!clientSecret) throw new Error('Discord client secret not configured');
    return this._tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || DEFAULT_REDIRECT_URI,
    });
  }

  async _refreshToken(refreshToken) {
    if (!refreshToken) return null;
    const { clientId, clientSecret } = this.getConfig();
    if (!clientSecret) return null;
    const token = await this._tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    this._saveAuth(token);
    return token;
  }

  _tokenRequest(params) {
    return new Promise((resolve, reject) => {
      const body = new URLSearchParams(params).toString();
      const req = https.request(
        {
          hostname: 'discord.com',
          path: '/api/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = JSON.parse(data);
            } catch (_) {
              parsed = null;
            }
            if (res.statusCode >= 200 && res.statusCode < 300 && parsed && parsed.access_token) {
              resolve(parsed);
            } else {
              const msg =
                (parsed && (parsed.error_description || parsed.error)) ||
                `Discord token request failed (HTTP ${res.statusCode})`;
              reject(new Error(msg));
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Discord token request timed out'));
      });
      req.write(body);
      req.end();
    });
  }

  // --- token persistence --------------------------------------------------

  _loadAuth() {
    return (this.store && this.store.get(AUTH_KEY)) || null;
  }

  _saveAuth(token) {
    const existing = this._loadAuth() || {};
    const auth = {
      access_token: token.access_token,
      refresh_token: token.refresh_token || existing.refresh_token || null,
      scope: token.scope || SCOPES.join(' '),
      expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    };
    if (this.store) this.store.set(AUTH_KEY, auth);
    return auth;
  }

  _clearAuth() {
    if (this.store) this.store.delete(AUTH_KEY);
  }
}

module.exports = { DiscordRpcClient, encodeFrame, decodeFrames, pipePath };
