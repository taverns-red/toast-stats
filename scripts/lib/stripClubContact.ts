/**
 * One-off in-place strip of club contact keys (#2026).
 *
 * Six snapshot dates were written by a daily with the Find-A-Club merge
 * before #2030 stopped promoting `email`/`phone`: 2026-10-09…10-13 (every
 * district) and 2026-06-30 (districts 201–231). No rebuild rewrites them
 * without also dropping the rest of the FAC enrichment, so this rewrites
 * those objects in place (cleanup plan 2026-10-14 §3, route (c): staging
 * only, a scheduled daily then promotes the clean files through its gates).
 *
 * The contract is narrow on purpose. It removes the `email` and `phone`
 * keys (`CLUB_CONTACT_KEYS`) at any depth, blank or not, and changes
 * nothing else:
 * - the JSON text is re-serialized only when one canonical format
 *   reproduces the original exactly (the pipeline writes 2-space JSON, no
 *   trailing newline), so every other byte stays as it was;
 * - the gzip layer count is kept (one, `Content-Encoding: gzip`), at the
 *   original's compression level (level 9 from `gcloud storage cp -Z`);
 * - the object's headers and custom metadata are carried over;
 * - each write is conditional on the generation that was read, so a
 *   concurrent writer wins and this object is reported, not clobbered.
 * The embedded `metadata.checksum` and `analytics/manifest.json` sizes are
 * left as they are: they describe the writer's output, and no reader
 * checks them against the served bytes.
 *
 * Audit rows hold paths, generations, md5s and counts. They never hold a
 * value, and error messages are built here rather than copied from a
 * parser or the server.
 */

import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  findClubContactField,
  isClubContactKey,
} from '@taverns-red/shared-contracts'
import {
  GzipLayerError,
  peelGzipLayers,
} from '../../packages/collector-cli/src/utils/gzipLayers.js'

/** The two buckets the workflow may target. */
export const BUCKETS = {
  staging: 'toast-stats-data-staging',
  prod: 'toast-stats-data-ca',
} as const

/** An object as listed: identity, integrity and the headers to keep. */
export interface StoredObjectMeta {
  name: string
  generation: string
  md5Hash?: string
  size?: string
  contentType?: string
  contentEncoding?: string
  cacheControl?: string
  contentDisposition?: string
  contentLanguage?: string
  metadata?: Record<string, string>
}

/** The headers a rewrite carries over from the original. */
export interface WriteMetadata {
  contentType?: string
  contentEncoding?: string
  cacheControl?: string
  contentDisposition?: string
  contentLanguage?: string
  metadata?: Record<string, string>
}

const HEADER_KEYS = [
  'contentType',
  'contentEncoding',
  'cacheControl',
  'contentDisposition',
  'contentLanguage',
] as const

/** The bucket operations the strip needs. */
export interface StripIo {
  /** Every object under `prefix`, with its generation and headers. */
  list(prefix: string): Promise<StoredObjectMeta[]>
  /** The stored bytes (gzip layer intact) of that exact generation. */
  read(name: string, generation: string): Promise<Buffer>
  /** Replace the object only if its live generation is `ifGenerationMatch`. */
  write(
    name: string,
    bytes: Buffer,
    metadata: WriteMetadata,
    ifGenerationMatch: string
  ): Promise<StoredObjectMeta>
}

/** A failure whose message is ours and holds no object content. */
export class StripError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StripError'
  }
}

export interface JsonFormat {
  indent: 0 | 2 | 4
  trailingNewline: boolean
}

const INDENTS = [2, 0, 4] as const

const serialize = (value: unknown, format: JsonFormat): string =>
  (format.indent === 0
    ? JSON.stringify(value)
    : JSON.stringify(value, null, format.indent)) +
  (format.trailingNewline ? '\n' : '')

/**
 * The canonical format that reproduces `text` exactly, or null. Null means
 * re-serializing would change bytes beyond the removed keys (odd spacing,
 * `1.0`, `\u` escapes, duplicate keys), so the caller must not rewrite.
 */
export function detectJsonFormat(text: string): JsonFormat | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  for (const indent of INDENTS) {
    for (const trailingNewline of [false, true]) {
      const format: JsonFormat = { indent, trailingNewline }
      if (serialize(value, format) === text) return format
    }
  }
  return null
}

/** Number of `email`/`phone` keys anywhere in `value`. */
export function countContactKeys(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((n, item) => n + countContactKeys(item), 0)
  }
  if (typeof value !== 'object' || value === null) return 0
  let n = 0
  for (const [key, child] of Object.entries(value)) {
    if (isClubContactKey(key)) n++
    n += countContactKeys(child)
  }
  return n
}

/**
 * A copy of `value` without any `email`/`phone` key, at any depth, and how
 * many were removed. Key order is kept; the input is not mutated.
 */
export function stripContactKeys(value: unknown): {
  value: unknown
  removed: number
} {
  let removed = 0
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (typeof node !== 'object' || node === null) return node
    const entries: Array<[string, unknown]> = []
    for (const [key, child] of Object.entries(node)) {
      if (isClubContactKey(key)) {
        removed++
        continue
      }
      entries.push([key, walk(child)])
    }
    // fromEntries defines own properties, so a `__proto__` key stays data.
    return Object.fromEntries(entries)
  }
  return { value: walk(value), removed }
}

export type StripResult =
  | { changed: false; gzipLayers: number }
  | { changed: true; gzipLayers: number; keysRemoved: number; bytes: Buffer }

function decode(stored: Buffer): { text: string; layers: number } {
  let data: Buffer
  let layers: number
  try {
    ;({ data, layers } = peelGzipLayers(stored))
  } catch (err) {
    if (err instanceof GzipLayerError) {
      throw new StripError('gzip layer does not inflate')
    }
    throw err
  }
  return { text: data.toString('utf-8'), layers }
}

/**
 * The deflate level matching a gzip member's XFL byte (RFC 1952): 2 is
 * maximum compression, which `gcloud storage cp -Z` writes; 4 is fastest.
 * Matching it keeps a rewritten object the size of the original.
 */
function gzipLevel(stored: Buffer): number {
  const xfl = stored.length > 9 ? stored[8] : undefined
  if (xfl === 2) return 9
  if (xfl === 4) return 1
  return 6
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // The parser's message quotes the input; never pass it on.
    throw new StripError('object is not JSON')
  }
}

/**
 * Strip one object's stored bytes. Unchanged when it has no contact key;
 * otherwise the new stored bytes, same format and gzip layer count, checked
 * to hold no contact key before they are returned.
 */
export function stripStoredObject(stored: Buffer): StripResult {
  const { text, layers } = decode(stored)
  const value = parse(text)
  if (countContactKeys(value) === 0) {
    return { changed: false, gzipLayers: layers }
  }
  const format = detectJsonFormat(text)
  if (format === null) {
    throw new StripError(
      'JSON format is not reproducible byte for byte; refusing to rewrite'
    )
  }
  const { value: stripped, removed } = stripContactKeys(value)
  const level = gzipLevel(stored)
  let bytes = Buffer.from(serialize(stripped, format), 'utf-8')
  for (let i = 0; i < layers; i++) bytes = gzipSync(bytes, { level })

  const check = decode(bytes)
  const reparsed = parse(check.text)
  if (
    check.layers !== layers ||
    countContactKeys(reparsed) !== 0 ||
    findClubContactField(reparsed) !== null
  ) {
    throw new StripError('stripped output failed its own post-check')
  }
  return { changed: true, gzipLayers: layers, keysRemoved: removed, bytes }
}

/** The original's headers and custom metadata, for the rewrite. */
export function preservedWriteMetadata(meta: StoredObjectMeta): WriteMetadata {
  const out: WriteMetadata = {}
  for (const key of HEADER_KEYS) {
    if (meta[key] !== undefined) out[key] = meta[key]
  }
  if (meta.metadata !== undefined) out.metadata = { ...meta.metadata }
  return out
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse the dates input: comma/space separated `YYYY-MM-DD`, deduplicated. */
export function parseDates(input: string): string[] {
  const dates = [...new Set(input.split(/[\s,]+/).filter(Boolean))]
  if (dates.length === 0) throw new Error('no dates given')
  for (const date of dates) {
    const m = ISO_DATE.exec(date)
    const valid =
      m !== null &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    if (!valid) throw new Error(`not a YYYY-MM-DD date: ${date}`)
  }
  return dates
}

export interface AuditRow {
  bucket: string
  path: string
  /** planned: dry run would rewrite; stripped: rewritten and verified. */
  action: 'planned' | 'stripped' | 'unchanged' | 'error'
  keysRemoved: number
  gzipLayers: number | null
  oldGeneration: string
  newGeneration: string | null
  oldMd5: string | null
  newMd5: string | null
  /** `findClubContactField` of the object as re-read after the write. */
  postCheck: string | null
  error?: string
}

export interface StripSummary {
  bucket: string
  dryRun: boolean
  dates: string[]
  objects: number
  planned: number
  stripped: number
  unchanged: number
  errors: number
  keysRemoved: number
}

export interface StripOptions {
  bucket: string
  dates: string[]
  dryRun: boolean
  concurrency?: number
}

const md5 = (bytes: Buffer): string =>
  createHash('md5').update(bytes).digest('base64')

/** A loggable message for any failure: never content, never a value. */
function safeError(err: unknown): string {
  if (err instanceof StripError) return err.message
  const code = (err as { code?: unknown }).code
  if (typeof code === 'number') return `HTTP ${code}`
  if (typeof code === 'string') return `error ${code}`
  return err instanceof Error ? err.name : 'unknown error'
}

async function stripOne(
  io: StripIo,
  meta: StoredObjectMeta,
  opts: StripOptions
): Promise<AuditRow> {
  const row: AuditRow = {
    bucket: opts.bucket,
    path: meta.name,
    action: 'error',
    keysRemoved: 0,
    gzipLayers: null,
    oldGeneration: meta.generation,
    newGeneration: null,
    oldMd5: meta.md5Hash ?? null,
    newMd5: null,
    postCheck: null,
  }
  try {
    const original = await io.read(meta.name, meta.generation)
    if (meta.md5Hash !== undefined && md5(original) !== meta.md5Hash) {
      throw new StripError('read bytes do not match the listed md5')
    }
    row.oldMd5 = md5(original)
    const result = stripStoredObject(original)
    row.gzipLayers = result.gzipLayers
    if (!result.changed) {
      row.action = 'unchanged'
      return row
    }
    row.keysRemoved = result.keysRemoved
    if (opts.dryRun) {
      row.action = 'planned'
      return row
    }

    const wanted = preservedWriteMetadata(meta)
    const written = await io.write(
      meta.name,
      result.bytes,
      wanted,
      meta.generation
    )
    row.newGeneration = written.generation
    for (const key of HEADER_KEYS) {
      if (written[key] !== wanted[key]) {
        throw new StripError(`${key} differs from the original after write`)
      }
    }
    const reread = await io.read(meta.name, written.generation)
    row.newMd5 = md5(reread)
    if (row.newMd5 !== md5(result.bytes)) {
      throw new StripError('re-read bytes differ from the bytes written')
    }
    const after = parse(decode(reread).text)
    row.postCheck = findClubContactField(after)
    if (row.postCheck !== null || countContactKeys(after) !== 0) {
      throw new StripError('re-read object still has a contact key')
    }
    row.action = 'stripped'
    return row
  } catch (err) {
    row.action = 'error'
    row.error = safeError(err)
    return row
  }
}

/** Run `fn` over `items` with at most `limit` in flight, results in order. */
async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  )
  return out
}

/**
 * Strip every `.json` object under `snapshots/<date>/` for each date. Rows
 * come back sorted by path; an object's failure is a row, not a throw.
 */
export async function runStrip(
  io: StripIo,
  opts: StripOptions
): Promise<{ rows: AuditRow[]; summary: StripSummary }> {
  const objects: StoredObjectMeta[] = []
  for (const date of opts.dates) {
    const listed = await io.list(`snapshots/${date}/`)
    objects.push(...listed.filter(o => o.name.endsWith('.json')))
  }
  objects.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const rows = await pool(objects, opts.concurrency ?? 16, meta =>
    stripOne(io, meta, opts)
  )
  const count = (action: AuditRow['action']) =>
    rows.filter(r => r.action === action).length
  return {
    rows,
    summary: {
      bucket: opts.bucket,
      dryRun: opts.dryRun,
      dates: opts.dates,
      objects: rows.length,
      planned: count('planned'),
      stripped: count('stripped'),
      unchanged: count('unchanged'),
      errors: count('error'),
      keysRemoved: rows.reduce((n, r) => n + r.keysRemoved, 0),
    },
  }
}

/** One JSON row per line, newline-terminated. */
export function toJsonl(rows: readonly AuditRow[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
}
