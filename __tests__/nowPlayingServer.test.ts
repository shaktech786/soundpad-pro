import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NowPlayingServer } = require('../main/now-playing-server')

const PORT = 3199

describe('NowPlayingServer', () => {
  let server: any
  let musicDir: string
  let asioPlaying: string[] = []
  let wdmPlaying: string[] = []

  beforeAll(async () => {
    musicDir = mkdtempSync(path.join(tmpdir(), 'spp-music-'))
    writeFileSync(
      path.join(musicDir, 'attribution.json'),
      JSON.stringify({
        tracks: {
          'Origami.mp3': {
            title: 'Origami',
            artist: 'Scott Buckley',
            license: 'CC-BY 4.0',
            requiresAttribution: true,
            credit: "'Origami' by Scott Buckley — CC-BY 4.0",
          },
        },
      })
    )
    server = new NowPlayingServer({
      port: PORT,
      getAsioPlaying: () => asioPlaying,
      getWdmPlaying: () => wdmPlaying,
    })
    server.start()
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterAll(() => {
    server.shutdown()
    rmSync(musicDir, { recursive: true, force: true })
  })

  const get = async (route: string) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${route}`)
    return { res, body: await res.json() }
  }

  it('responds on /health', async () => {
    const { res, body } = await get('/health')
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('returns empty nowPlaying when nothing is playing', async () => {
    asioPlaying = []
    wdmPlaying = []
    const { body } = await get('/now-playing')
    expect(body.nowPlaying).toEqual([])
  })

  it('merges ASIO and WDM playing sets with modes', async () => {
    asioPlaying = ['C:\\sounds\\airhorn.wav']
    wdmPlaying = [path.join(musicDir, 'Origami.mp3')]
    const { body } = await get('/now-playing')
    const files = body.nowPlaying.map((t: any) => t.fileName).sort()
    expect(files).toEqual(['Origami.mp3', 'airhorn.wav'])
    const origami = body.nowPlaying.find((t: any) => t.fileName === 'Origami.mp3')
    expect(origami.mode).toBe('wdm')
    expect(typeof origami.startedAt).toBe('number')
  })

  it('joins attribution from attribution.json in the file directory (case-insensitive)', async () => {
    asioPlaying = []
    wdmPlaying = [path.join(musicDir, 'ORIGAMI.mp3')]
    const { body } = await get('/now-playing')
    expect(body.nowPlaying[0].attribution).toMatchObject({
      artist: 'Scott Buckley',
      requiresAttribution: true,
    })
  })

  it('returns null attribution for files without a manifest entry', async () => {
    asioPlaying = ['C:\\nowhere\\mystery.mp3']
    wdmPlaying = []
    const { body } = await get('/now-playing')
    expect(body.nowPlaying[0].attribution).toBeNull()
  })

  it('clears startedAt when a sound stops and re-stamps on replay', async () => {
    const fp = path.join(musicDir, 'Origami.mp3')
    wdmPlaying = [fp]
    asioPlaying = []
    const first = (await get('/now-playing')).body.nowPlaying[0].startedAt
    wdmPlaying = []
    await get('/now-playing')
    await new Promise(resolve => setTimeout(resolve, 10))
    wdmPlaying = [fp]
    const second = (await get('/now-playing')).body.nowPlaying[0].startedAt
    expect(second).toBeGreaterThan(first)
  })

  it('sends CORS and Private Network Access headers', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/now-playing`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })
})

describe('NowPlayingServer onNowPlayingChange (Rich Presence hook)', () => {
  const fpA = 'C:\\sounds\\airhorn.wav'
  const fpB = 'C:\\sounds\\sadtrombone.wav'
  let playing: string[]
  let events: any[]
  let server: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    playing = []
    events = []
    server = new NowPlayingServer({
      getAsioPlaying: () => playing,
      getWdmPlaying: () => [],
      onNowPlayingChange: (track: any) => events.push(track),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once with the primary track when a sound starts', () => {
    playing = [fpA]
    server._pollNowPlaying()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ filePath: fpA, fileName: 'airhorn.wav' })
    expect(typeof events[0].startedAt).toBe('number')
  })

  it('does not re-fire while the same sound keeps playing', () => {
    playing = [fpA]
    server._pollNowPlaying()
    server._pollNowPlaying()
    expect(events).toHaveLength(1)
  })

  it('fires with null when playback stops', () => {
    playing = [fpA]
    server._pollNowPlaying()
    playing = []
    server._pollNowPlaying()
    expect(events).toHaveLength(2)
    expect(events[1]).toBeNull()
  })

  it('switches the primary to the most recently started sound', () => {
    playing = [fpA]
    server._pollNowPlaying()
    vi.advanceTimersByTime(1000) // fpB starts strictly later than fpA
    playing = [fpA, fpB]
    server._pollNowPlaying()
    expect(events).toHaveLength(2)
    expect(events[1].filePath).toBe(fpB)
  })
})
