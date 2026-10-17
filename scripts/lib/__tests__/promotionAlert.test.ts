/**
 * Unit tests for scripts/lib/promotionAlert.ts (#1073)
 *
 * When the staging→prod promotion gate blocks (count gate or the #1034 value
 * gate), the corrected staging data silently fails to reach prod with no
 * alert (epic #1072). These pure functions decide, from the two gate outputs
 * and the value-diff report, whether to file/refresh a `promotion-held` issue
 * or auto-close it on a promoting run — and distinguish the
 * operator-review-needed value gate from a possible-regression count gate.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyGate,
  evaluatePromotion,
  buildPromotionHeldTitle,
  buildPromotionHeldBody,
  type ValueDiffOutput,
} from '../promotionAlert'

// A value-diff where 2 overlap dates changed (staging ahead of prod in
// CONTENT even though dates/districts counts match) — the D61 150-vs-151 case.
const CHANGED_DIFF: ValueDiffOutput = {
  promote: false,
  reasons: ['value changes on overlap dates require allow_value_changes'],
  report: {
    added: [],
    removed: [],
    changed: [
      { date: '2026-05-30', changedDistricts: ['61', '50'] },
      { date: '2026-05-31', changedDistricts: ['61', '25', '129'] },
    ],
    unchanged: ['2026-05-29'],
    overlapCount: 3,
  },
}

const CLEAN_DIFF: ValueDiffOutput = {
  promote: true,
  reasons: [],
  report: {
    added: [],
    removed: [],
    changed: [],
    unchanged: ['2026-05-31'],
    overlapCount: 1,
  },
}

const OPTS = { now: new Date('2026-06-01T14:00:00Z') }

// ── classifyGate ───────────────────────────────────────────────────────────

describe('classifyGate', () => {
  it('returns "none" when both gates allow promotion', () => {
    expect(classifyGate(true, true)).toBe('none')
  })
  it('returns "value" when only the value gate refused', () => {
    expect(classifyGate(true, false)).toBe('value')
  })
  it('returns "count" when only the count gate refused', () => {
    expect(classifyGate(false, true)).toBe('count')
  })
  it('returns "both" when both gates refused', () => {
    expect(classifyGate(false, false)).toBe('both')
  })
})

// ── evaluatePromotion ────────────────────────────────────────────────────────

describe('evaluatePromotion', () => {
  it('is promoted (not blocked) when both gates pass', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
    })
    expect(r.promoted).toBe(true)
    expect(r.blocked).toBe(false)
    expect(r.gate).toBe('none')
  })

  it('is blocked by the value gate and reports staging-ahead with affected districts', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: CHANGED_DIFF,
    })
    expect(r.blocked).toBe(true)
    expect(r.promoted).toBe(false)
    expect(r.gate).toBe('value')
    expect(r.stagingAhead).toBe(true)
    expect(r.changedDateCount).toBe(2)
    // unique, numeric-aware sorted union of changed districts across dates
    expect(r.affectedDistricts).toEqual(['25', '50', '61', '129'])
  })

  it('is blocked by the count gate (possible regression)', () => {
    const r = evaluatePromotion({
      countPromote: false,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
    })
    expect(r.blocked).toBe(true)
    expect(r.gate).toBe('count')
  })

  it('treats a missing/unparseable value-diff as blocked when a gate refused', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: null,
    })
    expect(r.blocked).toBe(true)
    expect(r.gate).toBe('value')
    // no diff to read → staging-ahead can't be confirmed, but still blocked
    expect(r.stagingAhead).toBe(false)
    expect(r.changedDateCount).toBe(0)
  })

  it('detects staging-ahead even when the value gate would allow (changed>0 with override)', () => {
    // allow_value_changes=true → valuePromote true, but content still differs.
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CHANGED_DIFF,
    })
    expect(r.stagingAhead).toBe(true)
    expect(r.changedDateCount).toBe(2)
    // promoting run → not blocked; the auto-close path keys on `promoted`
    expect(r.promoted).toBe(true)
  })
})

// ── buildPromotionHeldTitle / Body ───────────────────────────────────────────

describe('buildPromotionHeldTitle', () => {
  it('names the value gate in the title', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: CHANGED_DIFF,
    })
    expect(buildPromotionHeldTitle(r)).toMatch(/promotion held/i)
    expect(buildPromotionHeldTitle(r)).toMatch(/value/i)
  })

  it('names the count gate in the title', () => {
    const r = evaluatePromotion({
      countPromote: false,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
    })
    expect(buildPromotionHeldTitle(r)).toMatch(/count/i)
  })
})

describe('buildPromotionHeldBody', () => {
  it('value-gate body explains operator review and the allow_value_changes clear path', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: CHANGED_DIFF,
    })
    const body = buildPromotionHeldBody(r, OPTS)
    expect(body).toMatch(/allow_value_changes\s*=\s*true/)
    expect(body).toMatch(/review/i)
    // surfaces affected districts and the changed-date count
    expect(body).toContain('61')
    expect(body).toMatch(/2 .*date/i)
    // staging-ahead is called out
    expect(body).toMatch(/staging.*ahead/i)
  })

  it('count-gate body frames a possible regression and does NOT lead with allow_value_changes', () => {
    const r = evaluatePromotion({
      countPromote: false,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
    })
    const body = buildPromotionHeldBody(r, OPTS)
    expect(body).toMatch(/regression|subtractive|fewer/i)
    expect(body).toMatch(/investigate/i)
  })

  it('both-gates body mentions both gates', () => {
    const r = evaluatePromotion({
      countPromote: false,
      valuePromote: false,
      valueDiff: CHANGED_DIFF,
    })
    const body = buildPromotionHeldBody(r, OPTS)
    expect(body).toMatch(/count gate/i)
    expect(body).toMatch(/value gate/i)
  })

  it('caps oversized bodies under the GitHub 64KB issue limit with a truncation notice (#1168)', () => {
    // A full-range re-derive: hundreds of reasons, every district affected —
    // the raw body would exceed 65,536 chars and crash gh issue create.
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: {
        ...CHANGED_DIFF,
        changedDates: Array.from({ length: 160 }, (_, i) => ({
          date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
          districtsChanged: 120,
        })),
        reasons: Array.from(
          { length: 2000 },
          (_, i) =>
            `2024-01-01 district ${i}: totalPayments 11111111 -> 22222222, paidClubs 333 -> 444 (digest mismatch on overlap date)`
        ),
        affectedDistricts: Array.from({ length: 130 }, (_, i) => String(i + 1)),
      },
    })
    const body = buildPromotionHeldBody(r, OPTS)
    expect(body.length).toBeLessThanOrEqual(60000)
    expect(body).toMatch(/truncated/i)
    // The operational core must survive truncation:
    expect(body).toMatch(/allow_value_changes=true/)
  })
})

// ── Content gate (#1715, plan S1-4, decision D8: hold, don't warn) ───────────

describe('content gate holds promotion through the promotion-held flow', () => {
  const FAILURES = [
    {
      path: 'time-series/district_61/2026-2027.json',
      reason:
        'body is still gzip-encoded after HTTP decoding (nested gzip, #1702)',
    },
  ]

  it('is blocked by the content gate alone, with the gate named', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
      contentPromote: false,
      contentFailures: FAILURES,
    })
    expect(r.blocked).toBe(true)
    expect(r.promoted).toBe(false)
    expect(r.gate).toBe('content')
    expect(buildPromotionHeldTitle(r)).toMatch(/content gate/)
  })

  it('body lists the failing objects and does not offer allow_value_changes as the fix', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
      contentPromote: false,
      contentFailures: FAILURES,
    })
    const body = buildPromotionHeldBody(r, OPTS)
    expect(body).toContain('time-series/district_61/2026-2027.json')
    expect(body).toMatch(/Content gate/)
    expect(body).not.toMatch(/allow_value_changes=true/)
  })

  it('names the content gate alongside another refusing gate', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: CHANGED_DIFF,
      contentPromote: false,
      contentFailures: FAILURES,
    })
    expect(r.gate).toBe('value')
    expect(buildPromotionHeldTitle(r)).toMatch(/value gate.*content gate/)
  })

  it('a passing content gate leaves the existing decision unchanged', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
      contentPromote: true,
      contentFailures: [],
    })
    expect(r.promoted).toBe(true)
    expect(r.gate).toBe('none')
  })
})

// ── Per-date completeness gate (#1761, ADR-015 P5.2, D8: hold) ─────────────

describe('completeness gate holds promotion through the promotion-held flow', () => {
  const FAILURES = [
    {
      path: 'snapshots/2026-10-10/district_02.json',
      reason: '2026-10-10: clubs[] record dropped keys address, coordinates',
    },
  ]

  it('is blocked by the completeness gate alone, with the gate named', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
      contentPromote: true,
      completenessPromote: false,
      completenessFailures: FAILURES,
    })
    expect(r.blocked).toBe(true)
    expect(r.gate).toBe('completeness')
    expect(buildPromotionHeldTitle(r)).toMatch(/completeness gate/)
    const body = buildPromotionHeldBody(r, { now: new Date(0) })
    expect(body).toContain('Completeness gate')
    expect(body).toContain('snapshots/2026-10-10/district_02.json')
    expect(body).toContain('allow_value_changes')
  })

  it('names the completeness gate alongside another refusing gate', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: false,
      valueDiff: CLEAN_DIFF,
      completenessPromote: false,
      completenessFailures: FAILURES,
    })
    expect(r.gate).toBe('value')
    expect(buildPromotionHeldTitle(r)).toMatch(/value gate.*completeness gate/)
  })

  it('omitted = not evaluated, leaving the decision unchanged', () => {
    const r = evaluatePromotion({
      countPromote: true,
      valuePromote: true,
      valueDiff: CLEAN_DIFF,
    })
    expect(r.promoted).toBe(true)
    expect(r.completenessPromote).toBe(true)
  })
})

// #1763 PR 2: scoped promotion copies only what passed. When every gate
// passes but the promote still holds the globals (staging's date index names
// a date prod lacks, e.g. one an earlier run left held), prod's v1/ stays
// put: that is a hold, not a promotion, and must not auto-close the alert.
describe('scoped promotion holds through the promotion-held flow (#1763)', () => {
  const PASS = {
    countPromote: true,
    valuePromote: true,
    valueDiff: CLEAN_DIFF,
    contentPromote: true,
    completenessPromote: true,
  }
  const GLOBALS_REASON =
    "staging's date index names 2026-10-16, which prod does not have and this run does not promote — re-derive it (or them) so it promotes through its own gates"

  it('is blocked when the scoped promote did not copy everything it planned', () => {
    const r = evaluatePromotion({
      ...PASS,
      scopedComplete: false,
      scopedHeldDates: [],
      scopedGlobalsReason: GLOBALS_REASON,
    })
    expect(r.blocked).toBe(true)
    expect(r.promoted).toBe(false)
    expect(r.gate).toBe('scoped')
    expect(buildPromotionHeldTitle(r)).toMatch(/scoped promotion/)
    const body = buildPromotionHeldBody(r, { now: new Date(0) })
    expect(body).toContain('Scoped promotion (#1763)')
    expect(body).toContain('2026-10-16')
    expect(body).toContain('re-derive')
  })

  it('names the held dates of a per-date completeness hold, and that the rest promoted', () => {
    const r = evaluatePromotion({
      ...PASS,
      completenessPromote: false,
      scopedComplete: false,
      scopedHeldDates: ['2026-10-10'],
      scopedGlobalsReason: 'held with date(s) 2026-10-10',
    })
    expect(r.gate).toBe('completeness')
    const body = buildPromotionHeldBody(r, { now: new Date(0) })
    expect(body).toContain('Held date(s): 2026-10-10')
    expect(body).toContain('the other dates of this run promoted')
  })

  it('a complete scoped promote is a promotion', () => {
    const r = evaluatePromotion({ ...PASS, scopedComplete: true })
    expect(r.promoted).toBe(true)
  })

  it('omitted = the promote did not run (a gate held first), decision unchanged', () => {
    expect(evaluatePromotion(PASS).promoted).toBe(true)
  })

  it('tells the operator a daily override cannot ship dates another run wrote', () => {
    const r = evaluatePromotion({
      ...PASS,
      valuePromote: false,
      valueDiff: {
        ...CHANGED_DIFF,
        reasons: [
          "2025-06-30: not written by this run — another run's unpromoted staging state needs operator review (#2040)",
        ],
      },
    })
    const body = buildPromotionHeldBody(r, { now: new Date(0) })
    expect(body).toContain('promotion only copies what a run wrote')
    expect(body).toContain('-f mode=rebuild -f dates=2025-06-30')
  })
})
