import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { useRouter } from 'next/router'

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

export default function OnboardingPage() {
  const { buttonStates, connected } = useSimpleGamepad()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [mapping, setMapping] = useState<Map<number, number>>(new Map()) // visualId -> gamepadButtonId
  const [prevButtonStates, setPrevButtonStates] = useState<Map<number, boolean>>(new Map())
  const [isComplete, setIsComplete] = useState(false)
  const [isReady, setIsReady] = useState(false)

  // Initialize prevButtonStates with current state to ignore any buttons already pressed
  useEffect(() => {
    if (!isReady && buttonStates.size > 0) {
      setPrevButtonStates(new Map(buttonStates))
      setIsReady(true)
    }
  }, [buttonStates, isReady])

  const totalButtons = BUTTON_LAYOUT.length
  const currentButton = BUTTON_LAYOUT[currentStep]

  // Helper to get input name
  const getInputName = (inputId: number) => {
    if (inputId < 100) {
      return `Button ${inputId}`
    } else {
      const axisIndex = Math.floor((inputId - 100) / 2)
      const direction = (inputId - 100) % 2 === 0 ? '+' : '-'
      return `Axis ${axisIndex}${direction}`
    }
  }

  // Detect button press for current step
  useEffect(() => {
    if (isComplete || !isReady) return

    buttonStates.forEach((isPressed, inputId) => {
      const wasPressed = prevButtonStates.get(inputId) || false

      // Edge detection - only trigger on button down
      if (isPressed && !wasPressed) {
        console.log(`Mapping visual button ${currentButton.id} to ${getInputName(inputId)} (${inputId})`)

        setMapping(prev => {
          const newMap = new Map(prev)
          newMap.set(currentButton.id, inputId)
          return newMap
        })

        // Move to next step
        if (currentStep < totalButtons - 1) {
          setCurrentStep(prev => prev + 1)
        } else {
          setIsComplete(true)
        }
      }
    })

    setPrevButtonStates(new Map(buttonStates))
  }, [buttonStates, prevButtonStates, currentStep, currentButton, isComplete, totalButtons, isReady])

  const saveAndContinue = () => {
    // Save mapping to localStorage
    const mappingObj: { [key: number]: number } = {}
    mapping.forEach((gamepadBtn, visualId) => {
      mappingObj[visualId] = gamepadBtn
    })

    localStorage.setItem('haute42-button-mapping', JSON.stringify(mappingObj))
    console.log('Saved mapping:', mappingObj)

    // Redirect to main page
    router.push('/')
  }

  const reset = () => {
    // Force full page reload to ensure clean state
    window.location.reload()
  }

  return (
    <>
      <Head>
        <title>Haute42 Setup - SoundPad Pro</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-4">Haute42 Controller Setup</h1>
            <div className={`inline-block px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className="text-white">
                {connected ? '✓ Controller Connected' : '✗ No Controller Detected'}
              </span>
            </div>
          </div>

          {!isComplete ? (
            <>
              {/* Instructions */}
              <div className="bg-gray-900 rounded-xl p-6 mb-6">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Step {currentStep + 1} of {totalButtons}
                </h2>
                <p className="text-gray-300 text-lg mb-2">
                  Press the button on your controller that corresponds to the <span className="text-yellow-400 font-bold">HIGHLIGHTED YELLOW</span> button below.
                </p>
                <div className="w-full bg-gray-700 rounded-full h-4 mt-4">
                  <div
                    className="bg-green-500 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${((currentStep) / totalButtons) * 100}%` }}
                  />
                </div>
              </div>

              {/* Visual Layout */}
              <div className="bg-gray-900 rounded-xl p-8">
                <div className="relative mx-auto" style={{ width: '800px', height: '400px' }}>
                  {BUTTON_LAYOUT.map((btn, index) => {
                    const isCurrent = index === currentStep
                    const isCompleted = index < currentStep
                    const mappedGamepadBtn = mapping.get(btn.id)

                    return (
                      <div
                        key={btn.id}
                        style={{
                          position: 'absolute',
                          left: `${btn.x}px`,
                          top: `${btn.y}px`
                        }}
                        className={`
                          w-14 h-14 rounded-full border-4
                          flex items-center justify-center
                          font-bold text-white text-lg
                          transition-all duration-300
                          ${isCurrent
                            ? 'bg-yellow-400 border-yellow-200 scale-125 shadow-2xl shadow-yellow-400/80 animate-pulse'
                            : isCompleted
                              ? 'bg-green-600 border-green-400'
                              : 'bg-gray-700 border-gray-600 opacity-40'
                          }
                        `}
                      >
                        {isCompleted && mappedGamepadBtn !== undefined ? (
                          <span className="text-xs">✓</span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Completion Screen */
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-bold text-white mb-2">Setup Complete!</h2>
                <p className="text-gray-300 text-lg">
                  Your Haute42 controller is now mapped and ready to use.
                </p>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
                <h3 className="text-white font-bold mb-2">Mapping Summary:</h3>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  {Array.from(mapping.entries()).map(([visualId, inputId]) => (
                    <div key={visualId} className="text-gray-400">
                      Pos {visualId} → {getInputName(inputId)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={saveAndContinue}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors"
                >
                  ✓ Save & Continue to App
                </button>
                <button
                  onClick={reset}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-lg transition-colors"
                >
                  🔄 Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
