/**
 * classifyRebuildResult — specified behaviour for rebuild-analytics.ts (#2530).
 * districtsSucceeded/districtsSkipped are string[]; counts must use .length.
 */
import { describe, it, expect } from 'vitest'
import { classifyRebuildResult } from '../rebuildResult.js'

describe('classifyRebuildResult', () => {
  it('single-district success reports "(1 districts)" as ok', () => {
    expect(
      classifyRebuildResult({ success: true, districtsSucceeded: ['61'] })
    ).toEqual({ category: 'ok', label: '✓ (1 districts)' })
  })

  it('multi-district success reports the district count as ok', () => {
    expect(
      classifyRebuildResult({
        success: true,
        districtsSucceeded: ['61', '62', '63'],
        districtsSkipped: ['64'],
      })
    ).toEqual({ category: 'ok', label: '✓ (3 districts)' })
  })

  it('skipped-only success reports "skipped (N unchanged)" as skipped', () => {
    expect(
      classifyRebuildResult({
        success: true,
        districtsSucceeded: [],
        districtsSkipped: ['61', '62'],
      })
    ).toEqual({ category: 'skipped', label: '⊘ skipped (2 unchanged)' })
  })

  it('success with no districts reports a bare check as ok', () => {
    expect(classifyRebuildResult({ success: true })).toEqual({
      category: 'ok',
      label: '✓',
    })
  })

  it('failure reports the first error as failed', () => {
    expect(
      classifyRebuildResult({ success: false, errors: ['boom', 'later'] })
    ).toEqual({ category: 'failed', label: '⚠️  failed: boom' })
  })

  it('failure with a real-shaped error object prints districtId and message', () => {
    const { category, label } = classifyRebuildResult({
      success: false,
      errors: [
        {
          districtId: '61',
          error: 'Snapshot file is missing',
          timestamp: '2026-11-17T12:00:00.000Z',
        },
      ],
    })
    expect(category).toBe('failed')
    expect(label).not.toContain('[object Object]')
    expect(label).toBe('⚠️  failed: 61: Snapshot file is missing')
  })

  it('failure without errors reports "unknown"', () => {
    expect(classifyRebuildResult({ success: false })).toEqual({
      category: 'failed',
      label: '⚠️  failed: unknown',
    })
  })
})
