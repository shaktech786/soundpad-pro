import { useEffect, useState } from 'react'

export function usePersistentStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    
    try {
      const item = window.localStorage.getItem(key)
      if (!item) return defaultValue
      
      // Handle Map serialization
      if (defaultValue instanceof Map) {
        const parsed = JSON.parse(item)
        return new Map(parsed) as T
      }
      
      return JSON.parse(item)
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error)
      return defaultValue
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    try {
      // Handle Map serialization
      if (value instanceof Map) {
        window.localStorage.setItem(key, JSON.stringify(Array.from(value.entries())))
      } else {
        window.localStorage.setItem(key, JSON.stringify(value))
      }
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error)
    }
  }, [key, value])

  return [value, setValue] as const
}