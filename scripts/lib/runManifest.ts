/**
 * The run manifest — `runs/<github_run_id>/written.jsonl` (#1762, ADR-015
 * P5, migration step 4).
 *
 * One JSON line per object a run uploaded to staging, appended by
 * scripts/pipeline/gcs-upload.sh (and publish-stores.sh for time-series):
 * `{ path, sha256, date, stage }`, sha256 of the uncompressed bytes, `date`
 * the YYYY-MM-DD of a dated path or null. It is run-scoped and derived —
 * never read by a later run — so it is not a store (#1111); prune keeps
 * `runs/` for RUN_MANIFEST_RETENTION_DAYS.
 *
 * Readers: the content gate reads every manifest object under the promoted
 * prefixes; the completeness gate takes its dates from it. Pure; no I/O.
 */

export interface RunManifestEntry {
  /** Object name, bucket stripped. */
  path: string
  /** sha256 hex of the uploaded, uncompressed bytes. */
  sha256: string
  /** The date the object belongs to, or null (v1/, config/, stores). */
  date: string | null
  /** The pipeline stage that wrote it. */
  stage: string
}

export const RUNS_PREFIX = 'runs/'
export const RUN_MANIFEST_RETENTION_DAYS = 90

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA256 = /^[0-9a-f]{64}$/
const SNAPSHOT_DATE = /^snapshots\/(\d{4}-\d{2}-\d{2})\//
const RUN_ID = /^[0-9A-Za-z_-]+$/
const RUN_OF = /^runs\/([^/]+)\//

/** `runs/<id>/written.jsonl`; the id must be a plain token. */
export function runManifestPath(runId: string): string {
  if (!RUN_ID.test(runId)) throw new Error(`not a run id: '${runId}'`)
  return `${RUNS_PREFIX}${runId}/written.jsonl`
}

/**
 * Parse the manifest. Throws on a malformed line, naming it, and on an
 * empty manifest: every mode that reaches the gates uploads at least the CDN
 * manifests, so an empty one means the recording broke. Callers fail closed.
 */
export function parseRunManifest(text: string): RunManifestEntry[] {
  const out: RunManifestEntry[] = []
  const lines = text.split('\n')
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line) continue
    const where = `run manifest line ${i + 1}`
    let v: Record<string, unknown>
    try {
      v = JSON.parse(line) as Record<string, unknown>
    } catch {
      throw new Error(`${where}: not JSON`)
    }
    if (typeof v?.path !== 'string' || v.path === '') {
      throw new Error(`${where}: no path`)
    }
    if (typeof v.sha256 !== 'string' || !SHA256.test(v.sha256)) {
      throw new Error(`${where}: sha256 is not 64 hex digits`)
    }
    if (v.date !== null && (typeof v.date !== 'string' || !DATE.test(v.date))) {
      throw new Error(`${where}: date is not YYYY-MM-DD or null`)
    }
    if (typeof v.stage !== 'string' || v.stage === '') {
      throw new Error(`${where}: no stage`)
    }
    out.push({ path: v.path, sha256: v.sha256, date: v.date, stage: v.stage })
  }
  if (out.length === 0) {
    throw new Error('run manifest is empty: the run recorded no uploads')
  }
  return out
}

/** The last write of each path (a later step may rewrite an object). */
export function latestByPath(
  entries: readonly RunManifestEntry[]
): Map<string, RunManifestEntry> {
  const out = new Map<string, RunManifestEntry>()
  for (const e of entries) {
    out.delete(e.path)
    out.set(e.path, e)
  }
  return out
}

/** The snapshot dates the run wrote, sorted (the completeness gate's input). */
export function manifestSnapshotDates(
  entries: readonly RunManifestEntry[]
): string[] {
  const dates = new Set<string>()
  for (const e of entries) {
    const m = SNAPSHOT_DATE.exec(e.path)
    if (m) dates.add(m[1]!)
  }
  return [...dates].sort()
}

/**
 * `runs/<id>/` prefixes whose newest live object is older than `maxAgeDays`,
 * from a `gcloud storage objects list --format=json` listing (keys `name`,
 * `creation_time`, as recorded in fixtures/gcloud-objects-list/). Noncurrent
 * generations are ignored (lesson from #1730). An entry under runs/ without
 * a parseable creation_time throws: never delete on a guess.
 */
export function expiredRunPrefixes(
  listing: readonly unknown[],
  nowMs: number,
  maxAgeDays = RUN_MANIFEST_RETENTION_DAYS
): string[] {
  const newest = new Map<string, number>()
  for (const raw of listing) {
    const o = (raw ?? {}) as Record<string, unknown>
    if (o.noncurrent_time !== undefined || o.soft_delete_time !== undefined) {
      continue
    }
    const name = typeof o.name === 'string' ? o.name : ''
    const run = RUN_OF.exec(name)?.[1]
    if (!run) continue
    const created =
      typeof o.creation_time === 'string' ? Date.parse(o.creation_time) : NaN
    if (Number.isNaN(created)) {
      throw new Error(`${name}: no parseable creation_time`)
    }
    newest.set(run, Math.max(newest.get(run) ?? -Infinity, created))
  }
  const cutoff = nowMs - maxAgeDays * 24 * 60 * 60 * 1000
  return [...newest]
    .filter(([, created]) => created < cutoff)
    .map(([run]) => `${RUNS_PREFIX}${run}/`)
    .sort()
}
