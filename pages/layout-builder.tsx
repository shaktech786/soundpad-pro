import { useState, useRef } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'

interface ButtonPosition {
  id: number
  x: number
  y: number
}

export default function LayoutBuilder() {
  const { buttonStates, connected } = useSimpleGamepad()
  const [positions, setPositions] = useState<ButtonPosition[]>(
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      x: 50 + (i % 8) * 60,
      y: 50 + Math.floor(i / 8) * 60
    }))
  )
  const [draggedButton, setDraggedButton] = useState<number | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent, buttonId: number) => {
    const button = positions.find(b => b.id === buttonId)
    if (!button || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setDraggedButton(buttonId)
    setOffset({
      x: mouseX - button.x,
      y: mouseY - button.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedButton === null || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const x = mouseX - offset.x
    const y = mouseY - offset.y

    setPositions(prev =>
      prev.map(btn =>
        btn.id === draggedButton
          ? { ...btn, x: Math.max(0, Math.min(rect.width - 60, x)), y: Math.max(0, Math.min(rect.height - 60, y)) }
          : btn
      )
    )
  }

  const handleMouseUp = () => {
    setDraggedButton(null)
  }

  const saveLayout = () => {
    const layout = JSON.stringify(positions, null, 2)
    console.log('Layout saved:')
    console.log(layout)

    // Copy to clipboard
    navigator.clipboard.writeText(layout)
    alert('Layout copied to clipboard! Paste it in the chat.')
  }

  const resetLayout = () => {
    setPositions(
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        x: 50 + (i % 8) * 60,
        y: 50 + Math.floor(i / 8) * 60
      }))
    )
  }

  return (
    <>
      <Head>
        <title>Layout Builder - Haute42</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-4">Haute42 Layout Builder</h1>
            <div className={`inline-block px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className="text-white">
                {connected ? '✓ Controller Connected' : '✗ No Controller'}
              </span>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Instructions:</h2>
            <ol className="text-gray-300 space-y-2 list-decimal list-inside">
              <li>Drag the numbered circles below to match your physical Haute42 controller layout</li>
              <li>Press buttons on your controller to see which numbers light up purple</li>
              <li>Arrange the circles to exactly match the physical positions</li>
              <li>Click "Save Layout" when done - it will copy the data to clipboard</li>
              <li>Paste the layout data in the chat</li>
            </ol>
          </div>

          {/* Canvas Area */}
          <div className="bg-gray-800 rounded-xl p-8 mb-6">
            <h3 className="text-white font-bold mb-4 text-center">Drag Area (Your Controller Layout)</h3>
            <div
              ref={canvasRef}
              className="relative bg-gray-700 rounded-lg border-4 border-gray-600"
              style={{ width: '800px', height: '500px', margin: '0 auto' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {positions.map(btn => {
                const isPressed = buttonStates.get(btn.id) === true
                const isDragging = draggedButton === btn.id

                return (
                  <div
                    key={btn.id}
                    onMouseDown={(e) => handleMouseDown(e, btn.id)}
                    style={{
                      position: 'absolute',
                      left: `${btn.x}px`,
                      top: `${btn.y}px`,
                      cursor: isDragging ? 'grabbing' : 'grab'
                    }}
                    className={`
                      w-14 h-14 rounded-full border-4
                      flex items-center justify-center
                      font-bold text-white text-lg
                      transition-all duration-100 select-none
                      ${isPressed
                        ? 'bg-purple-500 border-purple-300 scale-110 shadow-lg shadow-purple-500/50'
                        : 'bg-gray-600 border-gray-500 hover:bg-gray-500'
                      }
                      ${isDragging ? 'z-50 scale-105' : 'z-10'}
                    `}
                  >
                    {isPressed ? btn.id : ''}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            <button
              onClick={saveLayout}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors"
            >
              💾 Save Layout (Copy to Clipboard)
            </button>
            <button
              onClick={resetLayout}
              className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-lg transition-colors"
            >
              🔄 Reset
            </button>
          </div>

          {/* Currently Pressed Info */}
          <div className="mt-8 bg-gray-900 rounded-xl p-6">
            <h3 className="text-white font-bold mb-3">Currently Pressed Buttons:</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(buttonStates.entries())
                .filter(([_, pressed]) => pressed)
                .map(([idx]) => (
                  <div key={idx} className="px-4 py-2 bg-purple-500 rounded text-white font-bold">
                    Button {idx}
                  </div>
                ))}
              {Array.from(buttonStates.entries()).filter(([_, pressed]) => pressed).length === 0 && (
                <div className="text-gray-500">No buttons pressed</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
