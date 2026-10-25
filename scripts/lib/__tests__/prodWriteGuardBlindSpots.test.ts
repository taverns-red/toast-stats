/**
 * Blind spots of the prod-write guard (#2285, from the #1767 audit).
 *
 * A canary against `prodWriteReasons` showed five shapes of prod write that
 * the guard returned `[]` for. None is in data-pipeline.yml today, but each
 * is one edit away, and the guard is what holds "one prod-write mechanism"
 * (ADR-015 step 9) and the `skip_promotion` promise (#1754). Each case here
 * must be flagged.
 */

import { describe, it, expect } from 'vitest'
import { prodWriteReasons } from '../prodWriteGuard.js'

describe('prodWriteGuard blind spots (#2285)', () => {
  it('flags gsutil writes into prod', () => {
    for (const run of [
      'gsutil cp /tmp/a.json "gs://${GCS_BUCKET_PRODUCTION}/v1/a.json"',
      'gsutil -m rsync -r ./cache gs://toast-stats-data-ca/snapshots/',
      'gsutil -m rm -r "gs://${GCS_BUCKET_PRODUCTION}/snapshots/2026-10-01/"',
      'gsutil -h "Cache-Control:no-store" cp x gs://toast-stats-data-ca/v1/x',
      'gsutil setmeta -h "Cache-Control:no-store" gs://toast-stats-data-ca/v1/x',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags gcloud held in a variable ("${GCLOUD}" storage …)', () => {
    for (const run of [
      '"${GCLOUD}" storage cp /tmp/a.json "gs://${GCS_BUCKET_PRODUCTION}/v1/a.json"',
      '$GCLOUD storage rm "gs://${GCS_BUCKET_PRODUCTION}/v1/a.json"',
      '/usr/bin/gcloud storage mv gs://a/b gs://toast-stats-data-ca/b',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags a gcloud storage write after a pipe or xargs', () => {
    for (const run of [
      'cat /tmp/paths.txt | xargs -I {} gcloud storage rm -r "gs://${GCS_BUCKET_PRODUCTION}/{}"',
      'ls /tmp/x | xargs -I {} gcloud storage cp {} gs://toast-stats-data-ca/v1/',
      'true && gcloud storage cp /tmp/a gs://toast-stats-data-ca/v1/a',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags a destination held in a variable that names prod', () => {
    for (const run of [
      'DEST="gs://${GCS_BUCKET_PRODUCTION}/v1/"\ngcloud storage cp /tmp/a.json "$DEST"',
      'export PB="${GCS_BUCKET_PRODUCTION}"\ngcloud storage cp /tmp/a "gs://${PB}/v1/a"',
      // Transitively, through a second variable.
      'PB=toast-stats-data-ca; D="gs://${PB}/v1"\ngcloud storage rm "${D}/a.json"',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags a script handed the prod bucket as an argument', () => {
    for (const run of [
      'bash scripts/foo.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}"',
      './scripts/pipeline/sync.sh gs://toast-stats-data-ca/v1/',
      'npx tsx scripts/copy-things.ts --bucket "${GCS_BUCKET_PRODUCTION}"',
      'PB="${GCS_BUCKET_PRODUCTION}"\nnode scripts/x.mjs "$PB"',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })
})
