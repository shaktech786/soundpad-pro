import React, { useCallback, useEffect } from 'react'
import { extractAudioUrl, extractFilename } from '../utils/audioUtils'

interface SoundPadProps {
  soundMappings: Map<number, string>
  buttonStates: Map<number, boolean>
  onPlaySound: (filePath: string, options?: any) => void
  controllerButtonCount?: number
}

export const SoundPad: React.FC<SoundPadProps> = ({
  soundMappings,
  buttonStates,
  onPlaySound,
  controllerButtonCount = 16
}) => {
  // Debug logging for buttonStates prop
  useEffect(() => {
    const pressedButtons = Array.from(buttonStates.entries()).filter(([k,v]) => v).map(([k]) => k)
    if (pressedButtons.length > 0) {
      console.log(`🟣 SoundPad Component: Received buttonStates with pressed buttons: [${pressedButtons.join(', ')}]`)
    }
  }, [buttonStates])
  const handlePadClick = useCallback((index: number) => {
    const soundFile = soundMappings.get(index)
    if (soundFile) {
      const actualUrl = extractAudioUrl(soundFile)
      console.log(`Playing sound from pad ${index}:`, actualUrl)
      onPlaySound(actualUrl, { restart: true })
    }
  }, [soundMappings, onPlaySound])

  const getSoundName = useCallback((filePath: string) => {
    return extractFilename(filePath)
  }, [])

  // Get pad color based on row (Haute42/MPC style)
  const getPadColor = useCallback((index: number, hasSound: boolean, isActive: boolean) => {
    if (isActive) {
      return 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-300 shadow-lg shadow-purple-500/50'
    }
    if (hasSound) {
      const row = Math.floor(index / 4)
      const colors = [
        'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500 hover:from-blue-500 hover:to-blue-600',
        'bg-gradient-to-br from-green-600 to-green-700 border-green-500 hover:from-green-500 hover:to-green-600',
        'bg-gradient-to-br from-yellow-600 to-yellow-700 border-yellow-500 hover:from-yellow-500 hover:to-yellow-600',
        'bg-gradient-to-br from-red-600 to-red-700 border-red-500 hover:from-red-500 hover:to-red-600'
      ]
      return colors[row % 4]
    }
    return 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-600'
  }, [])

  return (
    <div className="bg-gray-900 rounded-xl p-8 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Haute42 Pad Controller
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {soundMappings.size} / 16 pads
          </span>
          <span className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">
            4x4 GRID
          </span>
        </div>
      </div>

      {/* Haute42 4x4 Pad Grid */}
      <div className="relative bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 rounded-2xl p-8 shadow-inner">
        <div className="grid grid-cols-4 gap-4 max-w-3xl mx-auto">
          {Array.from({ length: 16 }, (_, index) => {
            const isActive = buttonStates.get(index) || false
            const soundFile = soundMappings.get(index)
            const hasSound = !!soundFile

            // Debug logging for active buttons
            if (isActive) {
              console.log(`🟦 Pad ${index}: RENDERING AS ACTIVE (has sound: ${hasSound})`)
            }

            return (
              <button
                key={index}
                onClick={() => handlePadClick(index)}
                data-button-index={index}
                data-active={isActive}
                className={`
                  relative aspect-square rounded-lg border-4 transition-all duration-100 transform
                  ${getPadColor(index, hasSound, isActive)}
                  ${isActive ? 'scale-90 shadow-inner' : 'hover:scale-105 shadow-xl'}
                  flex flex-col items-center justify-center
                  overflow-hidden
                  min-h-[120px]
                `}
              >
                {/* Pad number badge */}
                <div className="absolute top-2 left-2 w-8 h-8 bg-black/60 rounded-lg flex items-center justify-center backdrop-blur-sm">
                  <span className="text-xs font-bold text-white">
                    {index}
                  </span>
                </div>

                {/* Sound name */}
                <div className="px-3 py-2 text-center flex-1 flex items-center justify-center">
                  {hasSound ? (
                    <span className="text-sm font-bold text-white drop-shadow-lg line-clamp-2">
                      {getSoundName(soundFile)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 font-medium">EMPTY</span>
                  )}
                </div>

                {/* Active indicator with velocity bar */}
                {isActive && (
                  <>
                    <div className="absolute inset-0 bg-white opacity-30 animate-pulse rounded-lg" />
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400" />
                  </>
                )}

                {/* Pad inner shadow effect */}
                <div className="absolute inset-0 rounded-lg shadow-inner pointer-events-none opacity-30" />
              </button>
            )
          })}
        </div>

        {/* Status bar below pads */}
        <div className="mt-6 flex justify-center items-center gap-6 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-br from-purple-500 to-pink-500" />
            <span>Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-600" />
            <span>Row 1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-600" />
            <span>Row 2</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-yellow-600" />
            <span>Row 3</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-600" />
            <span>Row 4</span>
          </div>
        </div>
      </div>
    </div>
  )
}
