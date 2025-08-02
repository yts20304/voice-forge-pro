import { useState, useEffect } from 'react'

// Mock implementation of useKV hook to replace @github/spark/hooks
export function useKV<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.warn('Failed to save to localStorage:', error)
    }
  }, [key, state])

  return [state, setState]
}