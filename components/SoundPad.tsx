import React, { useCallback, useMemo } from 'react'
import { extractAudioUrl, extractFilename } from '../utils/audioUtils'

interface SoundPadProps {
  soundMappings: Map<number, string>
  buttonStates: Map<number, boolean>
  onPlaySound: (filePath: string, options?: any) => void
}

export const SoundPad: React.FC<SoundPadProps> = ({ 
  soundMappings, 
  buttonStates, 
  onPlaySound 
}) => {
  // Memoize pad count calculation
  const { padCount, gridCols } = useMemo(() => {
    const keys = Array.from(soundMappings.keys())
    const maxMappedIndex = keys.length > 0 ? Math.max(...keys, 15) : 15
    const count = Math.min(32, Math.max(16, maxMappedIndex + 1))
    
    let cols = 'grid-cols-4'
    if (count <= 16) cols = 'grid-cols-4'
    else if (count <= 20) cols = 'grid-cols-5'
    else if (count <= 24) cols = 'grid-cols-6'
    else cols = 'grid-cols-8'
    
    return { padCount: count, gridCols: cols }
  }, [soundMappings])

  const handlePadClick = useCallback((index: number) => {
    const soundFile = soundMappings.get(index)
    if (soundFile) {
      // Extract actual URL using utility function
      const actualUrl = extractAudioUrl(soundFile)
      onPlaySound(actualUrl, { restart: true })
    }
  }, [soundMappings, onPlaySound])

  const getSoundName = useCallback((filePath: string) => {
    return extractFilename(filePath)
  }, [])

  // Count how many sounds are actually mapped
  const mappedCount = soundMappings.size

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Sound Pads</h2>
        <span className="text-sm text-gray-400">
          {mappedCount} sound{mappedCount !== 1 ? 's' : ''} mapped
        </span>
      </div>
      <div className={`grid ${gridCols} gap-3`}>
        {Array.from({ length: padCount }, (_, index) => {
          const isActive = buttonStates.get(index) || false
          const soundFile = soundMappings.get(index)
          const hasSound = !!soundFile

          return (
            <button
              key={index}
              onClick={() => handlePadClick(index)}
              className={`
                relative h-20 rounded-lg border-2 transition-all transform
                ${isActive 
                  ? 'bg-purple-600 border-purple-400 scale-95' 
                  : hasSound
                    ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:scale-105'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                }
              `}
            >
              <div className="flex flex-col items-center justify-center h-full">
                <span className="text-xs text-gray-400 absolute top-1 left-2">
                  {index + 1}
                </span>
                <span className="text-xs font-medium px-1 text-center line-clamp-2">
                  {hasSound ? getSoundName(soundFile) : 'Empty'}
                </span>
                {isActive && (
                  <div className="absolute inset-0 bg-purple-400 opacity-30 rounded-lg animate-pulse" />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}