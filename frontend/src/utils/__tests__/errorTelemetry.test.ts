import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordError,
  getStoredErrors,
  getErrorCount,
  clearErrors,
} from '../errorTelemetry'

// In-memory localStorage mock matching project convention
function createLocalStorageMock() {
  const store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(k => delete store[k])
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((_i: number) => null),
  }
}

describe('errorTelemetry (#225)', () => {
  let storageMock: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    // Saved on the device only once the visitor chose all or minimal (#2584).
    document.cookie = 'rt_consent=v1.minimal; Path=/'
    storageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', storageMock)
  })

  describe('recordError', () => {
    it('should store an error record in localStorage', () => {
      const error = new Error('Test failure')
      recordError(error)

      const stored = getStoredErrors()
      expect(stored).toHaveLength(1)
      expect(stored[0]?.message).toBe('Test failure')
    })

    it('should include timestamp, URL, and userAgent', () => {
      const error = new Error('Test')
      const record = recordError(error)

      expect(record).not.toBeNull()
      expect(record?.timestamp).toBeDefined()
      expect(record?.url).toBeDefined()
      expect(record?.userAgent).toBeDefined()
    })

    it('should include componentStack when provided', () => {
      const error = new Error('Component error')
      recordError(error, '  at MyComponent\n  at App')

      const stored = getStoredErrors()
      expect(stored[0]?.componentStack).toBe('  at MyComponent\n  at App')
    })

    it('should append to existing records', () => {
      recordError(new Error('First'))
      recordError(new Error('Second'))
      recordError(new Error('Third'))

      expect(getStoredErrors()).toHaveLength(3)
    })

    it('should enforce FIFO eviction at 50 entries', () => {
      for (let i = 0; i < 50; i++) {
        recordError(new Error(`Error ${i}`))
      }
      expect(getErrorCount()).toBe(50)

      recordError(new Error('Overflow'))
      const stored = getStoredErrors()
      expect(stored).toHaveLength(50)
      expect(stored[0]?.message).toBe('Error 1') // Error 0 evicted
      expect(stored[49]?.message).toBe('Overflow')
    })

    it('should return null if localStorage throws', () => {
      storageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })

      const result = recordError(new Error('Fail'))
      expect(result).toBeNull()
    })
  })

  describe('getStoredErrors', () => {
    it('should return empty array when no errors stored', () => {
      expect(getStoredErrors()).toEqual([])
    })

    it('should return empty array for corrupt JSON', () => {
      storageMock.getItem.mockReturnValue('not-json')
      expect(getStoredErrors()).toEqual([])
    })
  })

  describe('getErrorCount', () => {
    it('should return 0 when empty', () => {
      expect(getErrorCount()).toBe(0)
    })

    it('should return correct count', () => {
      recordError(new Error('A'))
      recordError(new Error('B'))
      expect(getErrorCount()).toBe(2)
    })
  })

  describe('clearErrors', () => {
    it('should remove all stored errors', () => {
      recordError(new Error('A'))
      recordError(new Error('B'))
      expect(getErrorCount()).toBe(2)

      clearErrors()
      expect(getErrorCount()).toBe(0)
    })
  })
})
