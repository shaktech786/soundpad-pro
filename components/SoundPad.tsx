import React, { useCallback } from 'react'
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
  // Fixed 4x4 grid layout like professional pad controllers (Haute42 style)
  const padCount = 16
  const gridCols = 'grid-cols-4'

  const handlePadClick = useCallback((index: number) => {
    const soundFile = soundMappings.get(index)
    if (soundFile) {
      // Extract actual URL using utility function
      const actualUrl = extractAudioUrl(soundFile)
      console.log(`Playing sound from pad ${index + 1}:`, actualUrl)
      onPlaySound(actualUrl, { restart: true })
    }
  }, [soundMappings, onPlaySound])

  const getSoundName = useCallback((filePath: string) => {
    return extractFilename(filePath)
  }, [])

  // Count how many sounds are actually mapped
  const mappedCount = soundMappings.size

  // Define professional pad colors (inspired by MPC/Maschine style)
  const getPadColor = useCallback((index: number, hasSound: boolean, isActive: boolean) => {
    if (isActive) {
      return 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-300 shadow-lg shadow-purple-500/50'
    }
    if (hasSound) {
      // Different colors for each row for visual organization
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
            Sound Pad Controller
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {mappedCount} / {padCount} pads
          </span>
          <span className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">
            4x4 GRID
          </span>
        </div>
      </div>

      {/* Pad grid container with aspect ratio */}
      <div className="relative bg-gray-950 rounded-xl p-6 shadow-inner">
        <div className={`grid ${gridCols} gap-4 max-w-2xl mx-auto`}>
          {Array.from({ length: padCount }, (_, index) => {
            const isActive = buttonStates.get(index) || false
            const soundFile = soundMappings.get(index)
            const hasSound = !!soundFile

            return (
              <button
                key={index}
                onClick={() => handlePadClick(index)}
                className={`
                  relative aspect-square rounded-xl border-2 transition-all duration-150 transform
                  ${getPadColor(index, hasSound, isActive)}
                  ${isActive ? 'scale-95' : 'hover:scale-105'}
                  shadow-lg hover:shadow-xl
                  flex flex-col items-center justify-center
                  overflow-hidden
                `}
              >
                {/* Pad number badge */}
                <div className="absolute top-2 left-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white/80">
                    {index + 1}
                  </span>
                </div>

                {/* Sound name */}
                <div className="px-3 py-2 text-center">
                  <span className="text-sm font-semibold text-white drop-shadow-md line-clamp-2">
                    {hasSound ? getSoundName(soundFile) : ''}
                  </span>
                  {!hasSound && (
                    <span className="text-xs text-gray-500">Empty</span>
                  )}
                </div>

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute inset-0 bg-white opacity-20 animate-pulse" />
                )}

                {/* Velocity/pressure indicator (visual only for now) */}
                {isActive && hasSound && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 animate-pulse" />
                )}
              </button>
            )
          })}
        </div>

        {/* Visual indicators for pad banks (like MPC) */}
        <div className="mt-6 flex justify-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((bank) => (
              <div
                key={bank}
                className={`w-2 h-2 rounded-full ${
                  bank === 1 ? 'bg-purple-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-2">Bank A</span>
        </div>
      </div>
    </div>
  )
}