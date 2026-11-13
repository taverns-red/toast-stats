/**
 * Raw-value ratchet (#2651, part; review finding CHR-25).
 *
 * The UX review counted hundreds of hand-written hex colours, rgba() values and
 * Tailwind `gray-*` classes in TSX, so each page family grew its own greys and
 * dark mode needs `!important` overrides to catch them. This guard freezes the
 * count: it may fall, it may not rise. A new colour goes through a token
 * (`--ink*`, `--surface*`, `--line`, `--tm-*`), which dark mode already remaps.
 *
 * Counted, in `frontend/src`, test files and `styles/tokens/` excluded,
 * comments stripped:
 *   - tsxHex   hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa) in .tsx
 *   - tsxRgba  rgb() / rgba() values in .tsx
 *   - tsxGray  `gray-NNN` classes in .tsx
 *   - cssHex   hex colours in .css
 *
 * The baseline lives in rawValueRatchet.baseline.json. When a count drops
 * (good), the test passes and says so: lower the baseline with
 *   UPDATE_RAW_VALUE_BASELINE=1 npx vitest --run src/styles/__tests__/rawValueRatchet.test.ts
 * from frontend/. Never raise it; use a token.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')
const baselinePath = join(here, 'rawValueRatchet.baseline.json')

type Counts = {
  tsxHex: number
  tsxRgba: number
  tsxGray: number
  cssHex: number
}

/** Preceded by a quote, space, bracket, comma or colon, so `a#b` and `&#x27;`
    are not read as colours. */
const HEX =
  /(?<=^|[\s'"`(,:])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/gm
const RGBA = /\brgba?\(/g
const GRAY = /\bgray-\d{2,3}\b/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'tokens')
        continue
      walk(p, out)
    } else if (/\.(css|tsx)$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1')

const count = (src: string, re: RegExp) => src.match(re)?.length ?? 0

function measure(): Counts {
  const totals: Counts = { tsxHex: 0, tsxRgba: 0, tsxGray: 0, cssHex: 0 }
  for (const file of walk(srcDir)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    if (file.endsWith('.css')) {
      totals.cssHex += count(src, HEX)
    } else {
      totals.tsxHex += count(src, HEX)
      totals.tsxRgba += count(src, RGBA)
      totals.tsxGray += count(src, GRAY)
    }
  }
  return totals
}

function readBaseline(): Counts {
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as Counts
}

describe('raw-value ratchet (#2651)', () => {
  const current = measure()

  if (process.env.UPDATE_RAW_VALUE_BASELINE === '1') {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n')
  }

  it('finds the source tree (guards a vacuous pass)', () => {
    expect(walk(srcDir).length).toBeGreaterThan(100)
    expect(relative(srcDir, baselinePath)).toBe(
      'styles/__tests__/rawValueRatchet.baseline.json'
    )
  })

  it.each(['tsxHex', 'tsxRgba', 'tsxGray', 'cssHex'] as const)(
    '%s does not rise above the baseline',
    key => {
      const baseline = readBaseline()
      expect(
        current[key],
        `${key} rose from ${baseline[key]} to ${current[key]}. Use a token ` +
          `(--ink*, --surface*, --line, --tm-*) instead of a raw value.`
      ).toBeLessThanOrEqual(baseline[key])
      if (current[key] < baseline[key]) {
        process.stderr.write(
          `[raw-value ratchet] ${key} fell from ${baseline[key]} to ` +
            `${current[key]}. Lower the baseline: from frontend/, run ` +
            `UPDATE_RAW_VALUE_BASELINE=1 npx vitest --run ` +
            `src/styles/__tests__/rawValueRatchet.test.ts and commit it.\n`
        )
      }
    }
  )

  it('is self-testing: the scanners see a planted raw value', () => {
    expect(count(`<div style={{ color: '#a1b2c3' }} />`, HEX)).toBe(1)
    expect(count(`color: #fff;`, HEX)).toBe(1)
    expect(count(`<a href="#main">`, HEX)).toBe(0)
    expect(count(`&#x27;`, HEX)).toBe(0)
    expect(count(`fill: rgba(0, 0, 0, .1)`, RGBA)).toBe(1)
    expect(count(`className="text-gray-500 bg-gray-100"`, GRAY)).toBe(2)
    expect(count(`className="text-ink-2"`, GRAY)).toBe(0)
  })
})
