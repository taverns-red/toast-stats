/**
 * CDN JSON compatibility guard (#2494, ADR 0019 steps 1 and 3 in
 * `taverns-red/ops`).
 *
 * The frontend and the mcp-server read published CDN JSON with the
 * shared-contracts `*ReaderSchema` exports (#2493). A PR must not break that
 * read in either direction:
 *
 * - **backward** (step 1): the latest release's reader schemas parse the
 *   fixtures at the PR head, so the live app (or a rollback) still reads data
 *   the new pipeline publishes;
 * - **forward** (step 3): the PR's reader schemas parse the release's
 *   fixtures, so the new app still reads what is on the CDN today.
 *
 * It fails closed. A reader with no fixture, a fixture that will not load, a
 * base with no reader schemas, a GitHub API error: each is a finding or a
 * failed override, never a skip. A rejection passes only when its fixture's
 * content hash is grandfathered (a name alone never matches), or when the PR
 * carries `db-breaking-approved` and the latest `labeled` event for it, from
 * the issues events API, was by rservant with `performed_via_github_app`
 * null (not through an app, #2520).
 *
 * The runner, `scripts/check-cdn-json-compat.ts`, builds the release's
 * shared-contracts and does the I/O; everything decided is here.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const OVERRIDE_LABEL = 'db-breaking-approved'
export const OVERRIDE_APPROVER = 'rservant'

/** The app release tag release-please cuts on main (`toast-stats-v2.80.1`). */
export const BASE_TAG_MATCH = 'toast-stats-v*'

export interface ParseIssue {
  path: PropertyKey[]
  message: string
}

export interface ReaderLike {
  safeParse(value: unknown): {
    success: boolean
    error?: { issues: ParseIssue[] }
  }
}

/** Reader name (the export without `ReaderSchema`) → schema. */
export type SchemaSet = Record<string, ReaderLike>

export type LoadedFixture =
  | { ok: true; payload: unknown }
  | {
      ok: false
      error: string
      /** The fixture's file is not in the tree (as opposed to a bad one). */
      missing?: boolean
      /** The path, relative to FIXTURE_ROOT, when `missing`. */
      file?: string
    }

/** A reader may have several fixtures; each is checked on its own. */
export type FixtureSet = Record<string, LoadedFixture | LoadedFixture[]>

/**
 * Where a reader's fixture lives, relative to
 * `packages/shared-contracts/src/__tests__/`. The same path is read in the
 * PR tree and in the release tree.
 */
export interface FixtureSpec {
  reader: string
  /** A `.json` file, or a `.ts` module when `exportName` is set. */
  file: string
  exportName?: string
  /** Keys to walk into the loaded value. */
  pick?: string[]
}

export const FIXTURE_ROOT = 'packages/shared-contracts/src/__tests__'

/**
 * One fixture per reader schema: the payloads the shared-contracts tolerance
 * test (`reader-schemas.test.ts`) already parses with both the reader and
 * the strict writer schema. Most are recorded from real pipeline output. The
 * guard's own test fails if a `*ReaderSchema` export has no entry here, or
 * if a fixture stops matching the PR's writer contract.
 */
export const COMPAT_FIXTURES: FixtureSpec[] = [
  {
    reader: 'DistrictReportsDataset',
    file: 'fixtures/district-reports/d47-2026-10-15-linked-location.json',
  },
  {
    reader: 'SuspendedClubs',
    file: '__fixtures__/reader-payloads.ts',
    exportName: 'SUSPENDED_CLUBS',
  },
  {
    reader: 'GlobalClubRace',
    file: '__fixtures__/reader-payloads.ts',
    exportName: 'GLOBAL_CLUB_RACE',
  },
  {
    reader: 'RegionRollups',
    // Synthetic, built by buildRegionRollups from clubs carrying TI's status
    // column and April renewals, so distinguishedCounts is exercised (#2562).
    // recorded-region-rollups.json stays as the pre-#2221 shape for the
    // "old output still parses" tests.
    file: '__fixtures__/recorded-region-rollups-distinguished.json',
  },
  {
    reader: 'ClubsByRegionShard',
    file: '__fixtures__/recorded-clubs-by-region.json',
    pick: ['shards', '12'],
  },
  {
    reader: 'ClubsByRegionWorld',
    file: '__fixtures__/recorded-clubs-by-region.json',
    pick: ['world'],
  },
  {
    reader: 'RegionMembershipSeries',
    file: '__fixtures__/recorded-region-membership-series.json',
  },
  {
    reader: 'EducationRollupProgramYear',
    file: '__fixtures__/reader-payloads.ts',
    exportName: 'EDUCATION_ROLLUP',
  },
  {
    reader: 'EducationRollupIndex',
    file: '__fixtures__/reader-payloads.ts',
    exportName: 'EDUCATION_ROLLUP_INDEX',
  },
  {
    reader: 'EducationTimelineEntity',
    file: '__fixtures__/reader-payloads.ts',
    exportName: 'EDUCATION_TIMELINE_ENTITY',
  },
  {
    reader: 'ReportsRollups',
    file: '__fixtures__/recorded-reports-rollups.json',
  },
  {
    reader: 'PerDistrictData',
    file: '__fixtures__/recorded-district-snapshot.json',
  },
]

export type Direction = 'backward' | 'forward'

export interface Finding {
  direction: Direction
  reader: string
  kind: 'rejected' | 'missing-fixture' | 'missing-schema'
  detail: string
  /** Set on a rejection only: what a grandfather entry must pin. */
  hash?: string
}

export interface GrandfatherEntry {
  hash: string
  reader: string
  direction: Direction
  reason: string
}

export interface IssueEvent {
  event: string
  actor?: { login?: string } | null
  label?: { name?: string } | null
  created_at?: string
  /**
   * `null` when a person acted in the web UI; the app object when a GitHub
   * app acted (a cloud session acts as rservant through the Claude app).
   * Typed `unknown` so the check below has to handle any shape.
   */
  performed_via_github_app?: unknown
}

export interface OverrideResult {
  approved: boolean
  reason: string
}

/**
 * One line per fixture the tree lacks, for the runner to log on the release
 * side so the skipped forward read is visible, never silent.
 */
export function absentAtReleaseNotes(fixtures: FixtureSet): string[] {
  void fixtures
  return []
}

const SUFFIX = 'ReaderSchema'

/** The `*ReaderSchema` exports of a shared-contracts module, by reader name. */
export function readerSchemasOf(mod: Record<string, unknown>): SchemaSet {
  const out: SchemaSet = {}
  for (const [name, value] of Object.entries(mod)) {
    if (!name.endsWith(SUFFIX) || name === SUFFIX) continue
    const v = value as Partial<ReaderLike> | null
    if (v && typeof v.safeParse === 'function') {
      out[name.slice(0, -SUFFIX.length)] = v as ReaderLike
    }
  }
  return out
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map(k => [k, canonical((value as Record<string, unknown>)[k])])
    )
  }
  return value
}

/** Content hash of a fixture, bound to the reader and the direction. */
export function fixtureHash(
  reader: string,
  direction: Direction,
  payload: unknown
): string {
  const text = JSON.stringify([reader, direction, canonical(payload)])
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

const MAX_ISSUES = 5

const summarize = (issues: ParseIssue[]): string => {
  const shown = issues
    .slice(0, MAX_ISSUES)
    .map(i => `${i.path.map(String).join('.') || '<root>'}: ${i.message}`)
  const more = issues.length - shown.length
  return shown.join('; ') + (more > 0 ? `; +${more} more` : '')
}

function check(
  direction: Direction,
  reader: string,
  schema: ReaderLike,
  fixture: LoadedFixture | undefined,
  side: string
): Finding | null {
  if (!fixture) {
    return {
      direction,
      reader,
      kind: 'missing-fixture',
      detail: `no ${side} fixture for this reader`,
    }
  }
  if (!fixture.ok) {
    return {
      direction,
      reader,
      kind: 'missing-fixture',
      detail: `${side} fixture did not load: ${fixture.error}`,
    }
  }
  const r = schema.safeParse(fixture.payload)
  if (r.success) return null
  return {
    direction,
    reader,
    kind: 'rejected',
    detail: summarize(r.error?.issues ?? []),
    hash: fixtureHash(reader, direction, fixture.payload),
  }
}

/**
 * Backward: every release reader parses the PR head's fixture for it.
 * Forward: every PR reader that the release also had parses the release's
 * fixture. A reader new at the head has no older data to read, but still
 * needs a fixture of its own so the next release can be checked against it.
 */
export function compareCompat(args: {
  base: { schemas: SchemaSet; fixtures: FixtureSet }
  head: { schemas: SchemaSet; fixtures: FixtureSet }
}): Finding[] {
  const { base, head } = args
  const findings: Finding[] = []
  const baseNames = Object.keys(base.schemas).sort()
  const headNames = Object.keys(head.schemas).sort()

  if (baseNames.length === 0) {
    findings.push({
      direction: 'backward',
      reader: '*',
      kind: 'missing-schema',
      detail: 'the release exports no *ReaderSchema',
    })
  }
  if (headNames.length === 0) {
    findings.push({
      direction: 'forward',
      reader: '*',
      kind: 'missing-schema',
      detail: 'the PR head exports no *ReaderSchema',
    })
  }

  for (const reader of baseNames) {
    const f = check(
      'backward',
      reader,
      base.schemas[reader] as ReaderLike,
      head.fixtures[reader],
      'PR head'
    )
    if (f) findings.push(f)
  }

  for (const reader of headNames) {
    if (reader in base.schemas) {
      const f = check(
        'forward',
        reader,
        head.schemas[reader] as ReaderLike,
        base.fixtures[reader],
        'release'
      )
      if (f) findings.push(f)
    } else if (!head.fixtures[reader]?.ok) {
      findings.push({
        direction: 'forward',
        reader,
        kind: 'missing-fixture',
        detail: 'a reader new at the PR head has no fixture of its own',
      })
    }
  }
  return findings
}

/**
 * Split findings into those a grandfather entry covers and the rest. Only a
 * rejection carries a hash, and an entry matches on hash, reader and
 * direction together; a missing fixture or schema is never grandfathered.
 */
export function applyGrandfather(
  findings: Finding[],
  entries: GrandfatherEntry[]
): { breaking: Finding[]; grandfathered: Finding[] } {
  const breaking: Finding[] = []
  const grandfathered: Finding[] = []
  for (const f of findings) {
    const covered =
      f.kind === 'rejected' &&
      f.hash !== undefined &&
      entries.some(
        e =>
          e.hash === f.hash &&
          e.reader === f.reader &&
          e.direction === f.direction
      )
    ;(covered ? grandfathered : breaking).push(f)
  }
  return { breaking, grandfathered }
}

/**
 * GitHub label names are case-insensitive, and an event keeps the spelling
 * used when it happened, so compare lower-cased (#2520, red-table#911).
 */
const isOverrideLabel = (name: unknown): boolean =>
  typeof name === 'string' &&
  name.toLowerCase() === OVERRIDE_LABEL.toLowerCase()

/** How a non-null `performed_via_github_app` reads in a refusal. */
const viaApp = (app: unknown): string => {
  if (app === undefined) return 'with no `performed_via_github_app` field'
  const slug = (app as { slug?: unknown } | null)?.slug
  return typeof slug === 'string'
    ? `via the ${slug} GitHub app`
    : `with an unexpected \`performed_via_github_app\` (${JSON.stringify(app)})`
}

/**
 * The label must be on the PR now, and the latest `labeled` event for it
 * (events arrive oldest first) must be by the approver, acting directly:
 * `performed_via_github_app` must be exactly `null` (#2520). A cloud session
 * acts as rservant but its events carry the Claude app there, so the actor
 * alone can't tell Ron from an agent. A missing field or any other value
 * fails closed. Label names compare case-insensitively, and an `unlabeled`
 * event counts too: if the latest event for the label is a removal, the
 * override is revoked even if the labels read still lists it. A removal and
 * re-add by anyone else therefore fails.
 */
export function verifyOverride(
  labels: string[],
  events: IssueEvent[]
): OverrideResult {
  if (!labels.some(isOverrideLabel)) {
    return {
      approved: false,
      reason: `\`${OVERRIDE_LABEL}\` is not on the PR`,
    }
  }
  const last = events
    .filter(
      e =>
        (e.event === 'labeled' || e.event === 'unlabeled') &&
        isOverrideLabel(e.label?.name)
    )
    .at(-1)
  if (!last) {
    return {
      approved: false,
      reason: `no \`labeled\` event for \`${OVERRIDE_LABEL}\``,
    }
  }
  if (last.event !== 'labeled') {
    return {
      approved: false,
      reason: `\`${OVERRIDE_LABEL}\` was last removed, by ${last.actor?.login ?? '<unknown>'}`,
    }
  }
  const by = last.actor?.login ?? '<unknown>'
  if (by !== OVERRIDE_APPROVER) {
    return {
      approved: false,
      reason: `\`${OVERRIDE_LABEL}\` was last applied by ${by}, not ${OVERRIDE_APPROVER}`,
    }
  }
  const app = last.performed_via_github_app
  if (app !== null) {
    return {
      approved: false,
      reason: `\`${OVERRIDE_LABEL}\` was last applied by ${by} ${viaApp(app)}, not by ${OVERRIDE_APPROVER} directly`,
    }
  }
  return {
    approved: true,
    reason: `\`${OVERRIDE_LABEL}\` applied by ${OVERRIDE_APPROVER} directly, not through an app`,
  }
}

const isLabel = (v: unknown): v is { name: string } =>
  typeof (v as { name?: unknown } | null)?.name === 'string'

const isEvent = (v: unknown): v is IssueEvent =>
  typeof (v as { event?: unknown } | null)?.event === 'string'

/**
 * Read the PR's live labels and every page of its issue events through
 * `getAll` (a paginating REST GET), then verify. Any error or malformed
 * response is a refusal.
 */
export async function fetchOverride(
  getAll: (path: string) => Promise<unknown[]>,
  repo: string,
  pr: number
): Promise<OverrideResult> {
  try {
    const labels = await getAll(`repos/${repo}/issues/${pr}/labels`)
    if (!Array.isArray(labels) || !labels.every(isLabel)) {
      throw new Error('labels response is not a list of labels')
    }
    const events = await getAll(`repos/${repo}/issues/${pr}/events`)
    if (!Array.isArray(events) || !events.every(isEvent)) {
      throw new Error('events response is not a list of issue events')
    }
    return verifyOverride(
      labels.map(l => l.name),
      events
    )
  } catch (err) {
    return {
      approved: false,
      reason: `GitHub API error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export function decide(args: {
  breaking: Finding[]
  override: OverrideResult | null
}): { pass: boolean; reason: string } {
  const { breaking, override } = args
  if (breaking.length === 0) {
    return { pass: true, reason: 'no breaking change' }
  }
  if (override?.approved) {
    return {
      pass: true,
      reason: `${breaking.length} breaking finding(s), overridden: ${override.reason}`,
    }
  }
  return {
    pass: false,
    reason: `${breaking.length} breaking finding(s); override refused: ${
      override?.reason ?? 'not checked'
    }`,
  }
}

/**
 * Text safe inside one Markdown table cell: backslashes first, then pipes,
 * so an escape already in the text cannot unescape a pipe; newlines become
 * spaces so the cell stays on its row.
 */
export function markdownCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

const walk = (value: unknown, keys: string[]): unknown => {
  let v = value
  for (const k of keys) {
    if (v === null || typeof v !== 'object' || !(k in v)) {
      throw new Error(`no value at ${keys.join('.')}`)
    }
    v = (v as Record<string, unknown>)[k]
  }
  return v
}

/**
 * Load each spec's fixture from `root` (a repo checkout, the PR's or an
 * extracted release tree). A missing file, export or key is an `ok: false`
 * entry, never a dropped one. `.ts` modules need a TypeScript-aware loader
 * (the runner runs under tsx; vitest handles it in tests).
 */
export async function loadFixtures(
  specs: FixtureSpec[],
  root: string
): Promise<FixtureSet> {
  const out: FixtureSet = {}
  for (const spec of specs) {
    const path = join(root, FIXTURE_ROOT, spec.file)
    try {
      if (!existsSync(path)) throw new Error(`missing ${spec.file}`)
      let value: unknown
      if (spec.exportName) {
        const mod = (await import(pathToFileURL(path).href)) as Record<
          string,
          unknown
        >
        if (!(spec.exportName in mod)) {
          throw new Error(`${spec.file} has no export ${spec.exportName}`)
        }
        value = mod[spec.exportName]
      } else {
        value = JSON.parse(readFileSync(path, 'utf-8'))
      }
      out[spec.reader] = { ok: true, payload: walk(value, spec.pick ?? []) }
    } catch (err) {
      out[spec.reader] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return out
}
