import React, { useState } from 'react'
import { OBSAction } from '../contexts/OBSContext'

interface OBSActionAssignerProps {
  buttonIndex: number
  currentAction: OBSAction | null
  scenes: string[]
  sources: string[]
  onAssign: (action: OBSAction | null) => void
  onClose: () => void
}

const ACTION_TYPES = [
  { value: 'start_stream', label: '🔴 Start Stream', needsParams: false },
  { value: 'stop_stream', label: '⚫ Stop Stream', needsParams: false },
  { value: 'start_recording', label: '⏺️ Start Recording', needsParams: false },
  { value: 'stop_recording', label: '⏹️ Stop Recording', needsParams: false },
  { value: 'start_replay_buffer', label: '▶️ Start Replay Buffer', needsParams: false },
  { value: 'stop_replay_buffer', label: '⏹️ Stop Replay Buffer', needsParams: false },
  { value: 'save_replay_buffer', label: '💾 Save Replay', needsParams: false },
  { value: 'set_scene', label: '🎬 Switch Scene', needsParams: true, param: 'sceneName' },
  { value: 'toggle_mute', label: '🔇 Toggle Mute', needsParams: true, param: 'inputName' },
  { value: 'trigger_hotkey', label: '⌨️ Trigger Hotkey', needsParams: true, param: 'hotkeyName' }
]

export const OBSActionAssigner: React.FC<OBSActionAssignerProps> = ({
  buttonIndex,
  currentAction,
  scenes,
  sources,
  onAssign,
  onClose
}) => {
  const [selectedType, setSelectedType] = useState<string>(currentAction?.type || '')
  const [paramValue, setParamValue] = useState<string>('')

  const selectedActionType = ACTION_TYPES.find(a => a.value === selectedType)

  const handleAssign = () => {
    if (!selectedType) return

    const action: OBSAction = {
      type: selectedType as any,
      params: {}
    }

    if (selectedActionType?.needsParams && selectedActionType.param) {
      action.params = {
        [selectedActionType.param]: paramValue
      }
    }

    onAssign(action)
    onClose()
  }

  const handleClear = () => {
    onAssign(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            Assign OBS Action to Pad {buttonIndex}
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Action Type Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">
              Select OBS Action
            </label>
            <div className="grid grid-cols-2 gap-3">
              {ACTION_TYPES.map(action => (
                <button
                  key={action.value}
                  onClick={() => {
                    setSelectedType(action.value)
                    setParamValue('')
                  }}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedType === action.value
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="font-bold">{action.label}</div>
                  {action.needsParams && (
                    <div className="text-xs mt-1 opacity-75">Requires input</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Parameter Input */}
          {selectedActionType?.needsParams && (
            <div className="p-4 bg-gray-800 rounded-lg">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {selectedActionType.param === 'sceneName' && 'Select Scene'}
                {selectedActionType.param === 'inputName' && 'Select Audio Source'}
                {selectedActionType.param === 'hotkeyName' && 'Enter Hotkey Name'}
              </label>

              {selectedActionType.param === 'sceneName' && (
                <select
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select a scene...</option>
                  {scenes.map(scene => (
                    <option key={scene} value={scene}>{scene}</option>
                  ))}
                </select>
              )}

              {selectedActionType.param === 'inputName' && (
                <select
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select an audio source...</option>
                  {sources.map(source => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              )}

              {selectedActionType.param === 'hotkeyName' && (
                <input
                  type="text"
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  placeholder="e.g. OBSBasic.StartStreaming"
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
              )}

              <div className="mt-2 text-xs text-gray-500">
                {selectedActionType.param === 'hotkeyName' && (
                  <div>
                    Tip: Find hotkey names in OBS Settings → Hotkeys. Common examples:
                    <ul className="list-disc list-inside mt-1 ml-2">
                      <li>OBSBasic.StartStreaming</li>
                      <li>OBSBasic.StartRecording</li>
                      <li>OBSBasic.SaveReplayBuffer</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {selectedType && (
            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-sm text-gray-400 mb-2">Preview:</div>
              <div className="text-white font-medium">
                {selectedActionType?.label}
                {paramValue && (
                  <span className="text-purple-400"> → {paramValue}</span>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleAssign}
              disabled={!selectedType || (selectedActionType?.needsParams && !paramValue)}
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
            >
              Assign Action
            </button>

            {currentAction && (
              <button
                onClick={handleClear}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
              >
                Clear
              </button>
            )}

            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
