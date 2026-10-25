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
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  findProdWriteSteps,
  prodWriteReasons,
  READ_ONLY_PROD_SCRIPTS,
} from '../prodWriteGuard.js'

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

  it('flags a copy into prod whose flags follow the destination', () => {
    // The shape of basemap-build.yml's prod-copy step: the last word is a
    // flag, not the destination.
    for (const run of [
      'gcloud storage cp "gs://${GCS_BUCKET}/${OBJ}" "gs://${GCS_BUCKET_PRODUCTION}/${OBJ}" \\\n  --no-clobber \\\n  --cache-control="public, max-age=86400, no-transform"',
      'gsutil cp /tmp/a gs://toast-stats-data-ca/v1/a -n',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })

  it('flags a write whose destination comes from a step or job env var', () => {
    const found = findProdWriteSteps({
      jobs: {
        pipeline: {
          env: { PB: '${{ env.GCS_BUCKET_PRODUCTION }}' },
          steps: [
            {
              name: 'Step env',
              env: { DEST: 'gs://toast-stats-data-ca/v1/' },
              run: 'gcloud storage cp /tmp/a.json "$DEST"',
            },
            { name: 'Job env', run: 'gsutil rm "gs://${PB}/v1/a.json"' },
          ],
        },
      },
    })
    expect(found.map(f => f.step)).toEqual(['Step env', 'Job env'])
  })

  it('does not flag staging writes, prod reads, or a prod value off the bucket position', () => {
    for (const run of [
      'SB="gs://${GCS_BUCKET}/v1/"\ngcloud storage cp /tmp/a.json "$SB"',
      'PROD_LATEST=$(gcloud storage cat "gs://${GCS_BUCKET_PRODUCTION}/v1/latest.json" | jq -r .d)\ngcloud storage cp /tmp/a "gs://${GCS_BUCKET}/${PROD_LATEST}/a"',
      'gsutil cp "gs://${GCS_BUCKET_PRODUCTION}/v1/dates.json" /tmp/d.json',
      'gsutil ls "gs://${GCS_BUCKET_PRODUCTION}/snapshots/" | xargs -I {} echo {}',
      'cat /tmp/p.txt | xargs -I {} gcloud storage rm "gs://${GCS_BUCKET}/{}"',
      'bash scripts/foo.sh "${GCS_BUCKET}"',
      'bash scripts/pipeline/check-report-sidecars.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}" "${D}"',
    ]) {
      expect(prodWriteReasons(run), run).toEqual([])
    }
  })

  it('allows a script the prod bucket only if the script has no storage write', () => {
    expect(Object.keys(READ_ONLY_PROD_SCRIPTS)).toEqual([
      'scripts/pipeline/check-report-sidecars.sh',
    ])
    const write =
      /\bstorage\s+(cp|rsync|mv|rm|objects\s+update)\b|\bgsutil\b|\.(?:delete|save|upload|copy|move)\(/
    for (const script of Object.keys(READ_ONLY_PROD_SCRIPTS)) {
      const text = fs.readFileSync(path.resolve(process.cwd(), script), 'utf-8')
      expect(text, script).not.toMatch(write)
    }
  })
})

describe('prodWriteGuard runs in linear time (#2285, CodeQL js/redos)', () => {
  it('handles long adversarial gsutil flag runs quickly', () => {
    for (const run of [
      'gsutil' + ' -h'.repeat(25_000),
      'gsutil -h ' + '-ab '.repeat(12_500) + 'x',
      'gsutil' + ' -m -h -o'.repeat(6_000) + ' !',
    ]) {
      const start = performance.now()
      expect(prodWriteReasons(run)).toEqual([])
      expect(performance.now() - start).toBeLessThan(2_000)
    }
  })
})

describe('gsutil word scan keeps its reach (#2285)', () => {
  it('still flags gsutil inside bash -c and after a spaced -h value', () => {
    for (const run of [
      "bash -c 'gsutil cp /tmp/a gs://toast-stats-data-ca/v1/a'",
      'gsutil -m -h "Cache-Control: no-store" cp x gs://toast-stats-data-ca/v1/x',
      '/usr/bin/gsutil rm gs://toast-stats-data-ca/v1/x',
    ]) {
      expect(prodWriteReasons(run), run).not.toEqual([])
    }
  })
})
