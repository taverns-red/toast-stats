/**
 * scripts/lib/cdnCompression.ts — is a CDN JSON response compressed on the
 * wire, and does it decode to exactly one layer of JSON? (#1852)
 *
 * The recorded fixtures are real prod responses (see the fixture's
 * `_captured`). The edge-compressed case cannot be recorded until Cloud CDN
 * dynamic compression is switched on; it is built from the recorded identity
 * response plus the documented headers, and the live check is what confirms
 * it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  classifyCdnResponse,
  decodeCdnBody,
  type CdnResponse,
} from '../cdnCompression.js'

const fixtures = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/cdn-headers/prod-2026-10-12.json'),
    'utf-8'
  )
) as Record<'identityLarge' | 'identitySmall' | 'storedGzip', CdnResponse>

/** The recorded identity response as Cloud CDN would serve it compressed. */
function edgeCompressed(encoding: string, wireBytes: number): CdnResponse {
  const r = structuredClone(fixtures.identityLarge)
  r.headers['content-encoding'] = encoding
  r.headers['content-length'] = String(wireBytes)
  r.headers['vary'] = 'Origin, Accept-Encoding'
  r.wireBytes = wireBytes
  return r
}

describe('classifyCdnResponse (#1852)', () => {
  it('today: the 485 KB index served identity is a FAIL naming the backend bucket switch', () => {
    const v = classifyCdnResponse(fixtures.identityLarge)
    expect(v.ok).toBe(false)
    expect(v.kind).toBe('uncompressed')
    expect(v.detail).toMatch(/compression-mode/)
  })

  it('the same object compressed at the edge (br or gzip) passes', () => {
    for (const enc of ['br', 'gzip']) {
      const v = classifyCdnResponse(edgeCompressed(enc, 4100))
      expect(v, enc).toMatchObject({ ok: true, kind: 'edge-compressed' })
    }
  })

  it('a response under the CDN 1 KiB floor passes uncompressed (v1/latest.json)', () => {
    expect(classifyCdnResponse(fixtures.identitySmall)).toMatchObject({
      ok: true,
      kind: 'below-threshold',
    })
  })

  it('an object stored gzip (snapshots/, time-series/ via -Z) passes as served pre-encoded', () => {
    expect(classifyCdnResponse(fixtures.storedGzip)).toMatchObject({
      ok: true,
      kind: 'stored-gzip',
    })
  })

  it('a stored-gzip object served WITHOUT Content-Encoding fails (transcoded or mislabelled)', () => {
    const r = structuredClone(fixtures.storedGzip)
    delete r.headers['content-encoding']
    expect(classifyCdnResponse(r)).toMatchObject({ ok: false })
  })

  it('an identity object whose Cache-Control has no-transform fails and says why', () => {
    const r = structuredClone(fixtures.identityLarge)
    r.headers['cache-control'] = 'public,max-age=300,no-transform'
    const v = classifyCdnResponse(r)
    expect(v.ok).toBe(false)
    expect(v.detail).toMatch(/no-transform/)
  })

  it('an object over the CDN 10 MiB ceiling fails: dynamic compression will never cover it', () => {
    const r = structuredClone(fixtures.identityLarge)
    r.headers['x-goog-stored-content-length'] = String(11 * 1024 * 1024)
    expect(classifyCdnResponse(r)).toMatchObject({
      ok: false,
      kind: 'too-large',
    })
  })

  it('a non-200 fails', () => {
    const r = structuredClone(fixtures.identityLarge)
    r.status = 404
    expect(classifyCdnResponse(r)).toMatchObject({
      ok: false,
      kind: 'http-error',
    })
  })

  it('an unexpected encoding fails', () => {
    expect(classifyCdnResponse(edgeCompressed('deflate', 4000))).toMatchObject({
      ok: false,
      kind: 'bad-encoding',
    })
  })
})

describe('decodeCdnBody (#1852): what the browser gets after one decode', () => {
  const json = Buffer.from('{"districts":{"61":["2026-10-11"]}}')

  it('decodes br, gzip and identity to the same JSON', () => {
    expect(decodeCdnBody(zlib.brotliCompressSync(json), 'br')).toEqual(json)
    expect(decodeCdnBody(zlib.gzipSync(json), 'gzip')).toEqual(json)
    expect(decodeCdnBody(json, undefined)).toEqual(json)
  })

  it('refuses a second gzip layer (the #1702 double-encode)', () => {
    expect(() =>
      decodeCdnBody(zlib.gzipSync(zlib.gzipSync(json)), 'gzip')
    ).toThrow(/gzip/)
  })

  it('refuses gzip bytes served as identity', () => {
    expect(() => decodeCdnBody(zlib.gzipSync(json), undefined)).toThrow(/gzip/)
  })

  it('refuses bytes that do not parse as JSON', () => {
    expect(() => decodeCdnBody(Buffer.from('{"a":'), 'identity')).toThrow(
      /JSON/
    )
  })
})
