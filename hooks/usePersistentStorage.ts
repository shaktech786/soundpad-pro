import { useEffect, useState, useRef } from 'react'

export function usePersistentStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue)
  const [isLoading, setIsLoading] = useState(true)
  const isInitialized = useRef(false)

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try electron-store first (persistent across reinstalls)
        if (typeof window !== 'undefined' && window.electronAPI?.storeGet) {
          const storedValue = await window.electronAPI.storeGet(key)
          if (storedValue !== undefined && storedValue !== null) {
            // Handle Map deserialization
            if (defaultValue instanceof Map) {
              setValue(new Map(storedValue) as T)
            } else {
              setValue(storedValue)
            }
            isInitialized.current = true
            setIsLoading(false)
            return
          }
        }
        
        // Fallback to localStorage (for migration or web version)
        if (typeof window !== 'undefined' && window.localStorage) {
          const item = window.localStorage.getItem(key)
          if (item) {
            try {
              const parsed = JSON.parse(item)
              // Handle Map deserialization
              if (defaultValue instanceof Map) {
                setValue(new Map(parsed) as T)
              } else {
                setValue(parsed)
              }
              
              // Migrate from localStorage to electron-store
              if (window.electronAPI?.storeSet) {
                if (defaultValue instanceof Map) {
                  await window.electronAPI.storeSet(key, Array.from(parsed))
                } else {
                  await window.electronAPI.storeSet(key, parsed)
                }
                // Clear localStorage after successful migration
                window.localStorage.removeItem(key)
                console.log(`Migrated ${key} from localStorage to electron-store`)
              }
            } catch (error) {
              console.error(`Error parsing ${key} from localStorage:`, error)
            }
          }
        }
      } catch (error) {
        console.error(`Error loading ${key}:`, error)
      } finally {
        isInitialized.current = true
        setIsLoading(false)
      }
    }

    loadData()
  }, [key])

  // Save data whenever value changes
  useEffect(() => {
    // Skip the initial load
    if (!isInitialized.current || isLoading) return

    const saveData = async () => {
      try {
        let dataToSave = value
        
        // Handle Map serialization
        if (value instanceof Map) {
          dataToSave = Array.from((value as Map<any, any>).entries()) as T
        }
        
        // Save to electron-store if available
        if (typeof window !== 'undefined' && window.electronAPI?.storeSet) {
          await window.electronAPI.storeSet(key, dataToSave)
        } else if (typeof window !== 'undefined' && window.localStorage) {
          // Fallback to localStorage for web version
          window.localStorage.setItem(key, JSON.stringify(dataToSave))
        }
      } catch (error) {
        console.error(`Error saving ${key}:`, error)
      }
    }

    saveData()
  }, [key, value, isLoading])

  return [value, setValue] as const
}