import React, { useMemo } from 'react'
import { OBSAction } from '../contexts/OBSContext'

interface Haute42LayoutProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  obsActions?: Map<number, OBSAction> // visualId -> OBS action
  onPlaySound: (url: string) => void
  onMapSound: (index: number) => void
  onAssignOBSAction?: (index: number) => void
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
  obsActions,
  onPlaySound,
  onMapSound,
  onAssignOBSAction,
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
    const obsAction = obsActions?.get(index)
    const hasOBSAction = !!obsAction
    const isStopButton = stopButton !== null && gamepadButton === stopButton

    const handleClick = (e: React.MouseEvent) => {
      console.log(`🔵 Button ${index} clicked!`, { hasSound, soundFile, hasOBSAction, ctrlKey: e.ctrlKey })

      // Ctrl+Click always opens file picker
      if (e.ctrlKey || e.metaKey) {
        console.log(`🔵 Opening file picker for pad ${index}`)
        onMapSound(index)
        return
      }

      // Alt+Click opens OBS action assigner
      if (e.altKey && onAssignOBSAction) {
        console.log(`🔵 Opening OBS action assigner for pad ${index}`)
        onAssignOBSAction(index)
        return
      }

      // Left click behavior
      if (hasSound) {
        console.log(`🔵 Playing sound from pad ${index}:`, soundFile)
        onPlaySound(soundFile!)
      } else {
        console.log(`🔵 Opening file picker for empty pad ${index}`)
        onMapSound(index)
      }
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault()

      // If OBS integration is enabled, show OBS action assigner on right-click
      if (onAssignOBSAction) {
        onAssignOBSAction(index)
      } else {
        onMapSound(index)
      }
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
          w-24 h-24
          rounded-full border-4
          flex flex-col items-center justify-center
          transition-all duration-100
          relative
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
        {/* OBS Action Indicator Badge */}
        {hasOBSAction && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full border-2 border-gray-900 flex items-center justify-center">
            <span className="text-xs">🎬</span>
          </div>
        )}

        {isStopButton ? (
          <div className="text-white text-sm px-1 text-center font-bold">
            🛑 STOP
          </div>
        ) : hasSound ? (
          <div className="text-white text-sm px-1 text-center line-clamp-2 font-medium leading-tight">
            {extractFilename(soundFile)}
          </div>
        ) : (
          <div className="text-gray-500 text-lg">+</div>
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
