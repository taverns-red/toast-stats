/**
 * Runtime behaviour of the SnapshotDate mint points (#1323, epic #1319).
 *
 * The brand is a compile-time nominal type, but its mints are the runtime
 * boundary where an unvalidated string becomes a trusted snapshot key. A brand
 * minted from an unvalidated source is laundering, not validation (L166 —
 * check value-honesty, not just shape), so these assert what each mint REJECTS
 * at least as hard as what it accepts.
 */

import { describe, it, expect } from 'vitest'
import {
  toSnapshotDate,
  snapshotDatesFrom,
  snapshotDateFromManifest,
} from '../snapshotDate'

describe('toSnapshotDate — the validating mint for URL/API-sourced dates', () => {
  it('mints a well-formed ISO date, preserving the value', () => {
    expect(toSnapshotDate('2026-06-30')).toBe('2026-06-30')
  })

  it.each([
    ['a zero-padding-free month', '2026-6-30'],
    ['a zero-padding-free day', '2026-06-3'],
    ['a full ISO timestamp', '2026-06-30T00:00:00Z'],
    ['a slash-separated date', '2026/06/30'],
    ['free text', 'garbage'],
    ['an empty string', ''],
    ['whitespace padding', ' 2026-06-30 '],
  ])('rejects %s', (_label, raw) => {
    expect(toSnapshotDate(raw)).toBeUndefined()
  })

  it.each([
    ['a 13th month', '2026-13-01'],
    ['a zero month', '2026-00-10'],
    ['a 32nd day', '2026-06-32'],
    ['a zero day', '2026-06-00'],
    ['a non-leap Feb 29', '2026-02-29'],
  ])('rejects %s — shape alone is not a real date', (_label, raw) => {
    expect(toSnapshotDate(raw)).toBeUndefined()
  })

  it('accepts a real leap day', () => {
    expect(toSnapshotDate('2024-02-29')).toBe('2024-02-29')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('rejects %s without throwing', (_label, raw) => {
    expect(toSnapshotDate(raw)).toBeUndefined()
  })
})

describe('snapshotDatesFrom — the mint for the CDN dates index', () => {
  it('mints every well-formed date in the index', () => {
    expect(snapshotDatesFrom({ dates: ['2026-06-30', '2026-05-31'] })).toEqual([
      '2026-06-30',
      '2026-05-31',
    ])
  })

  it('drops malformed entries rather than trusting the index wholesale', () => {
    expect(
      snapshotDatesFrom({ dates: ['2026-06-30', 'not-a-date', '2026-13-01'] })
    ).toEqual(['2026-06-30'])
  })

  it('preserves index order (callers sort for themselves)', () => {
    expect(snapshotDatesFrom({ dates: ['2026-01-31', '2026-06-30'] })).toEqual([
      '2026-01-31',
      '2026-06-30',
    ])
  })

  it.each([
    ['an undefined index (query in flight)', undefined],
    ['an index with no dates', { dates: [] }],
  ])('returns an empty array for %s', (_label, index) => {
    expect(snapshotDatesFrom(index)).toEqual([])
  })
})

describe('snapshotDateFromManifest — the mint for v1/latest.json', () => {
  it('mints a well-formed latestSnapshotDate', () => {
    expect(snapshotDateFromManifest({ latestSnapshotDate: '2026-06-30' })).toBe(
      '2026-06-30'
    )
  })

  it('rejects a malformed latestSnapshotDate', () => {
    expect(
      snapshotDateFromManifest({ latestSnapshotDate: 'unknown' })
    ).toBeUndefined()
  })

  it('returns undefined for an undefined manifest (query in flight)', () => {
    expect(snapshotDateFromManifest(undefined)).toBeUndefined()
  })
})
