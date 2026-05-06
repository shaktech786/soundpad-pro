import React, { useState, useEffect, useRef, useCallback } from 'react'
import logger from '../utils/logger'

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

interface AudioFilePickerProps {
  onSelect: (filePath: string, fileName: string) => void
  onClose: () => void
}

const DEFAULT_DIR_STORE_KEY = 'audioLibrary:defaultDir'

export const AudioFilePicker: React.FC<AudioFilePickerProps> = ({ onSelect, onClose }) => {
  const api = (window as any).electronAPI

  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<DirEntry | null>(null)
  const [defaultDir, setDefaultDir] = useState<string | null>(null)
  const [pinSaved, setPinSaved] = useState(false)

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<string | null>(null)

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current)
      blobRef.current = null
    }
    setIsPreviewPlaying(false)
    setPreviewPath(null)
  }, [])

  useEffect(() => stopPreview, [stopPreview])

  const playPreview = useCallback(async (filePath: string) => {
    if (previewPath === filePath && isPreviewPlaying) {
      stopPreview()
      return
    }
    stopPreview()
    setPreviewPath(filePath)
    setPreviewLoading(true)
    try {
      const result = await api.readAudioFile(filePath)
      if (result.error) throw new Error(result.error)
      const blob = new Blob([result.buffer], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      blobRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setIsPreviewPlaying(false); setPreviewPath(null) }
      audio.onerror = () => { setIsPreviewPlaying(false); setPreviewPath(null); setPreviewLoading(false) }
      await audio.play()
      setIsPreviewPlaying(true)
    } catch (err) {
      logger.error('Preview error:', err)
      stopPreview()
    } finally {
      setPreviewLoading(false)
    }
  }, [previewPath, isPreviewPlaying, stopPreview, api])

  const navigate = useCallback(async (dirPath: string) => {
    setLoadError(null)
    const result = await api.listDirectory(dirPath)
    if (result.error) {
      setLoadError(result.error)
      return
    }
    setCurrentPath(dirPath)
    setEntries(result.entries)
  }, [api])

  useEffect(() => {
    const init = async () => {
      const stored: string | null = await api.storeGet(DEFAULT_DIR_STORE_KEY)
      if (stored) setDefaultDir(stored)
      const startDir = stored || await api.getDefaultAudioDir()
      await navigate(startDir)
    }
    init()
  }, [api, navigate])

  const handleSetDefault = async () => {
    await api.storeSet(DEFAULT_DIR_STORE_KEY, currentPath)
    setDefaultDir(currentPath)
    setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  const handleGoToDefault = () => {
    if (defaultDir) navigate(defaultDir)
  }

  const goUp = () => {
    const parts = currentPath.replace(/\\/g, '/').split('/')
    if (parts.length <= 1) return
    parts.pop()
    const parent = parts.join('/') || currentPath.slice(0, 3)
    navigate(parent)
  }

  const handleBrowse = async () => {
    const dir = await api.openDirectory()
    if (dir) navigate(dir)
  }

  const handleConfirm = () => {
    if (!selectedFile) return
    stopPreview()
    onSelect(selectedFile.path, selectedFile.name.replace(/\.[^/.]+$/, ''))
  }

  const pathParts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean)

  // Keyboard: Escape to close, Enter to confirm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stopPreview(); onClose() }
      if (e.key === 'Enter' && selectedFile) handleConfirm()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedFile, stopPreview, onClose])

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { stopPreview(); onClose() } }}
    >
      <div className="bg-gray-900 rounded-xl shadow-2xl flex flex-col w-full max-w-2xl" style={{ height: '70vh' }}>
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-gray-700 flex-shrink-0">
          <span className="text-white font-bold text-lg">Choose Audio File</span>
          <div className="flex-1" />

          {/* Go to default library */}
          {defaultDir && currentPath !== defaultDir && (
            <button
              onClick={handleGoToDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-blue-300 rounded-lg transition-colors"
              title={`Go to default library: ${defaultDir}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
              Library
            </button>
          )}

          {/* Set as default */}
          <button
            onClick={handleSetDefault}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              currentPath === defaultDir
                ? 'bg-blue-700 text-blue-200 cursor-default'
                : pinSaved
                  ? 'bg-green-700 text-green-200'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            disabled={currentPath === defaultDir}
            title={currentPath === defaultDir ? 'This is your default library folder' : 'Set current folder as default library'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
            {pinSaved ? 'Saved!' : currentPath === defaultDir ? 'Default library' : 'Set as default'}
          </button>

          <button
            onClick={handleBrowse}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Browse...
          </button>
          <button
            onClick={() => { stopPreview(); onClose() }}
            className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-800 flex-shrink-0 overflow-x-auto">
          <button
            onClick={goUp}
            disabled={pathParts.length <= 1}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 transition-colors"
            title="Go up"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
            {pathParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-gray-600">/</span>}
                <button
                  onClick={() => {
                    const target = pathParts.slice(0, i + 1).join('/')
                    navigate((currentPath.startsWith('/') ? '/' : '') + target)
                  }}
                  className="hover:text-white transition-colors truncate max-w-[120px]"
                  title={part}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {loadError && (
            <div className="p-4 text-red-400 text-sm">{loadError}</div>
          )}
          {!loadError && entries.length === 0 && (
            <div className="p-4 text-gray-500 text-sm text-center">No audio files in this folder</div>
          )}
          {entries.map((entry) => {
            const isSelected = selectedFile?.path === entry.path
            const isThisPlaying = isPreviewPlaying && previewPath === entry.path
            const isThisLoading = previewLoading && previewPath === entry.path

            return (
              <div
                key={entry.path}
                onDoubleClick={() => {
                  if (entry.isDir) navigate(entry.path)
                  else { setSelectedFile(entry); setTimeout(handleConfirm, 0) }
                }}
                onClick={() => { if (!entry.isDir) setSelectedFile(entry) }}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-800 text-gray-200'
                }`}
              >
                {/* Icon */}
                {entry.isDir ? (
                  <svg className="w-5 h-5 flex-shrink-0 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 flex-shrink-0 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                )}

                {/* Name */}
                <span className="flex-1 truncate text-sm">{entry.name}</span>

                {/* Preview button (files only) */}
                {!entry.isDir && (
                  <button
                    onClick={(e) => { e.stopPropagation(); playPreview(entry.path) }}
                    className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                      isThisPlaying
                        ? 'bg-blue-500 hover:bg-blue-400'
                        : isSelected
                          ? 'bg-blue-500 hover:bg-blue-400'
                          : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    title={isThisPlaying ? 'Stop preview' : 'Preview'}
                  >
                    {isThisLoading ? (
                      <span className="w-3 h-3 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
                    ) : isThisPlaying ? (
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </button>
                )}

                {/* Chevron for dirs */}
                {entry.isDir && (
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                  </svg>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            {selectedFile ? (
              <span className="text-white text-sm truncate block">{selectedFile.name}</span>
            ) : (
              <span className="text-gray-500 text-sm">No file selected</span>
            )}
          </div>
          <button
            onClick={() => { stopPreview(); onClose() }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedFile}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-bold"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  )
}
