import React, { useMemo } from 'react'

interface Haute42LayoutProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  onPlaySound: (url: string) => void
  onMapSound: (index: number) => void
  buttonMapping?: Map<number, number> // visualId -> gamepadButtonId
  stopButton?: number | null // gamepad button assigned to stop
}

// Custom layout positions from drag-and-drop builder
const BUTTON_LAYOUT = [
  { id: 0, x: 191, y: 125 },
  { id: 1, x: 550, y: 111 },
  { id: 2, x: 388, y: 249 },
  { id: 3, x: 202, y: 44 },
  { id: 4, x: 261, y: 152 },
  { id: 5, x: 340, y: 119 },
  { id: 6, x: 479, y: 110 },
  { id: 7, x: 532, y: 187 },
  { id: 8, x: 117, y: 121 },
  { id: 9, x: 345, y: 41 },
  { id: 10, x: 293, y: 289 },
  { id: 11, x: 217, y: 273 },
  { id: 12, x: 413, y: 113 },
  { id: 13, x: 323, y: 197 },
  { id: 14, x: 390, y: 183 },
  { id: 15, x: 460, y: 183 }
]

export const Haute42Layout: React.FC<Haute42LayoutProps> = ({
  buttonStates,
  soundMappings,
  onPlaySound,
  onMapSound,
  buttonMapping,
  stopButton
}) => {
  // Create reverse mapping: gamepadButtonId -> visualId
  const reverseMapping = useMemo(() => {
    if (!buttonMapping) return null
    const reverse = new Map<number, number>()
    buttonMapping.forEach((gamepadBtn, visualId) => {
      reverse.set(gamepadBtn, visualId)
    })
    return reverse
  }, [buttonMapping])

  const extractFilename = (path: string) => {
    const parts = path.split(/[/\\#]/)
    const filename = parts[parts.length - 1] || parts[parts.length - 2] || 'Unknown'
    return filename.replace(/\.[^/.]+$/, '')
  }

  const PadButton = ({ index, x, y }: { index: number, x: number, y: number }) => {
    // Determine which gamepad button corresponds to this visual button
    const gamepadButton = buttonMapping?.get(index) ?? index
    const isPressed = buttonStates.get(gamepadButton) === true
    const soundFile = soundMappings.get(index)
    const hasSound = !!soundFile
    const isStopButton = stopButton !== null && gamepadButton === stopButton

    const handleClick = (e: React.MouseEvent) => {
      // Ctrl+Click always opens file picker
      if (e.ctrlKey || e.metaKey) {
        onMapSound(index)
        return
      }

      // Left click behavior
      if (hasSound) {
        onPlaySound(soundFile!)
      } else {
        onMapSound(index)
      }
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault()
      onMapSound(index)
    }

    return (
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`
        }}
        className={`
          w-20 h-20
          rounded-full border-4
          flex flex-col items-center justify-center
          transition-all duration-100
          ${isPressed
            ? 'bg-purple-500 border-purple-300 scale-110 shadow-lg shadow-purple-500/50'
            : isStopButton
              ? 'bg-red-600 border-red-500 hover:bg-red-500 shadow-lg shadow-red-500/30'
              : hasSound
                ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
          }
        `}
      >
        {isStopButton ? (
          <div className="text-white text-xs px-1 text-center font-bold">
            🛑 STOP
          </div>
        ) : hasSound ? (
          <div className="text-white text-xs px-1 text-center line-clamp-2 font-medium leading-tight">
            {extractFilename(soundFile)}
          </div>
        ) : (
          <div className="text-gray-500 text-sm">+</div>
        )}
      </button>
    )
  }

  return (
    <div className="p-8 bg-gray-900 rounded-xl">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Haute42 Controller</h2>

      {/* Custom layout matching your physical Haute42 controller */}
      <div className="relative mx-auto" style={{ width: '1200px', height: '600px' }}>
        {BUTTON_LAYOUT.map(btn => (
          <PadButton key={btn.id} index={btn.id} x={btn.x * 1.5} y={btn.y * 1.5} />
        ))}
      </div>
    </div>
  )
}
