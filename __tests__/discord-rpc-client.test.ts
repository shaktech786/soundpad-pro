import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import net from 'net'

import {
  DiscordRpcClient,
  encodeFrame,
  decodeFrames,
  pipePath,
} from '../main/discord-rpc-client'

const OP_HANDSHAKE = 0
const OP_FRAME = 1

// Mirrors the hardcoded prelive Public Client ID in discord-rpc-client.js.
const DEFAULT_CLIENT_ID = '1523146707725058048'

// The Client Secret is baked into the build from the DISCORD_CLIENT_SECRET env
// var (scripts/generate-discord-secret.js). Tests supply it the same way — env
// first wins in embeddedClientSecret(). "No secret configured" tests delete it.
beforeEach(() => {
  process.env.DISCORD_CLIENT_SECRET = 'test-client-secret'
})
afterEach(() => {
  delete process.env.DISCORD_CLIENT_SECRET
})

// A stand-in for a net.Socket: an EventEmitter that records writes and lets the
// test drive the connect/error/data lifecycle by hand.
class FakeSocket extends EventEmitter {
  writes: Buffer[] = []
  destroyed = false

  write(buf: Buffer) {
    this.writes.push(Buffer.from(buf))
    return true
  }

  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

// The Client Secret no longer lives in the store — it's build-embedded via the
// DISCORD_CLIENT_SECRET env var (see the beforeEach above). The store only holds
// the OAuth token (discord-rpc-auth).
function makeStore(initial: Record<string, any> = {}) {
  const data: Record<string, any> = { ...initial }
  return {
    get: (key: string) => data[key],
    set: (key: string, value: any) => {
      data[key] = value
    },
    delete: (key: string) => {
      delete data[key]
    },
    _data: data,
  }
}

/** Read the parsed frames a client wrote to its fake socket. */
function writtenFrames(socket: FakeSocket) {
  return decodeFrames(Buffer.concat(socket.writes)).frames
}

describe('discord-rpc-client framing', () => {
  test('encodeFrame/decodeFrames round-trips opcode and payload', () => {
    const buf = encodeFrame(OP_HANDSHAKE, { v: 1, client_id: 'abc' })
    const { frames, rest } = decodeFrames(buf)
    expect(rest.length).toBe(0)
    expect(frames).toHaveLength(1)
    expect(frames[0].op).toBe(OP_HANDSHAKE)
    expect(frames[0].data).toEqual({ v: 1, client_id: 'abc' })
  })

  test('decodeFrames keeps trailing partial bytes buffered', () => {
    const full = encodeFrame(OP_FRAME, { hello: 'world' })
    const partial = full.slice(0, full.length - 3)
    const { frames, rest } = decodeFrames(partial)
    expect(frames).toHaveLength(0)
    expect(rest.length).toBe(partial.length)
  })

  test('decodeFrames parses multiple concatenated frames', () => {
    const combined = Buffer.concat([
      encodeFrame(OP_HANDSHAKE, { a: 1 }),
      encodeFrame(OP_FRAME, { b: 2 }),
    ])
    const { frames } = decodeFrames(combined)
    expect(frames.map((f) => f.data)).toEqual([{ a: 1 }, { b: 2 }])
  })

  test('pipePath targets the Windows discord-ipc named pipe', () => {
    expect(pipePath(0)).toBe('\\\\?\\pipe\\discord-ipc-0')
    expect(pipePath(7)).toBe('\\\\?\\pipe\\discord-ipc-7')
  })
})

describe('DiscordRpcClient connection/handshake', () => {
  let createConnectionSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    createConnectionSpy?.mockRestore()
    vi.useRealTimers()
  })

  test('sends a HANDSHAKE frame with the hardcoded client_id on connect', async () => {
    const socket = new FakeSocket()
    createConnectionSpy = vi
      .spyOn(net, 'createConnection')
      .mockImplementation(() => socket as any)

    const store = makeStore()
    const client = new DiscordRpcClient({ store })

    client.connect()
    // Simulate the pipe accepting the connection.
    socket.emit('connect')

    const frames = writtenFrames(socket)
    expect(frames).toHaveLength(1)
    expect(frames[0].op).toBe(OP_HANDSHAKE)
    expect(frames[0].data).toEqual({ v: 1, client_id: DEFAULT_CLIENT_ID })
  })

  test('falls through pipe indices until one connects', async () => {
    const sockets: FakeSocket[] = []
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation((path: any) => {
      const s = new FakeSocket()
      sockets.push(s)
      return s as any
    })

    const store = makeStore()
    const client = new DiscordRpcClient({ store })

    client.connect()

    // First two pipe indices refuse; the third accepts.
    sockets[0].emit('error', new Error('ENOENT'))
    sockets[1].emit('error', new Error('ENOENT'))
    sockets[2].emit('connect')

    expect(createConnectionSpy).toHaveBeenCalledTimes(3)
    expect(createConnectionSpy).toHaveBeenNthCalledWith(1, pipePath(0))
    expect(createConnectionSpy).toHaveBeenNthCalledWith(3, pipePath(2))

    // Handshake goes out on the socket that connected.
    const frames = writtenFrames(sockets[2])
    expect(frames[0].op).toBe(OP_HANDSHAKE)
  })

  test('emits connecting status and schedules a reconnect when no pipe answers', async () => {
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => {
      const s = new FakeSocket()
      // Reject asynchronously so all 10 indices are exhausted.
      queueMicrotask(() => s.emit('error', new Error('ENOENT')))
      return s as any
    })

    const store = makeStore()
    const client = new DiscordRpcClient({ store })

    const statuses: string[] = []
    client.on('status', (s: any) => statuses.push(s.status))

    // The pipe fallback rejects via microtasks (no real timers), so awaiting
    // the connect() promise is enough — reconnect is then scheduled on a timer.
    await client.connect()

    expect(statuses[0]).toBe('connecting')
    expect(client.getStatus().status).toBe('error')
    // Indices 0..9 were all attempted.
    expect(createConnectionSpy).toHaveBeenCalledTimes(10)
    // A background reconnect is queued (fake timers keep it from actually firing).
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  test('AUTHENTICATE uses a stored, unexpired access token instead of re-authorizing', async () => {
    const socket = new FakeSocket()
    createConnectionSpy = vi
      .spyOn(net, 'createConnection')
      .mockImplementation(() => socket as any)

    const store = makeStore({
      'discord-rpc-auth': {
        access_token: 'stored-token',
        refresh_token: 'refresh',
        expires_at: Date.now() + 3600_000,
      },
    })
    const client = new DiscordRpcClient({ store })

    const connected = client.connect()
    socket.emit('connect')

    // Discord replies READY to the handshake.
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }))

    // The next frame the client writes must be AUTHENTICATE (never AUTHORIZE).
    await vi.waitFor(() => {
      const frames = writtenFrames(socket)
      expect(frames.some((f) => f.data && f.data.cmd === 'AUTHENTICATE')).toBe(true)
    })

    const authFrame = writtenFrames(socket).find((f) => f.data && f.data.cmd)!
    expect(authFrame.data.cmd).toBe('AUTHENTICATE')
    expect(authFrame.data.args).toEqual({ access_token: 'stored-token' })
    expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHORIZE')).toBe(false)

    // Reply to AUTHENTICATE so the connection settles as connected.
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'AUTHENTICATE',
        nonce: authFrame.data.nonce,
        data: { user: { id: '1', username: 'tester' } },
      }),
    )

    const result = await connected
    expect(result.status).toBe('connected')
    expect(result.user).toEqual({ id: '1', username: 'tester' })
  })

  test('hasStoredAuth reflects whether an access token is persisted', () => {
    const withToken = new DiscordRpcClient({
      store: makeStore({ 'discord-rpc-auth': { access_token: 'tok', refresh_token: 'r' } }),
    })
    expect(withToken.hasStoredAuth()).toBe(true)

    const withoutToken = new DiscordRpcClient({ store: makeStore() })
    expect(withoutToken.hasStoredAuth()).toBe(false)

    const emptyToken = new DiscordRpcClient({
      store: makeStore({ 'discord-rpc-auth': { access_token: '' } }),
    })
    expect(emptyToken.hasStoredAuth()).toBe(false)
  })

  test('_exchangeCode posts the hardcoded client_id and the configured client_secret', async () => {
    const client = new DiscordRpcClient({ store: makeStore() })
    const tokenSpy = vi
      .spyOn(client as any, '_tokenRequest')
      .mockResolvedValue({ access_token: 't', refresh_token: 'r', expires_in: 3600 })

    await (client as any)._exchangeCode('auth-code')

    expect(tokenSpy).toHaveBeenCalledTimes(1)
    const params = tokenSpy.mock.calls[0][0]
    expect(params).toEqual({
      client_id: DEFAULT_CLIENT_ID,
      client_secret: 'test-client-secret',
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: 'http://localhost',
    })
  })

  test('_exchangeCode throws when no client_secret is embedded', async () => {
    delete process.env.DISCORD_CLIENT_SECRET
    const client = new DiscordRpcClient({ store: makeStore() })
    await expect((client as any)._exchangeCode('auth-code')).rejects.toThrow(
      'Discord Client Secret not configured',
    )
  })

  test('_refreshToken posts the hardcoded client_id and the configured client_secret', async () => {
    const client = new DiscordRpcClient({ store: makeStore() })
    const tokenSpy = vi
      .spyOn(client as any, '_tokenRequest')
      .mockResolvedValue({ access_token: 't2', refresh_token: 'r2', expires_in: 3600 })

    await (client as any)._refreshToken('old-refresh')

    expect(tokenSpy).toHaveBeenCalledTimes(1)
    const params = tokenSpy.mock.calls[0][0]
    expect(params).toEqual({
      client_id: DEFAULT_CLIENT_ID,
      client_secret: 'test-client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    })
  })

  test('_refreshToken resolves to null when no client_secret is embedded', async () => {
    delete process.env.DISCORD_CLIENT_SECRET
    const client = new DiscordRpcClient({ store: makeStore() })
    await expect((client as any)._refreshToken('old-refresh')).resolves.toBeNull()
  })

  test('connect() surfaces an error status when no client_secret is embedded', async () => {
    delete process.env.DISCORD_CLIENT_SECRET
    const client = new DiscordRpcClient({ store: makeStore() })
    const status = await client.connect()
    expect(status.status).toBe('error')
    expect(status.error).toMatch(/not configured/)
  })

  test('_getClientSecret reads the build-embedded env secret, trimmed', () => {
    process.env.DISCORD_CLIENT_SECRET = '  env-secret  '
    const client = new DiscordRpcClient({ store: makeStore() })
    expect((client as any)._getClientSecret()).toBe('env-secret')
  })

  test('getPublicConfig reports only auth state, never the secret', () => {
    const client = new DiscordRpcClient({ store: makeStore() })
    expect(client.getPublicConfig()).toEqual({ hasAuth: false })
    expect('hasClientSecret' in client.getPublicConfig()).toBe(false)
  })
})

describe('DiscordRpcClient voice control', () => {
  let createConnectionSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Drive a client through handshake + AUTHENTICATE (using a stored token) to
   * a settled 'connected' state, returning the client and its fake socket. */
  async function connectAuthedClient(store: ReturnType<typeof makeStore>) {
    const socket = new FakeSocket()
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => socket as any)
    const client = new DiscordRpcClient({ store })

    const connected = client.connect()
    socket.emit('connect')
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }))

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHENTICATE')).toBe(true)
    })
    const authFrame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHENTICATE')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'AUTHENTICATE',
        nonce: authFrame.data.nonce,
        data: { user: { id: '1', username: 'tester' } },
      }),
    )
    await connected
    return { client, socket }
  }

  function authedStore() {
    return makeStore({
      'discord-rpc-auth': {
        access_token: 'tok',
        refresh_token: 'r',
        expires_at: Date.now() + 3600_000,
      },
    })
  }

  test('AUTHORIZE requests the rpc.voice.write scope', async () => {
    const socket = new FakeSocket()
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => socket as any)
    const store = makeStore()
    const client = new DiscordRpcClient({ store })
    vi.spyOn(client as any, '_exchangeCode').mockResolvedValue({
      access_token: 't',
      refresh_token: 'r',
      expires_in: 3600,
    })

    const connected = client.connect()
    socket.emit('connect')
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }))

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHORIZE')).toBe(true)
    })
    const authorize = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHORIZE')!
    expect(authorize.data.args.scopes).toEqual(['rpc', 'identify', 'rpc.voice.write'])

    // Settle so the client doesn't leak a pending connection.
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'AUTHORIZE', nonce: authorize.data.nonce, data: { code: 'c' } }))
    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHENTICATE')).toBe(true)
    })
    const auth = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHENTICATE')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, { cmd: 'AUTHENTICATE', nonce: auth.data.nonce, data: { user: { id: '1', username: 't' } } }),
    )
    await connected
  })

  test('setVoiceSettings sends a SET_VOICE_SETTINGS frame with only boolean mute/deaf args', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.setVoiceSettings({ mute: true, deaf: false, bogus: 'ignored' } as any)

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')!
    expect(frame.data.args).toEqual({ mute: true, deaf: false })

    socket.emit(
      'data',
      encodeFrame(OP_FRAME, { cmd: 'SET_VOICE_SETTINGS', nonce: frame.data.nonce, data: { mute: true, deaf: false } }),
    )
    await expect(pending).resolves.toEqual({ mute: true, deaf: false })
  })

  test('getVoiceSettings sends a GET_VOICE_SETTINGS frame and resolves Discord state', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.getVoiceSettings()

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'GET_VOICE_SETTINGS')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'GET_VOICE_SETTINGS')!

    socket.emit(
      'data',
      encodeFrame(OP_FRAME, { cmd: 'GET_VOICE_SETTINGS', nonce: frame.data.nonce, data: { mute: true, deaf: false } }),
    )
    await expect(pending).resolves.toEqual({ mute: true, deaf: false })
  })

  test('re-authorizes and retries when a voice command fails for missing scope', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())
    const exchangeSpy = vi.spyOn(client as any, '_exchangeCode').mockResolvedValue({
      access_token: 'new-token',
      refresh_token: 'r2',
      expires_in: 3600,
    })

    const pending = client.setVoiceSettings({ mute: true })

    // First attempt is rejected by Discord with a permissions error.
    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')).toBe(true)
    })
    const firstSet = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'SET_VOICE_SETTINGS',
        evt: 'ERROR',
        nonce: firstSet.data.nonce,
        data: { code: 4006, message: 'Insufficient permissions' },
      }),
    )

    // The client re-consents with the new scope list.
    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHORIZE')).toBe(true)
    })
    const authorize = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHORIZE')!
    expect(authorize.data.args.scopes).toContain('rpc.voice.write')
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'AUTHORIZE', nonce: authorize.data.nonce, data: { code: 'auth-code' } }))

    // Then AUTHENTICATE with the freshly exchanged token.
    await vi.waitFor(() => {
      expect(writtenFrames(socket).filter((f) => f.data && f.data.cmd === 'AUTHENTICATE').length).toBeGreaterThanOrEqual(2)
    })
    const reauth = writtenFrames(socket).filter((f) => f.data && f.data.cmd === 'AUTHENTICATE').pop()!
    expect(reauth.data.args).toEqual({ access_token: 'new-token' })
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, { cmd: 'AUTHENTICATE', nonce: reauth.data.nonce, data: { user: { id: '1', username: 'tester' } } }),
    )

    // Finally the original command is retried and succeeds.
    await vi.waitFor(() => {
      expect(writtenFrames(socket).filter((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS').length).toBeGreaterThanOrEqual(2)
    })
    const retrySet = writtenFrames(socket).filter((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS').pop()!
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'SET_VOICE_SETTINGS', nonce: retrySet.data.nonce, data: { mute: true } }))

    await expect(pending).resolves.toEqual({ mute: true })
    expect(exchangeSpy).toHaveBeenCalledWith('auth-code')
  })

  test('propagates a non-permission voice error without re-authorizing', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.setVoiceSettings({ mute: true })
    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_VOICE_SETTINGS')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'SET_VOICE_SETTINGS',
        evt: 'ERROR',
        nonce: frame.data.nonce,
        data: { code: 1000, message: 'Something else' },
      }),
    )

    await expect(pending).rejects.toThrow(/Something else/)
    expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHORIZE')).toBe(false)
  })
})

describe('DiscordRpcClient rich presence', () => {
  let createConnectionSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function connectAuthedClient(store: ReturnType<typeof makeStore>) {
    const socket = new FakeSocket()
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => socket as any)
    const client = new DiscordRpcClient({ store })

    const connected = client.connect()
    socket.emit('connect')
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }))

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHENTICATE')).toBe(true)
    })
    const authFrame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHENTICATE')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'AUTHENTICATE',
        nonce: authFrame.data.nonce,
        data: { user: { id: '1', username: 'tester' } },
      }),
    )
    await connected
    return { client, socket }
  }

  function authedStore() {
    return makeStore({
      'discord-rpc-auth': { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600_000 },
    })
  }

  test('setActivity sends a SET_ACTIVITY frame carrying pid and the mapped activity', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.setActivity({
      details: 'Playing Airhorn',
      state: 'by Scott Buckley',
      startTimestamp: 1_700_000_000_000,
      largeImageKey: 'soundpad_pro',
    })

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_ACTIVITY')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_ACTIVITY')!
    expect(frame.data.args.pid).toBe(process.pid)
    expect(frame.data.args.activity).toEqual({
      details: 'Playing Airhorn',
      state: 'by Scott Buckley',
      timestamps: { start: 1_700_000_000_000 },
      assets: { large_image: 'soundpad_pro' },
    })

    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', nonce: frame.data.nonce, data: {} }))
    await expect(pending).resolves.toEqual({})
  })

  test('setActivity omits fields the caller left undefined', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.setActivity({ details: 'Playing Airhorn', startTimestamp: 1000 })

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_ACTIVITY')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_ACTIVITY')!
    expect(frame.data.args.activity).toEqual({ details: 'Playing Airhorn', timestamps: { start: 1000 } })
    expect(frame.data.args.activity.state).toBeUndefined()
    expect(frame.data.args.activity.assets).toBeUndefined()

    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', nonce: frame.data.nonce, data: {} }))
    await pending
  })

  test('setActivity(null) clears the presence by sending activity: null', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const pending = client.setActivity(null)

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SET_ACTIVITY')).toBe(true)
    })
    const frame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SET_ACTIVITY')!
    expect(frame.data.args.pid).toBe(process.pid)
    expect(frame.data.args.activity).toBeNull()

    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', nonce: frame.data.nonce, data: {} }))
    await pending
  })
})

describe('DiscordRpcClient voice-state subscription', () => {
  let createConnectionSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function connectAuthedClient(store: ReturnType<typeof makeStore>) {
    const socket = new FakeSocket()
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => socket as any)
    const client = new DiscordRpcClient({ store })

    const connected = client.connect()
    socket.emit('connect')
    socket.emit('data', encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: {} }))

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'AUTHENTICATE')).toBe(true)
    })
    const authFrame = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'AUTHENTICATE')!
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'AUTHENTICATE',
        nonce: authFrame.data.nonce,
        data: { user: { id: '1', username: 'tester' } },
      }),
    )
    await connected
    return { client, socket }
  }

  function authedStore() {
    return makeStore({
      'discord-rpc-auth': { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600_000 },
    })
  }

  test('subscribes to VOICE_SETTINGS_UPDATE after authenticating', async () => {
    const { socket } = await connectAuthedClient(authedStore())

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SUBSCRIBE')).toBe(true)
    })
    const sub = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SUBSCRIBE')!
    expect(sub.data.evt).toBe('VOICE_SETTINGS_UPDATE')
    expect(typeof sub.data.nonce).toBe('string')
  })

  test('forwards a VOICE_SETTINGS_UPDATE push frame as a mapped voice-state event', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const events: Array<{ muted: boolean; deafened: boolean }> = []
    client.on('voice-state', (state: any) => events.push(state))

    // Unsolicited push event Discord sends when the user mutes+deafens manually.
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'DISPATCH',
        evt: 'VOICE_SETTINGS_UPDATE',
        data: { mute: true, deaf: true },
      }),
    )

    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toEqual({ muted: true, deafened: true })
    expect(client.voiceState).toEqual({ muted: true, deafened: true })

    // A later push (unmute, still deafened) updates state again.
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'DISPATCH',
        evt: 'VOICE_SETTINGS_UPDATE',
        data: { mute: false, deaf: true },
      }),
    )
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[1]).toEqual({ muted: false, deafened: true })
  })

  test('a SUBSCRIBE acknowledgement is not mistaken for a push event', async () => {
    const { client, socket } = await connectAuthedClient(authedStore())

    const events: unknown[] = []
    client.on('voice-state', (state: any) => events.push(state))

    await vi.waitFor(() => {
      expect(writtenFrames(socket).some((f) => f.data && f.data.cmd === 'SUBSCRIBE')).toBe(true)
    })
    const sub = writtenFrames(socket).find((f) => f.data && f.data.cmd === 'SUBSCRIBE')!

    // Discord's ack carries the subscribed evt AND the request nonce; it must
    // resolve the pending request, not be treated as a state push.
    socket.emit(
      'data',
      encodeFrame(OP_FRAME, {
        cmd: 'SUBSCRIBE',
        evt: 'VOICE_SETTINGS_UPDATE',
        nonce: sub.data.nonce,
        data: { evt: 'VOICE_SETTINGS_UPDATE' },
      }),
    )

    await Promise.resolve()
    expect(events).toHaveLength(0)
  })
})
