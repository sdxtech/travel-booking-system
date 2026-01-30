import { useCallback, useState } from 'react'

const STORAGE_KEY = 'officeSidebarCollapsed'

// Read the sidebar collapsed state from localStorage.
function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Persist the sidebar collapsed state to localStorage.
function persistCollapsed(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore storage errors
  }
}

// Hook to manage the office sidebar collapsed state.
export default function useOfficeSidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  // Toggle state and keep the preference in localStorage.
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      persistCollapsed(next)
      return next
    })
  }, [])

  return { collapsed, toggle }
}
