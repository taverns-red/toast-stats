/**
 * Run-scoped CDN fixtures for the PR Preview shards (#2545): the manifest of
 * objects the shards read, its expansion against the live dates, schema
 * validation of what was fetched, and the refresh that writes the directory.
 *
 * Not implemented yet: scripts/lib/__tests__/smokeFixtures.test.ts defines it.
 */
import type { ZodType } from 'zod'

export interface ManifestEntry {
  path: string
  districts?: string[]
  optional?: boolean
  copyFrom?: string
}

export interface Manifest {
  origin: string
  districts: string[]
  paths: ManifestEntry[]
}

export interface DateRoles {
  date: string
  prev: string | null
  ago14: string | null
  yearEnds: string[]
}

export interface ExpandVars extends DateRoles {
  py: string[]
}

export interface ResolvedEntry {
  path: string
  optional: boolean
  copyFrom?: string
}

export interface SchemaRule {
  name: string
  match: RegExp
  schema: ZodType
}

export type Validation =
  | { kind: 'ok'; schema: string }
  | { kind: 'invalid'; schema: string; detail: string }
  | { kind: 'notjson'; detail: string }
  | { kind: 'unvalidated' }

export interface FetchedObject {
  status: number
  contentType: string
  body: Uint8Array
}
export type FetchFn = (url: string) => Promise<FetchedObject>

export interface RefreshReport {
  ok: boolean
  date: string
  written: number
  bytes: number
  failures: string[]
  unvalidated: string[]
}

export function parseManifest(_json: unknown): Manifest {
  throw new Error('not implemented')
}

export function dateRoles(_latest: string, _dates: string[]): DateRoles {
  throw new Error('not implemented')
}

export function programYearsFrom(
  _metadata: unknown,
  _count?: number
): string[] {
  throw new Error('not implemented')
}

export function expandManifest(
  _manifest: Manifest,
  _vars: ExpandVars
): ResolvedEntry[] {
  throw new Error('not implemented')
}

export function uncoveredPaths(
  _recorded: string[],
  _resolved: ResolvedEntry[]
): string[] {
  throw new Error('not implemented')
}

export const SCHEMA_RULES: SchemaRule[] = []

export function validateObject(
  _path: string,
  _body: Uint8Array,
  _rules?: SchemaRule[]
): Validation {
  throw new Error('not implemented')
}

export async function refreshFixtures(_options: {
  manifest: Manifest
  outDir: string
  fetchFn: FetchFn
  rules?: SchemaRule[]
  readLocal?: (relativePath: string) => Uint8Array
}): Promise<RefreshReport> {
  throw new Error('not implemented')
}

export function formatReport(_report: RefreshReport): string {
  throw new Error('not implemented')
}
