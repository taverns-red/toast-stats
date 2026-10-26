/**
 * Video publish destination guard (#2310).
 *
 * Reviewed how-to renders are published to `videos/` on the data buckets,
 * which `cdn.taverns.red` (prod) and `cdn-staging.taverns.red` (staging)
 * already serve. Two properties keep that safe:
 *
 * 1. The publish destination can only be a versioned object under
 *    `videos/`: never a data prefix, never a traversal or a wildcard.
 * 2. The data pipeline's promotion, content gates, prune and lifecycle
 *    rules never reach `videos/`. They are allow-lists today; these tests
 *    pin that, so widening one of them to cover `videos/` fails here.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DATA_PREFIXES,
  VIDEO_CACHE_CONTROL,
  VIDEO_CONTENT_TYPE,
  VIDEO_FORMATS,
  VIDEO_PREFIX,
  assertVideoDestination,
  planVideoPublish,
  videoObjectPath,
} from '../videoPublish.js'
import {
  MANIFEST_GATED_PREFIXES,
  PROMOTED_PREFIXES,
  planManifestChecks,
} from '../promotionContentGate.js'
import { classifyPromotionPath } from '../manifestPromotion.js'
import {
  PRUNE_DELETABLE_LAYERS,
  PRUNE_RETAINED_LAYERS,
  assertPruneDeletionScope,
} from '../pruneGcsDeletions.js'
import { RUNS_PREFIX, expiredRunPrefixes } from '../runManifest.js'

const overlaps = (a: string, b: string) => a.startsWith(b) || b.startsWith(a)

describe('videoObjectPath (#2310)', () => {
  it('builds the immutable versioned path', () => {
    expect(videoObjectPath('v2', '2026-10-26', 'desktop')).toBe(
      'videos/v2/2026-10-26/v2-desktop.mp4'
    )
    expect(videoObjectPath('v2', 'r1', 'mobile')).toBe(
      'videos/v2/r1/v2-mobile.mp4'
    )
  })

  it('rejects scenario ids that are not plain lowercase slugs', () => {
    for (const bad of ['', 'V2', '../v1', 'v2/x', 'v 2', 'v2*', '-v2', '.']) {
      expect(() => videoObjectPath(bad, 'r1', 'desktop'), bad).toThrow(
        /scenario/
      )
    }
  })

  it('rejects version labels that could escape or wildcard the path', () => {
    for (const bad of [
      '',
      '..',
      '.',
      'a/b',
      '../snapshots',
      'r1/../../v1',
      'R1',
      'r1*',
      'r1?',
      'r[1]',
      '-r1',
      'r1.',
      'r1..2',
      'x'.repeat(41),
    ]) {
      expect(() => videoObjectPath('v2', bad, 'desktop'), bad).toThrow(
        /version/
      )
    }
  })

  it('accepts only the desktop and mobile formats', () => {
    expect(VIDEO_FORMATS).toEqual(['desktop', 'mobile'])
    expect(() =>
      videoObjectPath('v2', 'r1', 'tablet' as unknown as 'desktop')
    ).toThrow(/format/)
  })
})

describe('assertVideoDestination (#2310)', () => {
  it('accepts a versioned video object', () => {
    expect(() =>
      assertVideoDestination('videos/v2/2026-10-26/v2-desktop.mp4')
    ).not.toThrow()
  })

  it('refuses every data prefix the pipeline owns', () => {
    for (const prefix of DATA_PREFIXES) {
      const p = `${prefix}v2/r1/v2-desktop.mp4`
      expect(() => assertVideoDestination(p), p).toThrow()
    }
  })

  it('refuses anything that is not exactly videos/<id>/<version>/<id>-<format>.mp4', () => {
    for (const bad of [
      '',
      'videos/',
      'videos/v2/r1/',
      'videos/v2/r1/v2-desktop.mp4/',
      'videos/v2/r1/v3-desktop.mp4', // file scenario must match the folder
      'videos/v2/r1/v2-tablet.mp4',
      'videos/v2/r1/v2-desktop.webm',
      'videos/v2/../snapshots/v2-desktop.mp4',
      'videos/v2/r1/../../../v1/latest.json',
      '/videos/v2/r1/v2-desktop.mp4',
      'gs://toast-stats-data-ca/videos/v2/r1/v2-desktop.mp4',
      'videos/v2/r1/v2-*.mp4',
      'videos/v2/r1/x/v2-desktop.mp4',
      'Videos/v2/r1/v2-desktop.mp4',
      'v1/videos/v2/r1/v2-desktop.mp4',
    ]) {
      expect(() => assertVideoDestination(bad), bad).toThrow(/video/)
    }
  })

  it('serves MP4 with a long immutable, no-transform cache header', () => {
    expect(VIDEO_CONTENT_TYPE).toBe('video/mp4')
    expect(VIDEO_CACHE_CONTROL).toBe(
      'public, max-age=31536000, immutable, no-transform'
    )
  })
})

describe('planVideoPublish (#2310)', () => {
  it('maps the artifact files to their CDN objects', () => {
    expect(
      planVideoPublish({
        scenario: 'v2',
        version: '2026-10-26',
        files: ['v2-mobile.mp4', 'v2-desktop.mp4'],
      })
    ).toEqual([
      {
        format: 'desktop',
        file: 'v2-desktop.mp4',
        object: 'videos/v2/2026-10-26/v2-desktop.mp4',
        url: 'https://cdn.taverns.red/videos/v2/2026-10-26/v2-desktop.mp4',
      },
      {
        format: 'mobile',
        file: 'v2-mobile.mp4',
        object: 'videos/v2/2026-10-26/v2-mobile.mp4',
        url: 'https://cdn.taverns.red/videos/v2/2026-10-26/v2-mobile.mp4',
      },
    ])
  })

  it('refuses an artifact missing a format', () => {
    expect(() =>
      planVideoPublish({
        scenario: 'v2',
        version: 'r1',
        files: ['v2-desktop.mp4'],
      })
    ).toThrow(/v2-mobile\.mp4/)
  })

  it('refuses an artifact holding anything else', () => {
    expect(() =>
      planVideoPublish({
        scenario: 'v2',
        version: 'r1',
        files: ['v2-desktop.mp4', 'v2-mobile.mp4', 'v2.mp4'],
      })
    ).toThrow(/unexpected.*v2\.mp4/)
    expect(() =>
      planVideoPublish({
        scenario: 'v2',
        version: 'r1',
        files: ['v2-desktop.mp4', 'v2-mobile.mp4', 'v3-desktop.mp4'],
      })
    ).toThrow(/unexpected/)
  })
})

describe('the data pipeline never reaches videos/ (#2310)', () => {
  it('videos/ is disjoint from every data prefix', () => {
    expect(VIDEO_PREFIX).toBe('videos/')
    for (const prefix of DATA_PREFIXES) {
      expect(overlaps(VIDEO_PREFIX, prefix), prefix).toBe(false)
    }
  })

  it('DATA_PREFIXES covers the promoted, gated, prune and run-manifest prefixes', () => {
    const required = [
      ...PROMOTED_PREFIXES,
      ...MANIFEST_GATED_PREFIXES,
      ...PRUNE_DELETABLE_LAYERS.map(l => `${l}/`),
      ...PRUNE_RETAINED_LAYERS.map(l => `${l}/`),
      RUNS_PREFIX,
      'basemap/',
    ]
    for (const p of required) expect(DATA_PREFIXES, p).toContain(p)
  })

  it('promotion classifies a video object as excluded (never copied to prod)', () => {
    expect(
      classifyPromotionPath('videos/v2/2026-10-26/v2-desktop.mp4').kind
    ).toBe('excluded')
  })

  it('the manifest content gate does not plan a check for a video object', () => {
    const plan = planManifestChecks(
      [
        {
          path: 'videos/v2/2026-10-26/v2-desktop.mp4',
          sha256: 'a'.repeat(64),
          date: null,
          stage: 'videos',
        },
      ],
      []
    )
    expect(plan.manifestCount).toBe(0)
    expect(plan.checks).toEqual([])
  })

  it('prune refuses to delete under videos/', () => {
    expect(() => assertPruneDeletionScope(['videos/v2/2026-10-26'])).toThrow(
      /scope violation/
    )
    expect(() => assertPruneDeletionScope(['videos/2026-10-26'])).toThrow(
      /scope violation/
    )
  })

  it('run-manifest retention only yields runs/<id>/ prefixes', () => {
    const listing = [
      { name: 'runs/1/written.jsonl', creation_time: '2020-01-01T00:00:00Z' },
      {
        name: 'videos/v2/r1/v2-desktop.mp4',
        creation_time: '2020-01-01T00:00:00Z',
      },
    ]
    const expired = expiredRunPrefixes(listing, Date.now())
    expect(expired).toEqual(['runs/1/'])
    for (const p of expired) {
      expect(p.startsWith(RUNS_PREFIX), p).toBe(true)
    }
  })

  it('no GCS lifecycle rule can age out videos/', () => {
    const dir = path.resolve(process.cwd(), 'infra/gcs-lifecycle')
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as {
        rule: { action: { type: string }; condition: Record<string, unknown> }[]
      }
      for (const r of doc.rule) {
        if (r.action.type !== 'Delete' && r.action.type !== 'SetStorageClass')
          continue
        // Noncurrent-version cleanup only removes overwritten bytes; the
        // publish never overwrites (--no-clobber), so it never applies.
        if (r.condition['isLive'] === false) continue
        const prefixes = (r.condition['matchesPrefix'] ?? []) as string[]
        expect(prefixes.length, `${f}: unscoped live rule`).toBeGreaterThan(0)
        for (const p of prefixes) {
          expect(overlaps(p, VIDEO_PREFIX), `${f}: ${p}`).toBe(false)
        }
      }
    }
  })

  it('data-pipeline.yml and the prune workflow never name videos/', () => {
    for (const wf of ['data-pipeline.yml', 'gap-district-prune.yml']) {
      const text = fs.readFileSync(
        path.resolve(process.cwd(), '.github/workflows', wf),
        'utf-8'
      )
      expect(text, wf).not.toMatch(/\bvideos\//)
    }
  })
})
