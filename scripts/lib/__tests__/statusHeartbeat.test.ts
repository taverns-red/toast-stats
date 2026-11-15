import { describe, it, expect } from 'vitest'
import { promotedNewerDate } from '../statusHeartbeat.js'

describe('promotedNewerDate (#2863)', () => {
  it('is true when a promoted date is newer than prod had before', () => {
    expect(promotedNewerDate('2026-11-13', '2026-11-14')).toBe(true)
  })

  it('is true when only one of several promoted dates is newer', () => {
    expect(promotedNewerDate('2026-11-13', '2026-10-31,2026-11-14')).toBe(true)
  })

  it('is false for a rebuild of older or equal dates', () => {
    expect(promotedNewerDate('2026-11-13', '2026-11-13')).toBe(false)
    expect(promotedNewerDate('2026-11-13', '2026-06-30,2026-10-31')).toBe(false)
  })

  it('is false when nothing was promoted', () => {
    expect(promotedNewerDate('2026-11-13', '')).toBe(false)
    expect(promotedNewerDate('2026-11-13', undefined)).toBe(false)
  })

  it('is false when prod latest before the run is unknown (never guess a ping)', () => {
    expect(promotedNewerDate('', '2026-11-14')).toBe(false)
    expect(promotedNewerDate(undefined, '2026-11-14')).toBe(false)
    expect(promotedNewerDate('unknown', '2026-11-14')).toBe(false)
    expect(promotedNewerDate('null', '2026-11-14')).toBe(false)
  })

  it('ignores malformed promoted entries', () => {
    expect(promotedNewerDate('2026-11-13', 'garbage, ,2026-11-14')).toBe(true)
    expect(promotedNewerDate('2026-11-13', 'garbage')).toBe(false)
  })
})
