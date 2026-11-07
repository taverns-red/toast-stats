/**
 * The "RED TAVERNS" Underground-style roundel is retired (#2507,
 * taverns-red/ops#267). Every icon is now the plain RT red pennant from the
 * brand set at https://taverns.red/brand/icons/.
 *
 * File names don't identify the mark (favicon.ico was the roundel and is now
 * the pennant), so the guard compares content hashes against every roundel
 * build this repo ever shipped, and scans the shell and source for the name.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'

const FRONTEND = resolve(__dirname, '../../..')
const PUBLIC = resolve(FRONTEND, 'public')
const SRC = resolve(FRONTEND, 'src')

/** sha256 of each roundel asset in git history. */
const RETIRED_ROUNDEL_SHA256: Record<string, string> = {
  '2143e123d2f645da498636c25b7520ebb967485f7490039a213838d045682e80':
    'favicon.ico, 410 KB (6c8250482)',
  '50fbafe907613c56b37f14145efe25d0f53f155fb9b71590f97c8035dfcfb11c':
    'favicon.ico, 16/32/48 px (#1906)',
  baf3f20aaf034f8442441b8461540edcd7eac88b0bf72eb19a426c148de36708:
    'apple-touch-icon.png, 180 px (#1906)',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const sha256 = (p: string) =>
  createHash('sha256').update(readFileSync(p)).digest('hex')

describe('retired RED TAVERNS roundel (#2507)', () => {
  it('no file in frontend/public is a roundel build', () => {
    const hits = walk(PUBLIC)
      .filter(p => sha256(p) in RETIRED_ROUNDEL_SHA256)
      .map(
        p => `${relative(FRONTEND, p)} = ${RETIRED_ROUNDEL_SHA256[sha256(p)]}`
      )
    expect(hits).toEqual([])
  })

  it('index.html and src/ do not name the roundel', () => {
    const self = resolve(__filename)
    const files = [resolve(FRONTEND, 'index.html'), ...walk(SRC)].filter(
      p => p !== self && /\.(html|tsx?|css)$/.test(p)
    )
    const hits = files
      .filter(p => /roundel/i.test(readFileSync(p, 'utf-8')))
      .map(p => relative(FRONTEND, p))
    expect(hits).toEqual([])
  })
})
