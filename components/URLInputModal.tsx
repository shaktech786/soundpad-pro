import React, { useState, useEffect } from 'react'
import { extractAudioUrl, isValidUrl } from '../utils/audioUrlExtractor'

interface URLInputModalProps {
  isOpen: boolean
  buttonIndex: number
  onConfirm: (url: string, name?: string) => void
  onClose: () => void
}

export const URLInputModal: React.FC<URLInputModalProps> = ({
  isOpen,
  buttonIndex,
  onConfirm,
  onClose
}) => {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extractedInfo, setExtractedInfo] = useState<{ name?: string; source?: string } | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl('')
      setError(null)
      setLoading(false)
      setExtractedInfo(null)
    }
  }, [isOpen])

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && url && !loading) {
        handleConfirm()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, url, loading, onClose])

  // Prevent background scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const handleConfirm = async () => {
    if (!url.trim()) {
      setError('Please enter a URL')
      return
    }

    if (!isValidUrl(url)) {
      setError('Please enter a valid URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const extracted = await extractAudioUrl(url)
      setExtractedInfo({
        name: extracted.name,
        source: extracted.source
      })

      // Use the extracted audio URL
      onConfirm(extracted.url, extracted.name)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to extract audio URL')
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="url-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full shadow-2xl animate-scale-in">
        <div className="flex justify-between items-center mb-6">
          <h2 id="url-modal-title" className="text-2xl font-bold text-white">
            Add Sound URL to Pad {buttonIndex}
          </h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
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
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Supported Sources */}
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-xs font-medium text-gray-400 mb-2">Supported Sources:</div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>🎵 MyInstants.com - Sound button pages</div>
              <div>🔗 Direct audio URLs (.mp3, .wav, .ogg, etc.)</div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {/* Extracted Info */}
          {extractedInfo && (
            <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
              <div className="text-green-400 text-sm">
                ✓ Found: {extractedInfo.name || 'Audio file'}
                {extractedInfo.source && ` (${extractedInfo.source})`}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleConfirm}
              disabled={!url || loading}
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
            >
              {loading ? 'Processing...' : 'Add Sound'}
            </button>

            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
