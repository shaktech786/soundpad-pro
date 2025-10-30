import { useCallback, useRef, useState, useEffect } from 'react'
import { Howl, Howler } from 'howler'
import logger from '../utils/logger'
import { useAudioOutputDevice } from './useAudioOutputDevice'

// Audio engine for loading and playing sounds with Electron file system support

// Track blob URLs for cleanup
const blobUrlRegistry = new Map<string, string>()

interface AudioFile {
  id: string
  path: string
  name: string
  howl: Howl | null
}

export function useAudioEngine() {
  const [loadedSounds, setLoadedSounds] = useState<Map<string, Howl>>(new Map())
  const [isPlaying, setIsPlaying] = useState<Map<string, boolean>>(new Map())
  const [isLoading, setIsLoading] = useState<Map<string, boolean>>(new Map())
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map())
  const audioContextRef = useRef<AudioContext | null>(null)

  // Use audio output device hook
  const { selectedDevice, applyToAudioElement, audioDevices, selectDevice } = useAudioOutputDevice()

  // Refs to avoid stale closures in callbacks
  const loadedSoundsRef = useRef<Map<string, Howl>>(new Map())
  const loadingRef = useRef<Map<string, boolean>>(new Map())
  const selectedDeviceRef = useRef<string>(selectedDevice)
  
  // Update refs when state changes
  useEffect(() => {
    loadedSoundsRef.current = loadedSounds
  }, [loadedSounds])

  useEffect(() => {
    loadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice
  }, [selectedDevice])

  useEffect(() => {
    // Initialize Web Audio API for virtual audio routing
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Set up Howler to use our audio context
      Howler.ctx = audioContextRef.current
    }

    return () => {
      // Cleanup all sounds
      loadedSounds.forEach(sound => sound.unload())
      // Cleanup blob URLs
      blobUrlRegistry.forEach(url => URL.revokeObjectURL(url))
      blobUrlRegistry.clear()
    }
  }, [])

  const loadSound = useCallback(async (filePath: string, forceReload: boolean = false): Promise<void> => {
    // Check if already loaded using refs to avoid stale closure
    const sounds = loadedSoundsRef.current
    const loading = loadingRef.current

    // If force reload, unload the existing sound first
    if (forceReload && sounds.has(filePath)) {
      const existingSound = sounds.get(filePath)
      if (existingSound) {
        logger.debug(`Force reloading sound: ${filePath}`)
        existingSound.unload()

        // Clean up blob URL if exists
        const blobUrl = blobUrlRegistry.get(filePath)
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
          blobUrlRegistry.delete(filePath)
        }

        sounds.delete(filePath)
        setLoadedSounds(prev => {
          const newMap = new Map(prev)
          newMap.delete(filePath)
          loadedSoundsRef.current = newMap
          return newMap
        })
      }
    } else if (sounds.has(filePath)) {
      // Already loaded and not force reloading
      logger.debug(`Sound already loaded: ${filePath}`)
      return
    }

    if (loading.has(filePath)) {
      logger.debug(`Sound already loading: ${filePath}`)
      return
    }

    setIsLoading(prev => {
      const newMap = new Map(prev).set(filePath, true)
      loadingRef.current = newMap
      return newMap
    })
    setLoadErrors(prev => {
      const newMap = new Map(prev)
      newMap.delete(filePath)
      return newMap
    })

    try {
      // Handle different path formats
      let audioUrl = filePath

      // Handle blob URLs (keep as-is)
      if (filePath.startsWith('blob:')) {
        audioUrl = filePath
      }
      // In Electron, read local files as blobs to avoid security restrictions
      else if (typeof window !== 'undefined' && (window as any).electronAPI?.readAudioFile) {
        const isLocalFile = /^[A-Z]:[\\\/]/.test(filePath) || filePath.startsWith('\\\\') || filePath.includes('\\')

        if (isLocalFile) {
          logger.debug('Reading local file via Electron API:', filePath)

          try {
            const result = await (window as any).electronAPI.readAudioFile(filePath)

            if (result.error) {
              throw new Error(result.error)
            }

            // Convert buffer to Blob
            const blob = new Blob([result.buffer], { type: result.mimeType })
            audioUrl = URL.createObjectURL(blob)

            // Store blob URL for cleanup
            blobUrlRegistry.set(filePath, audioUrl)

            logger.debug('Created blob URL from local file:', audioUrl)
          } catch (err) {
            logger.error('Failed to read file via Electron API:', err)
            throw err
          }
        } else {
          // Not a local file, use as-is
          audioUrl = filePath
        }
      }
      // Fallback: Handle file:// protocol - ensure it's properly formatted
      else if (filePath.startsWith('file://')) {
        audioUrl = filePath
      }
      // Handle Windows absolute paths (C:\path\to\file.mp3)
      else if (/^[A-Z]:[\\\/]/.test(filePath)) {
        // Windows absolute path - convert to file URL
        const normalizedPath = filePath.replace(/\\/g, '/')
        audioUrl = 'file:///' + encodeURI(normalizedPath).replace(/#/g, '%23')
      }
      // Handle UNC paths (\\server\share\file.mp3)
      else if (filePath.startsWith('\\\\')) {
        audioUrl = 'file:' + filePath.replace(/\\/g, '/')
      }
      // Handle any other Windows-style paths
      else if (filePath.includes('\\')) {
        const normalizedPath = filePath.replace(/\\/g, '/')
        audioUrl = 'file:///' + encodeURI(normalizedPath).replace(/#/g, '%23')
      }
      // Keep other URLs as-is (http, https, etc)
      else {
        audioUrl = filePath
      }

      logger.debug('Loading audio from:', audioUrl)

      // Create Howl and return a Promise for the load operation
      return new Promise((resolve, reject) => {
        
        const sound = new Howl({
          src: [audioUrl],
          html5: true, // Use HTML5 Audio for better compatibility
          preload: true,
          volume: 1.0,
          format: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'aac', 'opus', 'weba'],
          onload: () => {
            logger.debug(`Sound loaded successfully: ${filePath}`)
            setLoadedSounds(prev => {
              const newMap = new Map(prev).set(filePath, sound)
              loadedSoundsRef.current = newMap
              return newMap
            })
            setIsLoading(prev => {
              const newMap = new Map(prev)
              newMap.delete(filePath)
              loadingRef.current = newMap
              return newMap
            })
            resolve()
          },
          onloaderror: (_id, error) => {
            const errorMsg = error || 'Unknown error'
            logger.error(`Error loading sound ${filePath}:`, errorMsg)
            setLoadErrors(prev => new Map(prev).set(filePath, String(errorMsg)))
            setIsLoading(prev => {
              const newMap = new Map(prev)
              newMap.delete(filePath)
              return newMap
            })
            reject(new Error(`Failed to load ${filePath}: ${errorMsg}`))
          },
          onplayerror: (_id, error) => {
            logger.error(`Error playing sound ${filePath}:`, error)
            setIsPlaying(prev => new Map(prev).set(filePath, false))
          },
          onend: () => {
            setIsPlaying(prev => new Map(prev).set(filePath, false))
          }
        })
      })
    } catch (error) {
      logger.error(`Exception loading sound ${filePath}:`, error)
      setLoadErrors(prev => new Map(prev).set(filePath, String(error)))
      setIsLoading(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        return newMap
      })
      throw error
    }
  }, [])

  const playSound = useCallback((filePath: string, options?: {
    volume?: number
    loop?: boolean
    restart?: boolean
  }) => {
    // Use ref to get current sound state
    const sound = loadedSoundsRef.current.get(filePath)
    
    if (!sound) {
      logger.debug(`Sound not loaded, loading: ${filePath}`)
      // Try to load and play
      loadSound(filePath).then(() => {
        const newSound = loadedSoundsRef.current.get(filePath)
        if (newSound) {
          logger.debug(`Playing newly loaded sound: ${filePath}`)
          playLoadedSound(newSound, filePath, options)
        }
      }).catch(err => {
        logger.error(`Failed to load and play: ${filePath}`, err)
      })
      return
    }

    playLoadedSound(sound, filePath, options)
  }, [loadSound])

  const playLoadedSound = (sound: Howl, filePath: string, options?: any) => {
    // If restart is true or sound is not playing, stop and restart
    if (options?.restart || !isPlaying.get(filePath)) {
      sound.stop()
    }

    if (options?.volume !== undefined) {
      sound.volume(options.volume)
    }

    if (options?.loop !== undefined) {
      sound.loop(options.loop)
    }

    const soundId = sound.play()
    setIsPlaying(prev => new Map(prev).set(filePath, true))

    // Apply audio output device routing to HTML5 audio element
    if (selectedDeviceRef.current && soundId !== undefined) {
      // Get the underlying HTML audio element from Howler
      // @ts-ignore - Howler internal API
      const audioNode = sound._sounds?.[0]?._node

      if (audioNode && audioNode.setSinkId) {
        applyToAudioElement(audioNode).catch(err => {
          logger.error('Failed to set audio output device:', err)
        })
      }
    }
  }

  const stopSound = useCallback((filePath: string) => {
    const sound = loadedSoundsRef.current.get(filePath)
    if (sound) {
      sound.stop()
      setIsPlaying(prev => new Map(prev).set(filePath, false))
    }
  }, [])
  
  const unloadSound = useCallback((filePath: string) => {
    const sound = loadedSoundsRef.current.get(filePath)
    if (sound) {
      logger.debug(`Unloading sound: ${filePath}`)
      sound.unload()

      // Clean up blob URL if exists
      const blobUrl = blobUrlRegistry.get(filePath)
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrlRegistry.delete(filePath)
        logger.debug(`Revoked blob URL for: ${filePath}`)
      }

      // Remove from loaded sounds
      setLoadedSounds(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        loadedSoundsRef.current = newMap
        return newMap
      })

      // Clean up states
      setIsPlaying(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        return newMap
      })

      setLoadErrors(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        return newMap
      })
    }
  }, [])

  const stopAll = useCallback(() => {
    Howler.stop()
    setIsPlaying(new Map())
  }, [])

  const setVolume = useCallback((filePath: string, volume: number) => {
    const sound = loadedSounds.get(filePath)
    if (sound) {
      sound.volume(Math.max(0, Math.min(1, volume)))
    }
  }, [loadedSounds])

  const setMasterVolume = useCallback((volume: number) => {
    Howler.volume(Math.max(0, Math.min(1, volume)))
  }, [])

  return {
    loadSound,
    playSound,
    stopSound,
    unloadSound,
    stopAll,
    setVolume,
    setMasterVolume,
    isPlaying,
    isLoading,
    loadErrors,
    loadedSounds: Array.from(loadedSounds.keys()),
    // Audio device selection
    audioDevices,
    selectedAudioDevice: selectedDevice,
    selectAudioDevice: selectDevice
  }
}