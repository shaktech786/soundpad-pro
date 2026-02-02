import React, { useState, useRef, useEffect } from 'react'
import { BoardProfile, ButtonShape } from '../types/profile'

interface ProfileSelectorProps {
  profiles: BoardProfile[]
  activeProfileId: string
  onSwitch: (profileId: string) => void
  onRename: (profileId: string, newName: string) => void
  onDelete: (profileId: string) => void
  onDuplicate: (profileId: string) => void
  onNewProfile: () => void
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  activeProfileId,
  onSwitch,
  onRename,
  onDelete,
  onDuplicate,
  onNewProfile,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeProfile = profiles.find(p => p.id === activeProfileId)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const shapeIcon = (shape: ButtonShape) => shape === 'circle' ? 'O' : '[]'

  const startEditing = (profile: BoardProfile) => {
    setEditingId(profile.id)
    setEditName(profile.name)
  }

  const confirmRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors border border-gray-700"
      >
        <span className="text-sm font-medium truncate max-w-[150px]">
          {activeProfile?.name || 'No Profile'}
        </span>
        <span className="text-gray-500 text-xs">
          {activeProfile ? `${activeProfile.boardLayout.length} btns` : ''}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <div className="text-gray-400 text-xs font-medium px-2 py-1">PROFILES</div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {profiles.map(profile => {
              const isActive = profile.id === activeProfileId
              const isEditing = editingId === profile.id

              return (
                <div
                  key={profile.id}
                  className={`group flex items-center justify-between px-3 py-2 ${
                    isActive ? 'bg-purple-600/20' : 'hover:bg-gray-700/50'
                  }`}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={confirmRename}
                      className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                      autoFocus
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          if (!isActive) {
                            onSwitch(profile.id)
                            setIsOpen(false)
                          }
                        }}
                        className="flex-1 flex items-center gap-2 text-left"
                      >
                        <span className={`text-xs font-mono ${isActive ? 'text-purple-400' : 'text-gray-500'}`}>
                          {shapeIcon(profile.buttonShape)}
                        </span>
                        <span className={`text-sm truncate ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
                          {profile.name}
                        </span>
                        <span className="text-gray-600 text-xs">
                          {profile.boardLayout.length}
                        </span>
                        {isActive && (
                          <span className="text-purple-400 text-xs ml-auto">Active</span>
                        )}
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditing(profile)}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white text-xs"
                          title="Rename"
                        >
                          Ren
                        </button>
                        <button
                          onClick={() => onDuplicate(profile.id)}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white text-xs"
                          title="Duplicate"
                        >
                          Dup
                        </button>
                        {profiles.length > 1 && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete profile "${profile.name}"?`)) {
                                onDelete(profile.id)
                              }
                            }}
                            className="p-1 hover:bg-red-600/50 rounded text-gray-400 hover:text-red-400 text-xs"
                            title="Delete"
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-2 border-t border-gray-700">
            <button
              onClick={() => {
                onNewProfile()
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-sm text-purple-400 hover:bg-gray-700/50 rounded-lg text-left font-medium transition-colors"
            >
              + New Profile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
