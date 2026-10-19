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
  AllDistrictsRankingsDataSchema,
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldPointsSchema,
  ClubsByRegionWorldSchema,
  containsPlaceSecret,
  DistrictReportsDatasetSchema,
  findClubContactField,
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_TOTALS_FILE_NAME,
  GlobalClubRaceSchema,
  GlobalTotalsSchema,
  isClubContactKey,
  isDistrictSnapshotFile,
  PerDistrictDataSchema,
  REGION_ROLLUPS_FILE_NAME,
  RegionRollupsSchema,
  repairReportsPlaceText,
  SnapshotManifestSchema,
  SnapshotMetadataFileSchema,
  SUSPENDED_CLUBS_FILE_NAME,
  SuspendedClubsSchema,
} from '@taverns-red/shared-contracts'
import {
  scrubFacLocation,
  scrubFacStreet,
  scrubFacText,
} from '../../packages/collector-cli/src/services/FacMeetingSchedule.js'
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

/**
 * Place-text fields (#2069). A FAC street, Location, meeting day or time is
 * free text a club types, and some typed their meeting link there; files
 * written before #2074 carry it verbatim. #2157 adds meeting credentials
 * (a passcode typed into a City) and the flat city/region and postal code. Each field is scrubbed with the
 * collector's own scrubber, so a rewritten file matches what a fresh run
 * would write. `undefined` from a scrubber removes the key, as the
 * collector omits it.
 */
type Scrubber = (raw: string) => string | undefined
const PLACE_SCRUBBERS: Record<string, Scrubber> = {
  meetingDay: scrubFacText,
  meetingTime: scrubFacText,
  location: scrubFacLocation,
  // #2157: a flat city/region (prospectiveClubs[], clubs-by-region rows).
  city: scrubFacText,
  region: scrubFacText,
}
const ADDRESS_SCRUBBERS: Record<string, Scrubber> = {
  street: scrubFacStreet,
  city: scrubFacText,
  region: scrubFacText,
  postalCode: scrubFacText,
}

/** The scrubber for `key` under `parentKey`, or null if not place text. */
function placeScrubber(parentKey: string | null, key: string): Scrubber | null {
  const table = parentKey === 'address' ? ADDRESS_SCRUBBERS : PLACE_SCRUBBERS
  return Object.hasOwn(table, key) ? (table[key] ?? null) : null
}

interface PlaceWalk {
  value: unknown
  scrubbed: number
  /** Keys removed because their value scrubbed to nothing. */
  dropped: number
}

/**
 * Walk `value`, rewriting each place-text string that contains a link.
 * A value with no link is never touched. Key order is kept; the input is
 * not mutated. A value that scrubs to nothing becomes null when its key is
 * in `nullKeys` (a required nullable key, #2183); otherwise the key goes.
 */
function walkPlaceText(
  value: unknown,
  nullKeys: ReadonlySet<string> = new Set()
): PlaceWalk {
  let scrubbed = 0
  let dropped = 0
  const walk = (node: unknown, parentKey: string | null): unknown => {
    if (Array.isArray(node)) return node.map(item => walk(item, null))
    if (typeof node !== 'object' || node === null) return node
    const entries: Array<[string, unknown]> = []
    for (const [key, child] of Object.entries(node)) {
      const scrub = placeScrubber(parentKey, key)
      if (scrub && typeof child === 'string' && containsPlaceSecret(child)) {
        scrubbed++
        const out = scrub(child)
        if (out !== undefined) entries.push([key, out])
        else if (parentKey !== 'address' && nullKeys.has(key)) {
          entries.push([key, null])
        } else dropped++
        continue
      }
      entries.push([key, walk(child, key)])
    }
    // fromEntries defines own properties, so a `__proto__` key stays data.
    return Object.fromEntries(entries)
  }
  const out = walk(value, null)
  return { value: out, scrubbed, dropped }
}

/** Place-text values holding a link or credential, at any depth (#2069, #2157). */
export function countPlaceLinks(value: unknown): number {
  return walkPlaceText(value).scrubbed
}

/** A copy with every linked place-text value scrubbed, and how many. */
export function scrubPlaceLinks(value: unknown): {
  value: unknown
  scrubbed: number
} {
  const { value: out, scrubbed } = walkPlaceText(value)
  return { value: out, scrubbed }
}

/** A rewrite checked against the object's shared-contracts schema. */
export interface SchemaCheck {
  /** Schema id, or null when the object has no shared-contracts schema. */
  schema: string | null
  before: 'pass' | 'fail' | null
  after: 'pass' | 'fail' | null
  /** Issues the rewrite has that the original did not. */
  newIssues: number
}

/** A top-level object of one snapshot date: `snapshots/<date>/<file>`. */
const TOP_LEVEL = /^snapshots\/\d{4}-\d{2}-\d{2}\/([^/]+)$/

/** `snapshots/<date>/clubs-by-region/<file>` (#1800). */
const CLUBS_BY_REGION = new RegExp(
  `^snapshots/\\d{4}-\\d{2}-\\d{2}/${CLUBS_BY_REGION_DIR}/([A-Za-z0-9-]+\\.json)$`
)

/**
 * `snapshots/<date>/analytics/district_<id>_<kind>.json`. No shared-contracts
 * schema; its place fields are optional in analytics-core's types, as in the
 * district snapshot's, so dropping an emptied one is the collector's form.
 */
const DISTRICT_ANALYTICS =
  /^snapshots\/\d{4}-\d{2}-\d{2}\/analytics\/district_[A-Za-z0-9]+_[a-z-]+\.json$/

/**
 * A clubs-by-region row's `city` (and `region`) is required and nullable
 * (`ClubsByRegionClubSchema`): emptied, it becomes null, never absent (#2183).
 */
const CLUBS_BY_REGION_NULL_KEYS: ReadonlySet<string> = new Set([
  'city',
  'region',
])

/** `district_<id>_reports.json`: the daily reports dataset (#1065). */
const REPORTS_FILE = /^district_[^_./]+_reports\.json$/

/** True for `snapshots/<date>/district_<id>_reports.json`, and only that. */
export function isReportsObject(name: string): boolean {
  const file = TOP_LEVEL.exec(name)?.[1]
  return file !== undefined && REPORTS_FILE.test(file)
}

interface Issue {
  path: ReadonlyArray<PropertyKey>
  code: string
}
type ParseResult =
  { success: true } | { success: false; error: { issues: Issue[] } }
interface ObjectSchema {
  id: string
  safeParse(value: unknown): ParseResult
}

const schemaOf = (
  id: string,
  schema: { safeParse(v: unknown): ParseResult }
): ObjectSchema => ({ id, safeParse: v => schema.safeParse(v) })

/** The schema of a `snapshots/<date>/clubs-by-region/` file (#2183). */
function clubsByRegionSchema(file: string): ObjectSchema {
  if (file === CLUBS_BY_REGION_WORLD_FILE_NAME) {
    return schemaOf('clubs-by-region-world', ClubsByRegionWorldSchema)
  }
  if (file === CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME) {
    return schemaOf(
      'clubs-by-region-world-points',
      ClubsByRegionWorldPointsSchema
    )
  }
  return schemaOf('clubs-by-region-shard', ClubsByRegionShardSchema)
}

/** Top-level snapshot files whose schema is a plain file-name match. */
const TOP_LEVEL_SCHEMAS: Record<string, ObjectSchema> = {
  [REGION_ROLLUPS_FILE_NAME]: schemaOf('region-rollups', RegionRollupsSchema),
  [GLOBAL_TOTALS_FILE_NAME]: schemaOf('global-totals', GlobalTotalsSchema),
  [GLOBAL_CLUB_RACE_FILE_NAME]: schemaOf(
    'global-club-race',
    GlobalClubRaceSchema
  ),
  [SUSPENDED_CLUBS_FILE_NAME]: schemaOf(
    'suspended-clubs',
    SuspendedClubsSchema
  ),
}

/**
 * The shared-contracts schema of a snapshot object, or null. Null kinds
 * (the analytics files, competitive-awards.json) fail closed in
 * `stripStoredObject`: their rewrite may not drop a key unless the kind's
 * place keys are known to be optional (#2183).
 */
export function schemaForObject(name: string): ObjectSchema | null {
  const nested = CLUBS_BY_REGION.exec(name)?.[1]
  if (nested !== undefined) return clubsByRegionSchema(nested)
  const file = TOP_LEVEL.exec(name)?.[1]
  if (file === undefined) return null
  if (Object.hasOwn(TOP_LEVEL_SCHEMAS, file)) {
    return TOP_LEVEL_SCHEMAS[file] ?? null
  }
  if (REPORTS_FILE.test(file)) {
    return {
      id: 'district-reports',
      safeParse: v => DistrictReportsDatasetSchema.safeParse(v),
    }
  }
  if (isDistrictSnapshotFile(file)) {
    return {
      id: 'per-district-data',
      safeParse: v => PerDistrictDataSchema.safeParse(v),
    }
  }
  if (file === 'metadata.json') {
    return {
      id: 'snapshot-metadata',
      safeParse: v => SnapshotMetadataFileSchema.safeParse(v),
    }
  }
  if (file === 'manifest.json') {
    return {
      id: 'snapshot-manifest',
      safeParse: v => SnapshotManifestSchema.safeParse(v),
    }
  }
  if (file === 'all-districts-rankings.json') {
    return {
      id: 'all-districts-rankings',
      safeParse: v => AllDistrictsRankingsDataSchema.safeParse(v),
    }
  }
  return null
}

/** Issue identities (path and code; never a value). */
const issueKeys = (result: ParseResult): Set<string> =>
  new Set(
    result.success
      ? []
      : result.error.issues.map(
          i => `${i.path.map(String).join('.')}|${i.code}`
        )
  )

/**
 * Check a rewrite against the object's schema (#2097). A rewrite may not
 * add an issue the original did not have: that is how a deleted required
 * key shows. An original that already failed is recorded, not refused,
 * since refusing would leave its link or contact key live.
 */
export function checkRewriteSchema(
  name: string | undefined,
  before: unknown,
  after: unknown
): SchemaCheck {
  const schema = name === undefined ? null : schemaForObject(name)
  if (schema === null) {
    return { schema: null, before: null, after: null, newIssues: 0 }
  }
  const b = schema.safeParse(before)
  const a = schema.safeParse(after)
  const old = issueKeys(b)
  const newIssues = [...issueKeys(a)].filter(k => !old.has(k)).length
  return {
    schema: schema.id,
    before: b.success ? 'pass' : 'fail',
    after: a.success ? 'pass' : 'fail',
    newIssues,
  }
}

/** A rewrite that would break the object's contract (#2097). */
export class SchemaRegressionError extends StripError {
  constructor(readonly schemaCheck: SchemaCheck) {
    super(
      `rewrite breaks the ${schemaCheck.schema} contract at ` +
        `${schemaCheck.newIssues} path(s); refusing to rewrite`
    )
    this.name = 'SchemaRegressionError'
  }
}

/**
 * Place-text work for one object. A reports file has a REQUIRED `location`
 * (#2097), so it goes through the shared reports repair: links and emails
 * are stripped with the collector's own `stripLinks`, a value that was only
 * a link becomes '', and a deleted key is restored as ''. Every other file
 * keeps the FAC scrubbers, whose fields are optional everywhere.
 */
function placeFix(
  name: string | undefined,
  value: unknown
): { value: unknown; scrubbed: number; restored: number; dropped: number } {
  if (name !== undefined && isReportsObject(name)) {
    return { ...repairReportsPlaceText(value), dropped: 0 }
  }
  const nullKeys =
    name !== undefined && CLUBS_BY_REGION.test(name)
      ? CLUBS_BY_REGION_NULL_KEYS
      : undefined
  return { ...walkPlaceText(value, nullKeys), restored: 0 }
}

/**
 * Whether a rewrite of `name` may drop an emptied place key: yes where the
 * object's schema checks it (a dropped required key is a new issue) or its
 * place keys are optional by contract; no for any other kind (#2183).
 * Without a name (a direct call) the drop is allowed, as before.
 */
function mayDropPlaceKeys(name: string | undefined): boolean {
  if (name === undefined) return true
  return schemaForObject(name) !== null || DISTRICT_ANALYTICS.test(name)
}

/** Number of place values to scrub or keys to restore in `value`. */
function pendingPlaceWork(name: string | undefined, value: unknown): number {
  const { scrubbed, restored } = placeFix(name, value)
  return scrubbed + restored
}

export type StripResult =
  | { changed: false; gzipLayers: number }
  | {
      changed: true
      gzipLayers: number
      keysRemoved: number
      placeValuesScrubbed: number
      keysRestored: number
      schemaCheck: SchemaCheck
      bytes: Buffer
    }

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
 * Strip one object's stored bytes. Unchanged when it has no contact key,
 * no linked place text and no missing required place key; otherwise the
 * new stored bytes, same format and gzip layer count, checked to hold no
 * contact key and no place link, and to add no issue to the contract of
 * the object at `name` (#2097), before they are returned.
 */
export function stripStoredObject(stored: Buffer, name?: string): StripResult {
  const { text, layers } = decode(stored)
  const value = parse(text)
  if (
    countContactKeys(value) === 0 &&
    countPlaceLinks(value) === 0 &&
    pendingPlaceWork(name, value) === 0
  ) {
    return { changed: false, gzipLayers: layers }
  }
  const format = detectJsonFormat(text)
  if (format === null) {
    throw new StripError(
      'JSON format is not reproducible byte for byte; refusing to rewrite'
    )
  }
  const { value: stripped, removed } = stripContactKeys(value)
  const {
    value: scrubbed,
    scrubbed: placeValuesScrubbed,
    restored: keysRestored,
    dropped,
  } = placeFix(name, stripped)
  if (dropped > 0 && !mayDropPlaceKeys(name)) {
    throw new StripError(
      `rewrite drops ${dropped} place key(s) from an object with no ` +
        'shared-contracts schema; refusing to rewrite'
    )
  }
  const schemaCheck = checkRewriteSchema(name, value, scrubbed)
  if (schemaCheck.newIssues > 0) throw new SchemaRegressionError(schemaCheck)
  const level = gzipLevel(stored)
  let bytes = Buffer.from(serialize(scrubbed, format), 'utf-8')
  for (let i = 0; i < layers; i++) bytes = gzipSync(bytes, { level })

  const check = decode(bytes)
  const reparsed = parse(check.text)
  if (
    check.layers !== layers ||
    countContactKeys(reparsed) !== 0 ||
    findClubContactField(reparsed) !== null ||
    countPlaceLinks(reparsed) !== 0 ||
    pendingPlaceWork(name, reparsed) !== 0
  ) {
    throw new StripError('stripped output failed its own post-check')
  }
  return {
    changed: true,
    gzipLayers: layers,
    keysRemoved: removed,
    placeValuesScrubbed,
    keysRestored,
    schemaCheck,
    bytes,
  }
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
  /** Place-text values that held a link and were scrubbed (#2069). */
  placeValuesScrubbed: number
  /** Required place keys restored as '' (#2097). */
  keysRestored: number
  /** The object's shared-contracts schema id, or null (#2097). */
  schema: string | null
  schemaBefore: 'pass' | 'fail' | null
  schemaAfter: 'pass' | 'fail' | null
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
  placeValuesScrubbed: number
  keysRestored: number
  /** Rewrites whose result fails its schema (pre-existing or refused). */
  schemaFailures: number
}

export interface StripOptions {
  bucket: string
  dates: string[]
  dryRun: boolean
  concurrency?: number
  /** 'reports': only `snapshots/<date>/district_<id>_reports.json` (#2097). */
  only?: 'reports'
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
    placeValuesScrubbed: 0,
    keysRestored: 0,
    schema: null,
    schemaBefore: null,
    schemaAfter: null,
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
    const result = stripStoredObject(original, meta.name)
    row.gzipLayers = result.gzipLayers
    if (!result.changed) {
      row.action = 'unchanged'
      return row
    }
    row.keysRemoved = result.keysRemoved
    row.placeValuesScrubbed = result.placeValuesScrubbed
    row.keysRestored = result.keysRestored
    row.schema = result.schemaCheck.schema
    row.schemaBefore = result.schemaCheck.before
    row.schemaAfter = result.schemaCheck.after
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
    if (
      countPlaceLinks(after) !== 0 ||
      pendingPlaceWork(meta.name, after) !== 0
    ) {
      throw new StripError('re-read object still has a place link')
    }
    row.action = 'stripped'
    return row
  } catch (err) {
    row.action = 'error'
    row.error = safeError(err)
    if (err instanceof SchemaRegressionError) {
      row.schema = err.schemaCheck.schema
      row.schemaBefore = err.schemaCheck.before
      row.schemaAfter = err.schemaCheck.after
    }
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
    objects.push(
      ...listed.filter(
        o =>
          o.name.endsWith('.json') &&
          (opts.only !== 'reports' || isReportsObject(o.name))
      )
    )
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
      placeValuesScrubbed: rows.reduce((n, r) => n + r.placeValuesScrubbed, 0),
      keysRestored: rows.reduce((n, r) => n + r.keysRestored, 0),
      schemaFailures: rows.filter(r => r.schemaAfter === 'fail').length,
    },
  }
}

/** One JSON row per line, newline-terminated. */
export function toJsonl(rows: readonly AuditRow[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
}
