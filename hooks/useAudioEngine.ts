import { useCallback, useRef, useState, useEffect } from 'react'
import { Howl, Howler } from 'howler'

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
    }
  }, [])

  const loadSound = useCallback(async (filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (loadedSounds.has(filePath)) {
        console.log(`Sound already loaded: ${filePath}`)
        resolve()
        return
      }
      
      if (isLoading.get(filePath)) {
        console.log(`Sound already loading: ${filePath}`)
        resolve()
        return
      }
      
      setIsLoading(prev => new Map(prev).set(filePath, true))
      setLoadErrors(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        return newMap
      })

      try {
        const sound = new Howl({
          src: [filePath],
          html5: true, // Use HTML5 Audio for better compatibility
          preload: true,
          volume: 1.0,
          format: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'],
          onload: () => {
            console.log(`Sound loaded successfully: ${filePath}`)
            setLoadedSounds(prev => new Map(prev).set(filePath, sound))
            setIsLoading(prev => {
              const newMap = new Map(prev)
              newMap.delete(filePath)
              return newMap
            })
            resolve()
          },
          onloaderror: (_id, error) => {
            const errorMsg = error || 'Unknown error'
            console.error(`Error loading sound ${filePath}:`, errorMsg)
            setLoadErrors(prev => new Map(prev).set(filePath, String(errorMsg)))
            setIsLoading(prev => {
              const newMap = new Map(prev)
              newMap.delete(filePath)
              return newMap
            })
            reject(new Error(`Failed to load ${filePath}: ${errorMsg}`))
          },
          onplayerror: (_id, error) => {
            console.error(`Error playing sound ${filePath}:`, error)
            setIsPlaying(prev => new Map(prev).set(filePath, false))
          },
          onend: () => {
            setIsPlaying(prev => new Map(prev).set(filePath, false))
          }
        })
      } catch (error) {
        console.error(`Exception loading sound ${filePath}:`, error)
        setLoadErrors(prev => new Map(prev).set(filePath, String(error)))
        setIsLoading(prev => {
          const newMap = new Map(prev)
          newMap.delete(filePath)
          return newMap
        })
        reject(error)
      }
    })
  }, [loadedSounds, isLoading])

  const playSound = useCallback((filePath: string, options?: {
    volume?: number
    loop?: boolean
    restart?: boolean
  }) => {
    const sound = loadedSounds.get(filePath)
    
    if (!sound) {
      // Try to load and play
      loadSound(filePath).then(() => {
        const newSound = loadedSounds.get(filePath)
        if (newSound) {
          playLoadedSound(newSound, filePath, options)
        }
      })
      return
    }

    playLoadedSound(sound, filePath, options)
  }, [loadedSounds, loadSound])

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
    const sound = loadedSounds.get(filePath)
    if (sound) {
      sound.stop()
      setIsPlaying(prev => new Map(prev).set(filePath, false))
    }
  }, [loadedSounds])

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
    stopAll,
    setVolume,
    setMasterVolume,
    isPlaying,
    isLoading,
    loadErrors,
    loadedSounds: Array.from(loadedSounds.keys())
  }
}