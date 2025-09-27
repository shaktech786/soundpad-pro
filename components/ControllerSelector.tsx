import React from 'react'

interface ControllerSelectorProps {
  controllers: Gamepad[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export const ControllerSelector: React.FC<ControllerSelectorProps> = ({
  controllers,
  selectedIndex,
  onSelect
}) => {
  if (controllers.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400">No Controller</span>
      </div>
    )
  }

  if (controllers.length === 1) {
    return (
      <div className="text-sm text-gray-400">
        Using: {controllers[0].id}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">Controller:</label>
      <select
        value={selectedIndex}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
      >
        {controllers.map((controller, index) => (
          <option key={index} value={index}>
            {controller.id} ({controller.buttons.length} buttons, {controller.axes.length} axes)
          </option>
        ))}
      </select>
    </div>
  )
}