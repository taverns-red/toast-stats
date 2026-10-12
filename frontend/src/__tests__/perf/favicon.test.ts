/**
 * Favicon weight (#1906, mobile epic #1827).
 *
 * `/favicon.ico` was 410,598 B (8 frames up to 256×256, uncompressed BMP),
 * 64 KB on the wire after Firebase compression. Chrome fetches it during the
 * first screen, so Lighthouse charged it to the pre-LCP window. A tab icon
 * needs 16/32/48 px; larger sizes belong in a PNG touch icon that the browser
 * only fetches when it is actually used (home-screen bookmark).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

const FRONTEND = resolve(__dirname, '../../..')
const PUBLIC = resolve(FRONTEND, 'public')
const html = readFileSync(resolve(FRONTEND, 'index.html'), 'utf-8')

interface IcoFrame {
  width: number
  height: number
  bytes: number
}

function icoFrames(buf: Buffer): IcoFrame[] {
  expect(buf.readUInt16LE(0)).toBe(0) // reserved
  expect(buf.readUInt16LE(2)).toBe(1) // type 1 = icon
  const count = buf.readUInt16LE(4)
  const frames: IcoFrame[] = []
  for (let i = 0; i < count; i++) {
    const o = 6 + 16 * i
    frames.push({
      width: buf.readUInt8(o) || 256,
      height: buf.readUInt8(o + 1) || 256,
      bytes: buf.readUInt32LE(o + 8),
    })
  }
  return frames
}

function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('favicon asset set (#1906)', () => {
  it('favicon.ico is at most 10 KB (it was 410 KB)', () => {
    expect(statSync(resolve(PUBLIC, 'favicon.ico')).size).toBeLessThanOrEqual(
      10 * 1024
    )
  })

  it('favicon.ico carries only tab-icon sizes: 16, 32 and 48 px', () => {
    const frames = icoFrames(readFileSync(resolve(PUBLIC, 'favicon.ico')))
    expect(frames.map(f => `${f.width}x${f.height}`).sort()).toEqual([
      '16x16',
      '32x32',
      '48x48',
    ])
  })

  it('ships a 180×180 apple-touch-icon PNG for home-screen bookmarks', () => {
    const buf = readFileSync(resolve(PUBLIC, 'apple-touch-icon.png'))
    expect(pngSize(buf)).toEqual({ width: 180, height: 180 })
    expect(buf.length).toBeLessThanOrEqual(30 * 1024)
  })

  it('index.html links the icon set', () => {
    expect(html).toMatch(/<link\b[^>]*rel="icon"[^>]*href="\/favicon\.ico"/)
    expect(html).toMatch(
      /<link\b[^>]*rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/
    )
  })
})
