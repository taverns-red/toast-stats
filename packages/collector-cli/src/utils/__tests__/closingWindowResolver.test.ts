import { describe, it, expect } from 'vitest'
import { resolveClosingWindow } from '../closingWindowResolver.js'
import type { ClosingDateEntry } from '../ClosingDateRegistry.js'

/**
 * resolveClosingWindow (#1129) — registry-backed closing-window membership.
 *
 * Fail-closed contract: 'unknown' (not 'non-closing') whenever the registry
 * cannot conclusively decide, so callers refuse to publish under the raw date.
 */
describe('resolveClosingWindow', () => {
  const JAN_2026: ClosingDateEntry = {
    dataMonth: '2026-01',
    closingDate: '2026-02-05',
  }

  it('maps a date inside the previous-month closing window to that month-end', () => {
    const verdict = resolveClosingWindow('2026-02-03', [JAN_2026])
    expect(verdict).toEqual({ kind: 'closing', dataMonth: '2026-01' })
  })

  it('treats the registry closingDate itself as closing (inclusive boundary)', () => {
    const verdict = resolveClosingWindow('2026-02-05', [JAN_2026])
    expect(verdict).toEqual({ kind: 'closing', dataMonth: '2026-01' })
  })

  it('treats the day after the closing window as non-closing', () => {
    expect(resolveClosingWindow('2026-02-06', [JAN_2026])).toEqual({
      kind: 'non-closing',
    })
  })

  it('keeps the 2026-02-13 stray under its own date (non-closing, #1129 AC2)', () => {
    // Sprint 1 (#1128) finding: TI's Jan-2026 as-of list ends 2026-02-05 and
    // 2026-02-13 appears in TI's Feb-2026 as-of list — it is a legitimate
    // February daily scrape, NOT a January closing collection.
    expect(resolveClosingWindow('2026-02-13', [JAN_2026])).toEqual({
      kind: 'non-closing',
    })
  })

  it('handles the December→January cross-year window', () => {
    const verdict = resolveClosingWindow('2026-01-05', [
      { dataMonth: '2025-12', closingDate: '2026-01-08' },
    ])
    expect(verdict).toEqual({ kind: 'closing', dataMonth: '2025-12' })
  })

  it('resolves a leap-year February window to dataMonth 2024-02', () => {
    const verdict = resolveClosingWindow('2024-03-05', [
      { dataMonth: '2024-02', closingDate: '2024-03-08' },
    ])
    expect(verdict).toEqual({ kind: 'closing', dataMonth: '2024-02' })
  })

  it('is non-closing after an IN-month closing date (2022-04 outage shape)', () => {
    // 2022-04 closed in-month (2022-04-30, TI outage). A scrape dated
    // 2022-04-30 is after 2022-03's window (closed 2022-04-10) → publish
    // under its own date, which is already the April month-end.
    const verdict = resolveClosingWindow('2022-04-30', [
      { dataMonth: '2022-03', closingDate: '2022-04-10' },
      { dataMonth: '2022-04', closingDate: '2022-04-30' },
    ])
    expect(verdict).toEqual({ kind: 'non-closing' })
  })

  it('returns unknown when the previous month has no registry entry', () => {
    const verdict = resolveClosingWindow('2026-02-03', [])
    expect(verdict.kind).toBe('unknown')
  })

  it('returns unknown when the previous-month entry only exists for OTHER months', () => {
    const verdict = resolveClosingWindow('2026-06-08', [JAN_2026])
    expect(verdict.kind).toBe('unknown')
  })

  it('returns unknown for an invalid requested date', () => {
    expect(resolveClosingWindow('2026-2-3', [JAN_2026]).kind).toBe('unknown')
    expect(resolveClosingWindow('garbage', [JAN_2026]).kind).toBe('unknown')
    expect(resolveClosingWindow('2026-13-01', [JAN_2026]).kind).toBe('unknown')
    expect(resolveClosingWindow('2026-02-30', [JAN_2026]).kind).toBe('unknown')
  })

  it('returns unknown when the matching entry has a malformed closingDate', () => {
    const verdict = resolveClosingWindow('2026-02-03', [
      { dataMonth: '2026-01', closingDate: 'whenever' },
    ])
    expect(verdict.kind).toBe('unknown')
  })
})
