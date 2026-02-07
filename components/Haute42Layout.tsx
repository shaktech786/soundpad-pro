import React, { useMemo } from 'react'
import { ButtonPosition, ButtonShape, CombinedAction } from '../types/profile'
import { HAUTE42_LAYOUT } from '../config/constants'
import { useTheme } from '../contexts/ThemeContext'

interface Haute42LayoutProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  obsActions?: Map<number, CombinedAction>
  onPlaySound: (url: string, buttonIndex?: number) => void
  onMapSound: (index: number) => void
  onMapSoundFromUrl?: (index: number) => void
  onAssignOBSAction?: (index: number) => void
  onTriggerAction?: (action: CombinedAction) => void
  buttonMapping?: Map<number, number>
  stopButton?: number | null
  boardLayout?: ButtonPosition[]
  buttonShape?: ButtonShape
}

const BUTTON_RENDER_SIZE = 96 // w-24 = 96px
const CONTAINER_PADDING = 64

export const Haute42Layout: React.FC<Haute42LayoutProps> = ({
  buttonStates,
  soundMappings,
  obsActions,
  onPlaySound,
  onMapSound,
  onMapSoundFromUrl,
  onAssignOBSAction,
  onTriggerAction,
  buttonMapping,
  stopButton,
  boardLayout,
  buttonShape = 'circle',
}) => {
  const layout = boardLayout && boardLayout.length > 0 ? boardLayout : HAUTE42_LAYOUT
  const { theme } = useTheme()

  // Compute dynamic container dimensions and scale
  const { containerWidth, containerHeight, scale } = useMemo(() => {
    if (layout.length === 0) {
      return { containerWidth: 1200, containerHeight: 600, scale: 1.5 }
    }
    const maxX = Math.max(...layout.map(b => b.x))
    const maxY = Math.max(...layout.map(b => b.y))

    // Target width for the container
    const targetWidth = 1200
    const rawWidth = maxX + BUTTON_RENDER_SIZE + CONTAINER_PADDING
    const rawHeight = maxY + BUTTON_RENDER_SIZE + CONTAINER_PADDING
    const s = Math.min(targetWidth / rawWidth, 2)

    return {
      containerWidth: Math.max(600, rawWidth * s),
      containerHeight: Math.max(300, rawHeight * s),
      scale: s,
    }
  }, [layout])

  const reverseMapping = useMemo(() => {
    if (!buttonMapping) return null
    const reverse = new Map<number, number>()
    buttonMapping.forEach((gamepadBtn, visualId) => {
      reverse.set(gamepadBtn, visualId)
    })
    return reverse
  }, [buttonMapping])

  const extractFilename = (path: string) => {
    if (!path || typeof path !== 'string') return 'Unknown'
    const parts = path.split(/[/\\#]/)
    const filename = parts[parts.length - 1] || parts[parts.length - 2] || 'Unknown'
    return filename.replace(/\.[^/.]+$/, '')
  }

  const shapeClass = buttonShape === 'circle' ? 'rounded-full' : 'rounded-xl'

  const PadButton = ({ index, x, y }: { index: number; x: number; y: number }) => {
    const gamepadButton = buttonMapping?.get(index) ?? index
    const isPressed = buttonStates.get(gamepadButton) === true
    const soundFile = soundMappings.get(index)
    const hasSound = !!soundFile
    const obsAction = obsActions?.get(index)
    const hasOBSAction = !!obsAction
    const isStopButton = stopButton !== null && gamepadButton === stopButton

    const handleClick = (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        onMapSound(index)
        return
      }
      if (e.shiftKey && onMapSoundFromUrl) {
        onMapSoundFromUrl(index)
        return
      }
      if (e.altKey && onAssignOBSAction) {
        onAssignOBSAction(index)
        return
      }
      if (hasSound) {
        onPlaySound(soundFile!, index)
      } else if (hasOBSAction && onTriggerAction) {
        onTriggerAction(obsAction!)
      } else {
        onMapSound(index)
      }
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault()
      if (onAssignOBSAction) {
        onAssignOBSAction(index)
      }
    }

    const buttonLabel = isStopButton
      ? 'Stop all sounds'
      : hasSound
        ? `Play sound: ${extractFilename(soundFile!)}`
        : 'Assign sound to pad'

    return (
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
        }}
        className={`
          w-24 h-24
          ${shapeClass} border-4
          flex flex-col items-center justify-center
          transition-all duration-100
          relative
          focus:outline-none focus:ring-4 focus:ring-purple-500/50
          ${isPressed
            ? 'bg-purple-500 border-purple-300 scale-110 shadow-lg shadow-purple-500/50'
            : isStopButton
              ? 'bg-red-600 border-red-500 hover:bg-red-500 hover:scale-105 shadow-lg shadow-red-500/30'
              : hasSound
                ? 'bg-blue-600 border-blue-500 hover:bg-blue-500 hover:scale-105'
                : theme === 'light'
                  ? 'bg-gray-200 border-gray-300 hover:bg-gray-300 hover:scale-105'
                  : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:scale-105'
          }
        `}
        aria-label={buttonLabel}
        aria-pressed={isPressed}
        role="button"
        tabIndex={0}
      >
        {hasOBSAction && (
          <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            theme === 'light' ? 'border-white' : 'border-gray-900'
          } ${
            obsAction?.service === 'livesplit'
              ? 'bg-gradient-to-br from-green-500 to-blue-500'
              : 'bg-gradient-to-br from-purple-500 to-pink-500'
          }`}>
            <span className="text-xs">{obsAction?.service === 'livesplit' ? '🏁' : '🎬'}</span>
          </div>
        )}

        {isStopButton ? (
          <div className="text-white text-sm px-1 text-center font-bold">
            STOP
          </div>
        ) : hasSound ? (
          <div className="text-white text-sm px-1 text-center line-clamp-2 font-medium leading-tight">
            {extractFilename(soundFile)}
          </div>
        ) : (
          <div className={`text-lg ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>+</div>
        )}
      </button>
    )
  }

  return (
    <div className={`p-8 rounded-xl transition-colors duration-200 ${theme === 'light' ? 'bg-white border border-gray-200 shadow-lg' : 'bg-gray-900'}`}>
      <h2 className={`text-2xl font-bold mb-6 text-center ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Controller</h2>

      <div className="relative mx-auto" style={{ width: `${containerWidth}px`, height: `${containerHeight}px` }}>
        {layout.map(btn => (
          <PadButton key={btn.id} index={btn.id} x={btn.x * scale} y={btn.y * scale} />
        ))}
      </div>
    </div>
  )
}
