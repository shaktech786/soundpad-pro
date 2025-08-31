import React, { useCallback } from 'react'

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
  const padCount = 16 // 4x4 grid

  const handlePadClick = useCallback((index: number) => {
    const soundFile = soundMappings.get(index)
    if (soundFile) {
      onPlaySound(soundFile, { restart: true })
    }
  }, [soundMappings, onPlaySound])

  const getSoundName = (filePath: string) => {
    if (!filePath) return 'Empty'
    const parts = filePath.split(/[/\\]/)
    const filename = parts[parts.length - 1]
    return filename.replace(/\.[^/.]+$/, '') // Remove extension
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Sound Pads</h2>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: padCount }, (_, index) => {
          const isActive = buttonStates.get(index) || false
          const soundFile = soundMappings.get(index)
          const hasSound = !!soundFile

          return (
            <button
              key={index}
              onClick={() => handlePadClick(index)}
              className={`
                relative h-24 rounded-lg border-2 transition-all transform
                ${isActive 
                  ? 'bg-purple-600 border-purple-400 scale-95' 
                  : hasSound
                    ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:scale-105'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                }
              `}
            >
              <div className="flex flex-col items-center justify-center h-full">
                <span className="text-xs text-gray-400 absolute top-2 left-2">
                  {index + 1}
                </span>
                <span className="text-sm font-medium px-2 text-center">
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