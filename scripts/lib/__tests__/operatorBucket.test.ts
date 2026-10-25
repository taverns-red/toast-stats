/**
 * Operator scripts must not default to the prod bucket (#2286, from the
 * #1767 audit). Run by hand with no arguments, they used to read and write
 * gs://toast-stats-data-ca, outside the gated promoter. Now a script that
 * writes refuses to run without an explicit bucket, a read-only one
 * defaults to staging, and naming prod needs --allow-prod.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  resolveOperatorBucket,
  PRODUCTION_BUCKET,
  ALLOW_PROD_FLAG,
} from '../operatorBucket.js'

const STAGING = 'toast-stats-data-staging'

describe('resolveOperatorBucket (#2286)', () => {
  it('refuses a writing script with no bucket', () => {
    expect(() =>
      resolveOperatorBucket({ argv: ['--execute'], env: {}, writes: true })
    ).toThrow(/--bucket/)
  })

  it('defaults a read-only script to staging', () => {
    expect(resolveOperatorBucket({ argv: [], env: {}, writes: false })).toEqual(
      { bucket: STAGING, allowProd: false }
    )
  })

  it('takes --bucket over GCS_BUCKET', () => {
    expect(
      resolveOperatorBucket({
        argv: ['--bucket', STAGING],
        env: { GCS_BUCKET: 'other-bucket' },
        writes: true,
      }).bucket
    ).toBe(STAGING)
    expect(
      resolveOperatorBucket({
        argv: [],
        env: { GCS_BUCKET: STAGING },
        writes: true,
      }).bucket
    ).toBe(STAGING)
  })

  it('refuses prod without --allow-prod, from the flag or the env', () => {
    for (const writes of [true, false]) {
      for (const input of [
        { argv: ['--bucket', PRODUCTION_BUCKET], env: {} },
        { argv: ['--bucket', `gs://${PRODUCTION_BUCKET}/`], env: {} },
        { argv: [], env: { GCS_BUCKET: PRODUCTION_BUCKET } },
        {
          argv: ['--bucket', 'renamed-prod'],
          env: { GCS_BUCKET_PRODUCTION: 'renamed-prod' },
        },
      ]) {
        expect(
          () => resolveOperatorBucket({ ...input, writes }),
          JSON.stringify(input)
        ).toThrow(new RegExp(ALLOW_PROD_FLAG))
      }
    }
  })

  it('accepts prod with --allow-prod', () => {
    expect(
      resolveOperatorBucket({
        argv: ['--bucket', PRODUCTION_BUCKET, ALLOW_PROD_FLAG],
        env: {},
        writes: true,
      })
    ).toEqual({ bucket: PRODUCTION_BUCKET, allowProd: true })
  })
})

describe('operator scripts resolve their bucket through it (#2286)', () => {
  const read = (f: string) =>
    fs.readFileSync(path.resolve(process.cwd(), 'scripts', f), 'utf-8')

  const SCRIPTS: Record<string, boolean> = {
    'prune-daily-snapshots.ts': true,
    'prune-month-end-pipeline.ts': true,
    'generate-month-end-snapshots.ts': true,
    'backfill-raw-csv-for-dates.ts': true,
    'find-month-end-dates.ts': false,
  }

  it('no top-level script defaults a bucket to prod', () => {
    const offenders = fs
      .readdirSync(path.resolve(process.cwd(), 'scripts'))
      .filter(f => /\.(ts|mjs|js)$/.test(f))
      .filter(f => /\?\?\s*['"]toast-stats-data-ca['"]/.test(read(f)))
    expect(offenders).toEqual([])
  })

  for (const [script, writes] of Object.entries(SCRIPTS)) {
    it(`${script} calls resolveOperatorBucket with writes: ${writes}`, () => {
      expect(read(script)).toMatch(
        new RegExp(`resolveOperatorBucket\\([\\s\\S]*?writes: ${writes}`)
      )
    })
  }

  it('the orchestrator forwards --allow-prod to every child script', () => {
    const src = read('prune-month-end-pipeline.ts')
    const children = src.match(/npx ts-node scripts\/[\w-]+\.ts/g) ?? []
    expect(children.length).toBe(3)
    expect(src.match(/bucketFlag\(/g)?.length).toBe(3)
    expect(src).toMatch(/function bucketFlag\([\s\S]*?--allow-prod/)
  })

  it('generate-month-end-snapshots hands collector-cli its bucket', () => {
    // collector-cli upload defaults GCS_BUCKET to prod, so an unset shell
    // env would upload to prod whatever --bucket said.
    expect(read('generate-month-end-snapshots.ts')).toMatch(
      /env: \{ \.\.\.process\.env, CACHE_DIR: cacheDir, GCS_BUCKET: bucket \}/
    )
  })
})
