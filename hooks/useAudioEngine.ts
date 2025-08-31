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
        resolve()
        return
      }

      const sound = new Howl({
        src: [filePath],
        html5: true, // Use HTML5 Audio for better compatibility
        preload: true,
        volume: 1.0,
        onload: () => {
          setLoadedSounds(prev => new Map(prev).set(filePath, sound))
          resolve()
        },
        onloaderror: (_id, error) => {
          console.error('Error loading sound:', error)
          reject(error)
        },
        onend: () => {
          setIsPlaying(prev => new Map(prev).set(filePath, false))
        }
      })
    })
  }, [loadedSounds])

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
    loadedSounds: Array.from(loadedSounds.keys())
  }
}