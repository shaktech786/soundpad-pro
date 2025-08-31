import React from 'react'

interface ControllerDisplayProps {
  controllers: Gamepad[]
  buttonStates: Map<number, boolean>
}

export const ControllerDisplay: React.FC<ControllerDisplayProps> = ({ 
  controllers, 
  buttonStates 
}) => {
  const controller = controllers[0] // Use first controller

  if (!controller) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Controller Status</h2>
        <div className="text-gray-400 text-center py-8">
          <p className="mb-2">No controller connected</p>
          <p className="text-sm">Connect a gamepad and press any button</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Controller Status</h2>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-400">Device</p>
          <p className="font-medium truncate">{controller.id}</p>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Buttons ({controller.buttons.length} detected)</p>
          <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
            {controller.buttons.map((button, index) => (
              <div
                key={index}
                className={`
                  p-2 rounded text-center text-sm transition-all
                  ${button.pressed || button.value > 0.5
                    ? 'bg-purple-600 text-white scale-105' 
                    : 'bg-gray-700 text-gray-400'
                  }
                  ${buttonStates.get(index) ? 'ring-2 ring-yellow-400' : ''}
                `}
                title={`Button ${index} - Value: ${button.value.toFixed(2)}`}
              >
                B{index}
              </div>
            ))}
          </div>
        </div>

        {controller.axes.length > 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-2">Axes</p>
            <div className="space-y-2">
              {Array.from({ length: Math.floor(controller.axes.length / 2) }, (_, i) => {
                const x = controller.axes[i * 2]
                const y = controller.axes[i * 2 + 1]
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Stick {i + 1}:</span>
                    <span className="text-xs">
                      X: {x?.toFixed(2) || '0.00'} Y: {y?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}