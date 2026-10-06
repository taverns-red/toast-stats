/**
 * Dark Mode Context (#120)
 *
 * Provides dark mode state management with:
 * - System preference detection (prefers-color-scheme)
 * - localStorage persistence
 * - data-theme attribute on document root
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react'

type Theme = 'light' | 'dark'

interface DarkModeContextValue {
  isDark: boolean
  toggle: () => void
  setTheme: (theme: Theme) => void
}

const DarkModeContext = createContext<DarkModeContextValue | null>(null)

const STORAGE_KEY = 'theme'

/* Storage can be blocked outright ("block all site data", some private modes,
   enterprise policy): then even reading `window.localStorage` throws a
   SecurityError. Every access is guarded so a blocked store degrades to an
   unpersisted, session-only theme instead of blanking the app (#1646). */
function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage unavailable: the theme still applies for this session.
  }
}

function getInitialTheme(): Theme {
  // 1. Check localStorage first
  const stored = readStoredTheme()
  if (stored === 'dark' || stored === 'light') {
    return stored
  }

  // 2. Fall back to system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  // 3. Default to light
  return 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = getInitialTheme()
    applyTheme(initial)
    return initial
  })

  // Sync data-theme attribute whenever theme changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      persistTheme(next)
      return next
    })
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    persistTheme(newTheme)
    setThemeState(newTheme)
  }, [])

  const value = useMemo<DarkModeContextValue>(
    () => ({
      isDark: theme === 'dark',
      toggle,
      setTheme,
    }),
    [theme, toggle, setTheme]
  )

  return (
    <DarkModeContext.Provider value={value}>
      {children}
    </DarkModeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDarkMode = (): DarkModeContextValue => {
  const context = useContext(DarkModeContext)
  if (!context) {
    throw new Error('useDarkMode must be used within a DarkModeProvider')
  }
  return context
}

export default DarkModeProvider
