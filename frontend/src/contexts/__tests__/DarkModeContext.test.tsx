/**
 * DarkModeContext Tests (#120)
 *
 * Tests for dark mode context, hook, and persistence behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { DarkModeProvider, useDarkMode } from '../DarkModeContext'

// Test consumer component
function TestConsumer() {
  const { isDark, toggle, setTheme } = useDarkMode()
  return (
    <div>
      <span data-testid="theme-status">{isDark ? 'dark' : 'light'}</span>
      <button data-testid="toggle-btn" onClick={toggle}>
        Toggle
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
        Light
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
        Dark
      </button>
    </div>
  )
}

describe('DarkModeContext (#120)', () => {
  let mockStorage: Record<string, string>

  beforeEach(() => {
    // Clean up DOM between tests
    document.documentElement.removeAttribute('data-theme')

    // Stub localStorage since jsdom may not provide it
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
      setItem: (key: string, value: string) => {
        mockStorage[key] = String(value)
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      get length() {
        return Object.keys(mockStorage).length
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    })

    // Reset matchMedia to light mode by default
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
  })

  describe('Default behavior', () => {
    it('should default to light mode when no stored preference and system is light', () => {
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )
      expect(screen.getByTestId('theme-status').textContent).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('should default to dark mode when system prefers dark', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
      )

      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  describe('Toggle behavior', () => {
    it('should toggle from light to dark', async () => {
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      expect(screen.getByTestId('theme-status').textContent).toBe('light')
      await user.click(screen.getByTestId('toggle-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should toggle from dark back to light', async () => {
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      await user.click(screen.getByTestId('toggle-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      await user.click(screen.getByTestId('toggle-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('light')
    })
  })

  describe('setTheme behavior', () => {
    it('should set theme to dark explicitly', async () => {
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      await user.click(screen.getByTestId('set-dark-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should set theme to light explicitly', async () => {
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      await user.click(screen.getByTestId('set-dark-btn'))
      await user.click(screen.getByTestId('set-light-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })
  })

  describe('Persistence', () => {
    it('should persist theme choice to localStorage', async () => {
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      await user.click(screen.getByTestId('toggle-btn'))
      expect(localStorage.getItem('theme')).toBe('dark')
    })

    it('should restore theme from localStorage on mount', () => {
      localStorage.setItem('theme', 'dark')
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should prioritize localStorage over system preference', () => {
      // System prefers dark
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
      )
      // But user chose light
      localStorage.setItem('theme', 'light')

      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      expect(screen.getByTestId('theme-status').textContent).toBe('light')
    })
  })

  describe('Blocked storage (#1646)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // "Block all site data" makes the `localStorage` getter itself throw a
    // SecurityError; quota/private modes make the Storage methods throw.
    // Either way the provider must render, fall back to the system theme,
    // and still switch theme for the session.
    const throwingGetter = () => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked-storage', 'SecurityError')
        },
      })
    }
    const throwingMethods = () => {
      const fail = () => {
        throw new DOMException('blocked-storage', 'SecurityError')
      }
      vi.stubGlobal('localStorage', {
        getItem: fail,
        setItem: fail,
        removeItem: fail,
        clear: fail,
        key: fail,
        length: 0,
      })
    }

    it.each([
      ['the localStorage getter throws', throwingGetter],
      ['every Storage method throws', throwingMethods],
    ])('renders and switches theme when %s', async (_label, block) => {
      block()
      const user = userEvent.setup()
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )

      expect(screen.getByTestId('theme-status').textContent).toBe('light')
      await user.click(screen.getByTestId('toggle-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      await user.click(screen.getByTestId('set-light-btn'))
      expect(screen.getByTestId('theme-status').textContent).toBe('light')
    })

    it('falls back to the system preference when the read is blocked', () => {
      throwingGetter()
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
      )
      render(
        <DarkModeProvider>
          <TestConsumer />
        </DarkModeProvider>
      )
      expect(screen.getByTestId('theme-status').textContent).toBe('dark')
    })
  })

  describe('Error handling', () => {
    it('should throw when useDarkMode is used outside provider', () => {
      // Suppress React error boundary console output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => render(<TestConsumer />)).toThrow(
        'useDarkMode must be used within a DarkModeProvider'
      )
      consoleSpy.mockRestore()
    })
  })
})
