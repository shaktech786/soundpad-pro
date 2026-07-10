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

  test('sends a HANDSHAKE frame with the configured client_id on connect', async () => {
    const socket = new FakeSocket()
    createConnectionSpy = vi
      .spyOn(net, 'createConnection')
      .mockImplementation(() => socket as any)

    const store = makeStore({ 'discord-client-config': { clientId: 'client-123', clientSecret: 's' } })
    const client = new DiscordRpcClient({ store })

    client.connect()
    // Simulate the pipe accepting the connection.
    socket.emit('connect')

    const frames = writtenFrames(socket)
    expect(frames).toHaveLength(1)
    expect(frames[0].op).toBe(OP_HANDSHAKE)
    expect(frames[0].data).toEqual({ v: 1, client_id: 'client-123' })
  })

  test('falls through pipe indices until one connects', async () => {
    const sockets: FakeSocket[] = []
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation((path: any) => {
      const s = new FakeSocket()
      sockets.push(s)
      return s as any
    })

    const store = makeStore({ 'discord-client-config': { clientId: 'cid', clientSecret: 's' } })
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

  test('refuses to connect without a client ID and reports error status', async () => {
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => {
      throw new Error('should not attempt a pipe connection')
    })

    const store = makeStore()
    const client = new DiscordRpcClient({ store })

    const statuses: string[] = []
    client.on('status', (s: any) => statuses.push(s.status))

    const result = await client.connect()

    expect(result.status).toBe('error')
    expect(result.error).toMatch(/client id/i)
    expect(createConnectionSpy).not.toHaveBeenCalled()
    expect(statuses).toContain('error')
  })

  test('emits connecting status and schedules a reconnect when no pipe answers', async () => {
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockImplementation(() => {
      const s = new FakeSocket()
      // Reject asynchronously so all 10 indices are exhausted.
      queueMicrotask(() => s.emit('error', new Error('ENOENT')))
      return s as any
    })

    const store = makeStore({ 'discord-client-config': { clientId: 'cid', clientSecret: 's' } })
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
      'discord-client-config': { clientId: 'cid', clientSecret: 'secret' },
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

  test('getPublicConfig never leaks the stored secret', () => {
    const store = makeStore({
      'discord-client-config': { clientId: 'cid', clientSecret: 'super-secret', redirectUri: 'http://localhost' },
    })
    const client = new DiscordRpcClient({ store })
    const pub = client.getPublicConfig()
    expect(pub).toEqual({
      clientId: 'cid',
      redirectUri: 'http://localhost',
      hasSecret: true,
      hasAuth: false,
    })
    expect(JSON.stringify(pub)).not.toContain('super-secret')
  })

  test('setConfig preserves an existing secret when passed a blank one', () => {
    const store = makeStore({
      'discord-client-config': { clientId: 'old', clientSecret: 'keep-me', redirectUri: 'http://localhost' },
    })
    const client = new DiscordRpcClient({ store })
    client.setConfig({ clientId: 'new', clientSecret: '' })
    expect(store._data['discord-client-config'].clientId).toBe('new')
    expect(store._data['discord-client-config'].clientSecret).toBe('keep-me')
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
      'discord-client-config': { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://localhost' },
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
    const store = makeStore({
      'discord-client-config': { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://localhost' },
    })
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
