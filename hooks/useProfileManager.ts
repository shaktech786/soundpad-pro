import { useCallback, useEffect, useRef } from 'react'
import { usePersistentStorage } from './usePersistentStorage'
import { BoardProfile, ButtonPosition, ButtonShape, CombinedAction } from '../types/profile'
import { APP_CONFIG, HAUTE42_LAYOUT } from '../config/constants'

const { STORAGE_KEYS } = APP_CONFIG.PROFILES

export function useProfileManager() {
  const [profiles, setProfiles, profilesLoading] = usePersistentStorage<BoardProfile[]>(
    STORAGE_KEYS.PROFILES,
    []
  )
  const [activeProfileId, setActiveProfileId, activeIdLoading] = usePersistentStorage<string>(
    STORAGE_KEYS.ACTIVE_PROFILE,
    ''
  )
  const migrationDone = useRef(false)

  const isLoading = profilesLoading || activeIdLoading

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null

  const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  const readWorkingState = useCallback(async (): Promise<{
    buttonMapping: [number, number][]
    soundMappings: [number, string][]
    combinedActions: [number, CombinedAction][]
    buttonVolumes: [number, number][]
    linkedButtons: [number, number][]
    stopButton: number | null
    boardLayout: ButtonPosition[]
    buttonShape: ButtonShape
  }> => {
    const storeGet = (window as any).electronAPI?.storeGet
    if (!storeGet) {
      return {
        buttonMapping: [],
        soundMappings: [],
        combinedActions: [],
        buttonVolumes: [],
        linkedButtons: [],
        stopButton: null,
        boardLayout: HAUTE42_LAYOUT,
        buttonShape: 'circle',
      }
    }

    const [
      buttonMapping,
      soundMappings,
      combinedActions,
      buttonVolumes,
      linkedButtons,
      stopButton,
      boardLayout,
      buttonShape,
    ] = await Promise.all([
      storeGet('haute42-button-mapping'),
      storeGet('soundpad-mappings'),
      storeGet('combined-action-mappings'),
      storeGet('button-volumes'),
      storeGet('haute42-linked-buttons'),
      storeGet('haute42-stop-button'),
      storeGet(STORAGE_KEYS.BOARD_LAYOUT),
      storeGet(STORAGE_KEYS.BUTTON_SHAPE),
    ])

    return {
      buttonMapping: buttonMapping ?? [],
      soundMappings: soundMappings ?? [],
      combinedActions: combinedActions ?? [],
      buttonVolumes: buttonVolumes ?? [],
      linkedButtons: linkedButtons ?? [],
      stopButton: stopButton ?? null,
      boardLayout: boardLayout ?? HAUTE42_LAYOUT,
      buttonShape: buttonShape ?? 'circle',
    }
  }, [])

  const writeWorkingState = useCallback(async (profile: BoardProfile) => {
    const storeSet = (window as any).electronAPI?.storeSet
    if (!storeSet) return

    await Promise.all([
      storeSet('haute42-button-mapping', profile.buttonMapping),
      storeSet('soundpad-mappings', profile.soundMappings),
      storeSet('combined-action-mappings', profile.combinedActions),
      storeSet('button-volumes', profile.buttonVolumes),
      storeSet('haute42-linked-buttons', profile.linkedButtons),
      storeSet('haute42-stop-button', profile.stopButton),
      storeSet(STORAGE_KEYS.BOARD_LAYOUT, profile.boardLayout),
      storeSet(STORAGE_KEYS.BUTTON_SHAPE, profile.buttonShape),
    ])
  }, [])

  const saveCurrentToProfile = useCallback(async (profileId: string) => {
    const state = await readWorkingState()
    setProfiles(prev =>
      prev.map(p =>
        p.id === profileId
          ? {
              ...p,
              ...state,
              updatedAt: Date.now(),
            }
          : p
      )
    )
  }, [readWorkingState, setProfiles])

  const createProfile = useCallback((
    name: string,
    boardLayout: ButtonPosition[],
    buttonShape: ButtonShape,
    buttonMapping: [number, number][] = []
  ): BoardProfile => {
    const now = Date.now()
    const profile: BoardProfile = {
      id: generateId(),
      name,
      createdAt: now,
      updatedAt: now,
      boardLayout,
      buttonShape,
      buttonMapping,
      soundMappings: [],
      combinedActions: [],
      buttonVolumes: [],
      linkedButtons: [],
      stopButton: null,
    }
    setProfiles(prev => [...prev, profile])
    setActiveProfileId(profile.id)
    return profile
  }, [setProfiles, setActiveProfileId])

  const switchProfile = useCallback(async (newProfileId: string) => {
    if (newProfileId === activeProfileId) return

    // Save current working state to the old profile
    if (activeProfileId) {
      await saveCurrentToProfile(activeProfileId)
    }

    // Load new profile into working state
    const newProfile = profiles.find(p => p.id === newProfileId)
    if (!newProfile) return

    await writeWorkingState(newProfile)
    setActiveProfileId(newProfileId)

    // Force reload to pick up new working state
    window.location.reload()
  }, [activeProfileId, profiles, saveCurrentToProfile, writeWorkingState, setActiveProfileId])

  const deleteProfile = useCallback((profileId: string) => {
    if (profiles.length <= 1) return // Don't delete last profile
    setProfiles(prev => prev.filter(p => p.id !== profileId))

    if (activeProfileId === profileId) {
      const remaining = profiles.filter(p => p.id !== profileId)
      if (remaining.length > 0) {
        // Switch to first remaining - write its state
        const next = remaining[0]
        writeWorkingState(next)
        setActiveProfileId(next.id)
        window.location.reload()
      }
    }
  }, [profiles, activeProfileId, setProfiles, setActiveProfileId, writeWorkingState])

  const duplicateProfile = useCallback(async (profileId: string) => {
    const source = profiles.find(p => p.id === profileId)
    if (!source) return null

    // If duplicating active profile, save current state first
    if (profileId === activeProfileId) {
      await saveCurrentToProfile(profileId)
    }

    const now = Date.now()
    const duplicate: BoardProfile = {
      ...source,
      id: generateId(),
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    }
    setProfiles(prev => [...prev, duplicate])
    return duplicate
  }, [profiles, activeProfileId, saveCurrentToProfile, setProfiles])

  const renameProfile = useCallback((profileId: string, newName: string) => {
    setProfiles(prev =>
      prev.map(p =>
        p.id === profileId
          ? { ...p, name: newName, updatedAt: Date.now() }
          : p
      )
    )
  }, [setProfiles])

  const updateProfileLayout = useCallback((
    profileId: string,
    boardLayout: ButtonPosition[],
    buttonShape: ButtonShape
  ) => {
    setProfiles(prev =>
      prev.map(p =>
        p.id === profileId
          ? { ...p, boardLayout, buttonShape, updatedAt: Date.now() }
          : p
      )
    )
    // Also write to working state if this is the active profile
    if (profileId === activeProfileId) {
      const storeSet = (window as any).electronAPI?.storeSet
      if (storeSet) {
        storeSet(STORAGE_KEYS.BOARD_LAYOUT, boardLayout)
        storeSet(STORAGE_KEYS.BUTTON_SHAPE, buttonShape)
      }
    }
  }, [setProfiles, activeProfileId])

  // Migration: create Default profile from legacy data
  const migrateFromLegacy = useCallback(async () => {
    if (migrationDone.current) return
    migrationDone.current = true

    const state = await readWorkingState()

    const now = Date.now()
    const defaultProfile: BoardProfile = {
      id: generateId(),
      name: APP_CONFIG.PROFILES.DEFAULT_PROFILE_NAME,
      createdAt: now,
      updatedAt: now,
      ...state,
    }

    setProfiles([defaultProfile])
    setActiveProfileId(defaultProfile.id)

    // Write new keys that didn't exist before
    const storeSet = (window as any).electronAPI?.storeSet
    if (storeSet) {
      await storeSet(STORAGE_KEYS.BOARD_LAYOUT, state.boardLayout)
      await storeSet(STORAGE_KEYS.BUTTON_SHAPE, state.buttonShape)
    }
  }, [readWorkingState, setProfiles, setActiveProfileId])

  // Auto-migrate on first load
  useEffect(() => {
    if (isLoading || migrationDone.current) return

    // Has profiles already - nothing to do
    if (profiles.length > 0) return

    // Check if legacy data exists
    const checkLegacy = async () => {
      const storeGet = (window as any).electronAPI?.storeGet
      if (!storeGet) return

      const mapping = await storeGet('haute42-button-mapping')
      const sounds = await storeGet('soundpad-mappings')
      const hasLegacy = (mapping && mapping.length > 0) || (sounds && sounds.length > 0)

      if (hasLegacy) {
        await migrateFromLegacy()
      }
    }

    checkLegacy()
  }, [isLoading, profiles.length, migrateFromLegacy])

  return {
    profiles,
    activeProfile,
    activeProfileId,
    isLoading,
    createProfile,
    switchProfile,
    deleteProfile,
    duplicateProfile,
    renameProfile,
    updateProfileLayout,
    saveCurrentToProfile,
    migrateFromLegacy,
  }
}
