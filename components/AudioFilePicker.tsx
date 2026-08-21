import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import logger from '../utils/logger'
import { useTheme } from '../contexts/ThemeContext'
import { URLInputModal } from './URLInputModal'

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

interface AudioFilePickerProps {
  onSelect: (filePath: string, fileName: string) => void
  onClose: () => void
  /** Optional: shows a "From URL" control that opens URLInputModal and forwards its result here. */
  onSelectUrl?: (url: string, name?: string) => void
  /** Optional: shows a "Pick a file..." control that opens the native OS file dialog, forwarding through `onSelect`. */
  enableNativeBrowse?: boolean
}

const DEFAULT_DIR_STORE_KEY = 'audioLibrary:defaultDir'

export const AudioFilePicker: React.FC<AudioFilePickerProps> = ({ onSelect, onClose, onSelectUrl, enableNativeBrowse }) => {
  const api = (window as any).electronAPI
  const { theme } = useTheme()

  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [defaultDir, setDefaultDir] = useState<string | null>(null)
  const [fallbackDir, setFallbackDir] = useState<string | null>(null)
  const [pinSaved, setPinSaved] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [upTarget, setUpTarget] = useState<string | null>(null)

  const [filterText, setFilterText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<string | null>(null)

  // Bumped on every listDirectory call (from navigate() or confirmFile()) so
  // an in-flight response that resolves after a newer request has started
  // gets ignored instead of clobbering fresher state — the user can click
  // through folders faster than IPC round-trips return.
  const requestSeqRef = useRef(0)
  const lastRequestedPathRef = useRef<string>('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

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
    const seq = ++requestSeqRef.current
    lastRequestedPathRef.current = dirPath
    setIsLoading(true)
    setLoadError(null)
    const result = await api.listDirectory(dirPath)
    if (seq !== requestSeqRef.current) return // a newer navigate/confirm call has since started; ignore this stale response
    setIsLoading(false)
    if (result.error) {
      setLoadError(result.error)
      setEntries([])
      setTruncated(false)
      setTotalCount(0)
      return
    }
    setCurrentPath(dirPath)
    setEntries(result.entries)
    setTruncated(!!result.truncated)
    setTotalCount(result.totalCount ?? result.entries.length)
    setFilterText('')
    setHighlightedIndex(null)
  }, [api])

  useEffect(() => {
    const init = async () => {
      const stored: string | null = await api.storeGet(DEFAULT_DIR_STORE_KEY)
      if (stored) setDefaultDir(stored)
      const systemDefault: string = await api.getDefaultAudioDir()
      setFallbackDir(systemDefault)
      const startDir = stored || systemDefault
      await navigate(startDir)
    }
    init()
  }, [api, navigate])

  // Autofocus the filter box when the picker opens.
  useEffect(() => {
    filterInputRef.current?.focus()
  }, [])

  // Recompute whether "up" has anywhere to go whenever the current folder
  // changes, via the main-process path.dirname (PRE-468) rather than
  // string-splitting currentPath. dirname(p) === p means we're at a
  // filesystem root, so the up control is disabled instead of guessed at.
  useEffect(() => {
    let cancelled = false
    if (!currentPath) {
      setUpTarget(null)
      return
    }
    api.pathDirname(currentPath).then((parent: string) => {
      if (cancelled) return
      setUpTarget(parent === currentPath ? null : parent)
    })
    return () => { cancelled = true }
  }, [currentPath, api])

  const handleSetDefault = async () => {
    await api.storeSet(DEFAULT_DIR_STORE_KEY, currentPath)
    setDefaultDir(currentPath)
    setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  const handleGoToDefault = () => {
    if (defaultDir) navigate(defaultDir)
  }

  const handleGoToLibrary = () => {
    const target = defaultDir || fallbackDir
    if (target) navigate(target)
  }

  const goUp = () => {
    if (upTarget) navigate(upTarget)
  }

  const handleRetry = () => {
    if (lastRequestedPathRef.current) navigate(lastRequestedPathRef.current)
  }

  const handleBrowse = async () => {
    const dir = await api.openDirectory()
    if (dir) navigate(dir)
  }

  // Re-validates `entry` still exists in `currentPath` before assigning it —
  // the entry list can go stale between being listed and being confirmed
  // (the user browses, another process deletes the file, etc.). Refreshes
  // the listing either way so the UI reflects reality rather than trusting
  // the in-memory snapshot.
  const confirmFile = useCallback(async (entry: DirEntry) => {
    const seq = ++requestSeqRef.current
    lastRequestedPathRef.current = currentPath
    setIsConfirming(true)
    const result = await api.listDirectory(currentPath)
    if (seq !== requestSeqRef.current) { setIsConfirming(false); return }
    setIsConfirming(false)

    if (result.error) {
      setLoadError(result.error)
      setEntries([])
      setTruncated(false)
      setTotalCount(0)
      return
    }

    setEntries(result.entries)
    setTruncated(!!result.truncated)
    setTotalCount(result.totalCount ?? result.entries.length)

    const stillExists = result.entries.some((e: DirEntry) => e.path === entry.path && !e.isDir)
    if (!stillExists) {
      setLoadError(`"${entry.name}" is no longer in this folder. It may have been moved or deleted.`)
      setHighlightedIndex(null)
      return
    }

    stopPreview()
    onSelect(entry.path, entry.name.replace(/\.[^/.]+$/, ''))
  }, [api, currentPath, onSelect, stopPreview])

  const activateEntry = useCallback((entry: DirEntry) => {
    if (isConfirming) return
    if (entry.isDir) {
      navigate(entry.path)
    } else {
      confirmFile(entry)
    }
  }, [isConfirming, navigate, confirmFile])

  const handleNativeBrowse = async () => {
    const result = await api.selectAudioFile()
    if (result && result.filePath) {
      stopPreview()
      onSelect(result.filePath, result.fileName.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleUrlConfirm = (url: string, name?: string) => {
    stopPreview()
    setShowUrlModal(false)
    onSelectUrl?.(url, name)
  }

  const pathParts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean)

  // Filters the already-loaded entries by case-insensitive substring match
  // on name — no recursive filesystem search, just narrowing what's in memory.
  const filteredEntries = useMemo(() => {
    const needle = filterText.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
  }, [entries, filterText])

  // Clamp the highlight into range whenever the filtered list shrinks (e.g.
  // typing in the filter box), rather than pointing at a stale index.
  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (prev === null) return null
      if (filteredEntries.length === 0) return null
      return Math.min(prev, filteredEntries.length - 1)
    })
  }, [filteredEntries.length])

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, filteredEntries.length)
  }, [filteredEntries.length])

  useEffect(() => {
    if (highlightedIndex === null) return
    itemRefs.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightedIndex])

  const highlightedEntry = highlightedIndex !== null ? (filteredEntries[highlightedIndex] ?? null) : null
  const selectedFile = highlightedEntry && !highlightedEntry.isDir ? highlightedEntry : null

  const handleConfirm = () => {
    if (!selectedFile || isConfirming) return
    confirmFile(selectedFile)
  }

  // Keyboard: Escape to close, ArrowUp/Down to move the highlight, Enter to
  // activate it (descend into a directory or confirm a file) — one highlight
  // concept shared with mouse clicks, not a separate keyboard-only cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stopPreview(); onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => {
          if (filteredEntries.length === 0) return null
          if (prev === null) return 0
          return Math.min(prev + 1, filteredEntries.length - 1)
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => {
          if (filteredEntries.length === 0) return null
          if (prev === null) return filteredEntries.length - 1
          return Math.max(prev - 1, 0)
        })
        return
      }
      if (e.key === 'Enter' && highlightedEntry) {
        activateEntry(highlightedEntry)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filteredEntries.length, highlightedEntry, activateEntry, stopPreview, onClose])

  const secondaryBtnClass = theme === 'light'
    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'

  return (
    <>
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { stopPreview(); onClose() } }}
    >
      <div className={`rounded-xl shadow-2xl flex flex-col w-full max-w-2xl ${theme === 'light' ? 'bg-white' : 'bg-gray-900'}`} style={{ height: '70vh' }}>
        {/* Header */}
        <div className={`flex items-center gap-2 p-4 border-b flex-shrink-0 ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
          <span className={`font-bold text-lg ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Choose Audio File</span>
          <div className="flex-1" />

          {/* Go to default library */}
          {defaultDir && currentPath !== defaultDir && (
            <button
              onClick={handleGoToDefault}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                theme === 'light'
                  ? 'bg-gray-200 hover:bg-gray-300 text-blue-700'
                  : 'bg-gray-700 hover:bg-gray-600 text-blue-300'
              }`}
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
                  : secondaryBtnClass
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
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${secondaryBtnClass}`}
          >
            Browse...
          </button>

          {/* Optional affordances — hidden unless the caller opts in, so existing
              callers (e.g. OBSActionAssigner, which has its own native-file and
              URL flows outside this component) see no change. */}
          {enableNativeBrowse && (
            <button
              onClick={handleNativeBrowse}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${secondaryBtnClass}`}
            >
              Pick a file...
            </button>
          )}
          {onSelectUrl && (
            <button
              onClick={() => setShowUrlModal(true)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${secondaryBtnClass}`}
            >
              From URL
            </button>
          )}
          <button
            onClick={() => { stopPreview(); onClose() }}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              theme === 'light'
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Breadcrumb */}
        <div className={`flex items-center gap-1 px-4 py-2 border-b flex-shrink-0 overflow-x-auto ${theme === 'light' ? 'border-gray-200' : 'border-gray-800'}`}>
          <button
            onClick={goUp}
            disabled={!upTarget}
            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
              theme === 'light'
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
            title="Go up"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div className={`flex items-center gap-1 text-xs min-w-0 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            {pathParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-gray-600">/</span>}
                <button
                  onClick={() => {
                    const target = pathParts.slice(0, i + 1).join('/')
                    navigate((currentPath.startsWith('/') ? '/' : '') + target)
                  }}
                  className={`transition-colors truncate max-w-[120px] ${theme === 'light' ? 'hover:text-gray-900' : 'hover:text-white'}`}
                  title={part}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Filter */}
        <div className={`px-4 py-2 border-b flex-shrink-0 ${theme === 'light' ? 'border-gray-200' : 'border-gray-800'}`}>
          <input
            ref={filterInputRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter files in this folder..."
            aria-label="Filter files"
            className={`w-full px-3 py-1.5 text-sm rounded-lg outline-none ${
              theme === 'light'
                ? 'bg-gray-100 text-gray-900 placeholder-gray-400'
                : 'bg-gray-800 text-white placeholder-gray-500'
            }`}
          />
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {isLoading && (
            <div className="p-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="p-4 text-center">
              <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                We couldn&apos;t read this folder.
              </p>
              <p className="text-red-400 text-sm mt-1">{loadError}</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={handleRetry}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${secondaryBtnClass}`}
                >
                  Retry
                </button>
                {(defaultDir || fallbackDir) && (
                  <button
                    onClick={handleGoToLibrary}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${secondaryBtnClass}`}
                  >
                    Go to library
                  </button>
                )}
              </div>
            </div>
          )}

          {!isLoading && !loadError && entries.length === 0 && (
            <div className="p-4 text-gray-500 text-sm text-center">No audio files in this folder</div>
          )}

          {!isLoading && !loadError && entries.length > 0 && filteredEntries.length === 0 && (
            <div className="p-4 text-gray-500 text-sm text-center">No files match &quot;{filterText}&quot;</div>
          )}

          {!isLoading && !loadError && filteredEntries.map((entry, index) => {
            const isHighlighted = highlightedEntry?.path === entry.path
            const isThisPlaying = isPreviewPlaying && previewPath === entry.path
            const isThisLoading = previewLoading && previewPath === entry.path

            return (
              <div
                key={entry.path}
                ref={(el) => { itemRefs.current[index] = el }}
                onDoubleClick={() => activateEntry(entry)}
                onClick={() => setHighlightedIndex(index)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                  isHighlighted
                    ? 'bg-blue-600 text-white'
                    : theme === 'light' ? 'hover:bg-gray-100 text-gray-800' : 'hover:bg-gray-800 text-gray-200'
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
                        : isHighlighted
                          ? 'bg-blue-500 hover:bg-blue-400'
                          : theme === 'light' ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    title={isThisPlaying ? 'Stop preview' : 'Preview'}
                  >
                    {isThisLoading ? (
                      <span className="w-3 h-3 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
                    ) : isThisPlaying ? (
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg className={`w-3.5 h-3.5 ml-0.5 ${isHighlighted ? 'text-white' : theme === 'light' ? 'text-gray-700' : 'text-white'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
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

          {!isLoading && !loadError && truncated && (
            <div className={`p-3 mt-1 text-xs rounded-lg text-center ${theme === 'light' ? 'bg-yellow-50 text-yellow-700' : 'bg-yellow-900/30 text-yellow-300'}`}>
              Showing {entries.length} of {totalCount} files. {Math.max(totalCount - entries.length, 0)} hidden — narrow the list with the filter box above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center gap-3 p-4 border-t flex-shrink-0 ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
          <div className="flex-1 min-w-0">
            {selectedFile ? (
              <span className={`text-sm truncate block ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{selectedFile.name}</span>
            ) : (
              <span className="text-gray-500 text-sm">No file selected</span>
            )}
          </div>
          <button
            onClick={() => { stopPreview(); onClose() }}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              theme === 'light'
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedFile || isConfirming}
            className={`px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-bold ${
              theme === 'light' ? 'disabled:bg-gray-300' : 'disabled:bg-gray-700'
            }`}
          >
            {isConfirming ? 'Checking...' : 'Select'}
          </button>
        </div>
      </div>
    </div>

    {showUrlModal && onSelectUrl && (
      <URLInputModal
        isOpen={showUrlModal}
        onConfirm={handleUrlConfirm}
        onClose={() => setShowUrlModal(false)}
      />
    )}
    </>
  )
}
