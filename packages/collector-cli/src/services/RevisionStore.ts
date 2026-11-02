/**
 * RevisionStore — keeps every month-end reconciliation revision (#2475).
 *
 * During TI's month-end reconciliation every daily collection is a revised
 * close of the same month, remapped onto `snapshots/<monthEnd>/` and
 * overwriting it. That snapshot must stay the newest (eventually final)
 * close — awards, DCP and YoY read it — so each revision is ALSO kept,
 * write-once, as a copy of its district files:
 *
 *   snapshots/<monthEnd>/revisions/<asOf>/district_<id>.json
 *   snapshots/<monthEnd>/revisions/index.json   (ReconciliationRevisionIndex)
 *
 * `asOf` is the collection date (unique per raw-csv dir). Revision 0 is the
 * in-month view of the month end that the first close overwrites
 * (`asOf` = the month end). It is taken from `priorSnapshotDir`, the copy of
 * the month end before this run publishes, while that copy is still
 * pre-close.
 *
 * Local disk only (R9): the pipeline hydrates the index from staging first
 * and uploads what `written` lists after (scripts/pipeline/process-dates.sh).
 * It runs on the PUBLISHED month end — after the Find-A-Club enrichment — so
 * a revision is byte-identical to what `snapshots/<monthEnd>/` served that
 * day.
 *
 * Fail closed: a month end that is not closing data, a collection date that
 * disagrees with the snapshot's, a malformed index or a missing district
 * file throws before anything is written. Write-once: an `asOf` the index
 * already lists is refused (nothing written); a different file already at a
 * revision path throws.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  RECONCILIATION_REVISIONS_DIR,
  RECONCILIATION_REVISION_INDEX_FILE_NAME,
  ReconciliationRevisionIndexSchema,
  type ReconciliationRevision,
  type ReconciliationRevisionIndex,
} from '@taverns-red/shared-contracts'
import { validateDistrictId } from '../utils/validateDistrictId.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface RecordRevisionOptions {
  /** The local `snapshots/` directory (`<cacheDir>/snapshots`). */
  snapshotsDir: string
  /** The month end the closing collection was remapped onto. */
  date: string
  /** The closing collection date: the revision's id. */
  asOf: string
  /**
   * The month end as it stood before this run (metadata.json +
   * district_<id>.json), for revision 0. Omitted: revision 0 is not taken.
   */
  priorSnapshotDir?: string
  /**
   * Record revision 0 only and refuse the closing revision: the run's
   * district set is a manual subset, so its month end is partial
   * (#2483 fix 4). Write-once means a partial revision could never be
   * replaced by the full run.
   */
  revisionZeroOnly?: boolean
}

export type RevisionZeroOutcome =
  'recorded' | 'already-recorded' | 'prior-is-closing' | 'no-prior' | 'failed'

export interface RecordRevisionResult {
  date: string
  asOf: string
  /** True when the `asOf` revision was written. */
  recorded: boolean
  revisionZero: RevisionZeroOutcome
  /**
   * Why revision 0 could not be taken (`revisionZero: 'failed'`); null
   * otherwise. Its failure never costs the closing revision (#2483 fix 2).
   */
  revisionZeroError: string | null
  /** Why nothing was written for `asOf`; null when it was. */
  refused: string | null
  /** Files written, relative to `snapshots/<date>/`; the index last. */
  written: string[]
}

interface SnapshotMetadataView {
  createdAt: string
  successfulDistricts: string[]
  failedDistricts?: string[]
  isClosingPeriodData?: boolean
  collectionDate?: string
  dataAsOfDate?: string
}

function isMonthEnd(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate() === d
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf-8')) as unknown
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function readMetadata(dir: string): Promise<SnapshotMetadataView> {
  const file = path.join(dir, 'metadata.json')
  const raw = (await readJson(file)) as Partial<SnapshotMetadataView> | null
  if (
    !raw ||
    typeof raw.createdAt !== 'string' ||
    !Array.isArray(raw.successfulDistricts)
  ) {
    throw new Error(
      `${file}: not a snapshot metadata file (createdAt, successfulDistricts)`
    )
  }
  for (const id of raw.successfulDistricts) validateDistrictId(id)
  return raw as SnapshotMetadataView
}

/** One planned copy: source bytes and where they go. */
interface Copy {
  rel: string
  bytes: Buffer
}

/** Read each district's file in `dir` into a planned copy under `revRel`. */
async function planCopies(
  dir: string,
  ids: readonly string[],
  revRel: string
): Promise<Copy[]> {
  const copies: Copy[] = []
  for (const id of ids) {
    const name = `district_${id}.json`
    const src = path.join(dir, name)
    if (!(await exists(src))) {
      throw new Error(
        `${src}: metadata lists district ${id} as successful but ${name} is missing`
      )
    }
    copies.push({ rel: `${revRel}/${name}`, bytes: await fs.readFile(src) })
  }
  return copies
}

/** Throws if any copy's target already holds different bytes. */
async function assertWriteOnce(
  dir: string,
  copies: readonly Copy[]
): Promise<void> {
  for (const c of copies) {
    const target = path.join(dir, c.rel)
    if (await exists(target)) {
      const have = await fs.readFile(target)
      if (!have.equals(c.bytes)) {
        throw new Error(
          `${target} already holds different bytes; revisions are write-once`
        )
      }
    }
  }
}

/**
 * Revision 0 from the prior copy of the month end: its copies (write-once
 * checked) and index entry, or null when the prior copy is already a close.
 * Throws on anything unreadable or inconsistent.
 */
async function planRevisionZero(
  dir: string,
  date: string,
  priorSnapshotDir: string
): Promise<{ copies: Copy[]; entry: ReconciliationRevision } | null> {
  const prior = await readMetadata(priorSnapshotDir)
  if (prior.isClosingPeriodData === true) return null
  if (prior.dataAsOfDate !== undefined && prior.dataAsOfDate !== date) {
    throw new Error(
      `${priorSnapshotDir}: prior copy is of ${prior.dataAsOfDate}, not ${date}`
    )
  }
  const copies = await planCopies(
    priorSnapshotDir,
    prior.successfulDistricts,
    `${RECONCILIATION_REVISIONS_DIR}/${date}`
  )
  await assertWriteOnce(dir, copies)
  return {
    copies,
    entry: {
      asOf: date,
      collectedAt: prior.createdAt,
      closing: false,
      successfulDistricts: [...prior.successfulDistricts],
    },
  }
}

async function readIndex(
  file: string
): Promise<ReconciliationRevisionIndex | null> {
  if (!(await exists(file))) return null
  const parsed = ReconciliationRevisionIndexSchema.safeParse(
    await readJson(file)
  )
  if (!parsed.success) {
    throw new Error(
      `${file}: malformed revision index, refusing to rewrite it: ${parsed.error.message}`
    )
  }
  return parsed.data
}

export async function recordRevision(
  opts: RecordRevisionOptions
): Promise<RecordRevisionResult> {
  const { snapshotsDir, date, asOf, priorSnapshotDir, revisionZeroOnly } = opts
  if (!ISO_DATE.test(date) || !ISO_DATE.test(asOf)) {
    throw new Error(`invalid date ${date} or as-of ${asOf} (YYYY-MM-DD)`)
  }
  if (!isMonthEnd(date)) {
    throw new Error(`${date} is not a month end; only a close has revisions`)
  }

  const dir = path.join(snapshotsDir, date)
  const metadata = await readMetadata(dir)
  if (metadata.isClosingPeriodData !== true) {
    throw new Error(
      `snapshots/${date} is not closing-period data; no revision to record`
    )
  }
  if (metadata.collectionDate !== asOf) {
    throw new Error(
      `snapshots/${date} holds collectionDate ${String(metadata.collectionDate)}, not ${asOf}`
    )
  }

  const revRoot = path.join(dir, RECONCILIATION_REVISIONS_DIR)
  const indexFile = path.join(revRoot, RECONCILIATION_REVISION_INDEX_FILE_NAME)
  const index: ReconciliationRevisionIndex = (await readIndex(indexFile)) ?? {
    schemaVersion: 1,
    monthEnd: date,
    dataMonth: date.slice(0, 7),
    revisions: [],
    final: null,
  }
  if (index.monthEnd !== date) {
    throw new Error(`${indexFile}: indexes ${index.monthEnd}, not ${date}`)
  }
  const listed = (d: string) => index.revisions.some(r => r.asOf === d)

  const result: RecordRevisionResult = {
    date,
    asOf,
    recorded: false,
    revisionZero: 'no-prior',
    revisionZeroError: null,
    refused: null,
    written: [],
  }

  if (listed(asOf)) {
    result.refused = `revision ${asOf} is already recorded (write-once)`
    result.revisionZero = listed(date) ? 'already-recorded' : 'no-prior'
    return result
  }

  const copies: Copy[] = []
  const added: ReconciliationRevision[] = []

  // Revision 0 — the pre-close month end, from the prior copy. Planned on
  // its own: any problem with it is reported, and the closing revision is
  // still recorded (the month end is about to be overwritten either way).
  if (listed(date)) {
    result.revisionZero = 'already-recorded'
  } else if (priorSnapshotDir) {
    try {
      const zero = await planRevisionZero(dir, date, priorSnapshotDir)
      if (zero === null) {
        result.revisionZero = 'prior-is-closing'
      } else {
        copies.push(...zero.copies)
        added.push(zero.entry)
        result.revisionZero = 'recorded'
      }
    } catch (error) {
      result.revisionZero = 'failed'
      result.revisionZeroError =
        error instanceof Error ? error.message : String(error)
    }
  }

  // A partial close is not a revision (#2483 fix 4): revisions are
  // write-once, so the full run of the day could never replace it.
  const failed = metadata.failedDistricts ?? []
  const partial = revisionZeroOnly
    ? `manual district subset: revision ${asOf} not recorded (revision 0 only)`
    : failed.length > 0
      ? `partial close: failed districts ${failed.join(', ')}; revision ${asOf} not recorded`
      : null

  if (partial !== null) {
    result.refused = partial
    if (added.length === 0) return result
  } else {
    const closing = await planCopies(
      dir,
      metadata.successfulDistricts,
      `${RECONCILIATION_REVISIONS_DIR}/${asOf}`
    )
    // Write-once, checked for every file before any is written.
    await assertWriteOnce(dir, closing)
    copies.push(...closing)
    added.push({
      asOf,
      collectedAt: metadata.createdAt,
      closing: true,
      successfulDistricts: [...metadata.successfulDistricts],
    })
  }

  const next = ReconciliationRevisionIndexSchema.parse({
    ...index,
    revisions: [...index.revisions, ...added].sort((a, b) =>
      a.asOf.localeCompare(b.asOf)
    ),
  })

  for (const c of copies) {
    const target = path.join(dir, c.rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, c.bytes)
    result.written.push(c.rel)
  }
  await fs.mkdir(revRoot, { recursive: true })
  const tmp = `${indexFile}.tmp.${process.pid}`
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
  await fs.rename(tmp, indexFile)
  result.written.push(
    `${RECONCILIATION_REVISIONS_DIR}/${RECONCILIATION_REVISION_INDEX_FILE_NAME}`
  )
  result.recorded = partial === null
  return result
}
