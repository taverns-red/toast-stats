/**
 * D3 text sizes (#2725; Ron 2026-11-12): prose 16px, data 14px, nothing under
 * 12px at any width, table headers 14px sentence case.
 *
 * Source scans, because jsdom has no layout engine (lesson 075). They cover
 * every stylesheet and component under src/, so a new sub-12px rule or an
 * uppercase table header fails here instead of reaching review.
 *
 * Exceptions live in the two allow-lists below. Each entry needs a reason. Do
 * not add one to make a test pass; fix the size.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../..')

const MIN_PX = 12
const DATA_PX = 14

/**
 * Files exempt from the scans. Path is relative to src/.
 */
const FILE_ALLOW: Record<string, string> = {
  'styles/tokens/rt-brand-v1.css':
    'Upstream brand tokens, copy-on-release, never hand-edited. Its 11px ' +
    '--rt-text-xs is not consumed anywhere (asserted below).',
  // #2722 (M5) rewrites these tables onto the shared DataTable styles and
  // removes the uppercase/11px treatment there. Editing them here would only
  // create merge conflicts. Remove these entries once #2722 merges.
  'components/AreaPerformanceTable.tsx': 'Owned by open PR #2722 (M5).',
  'pages/DivisionPage.tsx': 'Owned by open PR #2722 (M5).',
  'pages/AreaPage.tsx': 'Owned by open PR #2722 (M5).',
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (
      exts.some(e => entry.endsWith(e)) &&
      !/\.(test|spec|stories)\./.test(entry)
    )
      out.push(full)
  }
  return out
}

const rel = (f: string) => relative(SRC, f).split('\\').join('/')
const allowed = (f: string) => rel(f) in FILE_ALLOW

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Replace every @media print { ... } block with blanks (print is exempt). */
function stripPrint(css: string): string {
  let out = ''
  let i = 0
  const re = /@media[^{]*\bprint\b[^{]*\{/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out += css.slice(i, m.index)
    let depth = 1
    let j = m.index + m[0].length
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
    re.lastIndex = j
  }
  return out + css.slice(i)
}

/** Literal length to px, or null when it is a keyword, var(), calc(), etc. */
function pxOf(value: string): number | null {
  const v = value.trim().replace(/\s*!important$/, '')
  const m = v.match(/^(\d*\.?\d+)(px|rem|em|pt)$/)
  if (!m) return null
  const n = Number(m[1])
  if (m[2] === 'px') return n
  if (m[2] === 'pt') return (n * 4) / 3
  return n * 16 // rem, and em against a 16px parent
}

interface Rule {
  selector: string
  body: string
}

function rules(css: string): Rule[] {
  const flat = stripPrint(stripComments(css))
  const out: Rule[] = []
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

const cssFiles = walk(SRC, ['.css']).filter(f => !allowed(f))
const codeFiles = walk(SRC, ['.tsx', '.ts']).filter(f => !allowed(f))

describe('D3 type floor: nothing under 12px (#2725)', () => {
  it('finds stylesheets to scan', () => {
    expect(cssFiles.length).toBeGreaterThan(20)
    expect(codeFiles.length).toBeGreaterThan(100)
  })

  it('no stylesheet declares a font-size under 12px (print excluded)', () => {
    const offenders: string[] = []
    for (const f of cssFiles)
      for (const r of rules(readFileSync(f, 'utf8')))
        for (const d of r.body.matchAll(
          /(?:^|[;\s])font-size\s*:\s*([^;]+)/g
        )) {
          const px = pxOf(d[1])
          if (px !== null && px < MIN_PX)
            offenders.push(
              `${rel(f)}: ${r.selector.slice(0, 60)} ${d[1].trim()}`
            )
        }
    expect(offenders).toEqual([])
  })

  it('no type-size custom property is under 12px, and --rt-text-xs is unused', () => {
    const offenders: string[] = []
    for (const f of cssFiles)
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(
        /(--[\w-]*(?:text|font)[\w-]*)\s*:\s*([^;]+);/g
      )) {
        const px = pxOf(m[2])
        if (px !== null && px < MIN_PX) offenders.push(`${rel(f)}: ${m[1]}`)
      }
    expect(offenders).toEqual([])
    const users = [...cssFiles, ...codeFiles].filter(f =>
      /var\(--rt-text-xs\)/.test(readFileSync(f, 'utf8'))
    )
    expect(users.map(rel)).toEqual([])
  })

  it('no component uses a Tailwind text-[Npx] class under 12px', () => {
    const offenders: string[] = []
    for (const f of codeFiles)
      for (const m of readFileSync(f, 'utf8').matchAll(
        /text-\[(\d*\.?\d+)(px|rem)\]/g
      )) {
        const px = pxOf(m[1] + m[2])
        if (px !== null && px < MIN_PX) offenders.push(`${rel(f)}: ${m[0]}`)
      }
    expect(offenders).toEqual([])
  })

  it('no component or chart sets an inline fontSize under 12px', () => {
    const offenders: string[] = []
    for (const f of codeFiles) {
      const code = readFileSync(f, 'utf8')
      for (const m of code.matchAll(
        /fontSize\s*[=:]\s*\{?\s*['"]?(\d*\.?\d+)(px)?['"]?/g
      )) {
        const px = Number(m[1])
        if (px < MIN_PX) offenders.push(`${rel(f)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('D3 tables: 14px data, 14px sentence-case headers (#2725)', () => {
  const TABLE_CELL_SELECTOR =
    /(?:^|[\s>+~,])(?:th|td)(?:[\s:,.[]|$)|thead|tbody/

  it('no stylesheet rule on a table cell or header sets a font-size under 14px', () => {
    const offenders: string[] = []
    for (const f of cssFiles)
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!TABLE_CELL_SELECTOR.test(r.selector)) continue
        for (const d of r.body.matchAll(
          /(?:^|[;\s])font-size\s*:\s*([^;]+)/g
        )) {
          const px = pxOf(d[1])
          if (px !== null && px < DATA_PX)
            offenders.push(
              `${rel(f)}: ${r.selector.slice(0, 60)} ${d[1].trim()}`
            )
        }
      }
    expect(offenders).toEqual([])
  })

  it('no stylesheet uppercases a table header', () => {
    const HEADER_SELECTOR =
      /(?:^|[\s>+~,])th(?:[\s:,.[]|$)|thead|col-header|__th\b/
    const offenders: string[] = []
    for (const f of cssFiles)
      for (const r of rules(readFileSync(f, 'utf8')))
        if (
          HEADER_SELECTOR.test(r.selector) &&
          /text-transform\s*:\s*uppercase/.test(r.body)
        )
          offenders.push(`${rel(f)}: ${r.selector.slice(0, 80)}`)
    expect(offenders).toEqual([])
  })

  it('no component uppercases a table header', () => {
    const offenders: string[] = []
    for (const f of codeFiles) {
      const code = readFileSync(f, 'utf8')
      for (const m of code.matchAll(/<(?:th|tr)\b[^>]*\buppercase\b/g))
        offenders.push(`${rel(f)}: ${m[0].slice(0, 70)}`)
      for (const m of code.matchAll(
        /const\s+(\w*(?:th|Th|[Hh]eader)\w*)\s*=\s*\n?\s*['"`][^'"`]*\buppercase\b/g
      ))
        offenders.push(`${rel(f)}: ${m[1]}`)
    }
    expect(offenders).toEqual([])
  })

  it('no component sets a table cell or header smaller than 14px with text-xs', () => {
    const offenders: string[] = []
    for (const f of codeFiles) {
      const code = readFileSync(f, 'utf8')
      for (const m of code.matchAll(/<(?:th|td)\b[^>]*\btext-xs\b/g))
        offenders.push(`${rel(f)}: ${m[0].slice(0, 70)}`)
    }
    expect(offenders).toEqual([])
  })

  it('no table header text is typed in ALL CAPS', () => {
    const offenders: string[] = []
    for (const f of codeFiles) {
      const code = readFileSync(f, 'utf8')
      for (const m of code.matchAll(
        /<th\b[^>]*>\s*([A-Z][A-Z %#/&-]{4,})\s*</g
      ))
        offenders.push(`${rel(f)}: ${m[1]}`)
    }
    expect(offenders).toEqual([])
  })
})
