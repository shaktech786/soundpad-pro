// Audio utility functions for file validation and path handling

import { SUPPORTED_EXTENSIONS, MIME_BY_EXTENSION } from '../config/audio-file-contract'

// Derived from config/audio-file-contract.js, the single source of truth
// shared with main/index.js. Keeps its pre-existing shape (extension
// without the leading dot) so callers that already depend on it keep
// compiling.
export const SUPPORTED_AUDIO_FORMATS = SUPPORTED_EXTENSIONS.map((ext) => ext.slice(1))

export const SUPPORTED_MIME_TYPES = Array.from(new Set(Object.values(MIME_BY_EXTENSION)))

/**
 * Extracts clean filename from path or metadata string
 */
export function extractFilename(path: string): string {
  if (!path) return 'Empty'
  
  // Handle metadata format (url#filename)
  if (path.includes('#')) {
    const metadata = path.split('#')[1]
    if (metadata) {
      return metadata.replace(/\.[^/.]+$/, '') // Remove extension
    }
  }
  
  // Handle blob URLs
  if (path.startsWith('blob:')) {
    return 'Audio File'
  }
  
  // Extract from regular path
  const parts = path.split(/[/\\]/)
  const filename = parts[parts.length - 1]
  return filename.replace(/\.[^/.]+$/, '') // Remove extension
}

/**
 * Extracts actual URL from metadata format
 */
export function extractAudioUrl(audioFile: string): string {
  if (!audioFile) return ''
  if (!audioFile.includes('#')) return audioFile
  return audioFile.split('#')[0]
}

/**
 * Normalizes file path for cross-platform compatibility
 */
export function normalizeFilePath(path: string): string {
  if (!path) return ''
  
  // Handle file:// protocol
  if (path.startsWith('file:///')) {
    // Windows: file:///C:/path/to/file
    // Unix: file:///path/to/file
    path = path.replace('file:///', '')
    if (process.platform === 'win32') {
      path = path.replace(/\//g, '\\')
    }
  } else if (path.startsWith('file://')) {
    path = path.replace('file://', '')
  }
  
  return path
}

/**
 * Creates metadata string for storage
 */
export function createAudioMetadata(url: string, filename: string): string {
  return `${url}#${filename}`
}

/**
 * Validates audio URL format
 */
export function isValidAudioUrl(url: string): boolean {
  if (!url) return false
  
  // Check for valid URL patterns
  const validPatterns = [
    /^https?:\/\//i,  // HTTP/HTTPS URLs
    /^file:\/\//i,    // File URLs
    /^blob:/i,        // Blob URLs
    /^[A-Z]:\\/i,     // Windows paths
    /^\//             // Unix paths
  ]
  
  return validPatterns.some(pattern => pattern.test(url))
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Estimates audio duration from file size (rough estimate)
 */
export function estimateAudioDuration(fileSize: number, bitrate: number = 128): number {
  // Estimate based on average bitrate (128 kbps default)
  const bitsPerSecond = bitrate * 1000
  const bytesPerSecond = bitsPerSecond / 8
  return fileSize / bytesPerSecond
}