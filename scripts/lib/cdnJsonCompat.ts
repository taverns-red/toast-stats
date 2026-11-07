/**
 * CDN JSON compatibility guard (#2494, ADR 0019 steps 1 and 3 in
 * `taverns-red/ops`). Stub: the red commit pins the behaviour first.
 */

export const OVERRIDE_LABEL = 'db-breaking-approved'
export const OVERRIDE_APPROVER = 'rservant'

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

export type SchemaSet = Record<string, ReaderLike>

export type LoadedFixture =
  { ok: true; payload: unknown } | { ok: false; error: string }

export type FixtureSet = Record<string, LoadedFixture>

export interface FixtureSpec {
  reader: string
  file: string
  exportName?: string
  pick?: string[]
}

export const COMPAT_FIXTURES: FixtureSpec[] = []

export type Direction = 'backward' | 'forward'

export interface Finding {
  direction: Direction
  reader: string
  kind: 'rejected' | 'missing-fixture' | 'missing-schema'
  detail: string
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
}

export interface OverrideResult {
  approved: boolean
  reason: string
}

export function readerSchemasOf(_mod: Record<string, unknown>): SchemaSet {
  return {}
}

export function fixtureHash(
  _reader: string,
  _direction: Direction,
  _payload: unknown
): string {
  return ''
}

export function compareCompat(_args: {
  base: { schemas: SchemaSet; fixtures: FixtureSet }
  head: { schemas: SchemaSet; fixtures: FixtureSet }
}): Finding[] {
  return []
}

export function applyGrandfather(
  findings: Finding[],
  _entries: GrandfatherEntry[]
): { breaking: Finding[]; grandfathered: Finding[] } {
  return { breaking: [], grandfathered: findings }
}

export function verifyOverride(
  _labels: string[],
  _events: IssueEvent[]
): OverrideResult {
  return { approved: true, reason: '' }
}

export async function fetchOverride(
  _getAll: (path: string) => Promise<unknown[]>,
  _repo: string,
  _pr: number
): Promise<OverrideResult> {
  return { approved: true, reason: '' }
}

export function decide(_args: {
  breaking: Finding[]
  override: OverrideResult | null
}): { pass: boolean; reason: string } {
  return { pass: true, reason: '' }
}

export async function loadFixtures(
  _specs: FixtureSpec[],
  _root: string
): Promise<FixtureSet> {
  return {}
}
