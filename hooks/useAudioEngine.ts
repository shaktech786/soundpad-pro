import { useCallback, useRef, useState, useEffect } from 'react'
import { Howl, Howler } from 'howler'
import logger from '../utils/logger'

// Audio engine for loading and playing sounds with Electron file system support
// Supports dual-mode: WDM (Howler.js in renderer) and ASIO (via main process)

/** Convert linear slider value (0–1) to perceptual audio gain.
 *  Quadratic curve with 0.7 ceiling: 100% → 0.7 (~-3dB), 50% → 0.175 (~-15dB).
 *  Combined master×button at both 100% = 0.49 (~-6dBFS) — safe headroom for OBS. */
const toAudioGain = (v: number): number => v * v * 0.7

export type AudioMode = 'wdm' | 'asio'

// Track blob URLs for cleanup (WDM mode only)
const blobUrlRegistry = new Map<string, string>()

/** Convert a filesystem path to a file:// URL suitable for Howler's html5 audio fallback.
 *  Returns null if the path is already a URL (blob:, file://, http(s)://) or isn't a local path. */
function pathToFileUrl(filePath: string): string | null {
  if (!filePath) return null
  if (filePath.startsWith('blob:') || filePath.startsWith('file://') || /^https?:\/\//.test(filePath)) return null
  if (/^[A-Z]:[\\\/]/.test(filePath)) {
    const normalized = filePath.replace(/\\/g, '/')
    return 'file:///' + encodeURI(normalized).replace(/#/g, '%23')
  }
  if (filePath.startsWith('\\\\')) {
    const normalized = filePath.replace(/\\/g, '/')
    return 'file:' + encodeURI(normalized).replace(/#/g, '%23')
  }
  if (filePath.includes('\\')) {
    const normalized = filePath.replace(/\\/g, '/')
    return 'file:///' + encodeURI(normalized).replace(/#/g, '%23')
  }
  return null
}

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
  const isPlayingRef = useRef<Map<string, boolean>>(new Map())
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
    isPlayingRef.current = isPlaying
  }, [isPlaying])

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
      // Stop all WDM audio before ASIO takes over.
      // Without this, orphaned Howl instances from WDM mode keep playing at full
      // volume through Windows audio / CABLE Input, bypassing the ASIO master volume.
      Howler.stop()
      loadedSoundsRef.current.forEach((sound) => {
        if (sound && typeof (sound as any).unload === 'function') {
          try { sound.stop(); sound.unload(); } catch (e) { /* ignore */ }
        }
      })
      // Clear blob URLs for WDM sounds being replaced
      blobUrlRegistry.forEach((url) => URL.revokeObjectURL(url))
      blobUrlRegistry.clear()

      // First check if engine is already running (auto-initialized by main process)
      const checkAndInit = async () => {
        try {
          if (api.asioStatus) {
            const status = await api.asioStatus()
            if (status.initialized) {
              logger.log(`[AudioEngine] Engine already running: ${status.device} (${status.cachedSounds} cached sounds)`)
              setAsioReady(true)
              return
            }
          }
          // Engine not running, try to initialize
          logger.log('[AudioEngine] Engine not running, initializing...')
          const result = await api.asioInitialize()
          if (result.success) {
            logger.log(`[AudioEngine] ASIO initialized: ${result.device} @ ${result.sampleRate}Hz via ${result.mode}`)
            setAsioReady(true)
          } else {
            logger.error(`[AudioEngine] ASIO init failed: ${result.error}`)
            setAsioReady(false)
            setLoadErrors(prev => new Map(prev).set('__asio__', result.error))
          }
        } catch (err: any) {
          logger.error('[AudioEngine] ASIO init exception:', err)
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

  // Listen for ASIO stream-lost/recovered events from main process
  useEffect(() => {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (!api || audioMode !== 'asio') return

    let cleanupLost: (() => void) | undefined
    let cleanupRecovered: (() => void) | undefined

    if (api.onAsioStreamLost) {
      cleanupLost = api.onAsioStreamLost((reason: string) => {
        logger.error(`[AudioEngine] ASIO stream lost: ${reason}`)
        setAsioReady(false)
        setLoadErrors(prev => new Map(prev).set('__asio__', `Stream lost: ${reason}`))
      })
    }

    if (api.onAsioStreamRecovered) {
      cleanupRecovered = api.onAsioStreamRecovered((device: string) => {
        logger.log(`[AudioEngine] ASIO stream recovered: ${device}`)
        setAsioReady(true)
        setLoadErrors(prev => {
          const newMap = new Map(prev)
          newMap.delete('__asio__')
          return newMap
        })
        // Re-mark loaded files since cache is preserved across reconnect
        // but the Set needs to match engine state
      })
    }

    return () => {
      cleanupLost?.()
      cleanupRecovered?.()
    }
  }, [audioMode])

  // WDM cleanup on unmount
  useEffect(() => {
    return () => {
      loadedSoundsRef.current.forEach(sound => sound.unload())
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
          // Unload any WDM Howl being replaced so it doesn't keep playing
          const existingHowl = loadedSoundsRef.current.get(filePath)
          if (existingHowl && typeof (existingHowl as any).unload === 'function') {
            try { existingHowl.stop(); existingHowl.unload(); } catch (e) { /* ignore */ }
            const blobUrl = blobUrlRegistry.get(filePath)
            if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrlRegistry.delete(filePath) }
          }
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
          // Unload any WDM Howl being replaced so it doesn't keep playing
          const existingHowl2 = loadedSoundsRef.current.get(filePath)
          if (existingHowl2 && typeof (existingHowl2 as any).unload === 'function') {
            try { existingHowl2.stop(); existingHowl2.unload(); } catch (e) { /* ignore */ }
            const blobUrl = blobUrlRegistry.get(filePath)
            if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrlRegistry.delete(filePath) }
          }
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
        // blob: URLs use Web Audio API for sub-millisecond latency (MPC/drum pad feel).
        // Some MP3s (e.g. ffmpeg-transcoded YouTube Opus without a Xing header) make
        // Chromium's decodeAudioData fail or return silence — fall back to html5 audio
        // via file:// URL, which uses the media pipeline and tolerates these files.
        const fallbackUrl = audioUrl.startsWith('blob:') ? pathToFileUrl(filePath) : null

        const createHowl = (src: string, isFallback: boolean): Howl => {
          const howl = new Howl({
            src: [src],
            html5: !src.startsWith('blob:'),
            preload: true,
            volume: 1.0,
            format: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'aac', 'opus', 'weba'],
            onload: () => {
              logger.debug(`Sound loaded successfully${isFallback ? ' (html5 fallback)' : ''}: ${filePath}`)
              setLoadedSounds(prev => {
                const newMap = new Map(prev).set(filePath, howl)
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

              // Primary attempt used Web Audio via blob URL — try html5 file:// fallback.
              if (!isFallback && fallbackUrl) {
                logger.warn(`Web Audio decode failed for ${filePath} (${errorMsg}); retrying with html5 audio`)
                try { howl.unload() } catch { /* ignore */ }
                const staleBlob = blobUrlRegistry.get(filePath)
                if (staleBlob) { URL.revokeObjectURL(staleBlob); blobUrlRegistry.delete(filePath) }
                createHowl(fallbackUrl, true)
                return
              }

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
          return howl
        }

        createHowl(audioUrl, false)
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
    drumPad?: boolean
  }) => {
    const api = (window as any).electronAPI

    // --- ASIO path --- (use ref to avoid stale closure)
    if (audioModeRef.current === 'asio') {
      if (!api?.asioPlaySound) return

      const asioOpts = {
        volume: toAudioGain(options?.volume ?? 1.0),
        loop: options?.loop ?? false,
        restart: options?.drumPad ? false : (options?.restart ?? false)
      }

      const doPlay = async (fp: string) => {
        let result = await api.asioPlaySound(fp, asioOpts)
        if (result && !result.success) {
          // If engine reports not initialized, try reconnecting once
          if (result.error?.includes('not initialized') && api.asioReconnect) {
            logger.log('[AudioEngine] Engine not initialized, attempting reconnect...')
            const reconnResult = await api.asioReconnect()
            if (reconnResult.success) {
              setAsioReady(true)
              result = await api.asioPlaySound(fp, asioOpts)
            }
          }
          if (result && !result.success) {
            logger.error(`[AudioEngine] asioPlaySound failed for ${fp}: ${result.error}`)
          }
        }
        if (result?.success) {
          setIsPlaying(prev => new Map(prev).set(fp, true))
        }
      }

      if (!asioLoadedFiles.has(filePath)) {
        loadSound(filePath).then(() => doPlay(filePath)).catch(err => {
          logger.error(`[AudioEngine] load-then-play failed: ${err.message}`)
        })
        return
      }

      doPlay(filePath).catch(err => {
        logger.error(`[AudioEngine] play error: ${err.message}`)
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
  }, [])

  const playLoadedSound = (sound: Howl, filePath: string, options?: any) => {
    // Drum pad mode: layer new voices without stopping previous ones.
    // Volume is set per-voice (using the sound ID returned by play()) so that
    // rapid re-triggers with different volumes don't mutate each other's playback.
    if (options?.drumPad) {
      const soundId = sound.play()
      if (options?.volume !== undefined && soundId !== undefined) {
        sound.volume(toAudioGain(options.volume), soundId)
      }
      setIsPlaying(prev => new Map(prev).set(filePath, true))
      return
    }

    if (options?.restart || !isPlayingRef.current.get(filePath)) {
      sound.stop()
    }

    if (options?.volume !== undefined) {
      sound.volume(toAudioGain(options.volume))
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
  }, [])

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
  }, [])

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
  }, [])

  const setVolume = useCallback((filePath: string, volume: number) => {
    const gain = toAudioGain(Math.max(0, Math.min(1, volume)))
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioSetVolume) {
        api.asioSetVolume(filePath, gain)
      }
      return
    }

    const sound = loadedSoundsRef.current.get(filePath)
    if (sound) {
      sound.volume(gain)
    }
  }, [])

  const setMasterVolume = useCallback((volume: number) => {
    const gain = toAudioGain(Math.max(0, Math.min(1, volume)))
    if (audioModeRef.current === 'asio') {
      const api = (window as any).electronAPI
      if (api?.asioSetMasterVolume) {
        api.asioSetMasterVolume(gain)
      }
      return
    }

    Howler.volume(gain)
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
    asioReady,
  }
}
