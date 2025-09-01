// Input validation utilities

import { APP_CONFIG } from '../config/constants'

/**
 * Validates a button index is within valid range
 */
export function isValidButtonIndex(index: unknown): index is number {
  return typeof index === 'number' && 
         !isNaN(index) && 
         index >= 0 && 
         index < APP_CONFIG.CONTROLLER.MAX_BUTTONS
}

/**
 * Validates an audio file path
 */
export function isValidFilePath(path: unknown): path is string {
  if (typeof path !== 'string' || !path) return false
  
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~')) return false
  
  // Validate URL patterns
  const validPatterns = [
    /^https?:\/\//i,  // HTTP/HTTPS URLs
    /^file:\/\//i,    // File URLs
    /^blob:/i,        // Blob URLs
    /^[A-Z]:\\/i,     // Windows paths
    /^\//             // Unix paths
  ]
  
  return validPatterns.some(pattern => pattern.test(path))
}

/**
 * Validates audio file extension
 */
export function hasValidAudioExtension(filename: string): boolean {
  if (!filename) return false
  
  const extension = filename.split('.').pop()?.toLowerCase()
  return extension ? APP_CONFIG.AUDIO.SUPPORTED_FORMATS.includes(extension) : false
}

/**
 * Validates file size
 */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= APP_CONFIG.AUDIO.MAX_FILE_SIZE
}

/**
 * Sanitizes a file path for display
 */
export function sanitizePathForDisplay(path: string): string {
  if (!path) return ''
  
  // Remove sensitive parts of the path
  const parts = path.split(/[/\\]/)
  if (parts.length > 3) {
    return '...' + parts.slice(-2).join('/')
  }
  
  return path
}

/**
 * Validates hotkey combination
 */
export function isValidHotkey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  
  // Basic validation for key combinations
  const validModifiers = ['ctrl', 'alt', 'shift', 'cmd', 'meta']
  const parts = key.toLowerCase().split('+')
  
  // Must have at least one part
  if (parts.length === 0) return false
  
  // Check each part
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) return false
    
    // Either a modifier or a single character/function key
    const isModifier = validModifiers.includes(trimmed)
    const isFunctionKey = /^f([1-9]|1[0-2])$/.test(trimmed)
    const isSingleChar = trimmed.length === 1
    const isSpecialKey = ['escape', 'enter', 'space', 'tab', 'backspace', 'delete'].includes(trimmed)
    
    if (!isModifier && !isFunctionKey && !isSingleChar && !isSpecialKey) {
      return false
    }
  }
  
  return true
}

/**
 * Validates volume level
 */
export function isValidVolume(volume: unknown): volume is number {
  return typeof volume === 'number' && 
         !isNaN(volume) && 
         volume >= 0 && 
         volume <= 1
}

/**
 * Validates controller index
 */
export function isValidControllerIndex(index: unknown): index is number {
  return typeof index === 'number' && 
         !isNaN(index) && 
         index >= 0 && 
         index < 4 // Maximum 4 controllers
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
}

export default {
  isValidButtonIndex,
  isValidFilePath,
  hasValidAudioExtension,
  isValidFileSize,
  sanitizePathForDisplay,
  isValidHotkey,
  isValidVolume,
  isValidControllerIndex,
  sanitizeInput,
}