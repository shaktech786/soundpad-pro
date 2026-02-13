import { useState, useEffect, useMemo, useRef } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { useRouter } from 'next/router'
import { BoardBuilder } from '../components/BoardBuilder'
import { useProfileManager } from '../hooks/useProfileManager'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { ButtonPosition, ButtonShape } from '../types/profile'
import { HAUTE42_LAYOUT, APP_CONFIG } from '../config/constants'

type OnboardingStep = 'profile-setup' | 'board-builder' | 'button-mapping'

function RawGamepadDiagnostic({ buttonStates, getInputName }: { buttonStates: Map<number, boolean>, getInputName: (id: number) => string }) {
  const [rawData, setRawData] = useState<{
    id: string, buttons: { idx: number, pressed: boolean, value: number }[], axes: { idx: number, value: number }[]
  }[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      const gamepads = navigator.getGamepads()
      const data: typeof rawData = []
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i]
        if (!gp) continue
        const buttons = gp.buttons.map((b, idx) => ({ idx, pressed: b.pressed, value: Math.round(b.value * 100) / 100 }))
        const axes = gp.axes.map((v, idx) => ({ idx, value: Math.round(v * 100) / 100 }))
        data.push({ id: gp.id, buttons, axes })
      }
      setRawData(data)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-gray-800 rounded-lg p-3 mt-4 text-xs text-gray-400 space-y-2 max-h-64 overflow-y-auto">
      <div>
        <span className="text-gray-500 font-bold">Processed inputs: </span>
        {Array.from(buttonStates.entries()).filter(([, p]) => p).map(([id]) => (
          <span key={id} className="inline-block bg-green-800 text-green-200 rounded px-2 py-0.5 mr-1 mb-1">
            {getInputName(id)} ({id})
          </span>
        ))}
        {Array.from(buttonStates.entries()).filter(([, p]) => p).length === 0 && (
          <span className="text-gray-600">None</span>
        )}
      </div>
      {rawData.map((gp, i) => (
        <div key={i} className="border-t border-gray-700 pt-2">
          <div className="text-gray-500 font-bold mb-1">Gamepad {i}: {gp.id}</div>
          <div>
            <span className="text-yellow-500">Buttons ({gp.buttons.length}): </span>
            {gp.buttons.filter(b => b.pressed || b.value > 0).map(b => (
              <span key={b.idx} className="inline-block bg-yellow-900 text-yellow-200 rounded px-2 py-0.5 mr-1 mb-1">
                btn[{b.idx}] {b.value > 0 ? `val=${b.value}` : 'pressed'}
              </span>
            ))}
            {gp.buttons.filter(b => b.pressed || b.value > 0).length === 0 && <span className="text-gray-600">none pressed</span>}
          </div>
          <div>
            <span className="text-blue-500">Axes ({gp.axes.length}): </span>
            {gp.axes.map(a => (
              <span key={a.idx} className={`inline-block rounded px-2 py-0.5 mr-1 mb-1 ${Math.abs(a.value) > 0.1 ? 'bg-blue-900 text-blue-200' : 'bg-gray-750 text-gray-600'}`}>
                axis[{a.idx}]={a.value}
              </span>
            ))}
          </div>
        </div>
      ))}
      {rawData.length === 0 && <div className="text-gray-600">No gamepads detected by browser</div>}
    </div>
  )
}

export default function OnboardingPage() {
  const { buttonStates, connected } = useSimpleGamepad()
  const router = useRouter()
  const { createProfile } = useProfileManager()
  const isRemapOnly = router.query.remap === 'true'

  const navigateTo = async (route: string) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.navigate) {
      await (window as any).electronAPI.navigate(route)
    } else {
      router.push(route)
    }
  }

  // Load existing layout for remap mode
  const [savedLayout] = usePersistentStorage<ButtonPosition[]>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT,
    HAUTE42_LAYOUT
  )
  const [savedShape] = usePersistentStorage<ButtonShape>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE,
    'circle'
  )

  // Wizard state
  const [step, setStep] = useState<OnboardingStep>('profile-setup')

  // Skip to mapping step in remap mode
  useEffect(() => {
    if (isRemapOnly) {
      setBoardLayout(savedLayout)
      setButtonShape(savedShape)
      setStep('button-mapping')
    }
  }, [isRemapOnly, savedLayout, savedShape])

  // Step 1: Profile setup
  const [profileName, setProfileName] = useState('')
  const [buttonShape, setButtonShape] = useState<ButtonShape>('circle')

  // Step 2: Board builder result
  const [boardLayout, setBoardLayout] = useState<ButtonPosition[]>(HAUTE42_LAYOUT)

  // Step 3: Button mapping
  const [currentMappingStep, setCurrentMappingStep] = useState(0)
  const [mapping, setMapping] = useState<Map<number, number>>(new Map())
  const [isMappingComplete, setIsMappingComplete] = useState(false)
  const [isReady, setIsReady] = useState(false)
  // Use refs for tracking to avoid effect re-triggers from state changes
  const prevStatesRef = useRef<Map<number, boolean>>(new Map())
  const mappingStepRef = useRef(0)
  const lastMappingTime = useRef(0)

  // Compute mapping order: sort buttons top-to-bottom, left-to-right
  const mappingOrder = useMemo(() => {
    return [...boardLayout].sort((a, b) => {
      const yDiff = a.y - b.y
      if (Math.abs(yDiff) > 30) return yDiff // Allow ~30px tolerance for same row
      return a.x - b.x
    })
  }, [boardLayout])

  const totalButtons = mappingOrder.length
  const currentButton = mappingOrder[currentMappingStep]

  // Initialize prevButtonStates when entering mapping step
  useEffect(() => {
    if (step !== 'button-mapping') return
    if (!isReady && buttonStates.size > 0) {
      prevStatesRef.current = new Map(buttonStates)
      setIsReady(true)
    }
  }, [buttonStates, isReady, step])

  const getInputName = (inputId: number) => {
    if (inputId >= 300 && inputId <= 303) {
      return ['Hat Up', 'Hat Right', 'Hat Down', 'Hat Left'][inputId - 300]
    }
    if (inputId >= 200) {
      const keyCode = inputId - 200
      const knownKeys: Record<number, string> = {
        37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down',
        13: 'Enter', 32: 'Space', 27: 'Escape',
      }
      return knownKeys[keyCode] || `Key ${keyCode}`
    }
    if (inputId < 100) return `Button ${inputId}`
    const axisIndex = Math.floor((inputId - 100) / 2)
    const direction = (inputId - 100) % 2 === 0 ? '+' : '-'
    return `Axis ${axisIndex}${direction}`
  }

  // Detect button press for mapping step
  // Only depends on buttonStates (gamepad poll) - all tracking via refs to avoid re-triggers
  useEffect(() => {
    if (step !== 'button-mapping' || isMappingComplete || !isReady) return

    const now = Date.now()
    if (now - lastMappingTime.current < 300) return

    const stepIndex = mappingStepRef.current
    const button = mappingOrder[stepIndex]
    if (!button) {
      prevStatesRef.current = new Map(buttonStates)
      return
    }

    for (const [inputId, isPressed] of buttonStates) {
      const wasPressed = prevStatesRef.current.get(inputId) || false
      if (isPressed && !wasPressed) {
        lastMappingTime.current = now
        setMapping(prev => {
          const newMap = new Map(prev)
          newMap.set(button.id, inputId)
          return newMap
        })

        if (stepIndex < totalButtons - 1) {
          mappingStepRef.current = stepIndex + 1
          setCurrentMappingStep(stepIndex + 1)
        } else {
          setIsMappingComplete(true)
        }
        break
      }
    }

    prevStatesRef.current = new Map(buttonStates)
  }, [buttonStates, isMappingComplete, isReady, step, mappingOrder, totalButtons])

  const handleBoardSave = (layout: ButtonPosition[], shape: ButtonShape) => {
    setBoardLayout(layout)
    setButtonShape(shape)
    setStep('button-mapping')
  }

  const saveAndContinue = async () => {
    const mappingArray = Array.from(mapping.entries())

    if (isRemapOnly) {
      // Remap mode: only save the button mapping
      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeSet) {
        await (window as any).electronAPI.storeSet('haute42-button-mapping', mappingArray)
      }
    } else {
      // Full onboarding: create profile and save everything
      createProfile(
        profileName || APP_CONFIG.PROFILES.DEFAULT_PROFILE_NAME,
        boardLayout,
        buttonShape,
        mappingArray
      )

      if (typeof window !== 'undefined' && (window as any).electronAPI?.storeSet) {
        const storeSet = (window as any).electronAPI.storeSet
        await Promise.all([
          storeSet('haute42-button-mapping', mappingArray),
          storeSet(APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT, boardLayout),
          storeSet(APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE, buttonShape),
        ])
      }
    }

    localStorage.setItem('onboarding-complete', 'true')
    navigateTo('/')
  }

  const resetMapping = () => {
    mappingStepRef.current = 0
    setCurrentMappingStep(0)
    setMapping(new Map())
    setIsMappingComplete(false)
    setIsReady(false)
    prevStatesRef.current = new Map()
    lastMappingTime.current = 0
  }

  const shapeClass = buttonShape === 'circle' ? 'rounded-full' : 'rounded-xl'

  return (
    <>
      <Head>
        <title>{isRemapOnly ? 'Remap Buttons' : 'Setup'} - SoundPad Pro</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-4">
              {isRemapOnly ? 'Remap Buttons' : 'SoundPad Pro Setup'}
            </h1>

            {/* Step indicator (hidden in remap mode) */}
            {!isRemapOnly && (
              <div className="flex items-center justify-center gap-2 mb-4">
                {(['profile-setup', 'board-builder', 'button-mapping'] as OnboardingStep[]).map((s, i) => {
                  const labels = ['Profile', 'Layout', 'Mapping']
                  const isCurrent = s === step
                  const isPast = (
                    (step === 'board-builder' && i === 0) ||
                    (step === 'button-mapping' && i < 2)
                  )
                  return (
                    <div key={s} className="flex items-center">
                      {i > 0 && <div className={`w-8 h-0.5 mx-1 ${isPast ? 'bg-green-500' : 'bg-gray-700'}`} />}
                      <div className={`
                        px-4 py-2 rounded-full text-sm font-medium
                        ${isCurrent ? 'bg-purple-600 text-white' : isPast ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-500'}
                      `}>
                        {i + 1}. {labels[i]}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className={`inline-block px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className="text-white">
                {connected ? 'Controller Connected' : 'No Controller Detected'}
              </span>
            </div>
          </div>

          {/* Step 1: Profile Setup */}
          {step === 'profile-setup' && (
            <div className="bg-gray-900 rounded-xl p-8 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Create Your Profile</h2>

              {/* Profile name */}
              <div className="mb-6">
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="e.g., My Haute42, Stream Deck, Fight Stick..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Button shape */}
              <div className="mb-8">
                <label className="block text-gray-300 text-sm font-medium mb-3">
                  Button Shape
                </label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setButtonShape('circle')}
                    className={`flex-1 p-6 rounded-xl border-2 transition-all ${
                      buttonShape === 'circle'
                        ? 'border-purple-500 bg-gray-800'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className={`w-16 h-16 rounded-full border-4 ${
                        buttonShape === 'circle' ? 'bg-purple-600 border-purple-400' : 'bg-gray-700 border-gray-600'
                      }`} />
                      <span className={`font-medium ${buttonShape === 'circle' ? 'text-white' : 'text-gray-400'}`}>
                        Circle
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => setButtonShape('square')}
                    className={`flex-1 p-6 rounded-xl border-2 transition-all ${
                      buttonShape === 'square'
                        ? 'border-purple-500 bg-gray-800'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className={`w-16 h-16 rounded-xl border-4 ${
                        buttonShape === 'square' ? 'bg-purple-600 border-purple-400' : 'bg-gray-700 border-gray-600'
                      }`} />
                      <span className={`font-medium ${buttonShape === 'square' ? 'text-white' : 'text-gray-400'}`}>
                        Square
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    localStorage.setItem('onboarding-complete', 'true')
                    navigateTo('/')
                  }}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('board-builder')}
                  className="flex-1 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg rounded-lg transition-colors"
                >
                  Next: Design Your Board Layout
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Board Builder */}
          {step === 'board-builder' && (
            <div className="bg-gray-900 rounded-xl p-8">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-white mb-2">Design Your Board</h2>
                <p className="text-gray-400">
                  Drag buttons to match your physical controller layout. Use presets or build from scratch.
                </p>
              </div>
              <BoardBuilder
                initialLayout={boardLayout}
                initialShape={buttonShape}
                onSave={handleBoardSave}
                onCancel={() => setStep('profile-setup')}
                showPresets
              />
            </div>
          )}

          {/* Step 3: Button Mapping */}
          {step === 'button-mapping' && (
            <>
              {!isMappingComplete ? (
                <>
                  <div className="bg-gray-900 rounded-xl p-6 mb-6">
                    <h2 className="text-2xl font-bold text-white mb-4">
                      Map Button {currentMappingStep + 1} of {totalButtons}
                    </h2>
                    <p className="text-gray-300 text-lg mb-2">
                      Look at the <span className="text-yellow-400 font-bold">YELLOW</span> button below,
                      then press the <span className="font-bold">same physical button</span> on your controller.
                    </p>
                    <p className="text-gray-400 text-sm mb-4">
                      Match the position on screen to your physical controller.
                    </p>
                    <div className="w-full bg-gray-700 rounded-full h-4">
                      <div
                        className="bg-green-500 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${(currentMappingStep / totalButtons) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Visual Layout */}
                  <div className="bg-gray-900 rounded-xl p-8">
                    <div className="relative mx-auto" style={{ width: '1000px', height: '500px' }}>
                      {mappingOrder.map((btn, index) => {
                        const isCurrent = index === currentMappingStep
                        const isCompleted = index < currentMappingStep
                        const mappedGamepadBtn = mapping.get(btn.id)

                        return (
                          <div
                            key={btn.id}
                            style={{
                              position: 'absolute',
                              left: `${btn.x * 1.25}px`,
                              top: `${btn.y * 1.25}px`,
                            }}
                            className={`
                              w-20 h-20 ${shapeClass} border-4
                              flex items-center justify-center
                              font-bold text-white text-xl
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
                              <span className="text-sm">Done</span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Diagnostic: raw Gamepad API + processed inputs */}
                  <RawGamepadDiagnostic buttonStates={buttonStates} getInputName={getInputName} />

                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => {
                        resetMapping()
                        setStep('board-builder')
                      }}
                      className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
                    >
                      Back to Layout
                    </button>
                  </div>
                </>
              ) : (
                /* Completion Screen */
                <div className="bg-gray-900 rounded-xl p-8 text-center">
                  <div className="mb-6">
                    <h2 className="text-3xl font-bold text-white mb-2">Setup Complete!</h2>
                    <p className="text-gray-300 text-lg">
                      Your controller is mapped and ready to use.
                    </p>
                  </div>

                  <div className="bg-gray-800 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
                    <h3 className="text-white font-bold mb-2">Mapping Summary:</h3>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      {Array.from(mapping.entries()).map(([visualId, inputId]) => (
                        <div key={visualId} className="text-gray-400">
                          Pos {visualId} {'->'} {getInputName(inputId)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-lg p-4 mb-6 max-w-md mx-auto">
                    <div className="text-gray-400 text-sm space-y-1">
                      <div>Profile: <span className="text-white">{profileName || 'Default'}</span></div>
                      <div>Buttons: <span className="text-white">{boardLayout.length}</span></div>
                      <div>Shape: <span className="text-white capitalize">{buttonShape}</span></div>
                    </div>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={saveAndContinue}
                      className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors"
                    >
                      Save & Continue to App
                    </button>
                    <button
                      onClick={resetMapping}
                      className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-lg transition-colors"
                    >
                      Redo Mapping
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
