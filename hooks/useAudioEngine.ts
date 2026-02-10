import { useCallback, useRef, useState, useEffect } from 'react'
import { Howl, Howler } from 'howler'
import logger from '../utils/logger'

// Audio engine for loading and playing sounds with Electron file system support
// Supports dual-mode: WDM (Howler.js in renderer) and ASIO (via main process)

export type AudioMode = 'wdm' | 'asio'

// Track blob URLs for cleanup (WDM mode only)
const blobUrlRegistry = new Map<string, string>()

// Track ASIO-loaded files so we know what's loaded in main process
const asioLoadedFiles = new Set<string>()

export function useAudioEngine(audioMode: AudioMode = 'wdm') {
  const [loadedSounds, setLoadedSounds] = useState<Map<string, Howl>>(new Map())
  const [isPlaying, setIsPlaying] = useState<Map<string, boolean>>(new Map())
  const [isLoading, setIsLoading] = useState<Map<string, boolean>>(new Map())
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map())
  const [asioReady, setAsioReady] = useState(false)

  // Refs to avoid stale closures in callbacks
  const loadedSoundsRef = useRef<Map<string, Howl>>(new Map())
  const loadingRef = useRef<Map<string, boolean>>(new Map())
  const audioModeRef = useRef<AudioMode>(audioMode)

  // Keep audioMode ref in sync
  useEffect(() => {
    audioModeRef.current = audioMode
  }, [audioMode])

  // Update refs when state changes
  useEffect(() => {
    loadedSoundsRef.current = loadedSounds
  }, [loadedSounds])

  useEffect(() => {
    loadingRef.current = isLoading
  }, [isLoading])

  // Initialize ASIO engine when mode is 'asio'.
  // The engine is auto-initialized in the main process on startup,
  // so this typically just confirms it's ready.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (!api) return

    if (audioMode === 'asio') {
      // First check if engine is already running (auto-initialized by main process)
      const checkAndInit = async () => {
        try {
          if (api.asioStatus) {
            const status = await api.asioStatus()
            if (status.initialized) {
              console.log(`[AudioEngine] Engine already running: ${status.device} (${status.cachedSounds} cached sounds)`)
              setAsioReady(true)
              return
            }
          }
          // Engine not running, try to initialize
          console.log('[AudioEngine] Engine not running, initializing...')
          const result = await api.asioInitialize()
          if (result.success) {
            console.log(`[AudioEngine] ASIO initialized: ${result.device} @ ${result.sampleRate}Hz via ${result.mode}`)
            setAsioReady(true)
          } else {
            console.error(`[AudioEngine] ASIO init failed: ${result.error}`)
            setAsioReady(false)
            setLoadErrors(prev => new Map(prev).set('__asio__', result.error))
          }
        } catch (err: any) {
          console.error('[AudioEngine] ASIO init exception:', err)
          setAsioReady(false)
        }
      }
      checkAndInit()
    } else {
      // Switching away from ASIO - clear loaded files tracker but keep engine running
      // (engine is a shared resource managed by main process)
      asioLoadedFiles.clear()
      setAsioReady(false)
    }
  }, [audioMode])

  // WDM cleanup on unmount
  useEffect(() => {
    return () => {
      loadedSounds.forEach(sound => sound.unload())
      blobUrlRegistry.forEach(url => URL.revokeObjectURL(url))
      blobUrlRegistry.clear()
    }
  }, [])

  const loadSound = useCallback(async (filePath: string, forceReload: boolean = false): Promise<void> => {
    // --- ASIO path --- (use ref to avoid stale closure)
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (!api?.asioLoadSound) return

      if (!forceReload && asioLoadedFiles.has(filePath)) {
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
        if (forceReload) {
          await api.asioUnloadSound(filePath)
          asioLoadedFiles.delete(filePath)
        }

        // Try main process decode first (works for WAV)
        const result = await api.asioLoadSound(filePath)
        if (result.success) {
          asioLoadedFiles.add(filePath)
          setLoadedSounds(prev => {
            const newMap = new Map(prev).set(filePath, null as any)
            loadedSoundsRef.current = newMap
            return newMap
          })
        } else {
          // Main process decode failed (likely MP3/OGG) - decode in renderer using Web Audio API
          const fileData = await api.readAudioFile(filePath)
          if (fileData.error) throw new Error(fileData.error)

          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
          try {
            const arrayBuf = fileData.buffer.buffer.slice(
              fileData.buffer.byteOffset,
              fileData.buffer.byteOffset + fileData.buffer.byteLength
            )
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuf)
            const channels: Float32Array[] = []
            for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
              channels.push(audioBuffer.getChannelData(ch))
            }
            const cacheResult = await api.asioCachePcm(filePath, {
              channels,
              sampleRate: audioBuffer.sampleRate,
              length: audioBuffer.length
            })
            if (!cacheResult.success) throw new Error(cacheResult.error || 'PCM cache failed')
          } finally {
            audioCtx.close()
          }

          asioLoadedFiles.add(filePath)
          setLoadedSounds(prev => {
            const newMap = new Map(prev).set(filePath, null as any)
            loadedSoundsRef.current = newMap
            return newMap
          })
        }
      } catch (error: any) {
        logger.error(`[ASIO] Failed to load ${filePath}:`, error)
        setLoadErrors(prev => new Map(prev).set(filePath, String(error.message || error)))
        throw error
      } finally {
        setIsLoading(prev => {
          const newMap = new Map(prev)
          newMap.delete(filePath)
          loadingRef.current = newMap
          return newMap
        })
      }
      return
    }

    // --- WDM path (unchanged) ---
    const sounds = loadedSoundsRef.current
    const loading = loadingRef.current

    if (forceReload && sounds.has(filePath)) {
      const existingSound = sounds.get(filePath)
      if (existingSound) {
        logger.debug(`Force reloading sound: ${filePath}`)
        existingSound.unload()

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
      let audioUrl = filePath

      if (filePath.startsWith('blob:')) {
        audioUrl = filePath
      }
      else if (typeof window !== 'undefined' && (window as any).electronAPI?.readAudioFile) {
        const isLocalFile = /^[A-Z]:[\\\/]/.test(filePath) || filePath.startsWith('\\\\') || filePath.includes('\\')

        if (isLocalFile) {
          logger.debug('Reading local file via Electron API:', filePath)

          try {
            const result = await (window as any).electronAPI.readAudioFile(filePath)

            if (result.error) {
              throw new Error(result.error)
            }

            const blob = new Blob([result.buffer], { type: result.mimeType })
            audioUrl = URL.createObjectURL(blob)
            blobUrlRegistry.set(filePath, audioUrl)

            logger.debug('Created blob URL from local file:', audioUrl)
          } catch (err) {
            logger.error('Failed to read file via Electron API:', err)
            throw err
          }
        } else {
          audioUrl = filePath
        }
      }
      else if (filePath.startsWith('file://')) {
        audioUrl = filePath
      }
      else if (/^[A-Z]:[\\\/]/.test(filePath)) {
        const normalizedPath = filePath.replace(/\\/g, '/')
        audioUrl = 'file:///' + encodeURI(normalizedPath).replace(/#/g, '%23')
      }
      else if (filePath.startsWith('\\\\')) {
        audioUrl = 'file:' + filePath.replace(/\\/g, '/')
      }
      else if (filePath.includes('\\')) {
        const normalizedPath = filePath.replace(/\\/g, '/')
        audioUrl = 'file:///' + encodeURI(normalizedPath).replace(/#/g, '%23')
      }
      else {
        audioUrl = filePath
      }

      logger.debug('Loading audio from:', audioUrl)

      return new Promise((resolve, reject) => {

        const sound = new Howl({
          src: [audioUrl],
          html5: true,
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
  }, [audioMode])

  const playSound = useCallback((filePath: string, options?: {
    volume?: number
    loop?: boolean
    restart?: boolean
  }) => {
    const api = (window as any).electronAPI

    // --- ASIO path --- (use ref to avoid stale closure)
    if (audioModeRef.current === 'asio') {
      if (!api?.asioPlaySound) return

      const asioOpts = {
        volume: options?.volume ?? 1.0,
        loop: options?.loop ?? false,
        restart: options?.restart ?? false
      }

      const doPlay = async (fp: string) => {
        const result = await api.asioPlaySound(fp, asioOpts)
        if (result && !result.success) {
          console.error(`[AudioEngine] asioPlaySound failed for ${fp}: ${result.error}`)
        } else {
          setIsPlaying(prev => new Map(prev).set(fp, true))
        }
      }

      if (!asioLoadedFiles.has(filePath)) {
        loadSound(filePath).then(() => doPlay(filePath)).catch(err => {
          console.error(`[AudioEngine] load-then-play failed: ${err.message}`)
        })
        return
      }

      doPlay(filePath).catch(err => {
        console.error(`[AudioEngine] play error: ${err.message}`)
      })
      return
    }

    // --- WDM path (unchanged) ---
    const sound = loadedSoundsRef.current.get(filePath)

    if (!sound) {
      logger.debug(`Sound not loaded, loading: ${filePath}`)
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
  }, [audioMode, loadSound])

  const playLoadedSound = (sound: Howl, filePath: string, options?: any) => {
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
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioStopSound) {
        api.asioStopSound(filePath)
      }
      setIsPlaying(prev => new Map(prev).set(filePath, false))
      return
    }

    const sound = loadedSoundsRef.current.get(filePath)
    if (sound) {
      sound.stop()
      setIsPlaying(prev => new Map(prev).set(filePath, false))
    }
  }, [audioMode])

  const unloadSound = useCallback((filePath: string) => {
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioUnloadSound) {
        api.asioUnloadSound(filePath)
      }
      asioLoadedFiles.delete(filePath)
      setLoadedSounds(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        loadedSoundsRef.current = newMap
        return newMap
      })
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
      return
    }

    const sound = loadedSoundsRef.current.get(filePath)
    if (sound) {
      logger.debug(`Unloading sound: ${filePath}`)
      sound.unload()

      const blobUrl = blobUrlRegistry.get(filePath)
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrlRegistry.delete(filePath)
        logger.debug(`Revoked blob URL for: ${filePath}`)
      }

      setLoadedSounds(prev => {
        const newMap = new Map(prev)
        newMap.delete(filePath)
        loadedSoundsRef.current = newMap
        return newMap
      })

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
  }, [audioMode])

  const stopAll = useCallback(() => {
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioStopAll) {
        api.asioStopAll()
      }
      setIsPlaying(new Map())
      return
    }

    Howler.stop()
    setIsPlaying(new Map())
  }, [audioMode])

  const setVolume = useCallback((filePath: string, volume: number) => {
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioSetVolume) {
        api.asioSetVolume(filePath, Math.max(0, Math.min(1, volume)))
      }
      return
    }

    const sound = loadedSounds.get(filePath)
    if (sound) {
      sound.volume(Math.max(0, Math.min(1, volume)))
    }
  }, [audioMode, loadedSounds])

  const setMasterVolume = useCallback((volume: number) => {
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioSetMasterVolume) {
        api.asioSetMasterVolume(Math.max(0, Math.min(1, volume)))
      }
      return
    }

    Howler.volume(Math.max(0, Math.min(1, volume)))
  }, [audioMode])

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
    asioReady,
  }
}
