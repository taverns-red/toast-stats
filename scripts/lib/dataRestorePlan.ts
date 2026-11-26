/**
 * Data-restore copy picker (#2539, part of #2492). Pure; no I/O except the
 * injected runner in executePlan.
 *
 * After a bad publish, each object the run overwrote is put back from GCS
 * soft delete. The copy to restore is the one the bad run displaced: the
 * soft-deleted generation whose softDeleteTime equals the live object's
 * timeCreated. An object with no such copy was created by the bad run and is
 * deleted. Anything not provably one of those is refused, never guessed.
 *
 * Input is `gcloud storage ls --json` (live) and
 * `gcloud storage ls --soft-deleted --json` output: a list of
 * `{url, type, metadata}` where `metadata` is the JSON API object resource
 * (https://docs.cloud.google.com/storage/docs/json_api/v1/objects):
 * name, bucket, generation (string), timeCreated, softDeleteTime,
 * hardDeleteTime (RFC 3339).
 *
 * `since` / `until` bound the bad run (when it began and ended promoting);
 * both need an explicit `Z` or offset, never local time. A live object created
 * before `since` was not touched by the run (no-op). One created after
 * `until` is refused: something else wrote it, so it is not ours to act on.
 *
 * THE RULE (any ambiguity refuses; a wrong delete is far worse than a refuse):
 *   Walk back from the live object. A soft-deleted copy "belongs" to the
 *   current generation when its softDeleteTime equals that generation's
 *   timeCreated to the millisecond (exact; no tolerance: a mismatch refuses).
 *   - restore: the walk reaches a copy created before `since`.
 *   - delete: ONLY when (a) the object has no soft-deleted copies at all, was
 *     created in [since, until], and the soft-deleted listing is not empty
 *     overall (an empty listing cannot tell "created" from "overwritten"); or
 *     (b) every soft-deleted copy of the object was consumed by the walk, so
 *     it ends at the oldest existing copy, which itself was created after
 *     `since`.
 *   - refuse: everything else, in particular any soft-deleted copy the walk
 *     did not consume (missing link, hard-deleted generation, timestamp
 *     mismatch), two copies matching one step, a loop, or a live object newer
 *     than `until`.
 */

import { z } from 'zod'

export class RestorePlanError extends Error {}

/** Thrown by executePlan when a command fails; says what ran and what failed. */
export class ExecuteFailure extends Error {
  constructor(
    message: string,
    readonly executed: string[][],
    readonly failedAt: string[]
  ) {
    super(message)
  }
}

export interface ObjectCopy {
  name: string
  bucket: string
  generation: string
  timeCreated: string
  softDeleteTime?: string
  hardDeleteTime?: string
}

export interface PlanEntry {
  name: string
  action: 'restore' | 'delete' | 'noop' | 'refuse' | 'excluded' | 'manual'
  liveGeneration: string
  generation?: string
  hardDeleteTime?: string
  reason: string
}

/**
 * One prod removal the run made on purpose (#2856), recorded when it happens:
 * `gap` is a #2232 gap-district object (an exact name), `prune` is a prune
 * reconcile's date prefix (a name ending in `/`).
 */
export interface RemovalRecord {
  path: string
  kind: 'gap' | 'prune'
}

/**
 * Parse runs/<id>/prod-removed-a<attempt>.jsonl, one `{"path","kind"[,"date"]}` per line.
 * Absent or empty text is no record (a run that removed nothing publishes
 * none). A line that is not a valid record refuses: reading it as "nothing
 * removed" would turn a deliberate removal into an unexplained, restorable one.
 */
export function parseRemovalRecord(jsonl: string): RemovalRecord[] {
  const out: RemovalRecord[] = []
  jsonl.split('\n').forEach((line, i) => {
    if (line.trim() === '') return
    let v: unknown
    try {
      v = JSON.parse(line)
    } catch {
      throw new RestorePlanError(`removal record line ${i + 1} is not JSON`)
    }
    const path = isRecord(v) ? v['path'] : undefined
    const kind = isRecord(v) ? v['kind'] : undefined
    if (typeof path !== 'string' || path === '') {
      throw new RestorePlanError(`removal record line ${i + 1} has no path`)
    }
    if (kind !== 'gap' && kind !== 'prune') {
      throw new RestorePlanError(
        `removal record line ${i + 1} has an unknown kind`
      )
    }
    out.push({ path, kind })
  })
  return out
}

export interface RestorePlan {
  version: 1
  bucket: string
  since: string
  until: string
  entries: PlanEntry[]
  refused: number
}

const EntrySchema = z
  .object({
    name: z.string().min(1),
    action: z.enum([
      'restore',
      'delete',
      'noop',
      'refuse',
      'excluded',
      'manual',
    ]),
    liveGeneration: z.string().min(1),
    generation: z.string().min(1).optional(),
    hardDeleteTime: z.string().optional(),
    reason: z.string(),
  })
  .strict()
  .refine(e => e.action !== 'restore' || e.generation !== undefined, {
    message: 'restore entry has no generation',
  })

const PlanSchema = z
  .object({
    version: z.literal(1),
    bucket: z.string().min(1),
    since: z.string().min(1),
    until: z.string().min(1),
    entries: z.array(EntrySchema),
    refused: z.number().int().nonnegative(),
  })
  .strict()

/** Validate a saved plan file; anything malformed is refused, never coerced. */
export function parseSavedPlan(json: unknown): RestorePlan {
  const r = PlanSchema.safeParse(json)
  if (!r.success) {
    throw new RestorePlanError(
      `saved plan is malformed: ${r.error.issues
        .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`
    )
  }
  return r.data as RestorePlan
}

/**
 * The one stderr line `gcloud storage ls` prints for a URL that lists nothing.
 * Source: Google Cloud SDK, `googlecloudsdk/command_lib/storage/list_util.py`
 * (`raise errors.InvalidUrlError('One or more URLs matched no objects.')`,
 * which the gcloud framework prints as `ERROR: (gcloud.storage.ls) <message>`).
 * Not shown in the public docs, so it is matched exactly and anything else
 * refuses.
 */
export const MATCHED_NO_OBJECTS =
  'ERROR: (gcloud.storage.ls) One or more URLs matched no objects.'

/**
 * Refuse the whole plan unless the captured stderr of a listing holds nothing
 * but "matched no objects" lines (blank lines ignored). A listing that failed
 * for any other reason (a transient error, quota) is missing objects, and a
 * missing soft-deleted copy would make an overwritten object look new and get
 * deleted.
 */
export function checkListingErrors(text: string, what: string): void {
  const bad = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && l !== MATCHED_NO_OBJECTS)
  if (bad.length > 0) {
    throw new RestorePlanError(
      `the ${what} listing reported an error other than "matched no objects": ${bad[0]}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ''}; the listing may be incomplete, re-run it`
    )
  }
}

/** Soft-deleted copies live 14 days; the run's copy is gone before that. */
const WINDOW_MS = 13 * 24 * 60 * 60 * 1000

const ENTRY_POINTS = new Set(['v1/latest.json', 'v1/dates.json'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function instant(value: string, what: string): number {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new RestorePlanError(`${what}: not a timestamp: ${value}`)
  }
  return ms
}

const EXPLICIT_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** A bound given by the operator: must carry Z or an offset, never local time. */
function bound(value: unknown, what: string): number {
  if (typeof value !== 'string' || !EXPLICIT_OFFSET.test(value)) {
    throw new RestorePlanError(
      `${what} must be an ISO 8601 time with an explicit Z or offset (e.g. 2026-11-08T10:00:00Z), got: ${String(value)}`
    )
  }
  return instant(value, what)
}

/** Parse a `gcloud storage ls --json` listing. Throws on anything unreadable. */
export function parseListing(json: unknown): ObjectCopy[] {
  if (!Array.isArray(json)) {
    throw new RestorePlanError('listing is not a JSON array')
  }
  const out: ObjectCopy[] = []
  json.forEach((item, i) => {
    if (!isRecord(item)) {
      throw new RestorePlanError(`listing[${i}] is not an object`)
    }
    if (item.type === 'prefix') return
    const m = item.metadata
    if (!isRecord(m)) {
      throw new RestorePlanError(`listing[${i}] has no metadata`)
    }
    for (const k of ['name', 'bucket', 'generation', 'timeCreated']) {
      if (typeof m[k] !== 'string' || m[k] === '') {
        throw new RestorePlanError(`listing[${i}].metadata.${k} missing`)
      }
    }
    const copy: ObjectCopy = {
      name: m.name as string,
      bucket: m.bucket as string,
      generation: m.generation as string,
      timeCreated: m.timeCreated as string,
    }
    if (typeof m.softDeleteTime === 'string') {
      copy.softDeleteTime = m.softDeleteTime
    }
    if (typeof m.hardDeleteTime === 'string') {
      copy.hardDeleteTime = m.hardDeleteTime
    }
    out.push(copy)
  })
  return out
}

/** Read a listing file's text. */
export function parseListingText(text: string): ObjectCopy[] {
  return parseListing(JSON.parse(text))
}

function planOne(
  live: ObjectCopy,
  copies: ObjectCopy[],
  sinceMs: number,
  untilMs: number,
  softListingEmpty: boolean
): PlanEntry {
  const base = { name: live.name, liveGeneration: live.generation }
  const refuse = (reason: string): PlanEntry => ({
    ...base,
    action: 'refuse',
    reason,
  })
  const liveMs = instant(live.timeCreated, live.name)
  if (liveMs < sinceMs) {
    return {
      ...base,
      action: 'noop',
      reason: `live generation ${live.generation} was created before the bad run began`,
    }
  }
  if (liveMs > untilMs) {
    return refuse(
      `live generation ${live.generation} was created ${live.timeCreated}, after --until: not part of the bad run`
    )
  }
  let cur = live
  const seen = new Set<string>([live.generation])
  for (;;) {
    const curMs = instant(cur.timeCreated, cur.name)
    const matches = copies.filter(
      c =>
        c.softDeleteTime !== undefined &&
        instant(c.softDeleteTime, c.name) === curMs
    )
    if (matches.length > 1) {
      return refuse(
        `ambiguous: generations ${matches
          .map(c => c.generation)
          .join(', ')} were all soft-deleted at ${cur.timeCreated}`
      )
    }
    const m = matches[0]
    if (!m) {
      const unmatched = copies.filter(c => !seen.has(c.generation))
      if (unmatched.length > 0) {
        const gens = unmatched.map(c => c.generation).join(', ')
        return refuse(
          `soft-deleted generations ${gens} left unexplained: none has softDeleteTime equal to generation ${cur.generation}'s timeCreated ${cur.timeCreated}`
        )
      }
      if (cur === live && softListingEmpty) {
        return refuse(
          'the soft-deleted listing is empty: cannot tell an object the bad run created from one it overwrote'
        )
      }
      return {
        ...base,
        action: 'delete',
        reason:
          cur === live
            ? 'no soft-deleted copy: the bad run created this object'
            : `every soft-deleted copy was walked; the oldest, generation ${cur.generation}, was created in the bad run and displaced nothing`,
      }
    }
    if (seen.has(m.generation)) {
      return refuse(`copy chain loops at generation ${m.generation}`)
    }
    seen.add(m.generation)
    if (instant(m.timeCreated, m.name) < sinceMs) {
      return {
        ...base,
        action: 'restore',
        generation: m.generation,
        ...(m.hardDeleteTime ? { hardDeleteTime: m.hardDeleteTime } : {}),
        reason: `generation ${m.generation} was displaced by the bad run (softDeleteTime ${m.softDeleteTime} = replacing generation's timeCreated)`,
      }
    }
    cur = m
  }
}

/**
 * The entry for one object the run removed from prod on purpose. When the
 * object is still live (`liveGeneration` given), the removal did not finish
 * (the promoter records before it removes): a person decides, with the real
 * generation shown.
 */
function recordedEntry(r: RemovalRecord, liveGeneration?: string): PlanEntry {
  if (liveGeneration !== undefined) {
    return {
      name: r.path,
      action: 'manual',
      liveGeneration,
      reason:
        'recorded removal did not complete: the object is still live in prod, so a person decides',
    }
  }
  return r.kind === 'gap'
    ? {
        name: r.path,
        action: 'excluded',
        liveGeneration: '0',
        reason:
          'removed on purpose (#2232 gap district, 0-club junk), recorded when the run removed it: not restored',
      }
    : {
        name: r.path,
        action: 'manual',
        liveGeneration: '0',
        reason:
          'removed by a prune reconcile, recorded when the run removed it: not restorable automatically, a person decides',
      }
}

/** Whether the record names this object: exactly, or by a pruned prefix. */
function recordFor(
  name: string,
  removals: RemovalRecord[]
): RemovalRecord | undefined {
  return removals.find(r =>
    r.path.endsWith('/') ? name.startsWith(r.path) : name === r.path
  )
}

function isRecorded(name: string, removals: RemovalRecord[]): boolean {
  return recordFor(name, removals) !== undefined
}

/**
 * A name the run wrote that has no live object in prod but was soft-deleted
 * inside the run window, and is not in the removal record: an unexplained
 * deletion. Restored (the newest copy, while the name is still empty) unless
 * that copy was created inside the run itself, which refuses. Nothing here
 * looks at what the object held: only the record says a removal was on purpose.
 * A name with no soft-deleted copy in the window yields no entry: it never
 * reached prod (a held date), or was deleted outside this run.
 */
function planDeleted(
  name: string,
  copies: ObjectCopy[],
  sinceMs: number,
  untilMs: number
): PlanEntry | null {
  const inWindow = copies
    .filter(c => c.softDeleteTime !== undefined)
    .map(c => ({ c, at: instant(c.softDeleteTime as string, name) }))
    .filter(x => x.at >= sinceMs && x.at <= untilMs)
    .sort((a, b) => b.at - a.at)
  const newest = inWindow[0]?.c
  if (!newest) return null
  const base = { name, liveGeneration: '0' }
  if (instant(newest.timeCreated, name) >= sinceMs) {
    return {
      ...base,
      action: 'refuse',
      reason: `generation ${newest.generation} was created by the run itself and deleted from prod: not in the removal record, and there is no earlier copy to put back`,
    }
  }
  return {
    ...base,
    action: 'restore',
    generation: newest.generation,
    ...(newest.hardDeleteTime ? { hardDeleteTime: newest.hardDeleteTime } : {}),
    reason: `generation ${newest.generation} was deleted from prod at ${newest.softDeleteTime} and is not in the removal record: an unexplained deletion`,
  }
}

export function planRestore(input: {
  live: ObjectCopy[]
  softDeleted: ObjectCopy[]
  since: string
  until: string
  paths?: string[]
  /** The run's record of prod removals made on purpose (#2856). */
  removals?: RemovalRecord[]
  /** Epoch ms; injectable for tests. Defaults to the current time. */
  now?: number
}): RestorePlan {
  const sinceMs = bound(input.since, '--since')
  const untilMs = bound(input.until, '--until')
  if (untilMs <= sinceMs) {
    throw new RestorePlanError('--until must be after --since')
  }
  const buckets = new Set(
    [...input.live, ...input.softDeleted].map(o => o.bucket)
  )
  if (buckets.size > 1) {
    throw new RestorePlanError(
      `listings span several buckets: ${[...buckets].join(', ')}`
    )
  }
  const expired = (input.now ?? Date.now()) > sinceMs + WINDOW_MS
  const only = input.paths ? new Set(input.paths) : null
  const byName = new Map<string, ObjectCopy[]>()
  for (const c of input.softDeleted) {
    byName.set(c.name, [...(byName.get(c.name) ?? []), c])
  }
  const removals = input.removals ?? []
  const liveNames = new Set(input.live.map(o => o.name))
  const liveGenByName = new Map(input.live.map(o => [o.name, o.generation]))
  const recorded = [
    ...new Map(removals.map(r => [r.path, r] as const)).values(),
  ].map(r => recordedEntry(r, liveGenByName.get(r.path)))
  const recordedNames = new Set(recorded.map(e => e.name))
  // Names the run wrote with no live object in prod: unexplained unless the
  // removal record names them.
  const deleted = [...(only ?? [])]
    .filter(n => !liveNames.has(n) && !isRecorded(n, removals))
    .map(n => planDeleted(n, byName.get(n) ?? [], sinceMs, untilMs))
    .filter((e): e is PlanEntry => e !== null)
  const planned = input.live
    .filter(o => !only || only.has(o.name))
    .map(o =>
      planOne(
        o,
        byName.get(o.name) ?? [],
        sinceMs,
        untilMs,
        input.softDeleted.length === 0
      )
    )
    // A live object under a recorded prune prefix: the removal did not finish,
    // so a person decides (#2903). A refuse planOne raised stays.
    .map(e => {
      const record = recordFor(e.name, removals)
      return e.action !== 'refuse' && liveNames.has(e.name) && record
        ? recordedEntry({ path: e.name, kind: record.kind }, e.liveGeneration)
        : e
    })
    .concat(deleted)
    .map(e =>
      expired && (e.action === 'restore' || e.action === 'delete')
        ? ({
            name: e.name,
            liveGeneration: e.liveGeneration,
            action: 'refuse',
            reason: `more than 13 days since --since: the copy from before the run may be past soft-delete retention (14 days), so a missing copy cannot be told from a never-existing one`,
          } as PlanEntry)
        : e
    )
  // One entry per name (#2903). A recorded name is never also planned for a
  // restore. A refuse planOne raised for a still-live one stays (it is the
  // more serious finding) and the recorded entry steps aside.
  const keptRefuses = planned.filter(
    e =>
      recordedNames.has(e.name) &&
      e.action === 'refuse' &&
      liveNames.has(e.name)
  )
  const keptNames = new Set(keptRefuses.map(e => e.name))
  const entries = planned
    .filter(e => !recordedNames.has(e.name))
    .concat(keptRefuses)
    .concat(recorded.filter(e => !keptNames.has(e.name)))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    version: 1,
    bucket: [...buckets][0] ?? '',
    since: input.since,
    until: input.until,
    entries,
    refused: entries.filter(e => e.action === 'refuse').length,
  }
}

/** Throws unless `saved` is executable and equals a fresh plan from the current listing. */
export function verifyPlan(saved: RestorePlan, current: RestorePlan): void {
  if (saved.refused > 0 || saved.entries.some(e => e.action === 'refuse')) {
    throw new RestorePlanError(
      'plan contains refused entries; resolve them by hand before executing'
    )
  }
  if (
    saved.bucket !== current.bucket ||
    saved.since !== current.since ||
    saved.until !== current.until ||
    JSON.stringify(saved.entries) !== JSON.stringify(current.entries)
  ) {
    throw new RestorePlanError(
      'saved plan does not match the current listing; re-run plan mode and review it again'
    )
  }
}

/** The gcloud SDK whose `_BULK_RESTORE_FLAGS` the list below was checked against. */
export const BULK_FLAGS_CHECKED_SDK = '588.0.0'

/**
 * Flags `gcloud storage restore` accepts only for bulk (`--async`) restores.
 * A synchronous restore of a single `gs://B/O#GEN` rejects them. Source:
 * googlecloudsdk/surface/storage/restore.py L40-41 (`_BULK_RESTORE_FLAGS`) and
 * L381 ("Synchronous execution does not support flag: ..."), SDK 588.0.0.
 *
 * Copied by hand, so a flag added in a later SDK is not in this list. Re-check
 * `_BULK_RESTORE_FLAGS` whenever the CI gcloud pin changes (#2977): a test
 * fails until BULK_FLAGS_CHECKED_SDK matches the pin in data-pipeline.yml.
 */
export const BULK_ONLY_RESTORE_FLAGS: readonly string[] = [
  '--allow-overwrite',
  '--deleted-after-time',
  '--deleted-before-time',
  '--all-versions',
  '--preserve-acl',
]

/**
 * Run the plan: restores (entry points first), then deletes. argv excludes
 * `gcloud`. Stops at the first failure and throws ExecuteFailure naming what
 * ran and what failed. Each restore carries `--if-generation-match=<live
 * generation>` so it fails if the object changed since the plan (for
 * objects.restore that precondition is the LIVE generation); a delete names
 * the exact live generation in its `#generation` URL. No bulk-only flag
 * (BULK_ONLY_RESTORE_FLAGS) is passed: a synchronous restore rejects them.
 */
export function executePlan(
  plan: RestorePlan,
  run: (argv: string[]) => void
): void {
  const url = (e: PlanEntry, gen: string): string =>
    `gs://${plan.bucket}/${e.name}#${gen}`
  const restores = plan.entries.filter(e => e.action === 'restore')
  const ordered = [
    ...restores.filter(e => ENTRY_POINTS.has(e.name)),
    ...restores.filter(e => !ENTRY_POINTS.has(e.name)),
  ]
  const commands: string[][] = [
    ...ordered.map(e => [
      'storage',
      'restore',
      `--if-generation-match=${e.liveGeneration}`,
      url(e, e.generation as string),
    ]),
    ...plan.entries
      .filter(x => x.action === 'delete')
      .map(e => ['storage', 'rm', url(e, e.liveGeneration)]),
  ]
  const executed: string[][] = []
  for (const argv of commands) {
    try {
      run(argv)
    } catch (e) {
      throw new ExecuteFailure(
        e instanceof Error ? e.message : String(e),
        [...executed],
        argv
      )
    }
    executed.push(argv)
  }
}
