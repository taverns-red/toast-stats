/**
 * pruneClosingGuard — Refuse destructive prunes during a TI closing window
 * (#1133, #1037's original requirement)
 *
 * Prune deletes irreversibly, and a closing window is exactly when raw→
 * snapshot mappings are in flight (collection date ≠ snapshot date) and the
 * month's final data is not yet settled. The guard answers one question:
 * may a destructive prune run *today*?
 *
 * Fail-closed contract (#1129 chain): allowed ONLY when the closing-date
 * registry conclusively proves today is past the previous month's closing
 * window. Both 'closing' and 'unknown' refuse — an unknown verdict means
 * the registry cannot prove the window has ended (e.g. the month just
 * finished and its closing date is not yet recorded). The unblock path is
 * the registry, not an override flag: add the month's entry to
 * docs/month-end-closing-dates.json once TI's dashboard shows the close
 * (see scripts/update-closing-date-registry.ts).
 *
 * Dry-run policy is the CALLER's (PruneService): classification is
 * read-only, so a dry-run may proceed during a refused window — but it must
 * surface this verdict so the operator knows a real run would be refused.
 */

import type { ClosingDateEntry } from './ClosingDateRegistry.js'
import { resolveClosingWindow } from './closingWindowResolver.js'

export interface PruneClosingGuardVerdict {
  /** The date the guard evaluated (YYYY-MM-DD). */
  todayDate: string
  /** Registry verdict for todayDate (resolveClosingWindow kind). */
  windowVerdict: 'closing' | 'non-closing' | 'unknown'
  /** True only when a destructive prune may run today. */
  allowed: boolean
  /** Human-readable explanation for logs / step summaries. */
  reason: string
}

/**
 * Decide whether a destructive prune may run on `todayDate`.
 */
export function evaluatePruneClosingGuard(
  todayDate: string,
  registry: ClosingDateEntry[]
): PruneClosingGuardVerdict {
  const verdict = resolveClosingWindow(todayDate, registry)

  if (verdict.kind === 'closing') {
    const entry = registry.find(m => m.dataMonth === verdict.dataMonth)
    return {
      todayDate,
      windowVerdict: 'closing',
      allowed: false,
      reason:
        `${todayDate} is inside the closing window for data month ` +
        `${verdict.dataMonth}` +
        (entry ? ` (closes ${entry.closingDate})` : '') +
        ' — refusing destructive prune during a TI closing period (#1133)',
    }
  }

  if (verdict.kind === 'unknown') {
    return {
      todayDate,
      windowVerdict: 'unknown',
      allowed: false,
      reason:
        `Cannot prove ${todayDate} is outside a closing window: ` +
        `${verdict.reason} — failing closed (#1129/#1133). Add the missing ` +
        'month to docs/month-end-closing-dates.json to unblock.',
    }
  }

  return {
    todayDate,
    windowVerdict: 'non-closing',
    allowed: true,
    reason: `${todayDate} is past the previous month's closing window — destructive prune permitted`,
  }
}
