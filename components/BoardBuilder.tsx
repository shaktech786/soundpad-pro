import React, { useState, useRef, useCallback } from 'react'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { ButtonPosition, ButtonShape } from '../types/profile'
import { LAYOUT_PRESETS } from '../config/constants'

interface BoardBuilderProps {
  initialLayout: ButtonPosition[]
  initialShape: ButtonShape
  onSave: (layout: ButtonPosition[], shape: ButtonShape) => void
  onCancel?: () => void
  showPresets?: boolean
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 500
const BUTTON_SIZE = 56
const GRID_SIZE = 20
const MAX_BUTTONS = 32

export const BoardBuilder: React.FC<BoardBuilderProps> = ({
  initialLayout,
  initialShape,
  onSave,
  onCancel,
  showPresets = true,
}) => {
  const { buttonStates, connected } = useSimpleGamepad()
  const [positions, setPositions] = useState<ButtonPosition[]>(initialLayout)
  const [buttonShape, setButtonShape] = useState<ButtonShape>(initialShape)
  const [draggedButton, setDraggedButton] = useState<number | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [hoveredButton, setHoveredButton] = useState<number | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const snapPosition = useCallback((val: number): number => {
    if (!snapToGrid) return val
    return Math.round(val / GRID_SIZE) * GRID_SIZE
  }, [snapToGrid])

  const getNextId = useCallback((): number => {
    if (positions.length === 0) return 0
    const usedIds = new Set(positions.map(p => p.id))
    let nextId = 0
    while (usedIds.has(nextId)) nextId++
    return nextId
  }, [positions])

  const addButton = useCallback(() => {
    if (positions.length >= MAX_BUTTONS) return
    const id = getNextId()
    const centerX = (CANVAS_WIDTH - BUTTON_SIZE) / 2
    const centerY = (CANVAS_HEIGHT - BUTTON_SIZE) / 2
    setPositions(prev => [...prev, { id, x: snapPosition(centerX), y: snapPosition(centerY) }])
  }, [positions.length, getNextId, snapPosition])

  const removeButton = useCallback((id: number) => {
    setPositions(prev => prev.filter(b => b.id !== id))
  }, [])

  const applyPreset = useCallback((presetLayout: ButtonPosition[]) => {
    setPositions([...presetLayout])
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, buttonId: number) => {
    e.stopPropagation()
    const button = positions.find(b => b.id === buttonId)
    if (!button || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    setDraggedButton(buttonId)
    setOffset({
      x: e.clientX - rect.left - button.x,
      y: e.clientY - rect.top - button.y,
    })
  }, [positions])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedButton === null || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const rawX = e.clientX - rect.left - offset.x
    const rawY = e.clientY - rect.top - offset.y

    const x = Math.max(0, Math.min(CANVAS_WIDTH - BUTTON_SIZE, snapPosition(rawX)))
    const y = Math.max(0, Math.min(CANVAS_HEIGHT - BUTTON_SIZE, snapPosition(rawY)))

    setPositions(prev =>
      prev.map(btn => btn.id === draggedButton ? { ...btn, x, y } : btn)
    )
  }, [draggedButton, offset, snapPosition])

  const handleMouseUp = useCallback(() => {
    setDraggedButton(null)
  }, [])

  const shapeClass = buttonShape === 'circle' ? 'rounded-full' : 'rounded-lg'

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Shape toggle */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setButtonShape('circle')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                buttonShape === 'circle' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Circle
            </button>
            <button
              onClick={() => setButtonShape('square')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                buttonShape === 'square' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Square
            </button>
          </div>

          {/* Snap to grid */}
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={e => setSnapToGrid(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
            />
            Snap to grid
          </label>

          {/* Add button */}
          <button
            onClick={addButton}
            disabled={positions.length >= MAX_BUTTONS}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Button
          </button>

          <span className="text-gray-500 text-sm">
            {positions.length} button{positions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Presets */}
        {showPresets && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">Presets:</span>
            {LAYOUT_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset.layout)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controller status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-500 text-xs">
          {connected ? 'Controller connected - press buttons to see them light up' : 'No controller detected'}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative bg-gray-800 rounded-xl border-2 border-gray-700"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid overlay */}
        {snapToGrid && (
          <svg
            className="absolute inset-0 pointer-events-none opacity-10"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
          >
            {Array.from({ length: Math.floor(CANVAS_WIDTH / GRID_SIZE) + 1 }, (_, i) => (
              <line
                key={`v${i}`}
                x1={i * GRID_SIZE} y1={0}
                x2={i * GRID_SIZE} y2={CANVAS_HEIGHT}
                stroke="white" strokeWidth={1}
              />
            ))}
            {Array.from({ length: Math.floor(CANVAS_HEIGHT / GRID_SIZE) + 1 }, (_, i) => (
              <line
                key={`h${i}`}
                x1={0} y1={i * GRID_SIZE}
                x2={CANVAS_WIDTH} y2={i * GRID_SIZE}
                stroke="white" strokeWidth={1}
              />
            ))}
          </svg>
        )}

        {/* Empty state */}
        {positions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <p className="text-lg font-medium">No buttons yet</p>
              <p className="text-sm">Click "+ Add Button" or select a preset to get started</p>
            </div>
          </div>
        )}

        {/* Buttons */}
        {positions.map(btn => {
          const isPressed = buttonStates.get(btn.id) === true
          const isDragging = draggedButton === btn.id
          const isHovered = hoveredButton === btn.id

          return (
            <div
              key={btn.id}
              onMouseDown={e => handleMouseDown(e, btn.id)}
              onMouseEnter={() => setHoveredButton(btn.id)}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                position: 'absolute',
                left: btn.x,
                top: btn.y,
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isDragging ? 50 : 10,
              }}
              className={`
                border-4 flex items-center justify-center
                font-bold text-white text-base select-none
                transition-colors duration-100
                ${shapeClass}
                ${isPressed
                  ? 'bg-purple-500 border-purple-300 shadow-lg shadow-purple-500/50'
                  : 'bg-gray-600 border-gray-500 hover:bg-gray-500'
                }
                ${isDragging ? 'scale-105' : ''}
              `}
            >
              {btn.id}

              {/* Delete button */}
              {isHovered && !isDragging && (
                <button
                  onMouseDown={e => {
                    e.stopPropagation()
                    removeButton(btn.id)
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs z-50"
                >
                  x
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="text-gray-500 text-xs">
          Drag buttons to position them. Hover and click X to remove.
        </div>
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => onSave(positions, buttonShape)}
            disabled={positions.length === 0}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            Save Layout ({positions.length} buttons)
          </button>
        </div>
      </div>
    </div>
  )
}
