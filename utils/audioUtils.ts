// Audio utility functions for file validation and path handling

export const SUPPORTED_AUDIO_FORMATS = [
  'mp3', 'wav', 'ogg', 'webm', 'm4a', 'flac', 'aac', 'opus', 'weba'
]

export const SUPPORTED_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac',
  'audio/opus', 'audio/x-m4a'
]

/**
 * Validates if a file is a supported audio format
 */
export function isValidAudioFile(file: File): boolean {
  // Check MIME type
  if (SUPPORTED_MIME_TYPES.includes(file.type)) {
    return true
  }
  
  // Fallback to extension check
  const extension = getFileExtension(file.name)
  return SUPPORTED_AUDIO_FORMATS.includes(extension.toLowerCase())
}

/**
 * Gets file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

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