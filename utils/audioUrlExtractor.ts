/**
 * Audio URL Extractor
 * Extracts direct audio URLs from various sources like MyInstants, direct links, etc.
 */

export interface ExtractedAudio {
  url: string
  source: 'direct' | 'myinstants' | 'unknown'
  originalUrl: string
  name?: string
}

/**
 * Extract audio URL from a given input (URL or direct audio link)
 */
export async function extractAudioUrl(input: string): Promise<ExtractedAudio> {
  // Trim whitespace
  const trimmedInput = input.trim()

  // Check if it's already a direct audio file URL
  if (isDirectAudioUrl(trimmedInput)) {
    return {
      url: trimmedInput,
      source: 'direct',
      originalUrl: trimmedInput,
      name: extractFilenameFromUrl(trimmedInput)
    }
  }

  // Check if it's a MyInstants URL
  if (isMyInstantsUrl(trimmedInput)) {
    return await extractFromMyInstants(trimmedInput)
  }

  // Unknown source - return as-is and let the audio engine try to handle it
  return {
    url: trimmedInput,
    source: 'unknown',
    originalUrl: trimmedInput
  }
}

/**
 * Check if URL is a direct audio file
 */
function isDirectAudioUrl(url: string): boolean {
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm', '.aac', '.opus', '.weba']
  const lowerUrl = url.toLowerCase()
  return audioExtensions.some(ext => lowerUrl.includes(ext))
}

/**
 * Check if URL is from MyInstants
 */
function isMyInstantsUrl(url: string): boolean {
  return url.includes('myinstants.com')
}

/**
 * Extract audio URL from MyInstants page
 */
async function extractFromMyInstants(pageUrl: string): Promise<ExtractedAudio> {
  try {
    // Fetch the page HTML
    const response = await fetch(pageUrl)
    const html = await response.text()

    // Extract the preload audio URL using regex
    const match = html.match(/var preloadAudioUrl = ['"]([^'"]+)['"]/i)

    if (match && match[1]) {
      const audioPath = match[1]
      const fullUrl = audioPath.startsWith('http')
        ? audioPath
        : `https://www.myinstants.com${audioPath}`

      // Extract name from the page title or URL
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
      const name = titleMatch
        ? titleMatch[1].replace(' - Instant Sound Button | Myinstants', '').trim()
        : extractFilenameFromUrl(fullUrl)

      return {
        url: fullUrl,
        source: 'myinstants',
        originalUrl: pageUrl,
        name
      }
    }

    throw new Error('Could not find audio URL in MyInstants page')
  } catch (error) {
    throw new Error(`Failed to extract audio from MyInstants: ${error}`)
  }
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const filename = pathname.split('/').pop() || 'audio'
    return decodeURIComponent(filename)
  } catch {
    return 'audio'
  }
}

/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}
