import React from 'react'

interface SimplePadProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  onPlaySound: (url: string) => void
  onMapSound: (index: number) => void
}

export const SimplePad: React.FC<SimplePadProps> = ({
  buttonStates,
  soundMappings,
  onPlaySound,
  onMapSound
}) => {
  const extractFilename = (path: string) => {
    const parts = path.split(/[/\\#]/)
    const filename = parts[parts.length - 1] || parts[parts.length - 2] || 'Unknown'
    return filename.replace(/\.[^/.]+$/, '')
  }

  return (
    <div className="p-8 bg-gray-900 rounded-xl">
      <h2 className="text-2xl font-bold text-white mb-6">Haute42 Pad Controller</h2>

      <div className="grid grid-cols-4 gap-4 max-w-3xl mx-auto">
        {Array.from({ length: 16 }).map((_, index) => {
          const isPressed = buttonStates.get(index) === true
          const soundFile = soundMappings.get(index)
          const hasSound = !!soundFile

          return (
            <button
              key={index}
              onClick={() => {
                if (hasSound) {
                  onPlaySound(soundFile!)
                } else {
                  onMapSound(index)
                }
              }}
              className={`
                aspect-square rounded-lg border-4
                flex flex-col items-center justify-center
                transition-all duration-100
                min-h-[120px]
                ${isPressed
                  ? 'bg-purple-500 border-purple-300 scale-90 shadow-lg shadow-purple-500/50'
                  : hasSound
                    ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                }
              `}
            >
              <div className="text-white text-xs font-bold mb-2">PAD {index}</div>
              {hasSound && (
                <div className="text-white text-sm px-2 text-center">
                  {extractFilename(soundFile)}
                </div>
              )}
              {!hasSound && (
                <div className="text-gray-500 text-xs">EMPTY</div>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-6 text-center text-sm text-gray-400">
        {Array.from(buttonStates.entries())
          .filter(([_, pressed]) => pressed)
          .map(([idx]) => `Button ${idx}`)
          .join(', ') || 'No buttons pressed'}
      </div>
    </div>
  )
}
