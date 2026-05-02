import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractAudioUrl, isValidUrl } from '../utils/audioUrlExtractor'

describe('isValidUrl', () => {
  test('accepts valid http/https URLs', () => {
    expect(isValidUrl('https://example.com/sound.mp3')).toBe(true)
    expect(isValidUrl('http://cdn.example.com/audio.wav')).toBe(true)
    expect(isValidUrl('https://www.myinstants.com/instant/hello/')).toBe(true)
  })

  test('rejects non-URL strings', () => {
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('just text')).toBe(false)
  })

  test('rejects local file paths even though new URL() accepts drive letters as schemes', () => {
    expect(isValidUrl('C:\\Users\\sounds\\hello.mp3')).toBe(false)
    expect(isValidUrl('C:/Users/sounds/hello.wav')).toBe(false)
    expect(isValidUrl('/home/user/sounds/hello.ogg')).toBe(false)
  })
})

describe('extractAudioUrl — direct audio files', () => {
  test('returns direct source for mp3 URLs', async () => {
    const result = await extractAudioUrl('https://example.com/sounds/hello.mp3')
    expect(result.source).toBe('direct')
    expect(result.url).toBe('https://example.com/sounds/hello.mp3')
    expect(result.originalUrl).toBe('https://example.com/sounds/hello.mp3')
  })

  test('detects all supported audio extensions as direct', async () => {
    const extensions = ['wav', 'ogg', 'flac', 'webm', 'm4a', 'aac', 'opus', 'weba']
    for (const ext of extensions) {
      const result = await extractAudioUrl(`https://example.com/sound.${ext}`)
      expect(result.source).toBe('direct')
    }
  })

  test('extracts filename as name from direct URL', async () => {
    const result = await extractAudioUrl('https://cdn.example.com/audio/wilhelm.mp3')
    expect(result.name).toBe('wilhelm.mp3')
  })

  test('trims whitespace from input', async () => {
    const result = await extractAudioUrl('  https://example.com/sound.mp3  ')
    expect(result.url).toBe('https://example.com/sound.mp3')
  })
})

describe('extractAudioUrl — unknown sources', () => {
  test('returns unknown source for unrecognised URLs', async () => {
    const result = await extractAudioUrl('https://example.com/some-page')
    expect(result.source).toBe('unknown')
    expect(result.url).toBe('https://example.com/some-page')
  })

  test('preserves original URL in originalUrl field', async () => {
    const url = 'https://example.com/some-page'
    const result = await extractAudioUrl(url)
    expect(result.originalUrl).toBe(url)
  })
})

describe('extractAudioUrl — MyInstants', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('extracts audio URL from MyInstants page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve(
        `<title>Hello World - Instant Sound Button | Myinstants</title>
         <script>var preloadAudioUrl = '/media/sounds/hello.mp3'</script>`
      )
    }))

    const result = await extractAudioUrl('https://www.myinstants.com/instant/hello/')
    expect(result.source).toBe('myinstants')
    expect(result.url).toBe('https://www.myinstants.com/media/sounds/hello.mp3')
    expect(result.name).toBe('Hello World')
  })

  test('uses absolute URL when preloadAudioUrl is already absolute', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve(
        `<title>Test - Instant Sound Button | Myinstants</title>
         <script>var preloadAudioUrl = 'https://cdn.myinstants.com/sounds/test.mp3'</script>`
      )
    }))

    const result = await extractAudioUrl('https://www.myinstants.com/instant/test/')
    expect(result.url).toBe('https://cdn.myinstants.com/sounds/test.mp3')
  })

  test('throws when no audio URL found on page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      text: () => Promise.resolve('<html><body>No audio here</body></html>')
    }))

    await expect(
      extractAudioUrl('https://www.myinstants.com/instant/missing/')
    ).rejects.toThrow()
  })
})
