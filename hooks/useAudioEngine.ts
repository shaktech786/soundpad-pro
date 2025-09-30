import { useCallback, useRef, useState, useEffect } from 'react'
import { Howl, Howler } from 'howler'
import logger from '../utils/logger'

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
  
  // Refs to avoid stale closures in callbacks
  const loadedSoundsRef = useRef<Map<string, Howl>>(new Map())
  const loadingRef = useRef<Map<string, boolean>>(new Map())
  
  // Update refs when state changes
  useEffect(() => {
    loadedSoundsRef.current = loadedSounds
  }, [loadedSounds])
  
  useEffect(() => {
    loadingRef.current = isLoading
  }, [isLoading])

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
    return new Promise((resolve, reject) => {
      // Check if already loaded using refs to avoid stale closure
      const sounds = loadedSoundsRef.current
      const loading = loadingRef.current
      
      // If force reload, unload the existing sound first
      if (forceReload && sounds.has(filePath)) {
        const existingSound = sounds.get(filePath)
        if (existingSound) {
          logger.debug(`Force reloading sound: ${filePath}`)
          existingSound.unload()
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
        resolve()
        return
      }
      
      if (loading.has(filePath)) {
        logger.debug(`Sound already loading: ${filePath}`)
        resolve()
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
        
        // Handle file:// protocol - keep as-is for Howler.js
        if (filePath.startsWith('file://')) {
          audioUrl = filePath
        }
        // Handle Windows paths (C:\path\to\file.mp3)
        else if (/^[A-Z]:\\/.test(filePath)) {
          // Windows path - convert to file:// URL for Howler.js
          audioUrl = 'file:///' + filePath.replace(/\\/g, '/')
        }
        // Handle blob URLs (keep as-is)
        else if (filePath.startsWith('blob:')) {
          audioUrl = filePath
        }
        // Handle relative paths or temp file issues
        else if (filePath.includes('\\') || filePath.includes('AppData\\Local\\Temp')) {
          // Convert Windows paths to proper file URLs
          audioUrl = 'file:///' + filePath.replace(/\\/g, '/')
        }
        
        logger.debug('Loading audio from:', audioUrl)
        
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
      } catch (error) {
        logger.error(`Exception loading sound ${filePath}:`, error)
        setLoadErrors(prev => new Map(prev).set(filePath, String(error)))
        setIsLoading(prev => {
          const newMap = new Map(prev)
          newMap.delete(filePath)
          return newMap
        })
        reject(error)
      }
    })
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

    sound.play()
    setIsPlaying(prev => new Map(prev).set(filePath, true))
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
    loadedSounds: Array.from(loadedSounds.keys())
  }
}