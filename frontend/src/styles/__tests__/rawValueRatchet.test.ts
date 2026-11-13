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
 * comments stripped (the tsx* names cover .ts and .tsx):
 *   - tsxHex   hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa), including
 *              Tailwind arbitrary values such as `bg-[#123456]`
 *   - tsxRgba  rgb() / rgba() values
 *   - tsxGray  `gray-NNN`, `slate-NNN`, `zinc-NNN`, `neutral-NNN` classes
 *   - cssHex   hex colours in .css
 *
 * The baseline lives in rawValueRatchet.baseline.json. When a count drops
 * (good), the test passes and says so: lower the baseline with
 *   UPDATE_RAW_VALUE_BASELINE=1 npx vitest --run src/styles/__tests__/rawValueRatchet.test.ts
 * from frontend/. That only ever lowers a count; raising one means hand-editing
 * the JSON, which a reviewer will see. Use a token instead.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')
const baselinePath = join(here, 'rawValueRatchet.baseline.json')

type Counts = {
  tsxHex: number
  tsxRgba: number
  tsxGray: number
  cssHex: number
}

/** In code a colour starts a string, an argument, a value or a Tailwind
    arbitrary value (`bg-[#123456]`): preceded by a quote, backtick, `(`, `,`,
    `:` or `[`, never by whitespace, so "see #2651" in JSX text is not a colour.
    CSS values follow whitespace too (`color: #fff`). Neither matches `a#b` or
    `&#x27;`. */
const HEX_BODY = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])'
const HEX_CODE = new RegExp(`(?<=^|['"\`(,:\\[])${HEX_BODY}`, 'gm')
const HEX_CSS = new RegExp(`(?<=^|[\\s'"\`(,:\\[])${HEX_BODY}`, 'gm')
const RGBA = /\brgba?\(/g
const GRAY = /\b(?:gray|slate|zinc|neutral)-\d{2,3}\b/g

/** Only the brand token files may hold raw values; no other directory that
    happens to be called "tokens". */
const TOKENS_DIR = 'styles/tokens/'

/** `rel` is relative to src with forward slashes. */
const isScanned = (rel: string) =>
  /\.(css|tsx?)$/.test(rel) &&
  !/\.(test|spec)\.tsx?$/.test(rel) &&
  !rel.endsWith('.d.ts') &&
  !rel.startsWith(TOKENS_DIR)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (isScanned(relative(srcDir, p).split(sep).join('/'))) {
      out.push(p)
    }
  }
  return out
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1')

const count = (src: string, re: RegExp) => src.match(re)?.length ?? 0

type Kind = 'code' | 'css'
const countHex = (src: string, kind: Kind) =>
  count(src, kind === 'css' ? HEX_CSS : HEX_CODE)
const countGray = (src: string) => count(src, GRAY)

/** The update path may only lower a count. Raising a baseline is a
    hand-edit of the JSON, which a reviewer sees in the diff. */
const nextBaseline = (current: Counts, baseline: Counts): Counts => ({
  tsxHex: Math.min(current.tsxHex, baseline.tsxHex),
  tsxRgba: Math.min(current.tsxRgba, baseline.tsxRgba),
  tsxGray: Math.min(current.tsxGray, baseline.tsxGray),
  cssHex: Math.min(current.cssHex, baseline.cssHex),
})

function measure(): Counts {
  const totals: Counts = { tsxHex: 0, tsxRgba: 0, tsxGray: 0, cssHex: 0 }
  for (const file of walk(srcDir)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    if (file.endsWith('.css')) {
      totals.cssHex += countHex(src, 'css')
    } else {
      totals.tsxHex += countHex(src, 'code')
      totals.tsxRgba += count(src, RGBA)
      totals.tsxGray += countGray(src)
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
    writeFileSync(
      baselinePath,
      JSON.stringify(nextBaseline(current, readBaseline()), null, 2) + '\n'
    )
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
    expect(countHex(`<div style={{ color: '#a1b2c3' }} />`, 'code')).toBe(1)
    expect(countHex(`color: #fff;`, 'css')).toBe(1)
    expect(countHex(`<a href="#main">`, 'code')).toBe(0)
    expect(countHex(`&#x27;`, 'code')).toBe(0)
    expect(count(`fill: rgba(0, 0, 0, .1)`, RGBA)).toBe(1)
    expect(countGray(`className="text-gray-500 bg-gray-100"`)).toBe(2)
    expect(countGray(`className="text-ink-2"`)).toBe(0)
  })

  it('counts Tailwind arbitrary values and ignores issue numbers in text', () => {
    expect(countHex(`<i className="bg-[#123456]" />`, 'code')).toBe(1)
    expect(countHex(`<p>see #2651 and #304 for why</p>`, 'code')).toBe(0)
    expect(countHex(`color: #fff;`, 'css')).toBe(1)
  })

  it('counts slate, zinc and neutral like gray, and scans .ts but not tokens', () => {
    expect(countGray(`text-slate-500 bg-zinc-100 border-neutral-200`)).toBe(3)
    expect(isScanned('services/palette.ts')).toBe(true)
    expect(isScanned('styles/tokens/rt-brand-v1.css')).toBe(false)
    expect(isScanned('components/tokens/Swatch.tsx')).toBe(true)
    expect(isScanned('components/Foo.test.ts')).toBe(false)
  })

  it('the update path never raises a baseline', () => {
    const baseline = { tsxHex: 5, tsxRgba: 0, tsxGray: 10, cssHex: 3 }
    const current = { tsxHex: 9, tsxRgba: 0, tsxGray: 4, cssHex: 3 }
    expect(nextBaseline(current, baseline)).toEqual({
      tsxHex: 5,
      tsxRgba: 0,
      tsxGray: 4,
      cssHex: 3,
    })
  })
})
