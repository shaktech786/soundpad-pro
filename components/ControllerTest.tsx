import React, { useEffect, useState } from 'react'

interface ControllerTestProps {
  isOpen: boolean
  onClose: () => void
}

export const ControllerTest: React.FC<ControllerTestProps> = ({ isOpen, onClose }) => {
  const [gamepads, setGamepads] = useState<any[]>([])
  const [buttonPresses, setButtonPresses] = useState<Map<string, any>>(new Map())
  const [axisValues, setAxisValues] = useState<Map<string, number>>(new Map())
  
  useEffect(() => {
    if (!isOpen) return
    
    let animationId: number
    
    const scanControllers = () => {
      const gps = navigator.getGamepads()
      const activeGamepads: any[] = []
      const currentButtonPresses = new Map<string, any>()
      const currentAxisValues = new Map<string, number>()
      
      for (let i = 0; i < gps.length; i++) {
        const gp = gps[i]
        if (gp && gp.connected) {
          activeGamepads.push({
            index: i,
            id: gp.id,
            mapping: gp.mapping,
            buttons: gp.buttons.length,
            axes: gp.axes.length,
            timestamp: gp.timestamp
          })
          
          // Check all buttons
          for (let j = 0; j < gp.buttons.length; j++) {
            const button = gp.buttons[j]
            if (button.pressed || button.value > 0) {
              currentButtonPresses.set(`${i}-${j}`, {
                gamepadIndex: i,
                buttonIndex: j,
                value: button.value,
                pressed: button.pressed,
                touched: button.touched || false
              })
            }
          }
          
          // Check all axes
          for (let j = 0; j < gp.axes.length; j++) {
            const value = gp.axes[j]
            if (Math.abs(value) > 0.01) { // Dead zone
              currentAxisValues.set(`${i}-${j}`, value)
            }
          }
        }
      }
      
      setGamepads(activeGamepads)
      setButtonPresses(currentButtonPresses)
      setAxisValues(currentAxisValues)
      
      animationId = requestAnimationFrame(scanControllers)
    }
    
    scanControllers()
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Controller Test Mode</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>
        
        {gamepads.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-xl mb-2">No controllers detected</p>
            <p>Connect your Pokken/Haute42 controller and press any button</p>
          </div>
        ) : (
          <div className="space-y-6">
            {gamepads.map((gp, idx) => (
              <div key={idx} className="border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2 text-green-400">
                  Controller {gp.index}: {gp.id}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Mapping: {gp.mapping || 'none'}</p>
                    <p className="text-gray-400">Total Buttons: {gp.buttons}</p>
                    <p className="text-gray-400">Total Axes: {gp.axes}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Timestamp: {Math.round(gp.timestamp)}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Active Buttons */}
            {buttonPresses.size > 0 && (
              <div className="border border-yellow-600 bg-yellow-900 bg-opacity-20 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2 text-yellow-400">
                  Active Buttons (Press any button)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Array.from(buttonPresses.entries()).map(([key, btn]) => (
                    <div key={key} className="bg-gray-700 rounded p-2">
                      <p className="font-mono text-green-400">
                        Button {btn.buttonIndex}
                      </p>
                      <p className="text-xs text-gray-400">
                        Value: {btn.value.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Pressed: {btn.pressed ? 'YES' : 'NO'}
                      </p>
                      {btn.touched !== undefined && (
                        <p className="text-xs text-gray-400">
                          Touched: {btn.touched ? 'YES' : 'NO'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Active Axes */}
            {axisValues.size > 0 && (
              <div className="border border-blue-600 bg-blue-900 bg-opacity-20 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2 text-blue-400">
                  Active Axes (Move sticks/triggers)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Array.from(axisValues.entries()).map(([key, value]) => {
                    const [gpIdx, axisIdx] = key.split('-')
                    return (
                      <div key={key} className="bg-gray-700 rounded p-2">
                        <p className="font-mono text-blue-400">
                          Axis {axisIdx}
                        </p>
                        <p className="text-xs text-gray-400">
                          Value: {value.toFixed(3)}
                        </p>
                        <div className="w-full bg-gray-600 rounded-full h-2 mt-1">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{
                              width: `${((value + 1) / 2) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Mapping Guide */}
            <div className="border border-gray-600 rounded-lg p-4 bg-gray-900">
              <h3 className="text-lg font-semibold mb-2 text-gray-300">
                Pokken/Haute42 Controller Mapping Guide
              </h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>• Press each button on your controller to see its index number</p>
                <p>• Note down which button index corresponds to which physical button</p>
                <p>• Common Pokken layout:</p>
                <div className="ml-4 mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-green-400">Face Buttons:</p>
                    <p>A (Green) = Button 1 or 2</p>
                    <p>B (Red) = Button 0 or 1</p>
                    <p>X (Blue) = Button 3 or 4</p>
                    <p>Y (Yellow) = Button 2 or 3</p>
                  </div>
                  <div>
                    <p className="text-green-400">Shoulder/Triggers:</p>
                    <p>L1/L2 = Button 4-5 or 6-7</p>
                    <p>R1/R2 = Button 5-6 or 7-8</p>
                    <p>Start/Select = Button 9-10</p>
                    <p>D-Pad = Buttons 12-15 or Axes</p>
                  </div>
                </div>
                <p className="text-yellow-400 mt-2">
                  ⚠️ Your controller may have different mappings. Use the numbers shown above!
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition"
          >
            Close Test Mode
          </button>
        </div>
      </div>
    </div>
  )
}