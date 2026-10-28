/**
 * District share cards reach prod only through the manifest promote (#2304).
 *
 * The data pipeline has ONE prod-write mechanism (#1767, #2222):
 * scripts/promote-run-manifest.ts --execute. The og-cards job records its
 * staging uploads in its own manifest (scripts/pipeline/gcs-upload.sh),
 * re-reads what staging holds, and writes a verdict that passes only when
 * prod serves the exact rankings and awards the cards were drawn from. The
 * promoter copies `og/v1/district/<id>.png` only with `--og-cards`, in its
 * own phase; from any other manifest the cards are excluded. The planner
 * and the promoter run here for real against the gcloud shim.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  classifyPromotionPath,
  planManifestPromotion,
  type PromotionInputs,
} from '../manifestPromotion.js'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'
import type { RunManifestEntry } from '../runManifest.js'
import { verifyStagedCards } from '../ogCards.js'

const REPO = process.cwd()
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const C61 = 'og/v1/district/61.png'
const C10 = 'og/v1/district/10.png'
const META = 'cache-control=public, max-age=3600\ncontent-type=image/png\n'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const entry = (p: string, body: string = p): RunManifestEntry => ({
  path: p,
  sha256: sha(body),
  date: null,
  stage: 'og-cards',
})

describe('classifyPromotionPath — og cards', () => {
  it('classifies og/v1/district/<id>.png as an og card', () => {
    expect(classifyPromotionPath(C61)).toEqual({ kind: 'og-card' })
  })

  it('refuses anything else under og/', () => {
    for (const p of [
      'og/v1/district/61.html',
      'og/v1/club/123.png',
      'og/v1/district/sub/61.png',
      'og/index.json',
    ]) {
      expect(() => classifyPromotionPath(p), p).toThrow(/og\/v1\/district/)
    }
  })
})

describe('planManifestPromotion — og cards (#2304)', () => {
  const base = (over: Partial<PromotionInputs> = {}): PromotionInputs => ({
    entries: [entry(C61), entry(C10)],
    held: { all: false, dates: [] },
    indexDates: null,
    prodDates: null,
    ...over,
  })

  it('is never promoted from another manifest (no --og-cards)', () => {
    const plan = planManifestPromotion(base())
    expect(plan.objectCount).toBe(0)
    expect(plan.excluded.map(e => e.path)).toEqual([C10, C61])
    expect(plan.excluded[0]!.reason).toMatch(/#2304/)
  })

  it('with ogCards: the cards alone, in their own phase', () => {
    const plan = planManifestPromotion(base({ ogCards: true }))
    expect(plan.batches).toEqual([
      { phase: 'og', dir: 'og/v1/district/', paths: [C10, C61] },
    ])
    expect(plan.objectCount).toBe(2)
    expect(plan.globals.paths).toEqual([])
  })

  it('no verdict (or a held one) promotes nothing', () => {
    const plan = planManifestPromotion(
      base({ ogCards: true, held: { all: true, dates: [] } })
    )
    expect(plan.objectCount).toBe(0)
    expect(plan.held.map(h => h.path)).toEqual([C10, C61])
  })
})

describe('verifyStagedCards', () => {
  const png = (tag: string) => {
    const b = Buffer.alloc(20_000)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
    b.writeUInt32BE(13, 8)
    b.write('IHDR', 12, 'ascii')
    b.writeUInt32BE(1200, 16)
    b.writeUInt32BE(630, 20)
    b.write(tag, 100, 'ascii')
    return b
  }

  it('passes when staging holds exactly the recorded bytes of every planned card', () => {
    const a = png('a')
    const b = png('b')
    const r = verifyStagedCards(
      ['10', '61'],
      [entry(C10, a.toString('latin1')), entry(C61, b.toString('latin1'))].map(
        (e, i) => ({ ...e, sha256: sha([a, b][i]!) })
      ),
      new Map([
        ['10.png', a],
        ['61.png', b],
      ])
    )
    expect(r).toEqual({ ok: true, problems: [] })
  })

  it('fails a card whose staged bytes differ from the recorded upload, or that was not recorded', () => {
    const a = png('a')
    const r = verifyStagedCards(
      ['10', '61'],
      [{ ...entry(C10), sha256: sha(png('other')) }],
      new Map([
        ['10.png', a],
        ['61.png', a],
      ])
    )
    expect(r.problems).toEqual([
      '10.png: staged bytes differ from the recorded upload',
      '61.png: not in the og-cards manifest',
    ])
  })
})

describe('promote-run-manifest --og-cards (shim)', () => {
  let tmp: string
  let root: string
  let manifest: string
  let verdict: string
  let shimLog: string

  const put = (bucket: string, rel: string, body: string, meta = '') => {
    const f = path.join(root, bucket, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const m = path.join(root, '.meta', bucket, rel)
    fs.mkdirSync(path.dirname(m), { recursive: true })
    fs.writeFileSync(m, meta)
  }
  const read = (bucket: string, rel: string) => {
    const f = path.join(root, bucket, rel)
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null
  }
  const promote = async (args = ['--execute', '--og-cards']) => {
    let err = ''
    const status = await runPromoteRunManifest(args, {
      env: {
        PATH: process.env.PATH,
        GCLOUD: SHIM,
        SHIM_ROOT: root,
        SHIM_LOG: shimLog,
        GCS_BUCKET: STG,
        GCS_BUCKET_PRODUCTION: PROD,
        RUN_MANIFEST_FILE: manifest,
        COMPLETENESS_GATE_FILE: verdict,
        GITHUB_OUTPUT: path.join(tmp, 'out'),
      },
      out: () => {},
      err: s => {
        err += s
      },
    })
    return { status, err }
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-cards-promo-'))
    root = path.join(tmp, 'gcs')
    manifest = path.join(tmp, 'og.jsonl')
    verdict = path.join(tmp, 'verdict.json')
    shimLog = path.join(tmp, 'gcloud.log')
    put(STG, C61, 'card-61', META)
    put(STG, C10, 'card-10', META)
    put(PROD, C61, 'yesterday-61', META)
    fs.writeFileSync(
      manifest,
      [entry(C61, 'card-61'), entry(C10, 'card-10')]
        .map(e => JSON.stringify(e))
        .join('\n') + '\n'
    )
  })
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('copies the cards into prod, overwriting yesterday’s, headers as staged', async () => {
    fs.writeFileSync(verdict, JSON.stringify({ promote: true }))
    const r = await promote()
    expect(r.status, r.err).toBe(0)
    expect(read(PROD, C61)).toBe('card-61')
    expect(read(PROD, C10)).toBe('card-10')
    expect(fs.readFileSync(path.join(root, '.meta', PROD, C61), 'utf-8')).toBe(
      META
    )
  })

  it('a held verdict leaves prod’s cards alone', async () => {
    fs.writeFileSync(verdict, JSON.stringify({ promote: false }))
    expect((await promote()).status).toBe(0)
    expect(read(PROD, C61)).toBe('yesterday-61')
    expect(read(PROD, C10)).toBeNull()
  })

  it('without --og-cards the same manifest copies nothing', async () => {
    fs.writeFileSync(verdict, JSON.stringify({ promote: true }))
    expect((await promote(['--execute'])).status).toBe(0)
    expect(read(PROD, C61)).toBe('yesterday-61')
    expect(read(PROD, C10)).toBeNull()
  })
})
