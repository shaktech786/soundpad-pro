import React from 'react'

interface Haute42LayoutProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  onPlaySound: (url: string) => void
  onMapSound: (index: number) => void
}

export const Haute42Layout: React.FC<Haute42LayoutProps> = ({
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

  const PadButton = ({ index, size = 'normal' }: { index: number, size?: 'small' | 'normal' | 'large' }) => {
    const isPressed = buttonStates.get(index) === true
    const soundFile = soundMappings.get(index)
    const hasSound = !!soundFile

    const sizeClasses = {
      small: 'w-12 h-12 text-[10px]',
      normal: 'w-20 h-20 text-xs',
      large: 'w-24 h-24 text-sm'
    }

    return (
      <button
        onClick={() => {
          if (hasSound) {
            onPlaySound(soundFile!)
          } else {
            onMapSound(index)
          }
        }}
        className={`
          ${sizeClasses[size]}
          rounded-lg border-4
          flex flex-col items-center justify-center
          transition-all duration-100
          ${isPressed
            ? 'bg-purple-500 border-purple-300 scale-90 shadow-lg shadow-purple-500/50'
            : hasSound
              ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
              : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
          }
        `}
      >
        <div className="text-white font-bold">{index}</div>
        {hasSound && (
          <div className="text-white text-[10px] px-1 text-center line-clamp-1 mt-1">
            {extractFilename(soundFile)}
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="p-8 bg-gray-900 rounded-xl">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Haute42 Controller</h2>

      {/* Main Layout matching Haute42 physical layout */}
      <div className="max-w-4xl mx-auto">

        {/* Top Row - Small Control Buttons */}
        <div className="flex justify-center gap-2 mb-6">
          {[8, 9, 10, 11, 12, 13, 14, 15].map(idx => (
            <PadButton key={idx} index={idx} size="small" />
          ))}
        </div>

        {/* Main Pad Area */}
        <div className="flex gap-8 items-start">

          {/* Left Side - Encoders/Knobs Area (buttons 16-17) */}
          <div className="flex flex-col gap-4">
            <PadButton index={16} size="normal" />
            <PadButton index={17} size="normal" />
          </div>

          {/* Center/Right - Main Pads (matching typical Haute42 layout) */}
          <div className="flex-1">
            {/* Row 1 */}
            <div className="flex justify-center gap-3 mb-3">
              <PadButton index={0} size="large" />
              <PadButton index={1} size="large" />
              <PadButton index={2} size="large" />
              <PadButton index={3} size="large" />
            </div>

            {/* Row 2 */}
            <div className="flex justify-center gap-3 mb-3">
              <PadButton index={4} size="large" />
              <PadButton index={5} size="large" />
              <PadButton index={6} size="large" />
              <PadButton index={7} size="large" />
            </div>

            {/* Row 3 - Bottom row (fewer buttons) */}
            <div className="flex justify-center gap-3">
              <PadButton index={18} size="normal" />
              <PadButton index={19} size="normal" />
            </div>
          </div>
        </div>

        {/* Debug Info */}
        <div className="mt-6 text-center text-sm text-gray-400">
          Pressed: {Array.from(buttonStates.entries())
            .filter(([_, pressed]) => pressed)
            .map(([idx]) => `${idx}`)
            .join(', ') || 'None'}
        </div>
      </div>
    </div>
  )
}
