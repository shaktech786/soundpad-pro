import React, { useMemo, memo } from 'react'
import { ButtonPosition, ButtonShape, CombinedAction } from '../types/profile'
import { HAUTE42_LAYOUT } from '../config/constants'
import { useTheme } from '../contexts/ThemeContext'

interface Haute42LayoutProps {
  buttonStates: Map<number, boolean>
  soundMappings: Map<number, string>
  obsActions?: Map<number, CombinedAction>
  drumPadButtons?: Set<number>
  fileErrors?: Map<number, string>
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

interface PadButtonProps {
  index: number
  x: number
  y: number
  shapeClass: string
  isPressed: boolean
  soundFile: string | undefined
  isDrumPad: boolean
  obsAction: CombinedAction | undefined
  isStopButton: boolean
  fileError: string | undefined
  theme: string
  onPlaySound: (url: string, buttonIndex?: number) => void
  onMapSound: (index: number) => void
  onMapSoundFromUrl?: (index: number) => void
  onAssignOBSAction?: (index: number) => void
  onTriggerAction?: (action: CombinedAction) => void
}

const BUTTON_RENDER_SIZE = 96 // w-24 = 96px
const CONTAINER_PADDING = 64

export function extractFilename(path: string): string {
  if (!path || typeof path !== 'string') return 'Unknown'
  const parts = path.split(/[/\\#]/)
  const filename = parts[parts.length - 1] || parts[parts.length - 2] || 'Unknown'
  return filename.replace(/\.[^/.]+$/, '')
}

function labelStyle(name: string): { fontSize: string; lineClamp: string } {
  const len = name.length
  if (len <= 10) return { fontSize: 'text-sm',     lineClamp: 'line-clamp-2' }
  if (len <= 16) return { fontSize: 'text-xs',     lineClamp: 'line-clamp-2' }
  if (len <= 24) return { fontSize: 'text-[11px]', lineClamp: 'line-clamp-3' }
  return             { fontSize: 'text-[10px]', lineClamp: 'line-clamp-3' }
}

// PadButton is defined at module level so React can reuse DOM nodes across renders
const PadButton = memo(({
  index,
  x,
  y,
  shapeClass,
  isPressed,
  soundFile,
  isDrumPad,
  obsAction,
  isStopButton,
  fileError,
  theme,
  onPlaySound,
  onMapSound,
  onMapSoundFromUrl,
  onAssignOBSAction,
  onTriggerAction,
}: PadButtonProps) => {
  const hasSound = !!soundFile
  const hasOBSAction = !!obsAction

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
      title={fileError ? `⚠ ${fileError}` : hasSound ? extractFilename(soundFile!) : undefined}
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
          ? isDrumPad
            ? 'bg-orange-400 border-orange-200 scale-110 shadow-lg shadow-orange-400/50'
            : 'bg-purple-500 border-purple-300 scale-110 shadow-lg shadow-purple-500/50'
          : isStopButton
            ? 'bg-red-600 border-red-500 hover:bg-red-500 hover:scale-105 shadow-lg shadow-red-500/30'
            : isDrumPad
              ? 'bg-orange-600 border-orange-500 hover:bg-orange-500 hover:scale-105'
              : fileError
                ? 'bg-amber-700 border-amber-500 hover:bg-amber-600 hover:scale-105'
                : hasSound
                  ? 'bg-blue-600 border-blue-500 hover:bg-blue-500 hover:scale-105'
                  : theme === 'light'
                    ? 'bg-gray-200 border-gray-300 hover:bg-gray-300 hover:scale-105'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:scale-105'
        }
      `}
      aria-label={fileError ? `${buttonLabel} — warning: ${fileError}` : buttonLabel}
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
      {isDrumPad && (
        <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-orange-500 ${
          theme === 'light' ? 'border-white' : 'border-gray-900'
        }`}>
          <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="3" />
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
      {fileError && (
        <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-amber-500 ${
          theme === 'light' ? 'border-white' : 'border-gray-900'
        }`}>
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L1 21h22L12 2zm1 13h-2v2h2v-2zm0-6h-2v4h2v-4z"/>
          </svg>
        </div>
      )}

      {isStopButton ? (
        <div className="text-white text-sm px-1 text-center font-bold">
          STOP
        </div>
      ) : hasSound ? (
        <div className={`px-1 text-center font-medium leading-tight ${labelStyle(extractFilename(soundFile!)).fontSize} ${labelStyle(extractFilename(soundFile!)).lineClamp} ${fileError ? 'text-amber-200' : 'text-white'}`}>
          {extractFilename(soundFile!)}
        </div>
      ) : (
        <div className={`text-lg ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>+</div>
      )}
    </button>
  )
})

PadButton.displayName = 'PadButton'

export const Haute42Layout = memo<Haute42LayoutProps>(({
  buttonStates,
  soundMappings,
  obsActions,
  drumPadButtons,
  fileErrors,
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

  const shapeClass = buttonShape === 'circle' ? 'rounded-full' : 'rounded-xl'

  return (
    <div className={`p-8 rounded-xl transition-colors duration-200 ${theme === 'light' ? 'bg-white border border-gray-200 shadow-lg' : 'bg-gray-900'}`}>
      <h2 className={`text-2xl font-bold mb-6 text-center ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Controller</h2>

      <div className="relative mx-auto" style={{ width: `${containerWidth}px`, height: `${containerHeight}px` }}>
        {layout.map(btn => {
          const gamepadButton = buttonMapping?.get(btn.id) ?? btn.id
          const isPressed = buttonStates.get(gamepadButton) === true
          const soundFile = soundMappings.get(btn.id)
          const isDrumPad = !!soundFile && (drumPadButtons?.has(btn.id) ?? false)
          const obsAction = obsActions?.get(btn.id)
          const isStopButton = stopButton != null && gamepadButton === stopButton

          return (
            <PadButton
              key={btn.id}
              index={btn.id}
              x={btn.x * scale}
              y={btn.y * scale}
              shapeClass={shapeClass}
              isPressed={isPressed}
              soundFile={soundFile}
              isDrumPad={isDrumPad}
              obsAction={obsAction}
              isStopButton={isStopButton}
              fileError={fileErrors?.get(btn.id)}
              theme={theme}
              onPlaySound={onPlaySound}
              onMapSound={onMapSound}
              onMapSoundFromUrl={onMapSoundFromUrl}
              onAssignOBSAction={onAssignOBSAction}
              onTriggerAction={onTriggerAction}
            />
          )
        })}
      </div>
    </div>
  )
})

Haute42Layout.displayName = 'Haute42Layout'
