import { describe, it, expect } from 'vitest'
import { evaluatePruneClosingGuard } from '../pruneClosingGuard.js'
import type { ClosingDateEntry } from '../ClosingDateRegistry.js'

/**
 * evaluatePruneClosingGuard (#1133) — "never prune during a TI closing
 * window" (#1037's original requirement).
 *
 * Fail-closed contract: a destructive prune is allowed ONLY when the
 * registry conclusively says today is non-closing. Both 'closing' and
 * 'unknown' verdicts refuse — deletion is irreversible, and an unknown
 * verdict means the registry cannot prove the window has ended (#1129).
 */
describe('evaluatePruneClosingGuard', () => {
  const MAY_2026: ClosingDateEntry = {
    dataMonth: '2026-05',
    closingDate: '2026-06-05',
  }

  it('refuses while today is inside the previous-month closing window', () => {
    const guard = evaluatePruneClosingGuard('2026-06-03', [MAY_2026])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('closing')
    expect(guard.todayDate).toBe('2026-06-03')
    expect(guard.reason).toContain('2026-05')
  })

  it('refuses on the closing date itself (inclusive boundary)', () => {
    const guard = evaluatePruneClosingGuard('2026-06-05', [MAY_2026])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('closing')
  })

  it('allows the day after the closing window ends', () => {
    const guard = evaluatePruneClosingGuard('2026-06-06', [MAY_2026])
    expect(guard.allowed).toBe(true)
    expect(guard.windowVerdict).toBe('non-closing')
  })

  it('refuses (fail closed) when the registry has no entry for the previous month', () => {
    const guard = evaluatePruneClosingGuard('2026-06-11', [])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('unknown')
    expect(guard.reason).toContain('2026-05')
  })

  it('refuses (fail closed) when the registry entry is malformed', () => {
    const guard = evaluatePruneClosingGuard('2026-06-11', [
      { dataMonth: '2026-05', closingDate: 'not-a-date' },
    ])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('unknown')
  })

  it('refuses (fail closed) when today is not a valid ISO date', () => {
    const guard = evaluatePruneClosingGuard('garbage', [MAY_2026])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('unknown')
  })

  it('crosses the year boundary: a January date checks December of the prior year', () => {
    const guard = evaluatePruneClosingGuard('2026-01-04', [
      { dataMonth: '2025-12', closingDate: '2026-01-07' },
    ])
    expect(guard.allowed).toBe(false)
    expect(guard.windowVerdict).toBe('closing')
    expect(guard.reason).toContain('2025-12')
  })
})
