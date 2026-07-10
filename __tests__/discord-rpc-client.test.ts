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
