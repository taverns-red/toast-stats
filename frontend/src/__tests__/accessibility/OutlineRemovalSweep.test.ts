/**
 * A removed focus outline (WCAG 2.4.7 / 1.4.11) needs a ring in a colour that
 * remaps in dark mode: `ring-focus-ring` in the same TSX class string, or a
 * `var(--focus-ring)` outline/box-shadow in the same CSS rule or its
 * `:focus-visible` rule. `ring-tm-loyal-blue` is #004165 in both themes, so it
 * vanishes on dark surfaces. Other removals go on ALLOW with a reason.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')

function walk(dir: string, keep: (p: string) => boolean): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      return name === '__tests__' || name === 'node_modules'
        ? []
        : walk(p, keep)
    }
    return keep(p) ? [p] : []
  })
}

const rel = (p: string) => relative(srcDir, p).split('\\').join('/')
const lineOf = (text: string, index: number) =>
  text.slice(0, index).split('\n').length

/* ---------- TSX ---------- */

const REMOVAL_CLASS = /(?<![\w-])(?:[\w-]+:)*outline-(?:none|hidden|0)(?![\w-])/
const RING_WIDTH =
  /(?<![\w-])focus(?:-visible|-within)?:ring(?:-[1-9]\d*)?(?![\w-])/
const RING_THEMED =
  /(?<![\w-])focus(?:-visible|-within)?:ring-focus-ring(?![\w-])/

function tsxOffenders(): string[] {
  const files = walk(srcDir, p => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))
  const out: string[] = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
      const lit = m[0]
      if (!REMOVAL_CLASS.test(lit)) continue
      if (RING_WIDTH.test(lit) && RING_THEMED.test(lit)) continue
      out.push(`${rel(file)}:${lineOf(src, m.index!)}`)
    }
  }
  return out
}

/* ---------- CSS ---------- */

const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))

const REMOVAL_DECL =
  /(?:^|[;{\s])outline(?:-style)?\s*:\s*(?:none|0)\s*(?:!important\s*)?(?:;|$)|outline-width\s*:\s*0/
const VISIBLE_DECL =
  /outline\s*:\s*[1-9]\d*px\s+solid\s+var\(--focus-ring\)|box-shadow\s*:[^;]*var\(--focus-ring\)/

interface Rule {
  selectors: string[]
  body: string
  line: number
}

function splitSelectors(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1]!.trim()
    if (head.startsWith('@')) continue
    rules.push({
      selectors: splitSelectors(head),
      body: m[2]!,
      line: lineOf(css, m.index! + m[0].indexOf(head)),
    })
  }
  return rules
}

const cssFiles = walk(srcDir, p => p.endsWith('.css'))
const parsed = new Map(
  cssFiles.map(f => [
    rel(f),
    parseRules(stripComments(readFileSync(f, 'utf8'))),
  ])
)

interface Allowed {
  file: string
  selector: string
  reason: string
  /** The rule that draws the ring instead, when there is one. */
  replacement?: { file: string; selector: string }
}

const ALLOW: Allowed[] = [
  {
    file: 'styles/components/app-shell.css',
    selector: '.header-search__input',
    reason:
      'The input sits inside a borderless field; the field wrapper draws the ring on :focus-within (REF-40).',
    replacement: {
      file: 'styles/components/app-shell.css',
      selector: '.header-search__field:focus-within',
    },
  },
  {
    file: 'styles/components/app-shell.css',
    selector: '.command-palette__input',
    reason:
      'Same pattern as the header search: the input row draws the ring on :focus-within.',
    replacement: {
      file: 'styles/components/app-shell.css',
      selector: '.command-palette__input-row:focus-within',
    },
  },
  {
    file: 'styles/components/app-shell.css',
    selector: '.error-page__heading:focus',
    reason:
      'A tabindex=-1 heading focused on mount so screen readers announce the error; not a control, never reached by Tab.',
  },
  {
    file: 'styles/components/consent.css',
    selector: '.consent-banner__title:focus',
    reason:
      'A tabindex=-1 heading focused when the banner opens; not a control, never reached by Tab.',
  },
  {
    file: 'styles/components/app-shell.css',
    selector: '.app-shell__main:focus-visible',
    reason:
      'The skip-link target (tabindex=-1). An outline round the whole page body is noise, not a focus cue; the next Tab lands on a control with its own ring. e2e/focus-visible.smoke.ts checks the skip link still moves focus here.',
  },
]

const key = (file: string, selector: string) => `${file} ${selector}`

function hasVisibleFocusVisibleRule(file: string, base: string): boolean {
  return (parsed.get(file) ?? []).some(
    r =>
      VISIBLE_DECL.test(r.body) &&
      r.selectors.some(s => s.startsWith(`${base}:focus-visible`))
  )
}

function cssRemovals(): { at: string; file: string; selector: string }[] {
  const out: { at: string; file: string; selector: string }[] = []
  for (const [file, rules] of parsed) {
    for (const r of rules) {
      if (!REMOVAL_DECL.test(r.body)) continue
      for (const s of r.selectors) {
        if (s.includes(':not(:focus-visible)')) continue
        if (s.includes(':hover') && !s.includes(':focus')) continue
        if (VISIBLE_DECL.test(r.body)) continue
        const base = s.replace(/:focus(?:-visible|-within)?/g, '').trim()
        if (hasVisibleFocusVisibleRule(file, base)) continue
        out.push({ at: `${file}:${r.line} ${s}`, file, selector: s })
      }
    }
  }
  return out
}

describe('outline removal sweep (#2667)', () => {
  it('every TSX outline-none / outline-hidden has a themed focus ring in the same class string', () => {
    const bad = tsxOffenders()
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('every CSS outline: none has a visible --focus-ring replacement or a reasoned allow-list entry', () => {
    const allowed = new Set(ALLOW.map(a => key(a.file, a.selector)))
    const bad = cssRemovals()
      .filter(r => !allowed.has(key(r.file, r.selector)))
      .map(r => r.at)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('no allow-list entry is stale, and each named replacement draws a visible ring', () => {
    const live = new Set(cssRemovals().map(r => key(r.file, r.selector)))
    const problems: string[] = []
    for (const a of ALLOW) {
      if (!a.reason.trim()) problems.push(`${a.selector}: no reason`)
      if (!live.has(key(a.file, a.selector))) {
        problems.push(`${a.file} ${a.selector}: no longer removes an outline`)
      }
      if (a.replacement) {
        const ok = (parsed.get(a.replacement.file) ?? []).some(
          r =>
            r.selectors.includes(a.replacement!.selector) &&
            /outline\s*:\s*[1-9]\d*px\s+solid\s+var\(--focus-ring\)|box-shadow\s*:[^;]*var\(--focus-ring\)/.test(
              r.body
            )
        )
        if (!ok) {
          problems.push(
            `${a.replacement.file} ${a.replacement.selector}: missing or not drawn in var(--focus-ring)`
          )
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('the base layer default ring is --focus-ring with a 2px offset', () => {
    const base = parsed.get('styles/layers/base.css') ?? []
    const rule = base.find(r => r.selectors.includes(':focus-visible'))
    expect(rule, ':focus-visible rule missing from base layer').toBeDefined()
    expect(rule!.body).toMatch(/outline\s*:\s*2px solid var\(--focus-ring\)/)
    expect(rule!.body).toMatch(/outline-offset\s*:\s*2px/)
  })

  it('the how-to video frame shows focus when its player is focused (REF-19)', () => {
    const rules = parsed.get('styles/components/videos.css') ?? []
    const ok = rules.some(
      r =>
        r.selectors.includes('.videos-page__frame:focus-within') &&
        VISIBLE_DECL.test(r.body)
    )
    expect(ok).toBe(true)
  })
})
