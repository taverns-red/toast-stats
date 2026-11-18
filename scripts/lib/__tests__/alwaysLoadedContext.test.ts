/**
 * The always-loaded context stays short (#2950).
 *
 * Ron replaced "write a lesson per task" with "Recurrence prevented": a test,
 * hook, guard, checklist item or short rule. `CLAUDE.md` and `tasks/rules.md`
 * are what every session reads, so they are held to a size cap here. The
 * lesson corpus is reference-only, under `tasks/lessons/archive/`, and is
 * never loaded by default.
 *
 * This is the guard for the "Recurrence prevented" item: if someone grows the
 * rule set past the cap, or moves a lesson back into the loaded path, this
 * test fails.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()
const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8')

const MAX_ACTIVE_RULES = 20

const ruleHeadings = (text: string): RegExpMatchArray[] => [
  ...text.matchAll(/^\*\*R(\d+)\b[\s:.—–-]*(.*?)\*\*/gm),
]
const activeRuleHeadings = (text: string): RegExpMatchArray[] =>
  ruleHeadings(text).filter(m => !/^Retired/i.test(m[2]))

describe('tasks/rules.md is a short rule set (#2950)', () => {
  const rules = read('tasks/rules.md')
  const heads = ruleHeadings(rules)

  it('lists rules by number', () => {
    expect(heads.length).toBeGreaterThan(0)
  })

  it(`has at most ${MAX_ACTIVE_RULES} active rules`, () => {
    const active = activeRuleHeadings(rules)
    expect(active.length).toBeLessThanOrEqual(MAX_ACTIVE_RULES)
  })

  it('counts a rule heading however it is punctuated', () => {
    const sample = [
      '**R25: A colon heading**',
      '**R26 - A hyphen heading**',
      '**R27 — Retired, see archive.**',
      '**R28 — A normal heading**',
    ].join('\n')
    const active = activeRuleHeadings(sample)
    expect(active.map(m => m[1])).toEqual(['25', '26', '28'])
  })

  it('keeps R5 as a retired stub so old citations still resolve', () => {
    const r5 = heads.find(m => m[1] === '5')
    expect(r5).toBeDefined()
    expect(r5![2]).toMatch(/^Retired/i)
  })
})

describe('lessons are archived, not loaded (#2950)', () => {
  it('has no lesson files outside tasks/lessons/archive/', () => {
    const lessonsDir = path.join(ROOT, 'tasks/lessons')
    const entries = fs.existsSync(lessonsDir) ? fs.readdirSync(lessonsDir) : []
    expect(entries.filter(e => e !== 'archive')).toEqual([])
  })

  it('keeps the old lessons.md log in the archive too', () => {
    expect(fs.existsSync(path.join(ROOT, 'tasks/lessons.md'))).toBe(false)
    expect(
      fs.existsSync(path.join(ROOT, 'tasks/lessons/archive/lessons.md'))
    ).toBe(true)
  })
})

describe('CLAUDE.md matches the recurrence-prevented model (#2950)', () => {
  const claude = read('CLAUDE.md')

  it('no longer tells sessions to read the last 5 lessons', () => {
    expect(claude).not.toMatch(/last 5 entries/i)
    expect(claude).not.toMatch(/\*\*R5\*\*/)
  })

  it('asks for "Recurrence prevented" in the Definition of Done', () => {
    expect(claude).toMatch(/Recurrence prevented/)
  })

  it('does not point at the retired lesson tooling', () => {
    expect(claude).not.toMatch(/relevant-lessons/)
    expect(claude).not.toMatch(/lessons:index/)
  })

  it('every tasks/ link in CLAUDE.md resolves to a file', () => {
    const links = [...claude.matchAll(/\]\((tasks\/[^)#\s]+)\)/g)].map(
      m => m[1]
    )
    const missing = links.filter(l => !fs.existsSync(path.join(ROOT, l)))
    expect(missing).toEqual([])
  })
})
