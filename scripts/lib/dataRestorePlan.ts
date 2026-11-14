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
 * `since` is when the bad run began promoting. A live object created before
 * it was not touched by the run (no-op); without that bound, an untouched
 * object with no soft-deleted copy would look "created by the run".
 */

export class RestorePlanError extends Error {}

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
  action: 'restore' | 'delete' | 'noop' | 'refuse'
  liveGeneration: string
  generation?: string
  hardDeleteTime?: string
  reason: string
}

export interface RestorePlan {
  version: 1
  bucket: string
  since: string
  entries: PlanEntry[]
  refused: number
}

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

function planOne(
  live: ObjectCopy,
  copies: ObjectCopy[],
  sinceMs: number
): PlanEntry {
  const base = { name: live.name, liveGeneration: live.generation }
  if (instant(live.timeCreated, live.name) < sinceMs) {
    return {
      ...base,
      action: 'noop',
      reason: `live generation ${live.generation} was created before the bad run began`,
    }
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
      return {
        ...base,
        action: 'refuse',
        reason: `ambiguous: generations ${matches
          .map(c => c.generation)
          .join(', ')} were all soft-deleted at ${cur.timeCreated}`,
      }
    }
    const m = matches[0]
    if (!m) {
      if (cur === live && copies.length > 0) {
        return {
          ...base,
          action: 'refuse',
          reason: `${copies.length} soft-deleted copies exist but none has softDeleteTime equal to the live timeCreated ${live.timeCreated}`,
        }
      }
      return {
        ...base,
        action: 'delete',
        reason:
          cur === live
            ? 'no soft-deleted copy: the bad run created this object'
            : `generation ${cur.generation} was created in the bad run and displaced nothing`,
      }
    }
    if (seen.has(m.generation)) {
      return {
        ...base,
        action: 'refuse',
        reason: `copy chain loops at generation ${m.generation}`,
      }
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

export function planRestore(input: {
  live: ObjectCopy[]
  softDeleted: ObjectCopy[]
  since: string
  paths?: string[]
}): RestorePlan {
  const sinceMs = instant(input.since, 'since')
  const buckets = new Set(
    [...input.live, ...input.softDeleted].map(o => o.bucket)
  )
  if (buckets.size > 1) {
    throw new RestorePlanError(
      `listings span several buckets: ${[...buckets].join(', ')}`
    )
  }
  const only = input.paths ? new Set(input.paths) : null
  const byName = new Map<string, ObjectCopy[]>()
  for (const c of input.softDeleted) {
    byName.set(c.name, [...(byName.get(c.name) ?? []), c])
  }
  const entries = input.live
    .filter(o => !only || only.has(o.name))
    .map(o => planOne(o, byName.get(o.name) ?? [], sinceMs))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    version: 1,
    bucket: [...buckets][0] ?? '',
    since: input.since,
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
    JSON.stringify(saved.entries) !== JSON.stringify(current.entries)
  ) {
    throw new RestorePlanError(
      'saved plan does not match the current listing; re-run plan mode and review it again'
    )
  }
}

/** Run the plan: restores (entry points first), then deletes. argv excludes `gcloud`. */
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
  for (const e of ordered) {
    run([
      'storage',
      'restore',
      '--allow-overwrite',
      url(e, e.generation as string),
    ])
  }
  for (const e of plan.entries.filter(x => x.action === 'delete')) {
    run(['storage', 'rm', url(e, e.liveGeneration)])
  }
}
