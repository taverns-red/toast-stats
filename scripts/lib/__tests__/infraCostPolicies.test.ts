/**
 * Shape contract for the reviewable cost policies (#2103, #2104).
 *
 * The JSON under infra/ is applied by hand, by Ron, with the commands in
 * docs/runbooks/storage-and-registry-cleanup.md. Nothing in CI applies it, so
 * this test is the only guard between a typo and a bucket or registry policy
 * that deletes the wrong thing. Field names are checked against the formats
 * that `gcloud storage buckets update --lifecycle-file` and
 * `gcloud artifacts repositories set-cleanup-policies --policy` accept
 * (cloud.google.com/storage/docs/lifecycle and
 * cloud.google.com/artifact-registry/docs/repositories/cleanup-policy).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()
const GCS_DIR = path.join(ROOT, 'infra/gcs-lifecycle')
const AR_DIR = path.join(ROOT, 'infra/artifact-registry')

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, 'utf8'))

const jsonFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort()
    : []

// --- GCS lifecycle -------------------------------------------------------

const GCS_BUCKETS = ['toast-stats-data-ca', 'toast-stats-data-staging']
const GCS_ACTIONS = [
  'Delete',
  'SetStorageClass',
  'AbortIncompleteMultipartUpload',
]
const GCS_CONDITIONS = [
  'age',
  'createdBefore',
  'customTimeBefore',
  'daysSinceCustomTime',
  'daysSinceNoncurrentTime',
  'isLive',
  'matchesStorageClass',
  'matchesPrefix',
  'matchesSuffix',
  'noncurrentTimeBefore',
  'numNewerVersions',
  'sizeAboveBytes',
  'sizeBelowBytes',
]
const MULTIPART_CONDITIONS = ['age', 'matchesPrefix', 'matchesSuffix']
// Published, user-facing data and the immutable basemap are never aged out.
const PROTECTED_PREFIXES = ['snapshots/', 'basemap/', 'config/', 'time-series/']

interface GcsRule {
  action: { type: string; storageClass?: string }
  condition: Record<string, unknown>
}

describe('GCS lifecycle files (#2103)', () => {
  it('has exactly one file per data bucket', () => {
    expect(jsonFiles(GCS_DIR)).toEqual(GCS_BUCKETS.map(b => `${b}.json`))
  })

  for (const bucket of GCS_BUCKETS) {
    describe(bucket, () => {
      const file = path.join(GCS_DIR, `${bucket}.json`)
      const doc = fs.existsSync(file)
        ? (readJson(file) as { rule?: GcsRule[] })
        : {}
      const rules = doc.rule ?? []

      it('is a {"rule": [...]} document with at least one rule', () => {
        expect(Object.keys(doc)).toEqual(['rule'])
        expect(rules.length).toBeGreaterThan(0)
      })

      it('uses only documented actions and conditions', () => {
        for (const r of rules) {
          expect(GCS_ACTIONS).toContain(r.action.type)
          expect(Object.keys(r.condition).length).toBeGreaterThan(0)
          for (const k of Object.keys(r.condition)) {
            expect(GCS_CONDITIONS).toContain(k)
          }
          if (r.action.type === 'SetStorageClass') {
            expect(typeof r.action.storageClass).toBe('string')
          }
          if (r.action.type === 'AbortIncompleteMultipartUpload') {
            for (const k of Object.keys(r.condition)) {
              expect(MULTIPART_CONDITIONS).toContain(k)
            }
          }
        }
      })

      it('never ages out a live object outside an explicit prefix', () => {
        for (const r of rules) {
          if (r.action.type !== 'Delete') continue
          if (r.condition.isLive === false) continue
          const prefixes = r.condition.matchesPrefix
          expect(Array.isArray(prefixes) && prefixes.length > 0).toBe(true)
        }
      })

      it('never targets published data or the basemap', () => {
        for (const r of rules) {
          const prefixes = (r.condition.matchesPrefix ?? []) as string[]
          for (const p of prefixes) {
            for (const guarded of PROTECTED_PREFIXES) {
              expect(p.startsWith(guarded) || guarded.startsWith(p)).toBe(false)
            }
          }
        }
      })

      it('keeps run manifests past the pipeline 90-day retention', () => {
        for (const r of rules) {
          const prefixes = (r.condition.matchesPrefix ?? []) as string[]
          if (r.action.type === 'Delete' && prefixes.includes('runs/')) {
            expect(r.condition.age as number).toBeGreaterThan(90)
          }
        }
      })
    })
  }
})

// --- Artifact Registry cleanup policies ----------------------------------

const AR_FILE_RE = /^(northamerica-northeast1|us-east1)--[a-z0-9-]+\.json$/
// API enum names, not the docs' mixed case. gcloud 583's ParseCleanupPolicy
// passes values through apitools PyValueToMessage, which matches enum names
// case-sensitively: "Delete" / "tagged" end up as unrecognized enum strings
// (checked offline against the SDK, 2026-10-16), while DELETE / TAGGED map.
const TAG_STATES = ['TAGGED', 'UNTAGGED', 'ANY']
const AR_CONDITIONS = [
  'tagState',
  'tagPrefixes',
  'versionNamePrefixes',
  'packageNamePrefixes',
  'olderThan',
  'newerThan',
]
const DURATION_RE = /^\d+d$/

interface ArPolicy {
  name: string
  action: { type: string }
  condition?: Record<string, unknown>
  mostRecentVersions?: { keepCount: number; packageNamePrefixes?: string[] }
}

describe('Artifact Registry cleanup policies (#2104)', () => {
  const files = jsonFiles(AR_DIR)

  it('has one file per repository, named <location>--<repo>.json', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f).toMatch(AR_FILE_RE)
  })

  for (const f of files) {
    describe(f, () => {
      const policies = readJson(path.join(AR_DIR, f)) as ArPolicy[]

      it('is an array of uniquely named Keep/Delete policies', () => {
        expect(Array.isArray(policies)).toBe(true)
        const names = policies.map(p => p.name)
        expect(new Set(names).size).toBe(names.length)
        for (const p of policies) {
          expect(p.name).toMatch(/^[a-z0-9-]+$/)
          expect(['KEEP', 'DELETE']).toContain(p.action.type)
        }
      })

      it('gives each policy exactly one of condition / mostRecentVersions', () => {
        for (const p of policies) {
          const hasCond = p.condition !== undefined
          const hasRecent = p.mostRecentVersions !== undefined
          expect(hasCond !== hasRecent).toBe(true)
          if (p.action.type === 'DELETE') expect(hasCond).toBe(true)
        }
      })

      it('uses only documented condition fields and values', () => {
        for (const p of policies) {
          const c = p.condition
          if (!c) continue
          expect(Object.keys(c).length).toBeGreaterThan(0)
          for (const k of Object.keys(c)) expect(AR_CONDITIONS).toContain(k)
          if (c.tagState !== undefined) {
            expect(TAG_STATES).toContain(c.tagState)
          }
          for (const k of ['olderThan', 'newerThan']) {
            if (c[k] !== undefined) expect(c[k]).toMatch(DURATION_RE)
          }
          if (c.tagPrefixes !== undefined) {
            expect(c.tagState).toBe('TAGGED')
          }
        }
      })

      it('keeps the most recent versions and anything tagged deployed-', () => {
        const recent = policies.find(
          p => p.action.type === 'KEEP' && p.mostRecentVersions
        )
        expect(recent?.mostRecentVersions?.keepCount).toBeGreaterThanOrEqual(1)
        const deployed = policies.find(
          p =>
            p.action.type === 'KEEP' &&
            (p.condition?.tagPrefixes as string[] | undefined)?.includes(
              'deployed-'
            )
        )
        expect(deployed).toBeDefined()
      })

      it('deletes untagged versions only after 7 days', () => {
        const untagged = policies.find(
          p =>
            p.action.type === 'DELETE' && p.condition?.tagState === 'UNTAGGED'
        )
        expect(untagged?.condition?.olderThan).toBe('7d')
      })

      it('never deletes anything younger than 7 days', () => {
        for (const p of policies) {
          if (p.action.type !== 'DELETE') continue
          const older = String(p.condition?.olderThan ?? '0d')
          expect(parseInt(older, 10)).toBeGreaterThanOrEqual(7)
        }
      })
    })
  }
})
