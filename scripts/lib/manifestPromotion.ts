/**
 * Scoped promotion — the plan (#1763, ADR-015 P6, migration step 5).
 *
 * Promotion copies exactly the objects this run wrote (the run manifest,
 * `runs/<run_id>/written.jsonl`, #1762) under the promoted prefixes, for the
 * dates the gates passed, instead of rsyncing four whole prefixes. Pure; the
 * I/O lives in scripts/promote-run-manifest.ts.
 *
 * Design decisions (each pinned in __tests__/manifestPromotion.test.ts):
 *
 * - **Allow-list.** A path is promotable only under PROMOTED_PREFIXES, the
 *   same constant the content gate reads by, so every promoted object was
 *   read by a gate in this run. Stores (club-trends/, club-race/, the awards
 *   file, D3/D4), raw inputs (raw-csv/, raw-fac/), derived/ and runs/ are
 *   never promoted. Staging path == prod path: there is no rename layer, so
 *   the prod twin of every promoted object equals the staged one.
 * - **Date-scoped vs global.** `snapshots/<date>/…` belongs to its date.
 *   `v1/`, `config/` and `time-series/` are global: they aggregate over every
 *   staged date. A held date holds itself, and — because a global computed
 *   from it would ship its values — every global too. Passing dates still
 *   promote (they are not yet indexed if new; re-derived files of an indexed
 *   date update in place, as the value gate approved).
 * - **No dangling index entries.** Globals also hold when staging's date
 *   index (v1/dates.json + v1/latest.json) names a date prod does not have
 *   and this run does not promote — e.g. a date an earlier run left held.
 *   Promoting the index would point the frontend at a missing directory.
 *   Remedy: re-derive that date (it then promotes through its own gates).
 * - **Order.** Dates first, then globals, then the v1/ entry points
 *   (dates.json, latest.json) last, so prod never references an object the
 *   promotion has not yet written (R15: the strongest signal last).
 * - **Additive.** Nothing is deleted or renamed in prod. An object the run
 *   no longer writes stays in prod until a reconcile removes it (prune,
 *   #1767 routes that through a manifest too).
 * - **Fail closed.** A malformed path (wildcard, `..`, an undated
 *   snapshots/ object) throws; a missing completeness verdict holds
 *   everything; an unreadable index or prod listing holds the globals.
 */

import { PROMOTED_PREFIXES } from './promotionContentGate.js'
import { latestByPath, type RunManifestEntry } from './runManifest.js'

/** The frontend's entry points: copied last, in their own `cp`. */
export const ENTRY_POINT_PATHS = ['v1/dates.json', 'v1/latest.json'] as const

/** Sources per `gcloud storage cp` call (well under ARG_MAX). */
export const MAX_SOURCES_PER_COPY = 500

export type PromotionClass =
  | { kind: 'date'; date: string }
  | { kind: 'global' }
  | { kind: 'excluded'; reason: string }

const DATED = /^snapshots\/(\d{4}-\d{2}-\d{2})\/[^/]/
/** Characters an object path may hold here; no gcloud wildcard (`*?[]`). */
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export function classifyPromotionPath(path: string): PromotionClass {
  if (
    !SAFE_PATH.test(path) ||
    path.split('/').some(s => s === '..' || s === '.')
  ) {
    throw new Error(`refusing to promote '${path}': not a plain object path`)
  }
  const prefix = PROMOTED_PREFIXES.find(p => path.startsWith(p))
  if (!prefix) {
    return {
      kind: 'excluded',
      reason: 'internal to staging (not under a promoted prefix)',
    }
  }
  if (prefix === 'snapshots/') {
    const m = DATED.exec(path)
    if (!m) {
      throw new Error(
        `refusing to promote '${path}': snapshots/ objects must be under a date`
      )
    }
    return { kind: 'date', date: m[1]! }
  }
  return { kind: 'global' }
}

/** The completeness gate result fields this reads (see dateCompletenessGate). */
export interface CompletenessVerdict {
  promote: boolean
  heldDates?: string[]
}

export interface HeldDates {
  /** true: hold every object (the gate could not judge per date). */
  all: boolean
  dates: string[]
}

export function resolveHeldDates(
  verdict: CompletenessVerdict | null
): HeldDates {
  if (!verdict) return { all: true, dates: [] }
  if (verdict.promote) return { all: false, dates: [] }
  const dates = [...new Set(verdict.heldDates ?? [])].sort()
  return dates.length > 0 ? { all: false, dates } : { all: true, dates: [] }
}

export interface PromotionInputs {
  entries: readonly RunManifestEntry[]
  held: HeldDates
  /** Dates staging's v1/dates.json + v1/latest.json name; null = unreadable. */
  indexDates: readonly string[] | null
  /** Dates prod has a snapshots/<date>/ directory for; null = unreadable. */
  prodDates: ReadonlySet<string> | null
}

export type CopyPhase = 'dates' | 'globals' | 'entry'

export interface CopyBatch {
  phase: CopyPhase
  /** Destination directory, with a trailing slash (the `cp` container). */
  dir: string
  paths: string[]
}

export interface PromotionPlan {
  promotedDates: string[]
  heldDates: string[]
  /** Set when nothing at all is promoted; the reason. */
  heldAll: string | null
  globals: { promote: boolean; reason: string; paths: string[] }
  /** Promotable objects not copied (held), with why. */
  held: Array<{ path: string; reason: string }>
  /** Manifest objects that are never promoted, with why. */
  excluded: Array<{ path: string; reason: string }>
  batches: CopyBatch[]
  objectCount: number
}

function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1)
}

function batch(phase: CopyPhase, paths: readonly string[]): CopyBatch[] {
  const byDir = new Map<string, string[]>()
  for (const p of [...paths].sort()) {
    const d = dirOf(p)
    byDir.set(d, [...(byDir.get(d) ?? []), p])
  }
  const out: CopyBatch[] = []
  for (const dir of [...byDir.keys()].sort()) {
    const all = byDir.get(dir)!
    for (let i = 0; i < all.length; i += MAX_SOURCES_PER_COPY) {
      out.push({ phase, dir, paths: all.slice(i, i + MAX_SOURCES_PER_COPY) })
    }
  }
  return out
}

function globalsVerdict(
  inputs: PromotionInputs,
  promotedDates: readonly string[]
): { promote: boolean; reason: string } {
  if (inputs.held.dates.length > 0) {
    return {
      promote: false,
      reason: `held with date(s) ${inputs.held.dates.join(', ')}: the globals aggregate over every staged date`,
    }
  }
  if (!inputs.indexDates) {
    return {
      promote: false,
      reason: "staging's v1/dates.json or v1/latest.json could not be read",
    }
  }
  if (!inputs.prodDates) {
    return {
      promote: false,
      reason: "prod's snapshots/ listing could not be read",
    }
  }
  const promoted = new Set(promotedDates)
  const dangling = [...new Set(inputs.indexDates)]
    .filter(d => !inputs.prodDates!.has(d) && !promoted.has(d))
    .sort()
  if (dangling.length > 0) {
    return {
      promote: false,
      reason:
        `staging's date index names ${dangling.join(', ')}, which prod does not have and this run does not promote ` +
        '— re-derive it (or them) so it promotes through its own gates',
    }
  }
  return {
    promote: true,
    reason:
      'no held dates; every indexed date is in prod or promoted by this run',
  }
}

export function planManifestPromotion(inputs: PromotionInputs): PromotionPlan {
  const latest = [...latestByPath(inputs.entries).keys()].sort()
  const excluded: PromotionPlan['excluded'] = []
  const dated = new Map<string, string[]>()
  const globalPaths: string[] = []
  for (const p of latest) {
    const c = classifyPromotionPath(p)
    if (c.kind === 'excluded') excluded.push({ path: p, reason: c.reason })
    else if (c.kind === 'global') globalPaths.push(p)
    else dated.set(c.date, [...(dated.get(c.date) ?? []), p])
  }

  if (inputs.held.all) {
    const reason =
      'the completeness gate gave no per-date verdict (missing, unreadable or it could not run): nothing is promoted'
    return {
      promotedDates: [],
      heldDates: [...dated.keys()].sort(),
      heldAll: reason,
      globals: { promote: false, reason, paths: globalPaths },
      held: [...[...dated.values()].flat(), ...globalPaths]
        .sort()
        .map(path => ({ path, reason })),
      excluded,
      batches: [],
      objectCount: 0,
    }
  }

  const heldSet = new Set(inputs.held.dates)
  const promotedDates = [...dated.keys()].filter(d => !heldSet.has(d)).sort()
  const heldDates = [...dated.keys()].filter(d => heldSet.has(d)).sort()
  const globals = globalsVerdict(inputs, promotedDates)

  const held: PromotionPlan['held'] = []
  for (const d of heldDates) {
    for (const p of dated.get(d)!) {
      held.push({ path: p, reason: `date ${d} held by the completeness gate` })
    }
  }
  const entry = new Set<string>(ENTRY_POINT_PATHS)
  const batches: CopyBatch[] = [
    ...promotedDates.flatMap(d => batch('dates', dated.get(d)!)),
  ]
  if (globals.promote) {
    batches.push(
      ...batch(
        'globals',
        globalPaths.filter(p => !entry.has(p))
      )
    )
    batches.push(
      ...batch(
        'entry',
        globalPaths.filter(p => entry.has(p))
      )
    )
  } else {
    for (const p of globalPaths) held.push({ path: p, reason: globals.reason })
  }

  return {
    promotedDates,
    heldDates,
    heldAll: null,
    globals: { ...globals, paths: globalPaths },
    held,
    excluded,
    batches,
    objectCount: batches.reduce((n, b) => n + b.paths.length, 0),
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Dates named by v1/dates.json (`dates[]`) and v1/latest.json. Throws on shape. */
export function parseIndexDates(
  datesJson: string,
  latestJson: string
): string[] {
  const dates = (JSON.parse(datesJson) as { dates?: unknown }).dates
  if (
    !Array.isArray(dates) ||
    !dates.every(d => typeof d === 'string' && DATE.test(d))
  ) {
    throw new Error('v1/dates.json: `dates` is not a list of YYYY-MM-DD')
  }
  const latest = (JSON.parse(latestJson) as { latestSnapshotDate?: unknown })
    .latestSnapshotDate
  if (typeof latest !== 'string' || !DATE.test(latest)) {
    throw new Error('v1/latest.json: latestSnapshotDate is not YYYY-MM-DD')
  }
  return [...new Set([...(dates as string[]), latest])].sort()
}

/** Date directories in a `gcloud storage ls gs://<b>/snapshots/` listing. */
export function parseSnapshotDateListing(ls: string): Set<string> {
  const out = new Set<string>()
  for (const line of ls.split('\n')) {
    const m = /^gs:\/\/[^/]+\/snapshots\/(\d{4}-\d{2}-\d{2})\/$/.exec(
      line.trim()
    )
    if (m) out.add(m[1]!)
  }
  return out
}

/**
 * The dry run: one tab-separated line per object, in copy order —
 * `copy\t<phase>\t<gs://src>\t<gs://dst>`, then `hold\t<path>\t<reason>`
 * and `skip\t<path>\t<reason>` for everything in the manifest not copied.
 */
export function formatPromotionPlan(
  plan: PromotionPlan,
  staging: string,
  prod: string
): string {
  const lines: string[] = []
  for (const b of plan.batches) {
    for (const p of b.paths) {
      lines.push(`copy\t${b.phase}\tgs://${staging}/${p}\tgs://${prod}/${p}`)
    }
  }
  for (const h of plan.held) lines.push(`hold\t${h.path}\t${h.reason}`)
  for (const e of plan.excluded) lines.push(`skip\t${e.path}\t${e.reason}`)
  return lines.join('\n') + '\n'
}
