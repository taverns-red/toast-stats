/**
 * Closing-Date Registry Freshness — Pure Functions (#1128, epic #1098)
 *
 * The committed registry (docs/month-end-closing-dates.json) maps each
 * Toastmasters data month to its last closing-period collection date. It is
 * the prerequisite for accurate historical rescrapes and (Sprint 2, #1129)
 * the rebuild's fail-closed closing remap — yet it sat 3 months stale with
 * nothing watching (audit 2026-06-09 §9b).
 *
 * These pure functions are the daily pipeline's drift guard: derive the
 * expected entries for COMPLETED closing months from raw-csv metadata and
 * compare against the committed registry. Loud when behind (L107), quiet
 * about what it cannot know (outage months have no metadata to derive from —
 * those entries are maintained manually and trusted).
 *
 * No GCS/network I/O lives here; the runner (scripts/closing-registry-check.ts)
 * supplies the fetched metadata window.
 */

import type { RawCSVEntry } from './monthEndDates.js'
import { groupByDataMonth } from './monthEndDates.js'
import type { ClosingDateEntry } from '../../packages/collector-cli/src/utils/ClosingDateRegistry.js'

/**
 * One (dataMonth → closingDate) registry entry, e.g. 2026-05 → 2026-06-05.
 * Aliased from the registry's own writer so the file's schema lives once.
 */
export type RegistryMonthEntry = ClosingDateEntry

/** A planned registry write, classified by provenance and effect. */
export interface RegistryUpdate extends ClosingDateEntry {
  source: 'derived' | 'manual'
  action: 'add' | 'update'
  /** The registry date being replaced (present only for updates). */
  previous?: string
}

export interface RegistryMismatch {
  dataMonth: string
  registryClosingDate: string
  derivedClosingDate: string
}

export interface RegistryFreshnessResult {
  fresh: boolean
  /** Derivable completed months absent from the registry. */
  missing: RegistryMonthEntry[]
  /** Months where reality moved past the registered closing date. */
  mismatched: RegistryMismatch[]
  /** True when no metadata entries were supplied — a monitor-feed failure. */
  emptyFeed: boolean
  /**
   * True when entries were supplied but none yielded a completed closing
   * month — per-object read failures degrade to non-closing entries, so a
   * full window with zero derivable months means the monitor cannot see.
   */
  noDerivableMonths: boolean
  /** The derivable completed months that were actually verified. */
  checkedMonths: string[]
}

/**
 * Derive (dataMonth → lastClosingDate) for every COMPLETED closing month.
 *
 * A month's closing window is complete only when some collection date LATER
 * than its last closing-period date exists in the feed (TI moved on — a
 * non-closing day or the next month's window). A month whose last closing
 * entry is also the newest entry overall may still be extended by TI
 * tomorrow, so it is not yet demandable. Months with no closing entries at
 * all (collection outages) are underivable and skipped.
 */
export function deriveCompletedClosingMonths(
  entries: RawCSVEntry[]
): RegistryMonthEntry[] {
  const byMonth = groupByDataMonth(entries)
  const newestDate = entries.reduce(
    (max, e) => (e.collectionDate > max ? e.collectionDate : max),
    ''
  )

  const completed: RegistryMonthEntry[] = []
  for (const [dataMonth, closingDates] of byMonth) {
    const lastClosingDate = closingDates[closingDates.length - 1]!
    if (newestDate > lastClosingDate) {
      completed.push({ dataMonth, closingDate: lastClosingDate })
    }
  }

  completed.sort((a, b) => a.dataMonth.localeCompare(b.dataMonth))
  return completed
}

/**
 * Compare the committed registry against the derivable completed months.
 *
 * - A derivable month absent from the registry → `missing` (stale).
 * - A registry date EARLIER than derived → `mismatched` (reality moved past
 *   the committed entry — stale).
 * - A registry date LATER than derived → trusted: the operator backfilled a
 *   partial-outage month from TI behavior; our metadata knows less, not more.
 * - An empty feed → stale with `emptyFeed` (a monitor that cannot read its
 *   signal must alert, never pass — L107).
 */
export function evaluateRegistryFreshness(
  registryMonths: RegistryMonthEntry[],
  entries: RawCSVEntry[]
): RegistryFreshnessResult {
  if (entries.length === 0) {
    return {
      fresh: false,
      missing: [],
      mismatched: [],
      emptyFeed: true,
      noDerivableMonths: false,
      checkedMonths: [],
    }
  }

  const expected = deriveCompletedClosingMonths(entries)
  const registryByMonth = new Map(
    registryMonths.map(m => [m.dataMonth, m.closingDate])
  )

  const missing: RegistryMonthEntry[] = []
  const mismatched: RegistryMismatch[] = []

  for (const exp of expected) {
    const registered = registryByMonth.get(exp.dataMonth)
    if (registered === undefined) {
      missing.push(exp)
    } else if (registered < exp.closingDate) {
      mismatched.push({
        dataMonth: exp.dataMonth,
        registryClosingDate: registered,
        derivedClosingDate: exp.closingDate,
      })
    }
  }

  return {
    fresh: missing.length === 0 && mismatched.length === 0,
    missing,
    mismatched,
    emptyFeed: false,
    noDerivableMonths: false,
    checkedMonths: expected.map(e => e.dataMonth),
  }
}

/**
 * Parse a manual `--set YYYY-MM=YYYY-MM-DD` argument (outage months whose
 * closing date cannot be derived from metadata and was established from TI
 * behavior instead). Throws on malformed input or a closing date in a month
 * EARLIER than the data month (same-month is valid — see the rule below).
 */
export function parseManualEntryArg(input: string): RegistryMonthEntry {
  const match = /^(\d{4}-\d{2})=(\d{4}-\d{2}-\d{2})$/.exec(input)
  if (!match) {
    throw new Error(
      `--set expects YYYY-MM=YYYY-MM-DD, got: ${JSON.stringify(input)}`
    )
  }
  const dataMonth = match[1]!
  const closingDate = match[2]!

  const monthNum = Number(dataMonth.slice(5, 7))
  const dayNum = Number(closingDate.slice(8, 10))
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    throw new Error(`--set: not a real calendar month/day: ${input}`)
  }

  // A closing date normally falls early in the FOLLOWING month, but a TI
  // archive-outage month can end inside the data month itself (April 2022's
  // as-of list stops at 2022-04-30 — TI never archived a May reconciliation).
  // Same-month is therefore valid; only an EARLIER month is a typo.
  if (closingDate.slice(0, 7) < dataMonth) {
    throw new Error(
      `--set: closing date ${closingDate} is before data month ${dataMonth}`
    )
  }

  return { dataMonth, closingDate }
}

/**
 * Plan which registry writes to apply, given the existing registry and the
 * derived + manual candidate entries.
 *
 * - Identical entries are skipped.
 * - A DERIVED date never regresses a later registry date — partial metadata
 *   must not undo a manual outage entry that knows more (the same
 *   trust-later rule evaluateRegistryFreshness applies).
 * - A MANUAL entry overrides in either direction: it is an operator
 *   correction sourced from TI's own as-of lists (e.g. the 2026-01
 *   stray-derived 2026-02-13 corrected back to 2026-02-05).
 */
export function planRegistryUpdates(
  existing: RegistryMonthEntry[],
  derived: RegistryMonthEntry[],
  manual: RegistryMonthEntry[]
): RegistryUpdate[] {
  const existingByMonth = new Map(
    existing.map(m => [m.dataMonth, m.closingDate])
  )

  const candidates: Array<
    RegistryMonthEntry & { source: 'derived' | 'manual' }
  > = [
    ...derived.map(e => ({ ...e, source: 'derived' as const })),
    ...manual.map(e => ({ ...e, source: 'manual' as const })),
  ]

  const plan: RegistryUpdate[] = []
  for (const { dataMonth, closingDate, source } of candidates) {
    const previous = existingByMonth.get(dataMonth)

    if (previous === closingDate) continue
    if (
      source === 'derived' &&
      previous !== undefined &&
      previous > closingDate
    )
      continue

    plan.push(
      previous === undefined
        ? { dataMonth, closingDate, source, action: 'add' }
        : { dataMonth, closingDate, source, action: 'update', previous }
    )
  }
  return plan
}

export function buildRegistryStaleTitle(
  result: RegistryFreshnessResult
): string {
  if (result.emptyFeed) {
    return '🟥 closing-date registry check could not read raw-csv metadata'
  }
  const months = [
    ...result.missing.map(m => m.dataMonth),
    ...result.mismatched.map(m => m.dataMonth),
  ].sort()
  return `🟥 closing-date registry stale — ${months.join(', ')}`
}

export function buildRegistryStaleBody(
  result: RegistryFreshnessResult
): string {
  const lines: string[] = []

  if (result.emptyFeed) {
    lines.push(
      'The registry freshness check received **no raw-csv metadata entries** —',
      'the monitor feed itself failed (GCS listing/read error or empty window).',
      'Treating "cannot tell" as stale (L107). Investigate the check step logs',
      'before trusting `docs/month-end-closing-dates.json` for rescrapes.'
    )
  } else {
    lines.push(
      'The committed closing-date registry `docs/month-end-closing-dates.json`',
      'is behind what raw-csv metadata proves (#1128, epic #1098):',
      ''
    )
    for (const m of result.missing) {
      lines.push(
        `- **${m.dataMonth}** — missing; metadata shows its closing window ended on **${m.closingDate}**`
      )
    }
    for (const m of result.mismatched) {
      lines.push(
        `- **${m.dataMonth}** — registered as ${m.registryClosingDate}, but reality moved on to **${m.derivedClosingDate}**`
      )
    }
  }

  lines.push(
    '',
    '### Remediation',
    '```bash',
    'npx tsx scripts/update-closing-date-registry.ts        # derive + append from GCS metadata',
    '```',
    'then commit the updated `docs/month-end-closing-dates.json`.',
    'This issue self-clears on the next daily run that finds the registry fresh.'
  )

  return lines.join('\n')
}
