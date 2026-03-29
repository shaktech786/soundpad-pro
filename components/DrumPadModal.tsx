import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

interface DrumPadModalProps {
  buttonIndex: number
  fileName: string
  isDrumPad: boolean
  onConfirm: (drumPad: boolean) => void
  onCancel: () => void
}

export const DrumPadModal: React.FC<DrumPadModalProps> = ({
  buttonIndex,
  fileName,
  isDrumPad,
  onConfirm,
  onCancel,
}) => {
  const { theme } = useTheme()
  const [drumPadEnabled, setDrumPadEnabled] = React.useState(isDrumPad)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className={`rounded-xl p-6 w-[400px] shadow-2xl ${
        theme === 'light' ? 'bg-white' : 'bg-gray-900 border border-gray-800'
      }`}>
        <h3 className={`text-lg font-bold mb-1 ${
          theme === 'light' ? 'text-gray-900' : 'text-white'
        }`}>
          Sound Assigned
        </h3>
        <p className={`text-sm mb-5 truncate ${
          theme === 'light' ? 'text-gray-500' : 'text-gray-400'
        }`}>
          Pad {buttonIndex} &mdash; {fileName}
        </p>

        {/* Drum Pad Toggle */}
        <div className={`flex items-center justify-between p-4 rounded-lg ${
          theme === 'light' ? 'bg-gray-50 border border-gray-200' : 'bg-gray-800/50 border border-gray-700'
        }`}>
          <div className="flex-1 mr-4">
            <div className={`text-sm font-semibold ${
              theme === 'light' ? 'text-gray-900' : 'text-white'
            }`}>
              Drum Pad Mode
            </div>
            <div className={`text-xs mt-0.5 ${
              theme === 'light' ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Polyphonic playback, zero debounce. Best for drum hits, one-shots, and instrument samples.
            </div>
          </div>
          <button
            onClick={() => setDrumPadEnabled(!drumPadEnabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
              drumPadEnabled
                ? 'bg-orange-500'
                : theme === 'light' ? 'bg-gray-300' : 'bg-gray-600'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              drumPadEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              theme === 'light'
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(drumPadEnabled)}
            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
