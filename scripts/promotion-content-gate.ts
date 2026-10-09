/**
 * Pre-promotion Content Gate — Runner (#1715, plan S1-4)
 *
 * Thin glue around ./lib/promotionContentGate.js, run on the CI runner just
 * before `Promote staging to production`:
 *   1. list the promoted prefixes in staging and production (metadata only),
 *   2. keep the staging objects promotion would copy (new, or different
 *      bytes) — never the whole bucket,
 *   3. read a bounded sample of those from staging (stored bytes plus
 *      Content-Encoding, decoded the way a browser does) and check bytes,
 *      parse and shape,
 *   4. emit `content_promote` and write the result for the promotion-held
 *      alert. Nothing is written to any bucket.
 *
 * Decision logic is unit-tested in
 * scripts/lib/__tests__/promotionContentGate.test.ts. Logs go to stderr (R4).
 * Always exits 0: like the value gate, the decision flows through the step
 * output so the promotion-held steps stay reachable. Any error FAILS CLOSED
 * (content_promote=false).
 *
 * Env: GCS_BUCKET (staging), GCS_BUCKET_PRODUCTION,
 *      CONTENT_GATE_FILE (default /tmp/content-gate.json)
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { Storage, type Bucket } from '@google-cloud/storage'
import {
  DATES_PATH,
  LATEST_PATH,
  PROMOTED_PREFIXES,
  SNAPSHOT_INDEX_PATH,
  buildContentGateSummary,
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
} from './lib/promotionContentGate.js'

const CONCURRENCY = 16
const LIST_FIELDS =
  'items(name,size,crc32c,md5Hash,contentEncoding),nextPageToken'
const DEFAULT_RESULT_FILE = '/tmp/content-gate.json'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

async function mapLimit<T, R>(
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

async function listFlat(
  bucket: Bucket,
  prefix: string
): Promise<GcsObjectMeta[]> {
  const [files] = await bucket.getFiles({ prefix, fields: LIST_FIELDS })
  return files.map(f => ({
    name: f.name,
    size: f.metadata.size,
    crc32c: f.metadata.crc32c,
    md5Hash: f.metadata.md5Hash,
    contentEncoding: f.metadata.contentEncoding,
  }))
}

/** Immediate sub-prefixes ("directories") under `prefix`. */
async function listSubPrefixes(
  bucket: Bucket,
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
    const r = response as { prefixes?: string[]; nextPageToken?: string }
    out.push(...(r.prefixes ?? []))
    pageToken = r.nextPageToken
  } while (pageToken)
  return out
}

/**
 * Every object under the promoted prefixes. `snapshots/` is large, so it is
 * listed one date directory at a time, concurrently (plus its top level).
 */
async function listPromoted(bucket: Bucket): Promise<GcsObjectMeta[]> {
  const parts = await mapLimit(PROMOTED_PREFIXES, CONCURRENCY, async prefix => {
    if (prefix !== 'snapshots/') return listFlat(bucket, prefix)
    const dirs = await listSubPrefixes(bucket, prefix)
    const [top] = await bucket.getFiles({
      prefix,
      delimiter: '/',
      fields: LIST_FIELDS,
    })
    const nested = await mapLimit(dirs, CONCURRENCY, d => listFlat(bucket, d))
    return [
      ...top.map(f => ({
        name: f.name,
        size: f.metadata.size,
        crc32c: f.metadata.crc32c,
        md5Hash: f.metadata.md5Hash,
        contentEncoding: f.metadata.contentEncoding,
      })),
      ...nested.flat(),
    ]
  })
  return parts.flat()
}

/** Stored bytes (no client-side decompression) + the served encoding. */
async function readStored(
  bucket: Bucket,
  name: string,
  contentEncoding: string | undefined
): Promise<StoredObject> {
  const [bytes] = await bucket.file(name).download({ decompress: false })
  return { bytes: new Uint8Array(bytes), contentEncoding }
}

async function readContext(
  staging: Bucket,
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

async function run(): Promise<ContentGateResult> {
  const stagingName = process.env.GCS_BUCKET
  const prodName = process.env.GCS_BUCKET_PRODUCTION
  if (!stagingName || !prodName) {
    throw new Error('GCS_BUCKET and GCS_BUCKET_PRODUCTION must be set')
  }
  const storage = new Storage()
  const staging = storage.bucket(stagingName)
  const prod = storage.bucket(prodName)

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
  const plan = planContentChecks(changed)
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

async function main(): Promise<void> {
  const resultFile = process.env.CONTENT_GATE_FILE || DEFAULT_RESULT_FILE
  let result: ContentGateResult
  try {
    result = await run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[content-gate] error: ${message}`)
    result = evaluateContentGate({
      changedCount: 0,
      results: [],
      error: message,
    })
  }

  for (const f of result.failures.slice(0, 50)) {
    log(`::error title=Content gate::${f.path}: ${f.reason}`)
  }
  log(`[content-gate] ${result.promote ? 'PASS' : 'HOLD'} — ${result.reason}`)

  try {
    writeFileSync(resultFile, JSON.stringify(result, null, 2))
    const summaryFile = process.env.GITHUB_STEP_SUMMARY
    if (summaryFile)
      appendFileSync(summaryFile, buildContentGateSummary(result))
  } catch (err) {
    log(`[content-gate] could not write result: ${String(err)}`)
  }
  emitOutput('content_promote', String(result.promote))
}

main()
  .catch(err => {
    // Last resort: never leave the output unset — an empty output must not
    // read as anything but a hold.
    log(`[content-gate] unexpected: ${String(err)}`)
    emitOutput('content_promote', 'false')
  })
  .finally(() => {
    process.exitCode = 0
  })
