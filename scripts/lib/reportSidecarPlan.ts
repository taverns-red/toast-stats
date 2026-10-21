/**
 * The report-sidecar manifest — the plan (#1767, ADR-015 step 9, D-16).
 *
 * Report sidecars (`snapshots/<date>/district_<id>_reports.json`, #1069)
 * and the date's reports rollup (`reports-rollups.json`, #2012) are written
 * to staging AFTER the pipeline job promoted: `place-reports` and
 * `education-rollup` run later. They used to reach prod by a direct mirror
 * and a bucket-to-bucket carry, outside every gate. Now they go through the
 * one prod-write mechanism, scripts/promote-run-manifest.ts, from a sidecar
 * manifest this plans, after the content gate has read every object in it.
 *
 * What goes in the sidecar manifest:
 * - **This run's sidecars**: every sidecar line of the run manifest (both
 *   writers record through gcs-upload.sh), so a re-placed sidecar replaces
 *   prod's, as the mirror did.
 * - **The carry**: for prod's newest N indexed dates and every date this run
 *   promoted, each sidecar staging holds and prod lacks (#1763 PR 2, #2144):
 *   a held day's reports once that day promotes. Additive: a sidecar prod
 *   already holds is not touched unless this run rewrote it.
 *
 * What holds: every date this run wrote and did not promote (the pipeline's
 * scoped promote held it, or a run-level gate held everything). The verdict
 * is the completeness-gate shape the promoter reads, so a held date's
 * sidecars stay in staging exactly as its snapshot does.
 *
 * Pure; the I/O is in ./reportSidecarPlanRunner.ts.
 */

import {
  latestByPath,
  manifestSnapshotDates,
  type RunManifestEntry,
} from './runManifest.js'
import type { CompletenessVerdict } from './manifestPromotion.js'

/** A sidecar or the reports rollup, directly under its date. */
export const REPORT_SIDECAR =
  /^snapshots\/(\d{4}-\d{2}-\d{2})\/(district_[A-Za-z0-9]+_reports\.json|reports-rollups\.json)$/

export const CARRY_STAGE = 'carry-reports'
export const DEFAULT_CARRY_DAYS = 7

export function isReportSidecar(path: string): boolean {
  return REPORT_SIDECAR.test(path)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `a,b,c` → sorted unique dates; '' → []. Throws on anything else. */
export function parseDateList(text: string): string[] {
  const parts = text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const bad = parts.find(d => !DATE.test(d))
  if (bad !== undefined) throw new Error(`not a YYYY-MM-DD date: '${bad}'`)
  return [...new Set(parts)].sort()
}

/** Every date the run wrote under snapshots/ and did not promote. */
export function heldSidecarDates(
  runEntries: readonly RunManifestEntry[],
  promotedDates: readonly string[]
): string[] {
  const promoted = new Set(promotedDates)
  return manifestSnapshotDates(runEntries).filter(d => !promoted.has(d))
}

/** Prod's newest `days` indexed dates plus the promoted ones, sorted. */
export function carryDates(
  prodIndexDates: readonly string[],
  promotedDates: readonly string[],
  days: number
): string[] {
  const indexed = [...new Set(prodIndexDates)].sort()
  return [
    ...new Set([...indexed.slice(-Math.max(0, days)), ...promotedDates]),
  ].sort()
}

/** The sidecar names directly under `snapshots/<date>/` in an `ls` listing. */
export function sidecarNames(
  listing: string,
  bucket: string,
  date: string
): string[] {
  const prefix = `gs://${bucket}/`
  const out: string[] = []
  for (const raw of listing.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith(prefix)) continue
    const path = line.slice(prefix.length)
    const m = REPORT_SIDECAR.exec(path)
    if (m && m[1] === date) out.push(m[2]!)
  }
  return [...new Set(out)].sort()
}

/** The run manifest's own sidecar lines, the last write of each path. */
export function runSidecarEntries(
  runEntries: readonly RunManifestEntry[]
): RunManifestEntry[] {
  return [...latestByPath(runEntries).values()]
    .filter(e => isReportSidecar(e.path))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** The run's sidecars plus the carried ones (the run's win), sorted. */
export function sidecarManifest(
  own: readonly RunManifestEntry[],
  carried: readonly RunManifestEntry[]
): RunManifestEntry[] {
  const byPath = new Map<string, RunManifestEntry>()
  for (const e of carried) byPath.set(e.path, e)
  for (const e of own) byPath.set(e.path, e)
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

export interface SidecarVerdict extends CompletenessVerdict {
  heldDates: string[]
  reason: string
}

/** The completeness-gate-shaped verdict the promoter reads. */
export function sidecarVerdict(heldDates: readonly string[]): SidecarVerdict {
  const held = [...new Set(heldDates)].sort()
  return {
    promote: held.length === 0,
    heldDates: held,
    reason:
      held.length === 0
        ? 'every date this run wrote was promoted'
        : `this run wrote and did not promote ${held.join(', ')}: their sidecars stay in staging`,
  }
}
