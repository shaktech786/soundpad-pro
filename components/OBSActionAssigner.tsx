import React, { useState } from 'react'
import { OBSAction } from '../contexts/OBSContext'
import { LiveSplitAction } from '../contexts/LiveSplitContext'
import { extractAudioUrl, isValidUrl } from '../utils/audioUrlExtractor'

type CombinedAction = (OBSAction & { service: 'obs' }) | (LiveSplitAction & { service: 'livesplit' })

interface OBSActionAssignerProps {
  buttonIndex: number
  currentAction: CombinedAction | null
  currentSound?: string | null
  currentVolume?: number
  scenes: string[]
  sources: string[]
  onAssign: (action: CombinedAction | null) => void
  onAssignSound?: (url: string, name?: string) => void
  onClearSound?: () => void
  onSetVolume?: (volume: number) => void
  onClose: () => void
  obsConnected: boolean
  liveSplitConnected: boolean
}

const OBS_ACTION_TYPES = [
  // Toggle Actions (Recommended)
  { value: 'toggle_streaming', label: '🔴 Toggle Streaming', needsParams: false, category: 'Toggle', service: 'obs' },
  { value: 'toggle_recording', label: '⏺️ Toggle Recording', needsParams: false, category: 'Toggle', service: 'obs' },
  { value: 'toggle_replay_buffer', label: '▶️ Toggle Replay Buffer', needsParams: false, category: 'Toggle', service: 'obs' },

  // Streaming Actions
  { value: 'start_stream', label: '🔴 Start Stream', needsParams: false, category: 'Streaming', service: 'obs' },
  { value: 'stop_stream', label: '⚫ Stop Stream', needsParams: false, category: 'Streaming', service: 'obs' },

  // Recording Actions
  { value: 'start_recording', label: '⏺️ Start Recording', needsParams: false, category: 'Recording', service: 'obs' },
  { value: 'stop_recording', label: '⏹️ Stop Recording', needsParams: false, category: 'Recording', service: 'obs' },

  // Replay Buffer Actions
  { value: 'start_replay_buffer', label: '▶️ Start Replay Buffer', needsParams: false, category: 'Replay', service: 'obs' },
  { value: 'stop_replay_buffer', label: '⏹️ Stop Replay Buffer', needsParams: false, category: 'Replay', service: 'obs' },
  { value: 'save_replay_buffer', label: '💾 Save Replay', needsParams: false, category: 'Replay', service: 'obs' },

  // Scene & Source Actions
  { value: 'set_scene', label: '🎬 Switch Scene', needsParams: true, param: 'sceneName', category: 'Scene', service: 'obs' },
  { value: 'toggle_mute', label: '🔇 Toggle Mute', needsParams: true, param: 'inputName', category: 'Source', service: 'obs' },
  { value: 'trigger_hotkey', label: '⌨️ Trigger Hotkey', needsParams: true, param: 'hotkeyName', category: 'Advanced', service: 'obs' }
]

const LIVESPLIT_ACTION_TYPES = [
  // Recommended Smart Control
  { value: 'smart_toggle', label: '⚡ Smart Toggle (Recommended)', needsParams: false, category: 'Smart', service: 'livesplit', description: 'Quick press: Start/Split | Hold 2s: Reset' },

  // Main Actions
  { value: 'start_or_split', label: '🏁 Start/Split', needsParams: false, category: 'Main', service: 'livesplit' },
  { value: 'start', label: '▶️ Start Timer', needsParams: false, category: 'Main', service: 'livesplit' },
  { value: 'split', label: '⏭️ Split', needsParams: false, category: 'Main', service: 'livesplit' },
  { value: 'reset', label: '🔄 Reset', needsParams: false, category: 'Main', service: 'livesplit' },

  // Pause Actions
  { value: 'toggle_pause', label: '⏯️ Toggle Pause', needsParams: false, category: 'Pause', service: 'livesplit' },
  { value: 'pause', label: '⏸️ Pause', needsParams: false, category: 'Pause', service: 'livesplit' },
  { value: 'resume', label: '▶️ Resume', needsParams: false, category: 'Pause', service: 'livesplit' },

  // Split Management
  { value: 'undo_split', label: '⏮️ Undo Split', needsParams: false, category: 'Splits', service: 'livesplit' },
  { value: 'skip_split', label: '⏭️ Skip Split', needsParams: false, category: 'Splits', service: 'livesplit' },

  // Advanced
  { value: 'init_game_time', label: '🎮 Init Game Time', needsParams: false, category: 'Advanced', service: 'livesplit' }
]

export const OBSActionAssigner: React.FC<OBSActionAssignerProps> = ({
  buttonIndex,
  currentAction,
  currentSound,
  currentVolume = 100,
  scenes,
  sources,
  onAssign,
  onAssignSound,
  onClearSound,
  onSetVolume,
  onClose,
  obsConnected,
  liveSplitConnected
}) => {
  const [selectedTab, setSelectedTab] = useState<'sound' | 'obs' | 'livesplit'>(
    currentSound ? 'sound' : currentAction?.service || 'sound'
  )
  const [selectedType, setSelectedType] = useState<string>(currentAction?.type || '')
  const [paramValue, setParamValue] = useState<string>('')

  // Sound assignment state
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(currentVolume)

  const ACTION_TYPES = selectedTab === 'obs' ? OBS_ACTION_TYPES : LIVESPLIT_ACTION_TYPES
  const selectedActionType = ACTION_TYPES.find(a => a.value === selectedType)

  // Keyboard support: Escape to close, Enter to submit
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter') {
        if (selectedTab === 'sound' && url && !loading) {
          handleAssignSound()
        } else if (selectedTab !== 'sound' && selectedType && !(selectedTab === 'obs' && selectedActionType?.needsParams && 'param' in selectedActionType && !paramValue)) {
          handleAssign()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedType, paramValue, selectedTab, selectedActionType, url, loading])

  // Prevent background scroll
  React.useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleAssign = () => {
    if (!selectedType) return

    const action: any = {
      type: selectedType as any,
      service: selectedTab as 'obs' | 'livesplit'
    }

    if (selectedTab === 'obs' && selectedActionType?.needsParams && 'param' in selectedActionType && selectedActionType.param) {
      action.params = {
        [selectedActionType.param as string]: paramValue
      }
    }

    onAssign(action)
    onClose()
  }

  const handleClear = () => {
    onAssign(null)
    onClose()
  }

  const handleAssignSound = async () => {
    if (!url.trim() || !onAssignSound) return

    if (!isValidUrl(url)) {
      setError('Please enter a valid URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const extracted = await extractAudioUrl(url)
      onAssignSound(extracted.url, extracted.name)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to extract audio URL')
      setLoading(false)
    }
  }

  const handleFilePickerClick = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.selectAudioFile) {
      try {
        const result = await (window as any).electronAPI.selectAudioFile()
        if (result && onAssignSound) {
          // Electron returns { filePath, fileName } - extract the path
          const filePath = typeof result === 'string' ? result : result.filePath
          const fileName = typeof result === 'string' ? undefined : result.fileName
          onAssignSound(filePath, fileName)
          onClose()
        }
      } catch (err) {
        console.error('File picker error:', err)
        setError('Failed to open file picker')
      }
    } else {
      setError('File picker only available in desktop app')
    }
  }

  const handleClearSound = () => {
    if (onClearSound) {
      onClearSound()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl animate-scale-in">
        <div className="flex justify-between items-center mb-6">
          <h2 id="modal-title" className="text-2xl font-bold text-white">
            Assign Action to Pad {buttonIndex}
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Service Selector Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setSelectedTab('sound')
              setSelectedType('')
              setParamValue('')
              setError(null)
            }}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'sound'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🔊 Sound
          </button>
          <button
            onClick={() => {
              setSelectedTab('obs')
              setSelectedType('')
              setParamValue('')
              setError(null)
            }}
            disabled={!obsConnected}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'obs'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                : obsConnected
                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            🎬 OBS {!obsConnected && '(Disconnected)'}
          </button>
          <button
            onClick={() => {
              setSelectedTab('livesplit')
              setSelectedType('')
              setParamValue('')
              setError(null)
            }}
            disabled={!liveSplitConnected}
            className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
              selectedTab === 'livesplit'
                ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white'
                : liveSplitConnected
                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            🏁 LiveSplit {!liveSplitConnected && '(Disconnected)'}
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {/* Sound Assignment Tab */}
          {selectedTab === 'sound' && (
            <>
              <div className="space-y-4">
                {/* Current Sound Display */}
                {currentSound && (
                  <div className="p-4 bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-400 mb-2">Current Sound:</div>
                    <div className="text-white font-medium break-all">{currentSound}</div>
                  </div>
                )}

                {/* File Picker Button */}
                <button
                  onClick={handleFilePickerClick}
                  className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📁</span>
                  <span>Choose Local Audio File</span>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 border-t border-gray-700"></div>
                  <span className="text-gray-500 text-sm">OR</span>
                  <div className="flex-1 border-t border-gray-700"></div>
                </div>

                {/* URL Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Enter Sound URL
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setError(null)
                    }}
                    placeholder="https://www.myinstants.com/... or direct audio URL"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                    disabled={loading}
                    autoFocus={!currentSound}
                  />
                </div>

                {/* Supported Sources Info */}
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-xs font-medium text-gray-400 mb-2">Supported Sources:</div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>🎵 MyInstants.com - Sound button pages</div>
                    <div>🔗 Direct audio URLs (.mp3, .wav, .ogg, etc.)</div>
                  </div>
                </div>

                {/* Volume Control */}
                <div className="p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-400">
                      Volume
                    </label>
                    <span className="text-white font-bold text-lg">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={volume}
                    onChange={(e) => {
                      const newVolume = Number(e.target.value)
                      setVolume(newVolume)
                      onSetVolume?.(newVolume)
                    }}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    style={{
                      background: `linear-gradient(to right, rgb(37, 99, 235) 0%, rgb(37, 99, 235) ${volume}%, rgb(55, 65, 81) ${volume}%, rgb(55, 65, 81) 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                    <div className="text-red-400 text-sm">{error}</div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAssignSound}
                    disabled={!url || loading}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {loading ? 'Processing...' : 'Assign Sound'}
                  </button>

                  {currentSound && onClearSound && (
                    <button
                      onClick={handleClearSound}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}

          {/* OBS/LiveSplit Action Type Selection */}
          {(selectedTab === 'obs' || selectedTab === 'livesplit') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">
                  Select {selectedTab === 'obs' ? 'OBS' : 'LiveSplit'} Action
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
          {selectedTab === 'obs' && selectedActionType?.needsParams && 'param' in selectedActionType && (
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
              disabled={!selectedType || (selectedTab === 'obs' && selectedActionType?.needsParams && 'param' in selectedActionType && !paramValue)}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
