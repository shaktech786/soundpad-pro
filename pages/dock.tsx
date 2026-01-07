import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { Howler } from 'howler'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { useOBS, OBSAction } from '../contexts/OBSContext'
import { useLiveSplit, LiveSplitAction } from '../contexts/LiveSplitContext'

type CombinedAction = (OBSAction & { service: 'obs' }) | (LiveSplitAction & { service: 'livesplit' })

export default function DockMode() {
  const { playSound, stopAll, loadSound } = useAudioEngine()
  const { connected: obsConnected, executeAction: executeOBSAction } = useOBS()
  const { connected: liveSplitConnected, executeAction: executeLiveSplitAction } = useLiveSplit()

  const [soundMappings, setSoundMappings] = useState<Map<number, string>>(new Map())
  const [combinedActions, setCombinedActions] = useState<Map<number, CombinedAction>>(new Map())
  const [buttonVolumes, setButtonVolumes] = useState<Map<number, number>>(new Map())
  const [stopButton, setStopButton] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeButton, setActiveButton] = useState<number | null>(null)

  // Resume audio context (needed for OBS browser docks)
  const resumeAudioContext = useCallback(async () => {
    try {
      // Resume Howler's audio context
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        await Howler.ctx.resume()
        console.log('Audio context resumed')
      }
    } catch (err) {
      console.error('Failed to resume audio context:', err)
    }
  }, [])

  // Fetch mappings from API (reads from electron-store)
  const fetchMappings = useCallback(async () => {
    try {
      const response = await fetch('/api/mappings')
      if (!response.ok) throw new Error('Failed to fetch mappings')

      const data = await response.json()

      if (data['soundpad-mappings']) {
        setSoundMappings(new Map(data['soundpad-mappings']))
      }
      if (data['combined-action-mappings']) {
        setCombinedActions(new Map(data['combined-action-mappings']))
      }
      if (data['button-volumes']) {
        setButtonVolumes(new Map(data['button-volumes']))
      }
      if (data['haute42-stop-button'] !== null) {
        setStopButton(data['haute42-stop-button'])
      }
    } catch (error) {
      console.error('Error fetching mappings:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and periodically refresh
  useEffect(() => {
    fetchMappings()
    const interval = setInterval(fetchMappings, 5000)
    return () => clearInterval(interval)
  }, [fetchMappings])

  // Convert local file path to API URL for OBS dock (can't access local files directly)
  const getAudioUrl = useCallback((filePath: string): string => {
    const cleanPath = filePath.split('#')[0]

    // If it's already a URL, return as-is
    if (cleanPath.startsWith('http') || cleanPath.startsWith('blob:')) {
      return cleanPath
    }

    // Convert Windows path to API URL
    // C:\Users\shake\Documents\SoundBoard\file.mp3 -> /api/audio/C:/Users/shake/Documents/SoundBoard/file.mp3
    const normalizedPath = cleanPath.replace(/\\/g, '/')
    return `/api/audio/${normalizedPath}`
  }, [])

  // Pre-load sounds when mappings change (using API URLs)
  useEffect(() => {
    const preloadSounds = async () => {
      for (const [_, filepath] of soundMappings) {
        try {
          const audioUrl = getAudioUrl(filepath)
          await loadSound(audioUrl)
        } catch (err) {
          console.error('Failed to preload:', filepath, err)
        }
      }
    }
    if (soundMappings.size > 0) {
      preloadSounds()
    }
  }, [soundMappings, loadSound, getAudioUrl])

  const extractFilename = (path: string) => {
    if (!path || typeof path !== 'string') return ''
    const parts = path.split(/[/\\#]/)
    const filename = parts[parts.length - 1] || parts[parts.length - 2] || ''
    return filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
  }

  // Send trigger to main app via API (OBS docks can't play audio directly)
  const sendTrigger = async (type: string, index: number, filePath?: string, volume?: number) => {
    try {
      await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, index, filePath, volume })
      })
    } catch (err) {
      console.error('Failed to send trigger:', err)
    }
  }

  const handlePadClick = async (index: number) => {
    // Visual feedback
    setActiveButton(index)
    setTimeout(() => setActiveButton(null), 150)

    const soundFile = soundMappings.get(index)
    const action = combinedActions.get(index)

    console.log('[Dock] Click index:', index, 'soundFile:', soundFile)

    // Send trigger to main app to play sound (include filepath to avoid mapping mismatch)
    if (soundFile) {
      const volume = buttonVolumes.get(index) ?? 100
      console.log('[Dock] Sending trigger for index:', index, 'file:', soundFile, 'volume:', volume)
      await sendTrigger('play', index, soundFile, volume)
    }

    // Send action trigger to main app (dock can't connect to OBS/LiveSplit directly)
    if (action) {
      await sendTrigger('action', index, undefined, undefined)
    }
  }

  const handleStopAll = async () => {
    await sendTrigger('stop', -1)
    stopAll()
  }

  const getActionLabel = (action: CombinedAction): string => {
    if (action.service === 'livesplit') {
      const type = action.type as string
      if (type === 'start_or_split') return 'Split'
      if (type === 'reset') return 'Reset'
      if (type === 'skip') return 'Skip'
      if (type === 'undo') return 'Undo'
      return type
    } else {
      const type = action.type as string
      if (type === 'toggle_mute') {
        const params = (action as any).params
        return params?.inputName ? `Mute ${params.inputName}` : 'Mute'
      }
      if (type === 'set_scene') return 'Scene'
      if (type === 'start_stream') return 'Go Live'
      if (type === 'stop_stream') return 'End'
      if (type === 'save_replay') return 'Replay'
      return type
    }
  }

  const DockPad = ({ index }: { index: number }) => {
    const soundFile = soundMappings.get(index)
    const hasSound = !!soundFile
    const action = combinedActions.get(index)
    const hasAction = !!action
    const isStopButton = stopButton === index
    const isActive = activeButton === index
    const isEmpty = !hasSound && !hasAction && !isStopButton

    // Get display label
    let label = ''
    if (isStopButton) {
      label = 'STOP'
    } else if (hasSound) {
      label = extractFilename(soundFile)
    } else if (hasAction) {
      label = getActionLabel(action)
    }

    return (
      <button
        onClick={() => isStopButton ? handleStopAll() : handlePadClick(index)}
        className={`
          aspect-square rounded-md border
          flex flex-col items-center justify-center
          transition-all duration-75
          relative overflow-hidden
          p-0.5
          ${isActive
            ? 'bg-purple-500 border-purple-300 scale-95 shadow-lg shadow-purple-500/50'
            : isStopButton
              ? 'bg-red-600 border-red-500 hover:bg-red-500'
              : hasSound
                ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                : hasAction
                  ? 'bg-purple-600 border-purple-500 hover:bg-purple-500'
                  : 'bg-gray-800/50 border-gray-700/50'
          }
          ${isEmpty ? 'opacity-20 cursor-default' : 'cursor-pointer'}
        `}
        disabled={isEmpty}
      >
        {/* Pad number */}
        <span className="absolute top-0 left-0.5 text-[7px] text-white/40 font-mono">
          {index}
        </span>

        {/* Action indicator */}
        {hasAction && (
          <div className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-bl text-[5px] flex items-center justify-center font-bold ${
            action?.service === 'livesplit' ? 'bg-green-500' : 'bg-purple-400'
          }`}>
            {action?.service === 'livesplit' ? 'L' : 'O'}
          </div>
        )}

        {/* Label */}
        <span className="text-white text-center text-[9px] leading-tight line-clamp-2 font-medium">
          {label}
        </span>
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-xs">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>SoundPad Dock</title>
        <style>{`
          body, html {
            background: #0a0a0a !important;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
        `}</style>
      </Head>

      <div
        className="min-h-screen bg-gray-950 p-1"
        onClick={resumeAudioContext}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1 px-0.5">
          <div className="flex items-center gap-1">
            {obsConnected && (
              <span className="text-[8px] text-purple-400 bg-purple-950 px-1 rounded">OBS</span>
            )}
            {liveSplitConnected && (
              <span className="text-[8px] text-green-400 bg-green-950 px-1 rounded">LS</span>
            )}
          </div>
          <button
            onClick={handleStopAll}
            className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[8px] rounded font-bold"
          >
            STOP ALL
          </button>
        </div>

        {/* 4x4 Grid - indices match main app */}
        <div className="grid grid-cols-4 gap-0.5">
          {Array.from({ length: 16 }, (_, i) => (
            <DockPad key={i} index={i} />
          ))}
        </div>

        {/* Footer status */}
        <div className="mt-1 text-center">
          <span className="text-[7px] text-gray-600">
            {soundMappings.size} sounds | {combinedActions.size} actions
          </span>
        </div>
      </div>
    </>
  )
}
