import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'

export default function MapperPage() {
  const { buttonStates, connected } = useSimpleGamepad()
  const [buttonHistory, setButtonHistory] = useState<number[]>([])
  const [prevStates, setPrevStates] = useState<Map<number, boolean>>(new Map())

  // Track button presses
  useEffect(() => {
    buttonStates.forEach((isPressed, buttonIndex) => {
      const wasPressed = prevStates.get(buttonIndex) || false

      if (isPressed && !wasPressed) {
        setButtonHistory(prev => [...prev, buttonIndex].slice(-20)) // Keep last 20
      }
    })

    setPrevStates(new Map(buttonStates))
  }, [buttonStates, prevStates])

  const clearHistory = () => setButtonHistory([])

  return (
    <>
      <Head>
        <title>Haute42 Button Mapper</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">Haute42 Button Mapper</h1>
            <div className={`inline-block px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className="text-white">
                {connected ? '✓ Controller Connected' : '✗ No Controller'}
              </span>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-8 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">Instructions</h2>
            <div className="text-gray-300 space-y-2">
              <p>1. Look at your physical Haute42 controller</p>
              <p>2. Press each button starting from TOP-LEFT to BOTTOM-RIGHT</p>
              <p>3. Write down the button number that appears below</p>
              <p>4. Tell me the complete mapping when done</p>
            </div>
          </div>

          {/* Current Pressed Buttons */}
          <div className="bg-gray-900 rounded-xl p-8 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Currently Pressed:</h2>
            <div className="flex flex-wrap gap-3">
              {Array.from(buttonStates.entries())
                .filter(([_, pressed]) => pressed)
                .map(([idx]) => (
                  <div key={idx} className="px-8 py-6 bg-purple-500 rounded-lg text-white font-bold text-3xl">
                    {idx}
                  </div>
                ))}
              {Array.from(buttonStates.entries()).filter(([_, pressed]) => pressed).length === 0 && (
                <div className="text-gray-500 text-xl">No buttons pressed</div>
              )}
            </div>
          </div>

          {/* Button History */}
          <div className="bg-gray-900 rounded-xl p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Button Press History:</h2>
              <button
                onClick={clearHistory}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Clear History
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {buttonHistory.map((btn, i) => (
                <div key={i} className="px-4 py-2 bg-blue-600 rounded text-white font-mono">
                  {btn}
                </div>
              ))}
              {buttonHistory.length === 0 && (
                <div className="text-gray-500">Press buttons to see history...</div>
              )}
            </div>
          </div>

          {/* Mapping Grid Template */}
          <div className="bg-gray-900 rounded-xl p-8 mt-6">
            <h2 className="text-xl font-bold text-white mb-4">Mapping Template:</h2>
            <div className="text-gray-400 font-mono text-sm whitespace-pre">
{`Looking at your Haute42, press buttons in this order and write down the numbers:

TOP ROW (small buttons, left to right):
[ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]

LEFT SIDE (knobs/encoders, top to bottom):
[ ]
[ ]

MAIN PADS (top-left to bottom-right, row by row):
Row 1: [ ] [ ] [ ] [ ]
Row 2: [ ] [ ] [ ] [ ]
Row 3: [ ] [ ] [ ] [ ]
Row 4: [ ] [ ] [ ] [ ]

BOTTOM: [ ] [ ]`}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
