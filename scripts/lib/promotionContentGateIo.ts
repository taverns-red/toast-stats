/**
 * Pre-promotion content gate — bucket I/O (#1715, plan S1-4).
 *
 * Lists the promoted prefixes, reads the planned sample and runs the pure
 * decision logic in ./promotionContentGate.js. Kept apart from the runner
 * (`scripts/promotion-content-gate.ts`) so it can be exercised end to end
 * against a fake bucket that reproduces what `@google-cloud/storage` really
 * returns — the runner's only job is to build the real buckets and emit.
 *
 * Nothing here writes to any bucket.
 */

import {
  DATES_PATH,
  LATEST_PATH,
  PROMOTED_PREFIXES,
  SNAPSHOT_INDEX_PATH,
  checkLatestAgreesWithIndex,
  checkObject,
  decodeStoredObject,
  diffChangedObjects,
  evaluateContentGate,
  planContentChecks,
  type CheckContext,
  type CheckResult,
  type ContentGateResult,
  type GcsObjectMeta,
  type StoredObject,
} from './promotionContentGate.js'

export const CONCURRENCY = 16
export const LIST_FIELDS =
  'items(name,size,crc32c,md5Hash,contentEncoding),nextPageToken'

/** The subset of `@google-cloud/storage`'s File the gate uses. */
export interface GateFile {
  download(opts: { decompress: false }): Promise<[Uint8Array]>
}

/** The subset of `@google-cloud/storage`'s Bucket the gate uses. */
export interface GateBucket {
  // The SDK's overloads resolve to `[items, nextQuery, apiResponse]`.
  getFiles(query: Record<string, unknown>): Promise<unknown[]>
  file(name: string): GateFile
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
  return out
}

const optString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined

/**
 * One listed object → GcsObjectMeta, whichever shape the SDK handed back.
 * With `fields` set (as the gate always lists), @google-cloud/storage 8.2.0
 * returns the raw JSON-API item — `{ name, size, md5Hash, crc32c,
 * contentEncoding? }` — not a File, so there is no `.metadata`
 * (fixtures/gcs-get-files/with-fields.json). Without `fields` it is a File
 * whose values live under `.metadata`. Read the metadata object when present,
 * else the item itself; `size` is a decimal string, `contentEncoding` is
 * absent when unset. A nameless item throws (fail closed) rather than being
 * diffed as garbage.
 */
export function toMeta(f: unknown): GcsObjectMeta {
  const item = (f ?? {}) as Record<string, unknown>
  const wrapped = item.metadata
  const src =
    wrapped && typeof wrapped === 'object'
      ? (wrapped as Record<string, unknown>)
      : item
  const name = optString(item.name) ?? optString(src.name)
  if (!name) {
    throw new Error(
      `listed object has no name: ${JSON.stringify(f)?.slice(0, 120)}`
    )
  }
  const size = src.size
  return {
    name,
    size:
      typeof size === 'string' || typeof size === 'number' ? size : undefined,
    crc32c: optString(src.crc32c),
    md5Hash: optString(src.md5Hash),
    contentEncoding: optString(src.contentEncoding),
  }
}

async function listItems(
  bucket: GateBucket,
  query: Record<string, unknown>
): Promise<unknown[]> {
  const [items] = await bucket.getFiles(query)
  return (items as unknown[]) ?? []
}

export async function listFlat(
  bucket: GateBucket,
  prefix: string
): Promise<GcsObjectMeta[]> {
  const files = await listItems(bucket, { prefix, fields: LIST_FIELDS })
  return files.map(toMeta)
}

/** Immediate sub-prefixes ("directories") under `prefix`. */
export async function listSubPrefixes(
  bucket: GateBucket,
  prefix: string
): Promise<string[]> {
  const out: string[] = []
  let pageToken: string | undefined
  // Manual pagination: autoPaginate drops `prefixes` after page 1 (gcsHelpers).
  do {
    const [, , response] = await bucket.getFiles({
      prefix,
      delimiter: '/',
      maxResults: 1000,
      pageToken,
      autoPaginate: false,
    })
    const r = (response ?? {}) as {
      prefixes?: string[]
      nextPageToken?: string
    }
    out.push(...(r.prefixes ?? []))
    pageToken = r.nextPageToken
  } while (pageToken)
  return out
}

/**
 * Every object under the promoted prefixes. `snapshots/` is large, so it is
 * listed one date directory at a time, concurrently (plus its top level).
 */
export async function listPromoted(
  bucket: GateBucket
): Promise<GcsObjectMeta[]> {
  const parts = await mapLimit(PROMOTED_PREFIXES, CONCURRENCY, async prefix => {
    if (prefix !== 'snapshots/') return listFlat(bucket, prefix)
    const dirs = await listSubPrefixes(bucket, prefix)
    const top = await listItems(bucket, {
      prefix,
      delimiter: '/',
      fields: LIST_FIELDS,
    })
    const nested = await mapLimit(dirs, CONCURRENCY, d => listFlat(bucket, d))
    return [...top.map(toMeta), ...nested.flat()]
  })
  return parts.flat()
}

/** Stored bytes (no client-side decompression) + the served encoding. */
export async function readStored(
  bucket: GateBucket,
  name: string,
  contentEncoding: string | undefined
): Promise<StoredObject> {
  const [bytes] = await bucket.file(name).download({ decompress: false })
  return { bytes: new Uint8Array(bytes), contentEncoding }
}

async function readContext(
  staging: GateBucket,
  meta: Map<string, GcsObjectMeta>
): Promise<{ ctx: CheckContext; latest: StoredObject | null }> {
  const read = async (path: string) =>
    meta.has(path)
      ? readStored(staging, path, meta.get(path)!.contentEncoding)
      : null
  const [latest, dates] = await Promise.all([
    read(LATEST_PATH),
    read(DATES_PATH),
  ])
  const l = latest ? decodeStoredObject(latest) : null
  const d = dates ? decodeStoredObject(dates) : null
  const latestDate = l?.ok
    ? (l.value as { latestSnapshotDate?: unknown }).latestSnapshotDate
    : null
  const dateList = d?.ok ? (d.value as { dates?: unknown }).dates : null
  return {
    latest,
    ctx: {
      latestSnapshotDate: typeof latestDate === 'string' ? latestDate : null,
      availableDates: Array.isArray(dateList)
        ? dateList.filter((x): x is string => typeof x === 'string')
        : [],
    },
  }
}

/** List, diff, sample, read and decide. Throws on listing errors. */
export async function runContentGate(
  staging: GateBucket,
  prod: GateBucket,
  log: (msg: string) => void = () => {},
  opts: { random?: () => number } = {}
): Promise<ContentGateResult> {
  const started = Date.now()
  const [stagingObjects, prodObjects] = await Promise.all([
    listPromoted(staging),
    listPromoted(prod),
  ])
  log(
    `[content-gate] listed ${stagingObjects.length} staging / ${prodObjects.length} prod objects ` +
      `in ${Math.round((Date.now() - started) / 1000)}s`
  )

  const changed = diffChangedObjects(stagingObjects, prodObjects)
  const plan = planContentChecks(changed, { random: opts.random })
  log(
    `[content-gate] ${plan.changedCount} changed; checking ${plan.checks.length} ` +
      `(${plan.sampledOut} outside the sample, ${plan.notJson} not JSON)`
  )

  const stagingMeta = new Map(stagingObjects.map(o => [o.name, o]))
  const prodMeta = new Map(prodObjects.map(o => [o.name, o]))
  const { ctx, latest } = await readContext(staging, stagingMeta)

  const results: CheckResult[] = await mapLimit(
    plan.checks,
    CONCURRENCY,
    async check => {
      try {
        const object = await readStored(
          staging,
          check.path,
          stagingMeta.get(check.path)?.contentEncoding
        )
        const prodObject =
          check.compareWithProd && prodMeta.has(check.path)
            ? await readStored(
                prod,
                check.path,
                prodMeta.get(check.path)!.contentEncoding
              )
            : null
        return {
          path: check.path,
          kind: check.kind,
          failure: checkObject(check, object, prodObject, ctx),
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          path: check.path,
          kind: check.kind,
          failure: `read failed: ${message}`,
        }
      }
    }
  )

  if (plan.crossCheckLatest) {
    const index = stagingMeta.has(SNAPSHOT_INDEX_PATH)
      ? await readStored(
          staging,
          SNAPSHOT_INDEX_PATH,
          stagingMeta.get(SNAPSHOT_INDEX_PATH)!.contentEncoding
        )
      : null
    results.push({
      path: `${LATEST_PATH} ↔ ${SNAPSHOT_INDEX_PATH}`,
      kind: 'cross-check',
      failure:
        latest && index
          ? checkLatestAgreesWithIndex(latest, index)
          : 'latest manifest or snapshot index is missing from staging',
    })
  }

  return evaluateContentGate({
    changedCount: plan.changedCount,
    results,
    notJson: plan.notJson,
    sampledOut: plan.sampledOut,
  })
}
