/* Rule-change log drift guard (#1400).

   ── THE DECISION ────────────────────────────────────────────────────────────
   A hand-written rule log is wrong within two program years. #1400 named three
   options; this is option 2, TEST it, and here is why the other two lost.

   (1) GENERATE it — have the year-conditional helpers carry the prose the page
       renders. Rejected as too invasive for the current shape, and incomplete
       even if done: the year-conditional logic is not one mechanism. It is a
       ruleset dispatcher in analytics-core, a `?? true` back-compat default
       for CSP spread across ~11 files in three packages, a first-match-wins
       column alias list, and a set of optional CSV columns. There is no single
       helper to hang a description on, and inventing one would mean routing
       reader-facing prose through the analytics engine — every future rule
       change would then have to touch analytics-core to fix a typo on a docs
       page. It also would not have caught the changes that predate the
       helper: the 2018-19 and 2022-23 eras carry no callable surface at all.

   (2) TEST it — this file. The log declares which files implement each change;
       the guard scans the codebase for rule-shaped program-year signals and
       fails when either a file or a program year appears that no entry claims
       and no acknowledgement excuses. Two failure modes are covered:
         - a rule branch lands in a file the log never heard of, and
         - a NEW program year appears inside a file the log already claims
           (the likely case — `if (startYear >= 2027)` in the dispatcher).
       Cost: an acknowledgement list that an unrelated PR can trip. That is
       the point; the acknowledgement is one line and forces a decision.

   (3) ACCEPT the drift. Rejected: the log's only value is being true, and the
       #1399 post-mortem is exactly this failure mode one layer down — a check
       that samples one thing while vouching for thirteen.

   The scanner's own detection rules are proven against synthetic sources in
   programYearRuleScan.test.ts; this file is the census over the real tree. */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, relative, resolve } from 'path'
import { scanProgramYearSignals, programYearsIn } from './programYearRuleScan'
import { PROGRAM_YEAR_RULE_CHANGES } from '../../content/programYearRuleChanges'

// frontend/src/__tests__/guards → repo root
const REPO_ROOT = resolve(__dirname, '../../../..')

const SCANNED_ROOTS = [
  'packages/analytics-core/src',
  'packages/collector-cli/src',
  'packages/shared-contracts/src',
  'frontend/src',
]

const SKIPPED_DIRS = /^(__tests__|__fixtures__|__mocks__|node_modules|dist)$/

/**
 * Files that name a program year in rule-shaped language but do NOT encode a
 * recognition-rule change. Each needs a reason; keep the list short — a long
 * one means the scanner's rule vocabulary needs narrowing, not more excuses.
 */
const ACKNOWLEDGED_SITES: Record<string, string> = {
  'frontend/src/pages/MethodologyPage.tsx':
    'the page that renders the log — it quotes the rules it links to',
  'frontend/src/content/programYearRuleChanges.ts': 'the log itself',
  'frontend/src/utils/methodologyUrl.ts':
    'the deep-link codec — it quotes an entry anchor (`#py-2026-2027-…`) as a doc example',
  'packages/collector-cli/src/cli.ts':
    'a `--program-years` CLI help example; arg parsing, not a rule',
  'frontend/src/hooks/useTimeSeries.ts':
    'a `@param … e.g. "2021-2022"` doc example next to unrelated prose',
  'packages/collector-cli/src/services/TimeSeriesIndexWriter.ts':
    'program-year ↔ date arithmetic and file naming; no rule differs by year',
  'packages/shared-contracts/src/types/time-series.ts':
    'a storage-path example in a type comment',
  'packages/collector-cli/src/utils/districtSetForDate.ts':
    'names the PY 2026-27 district renumbering as the DATA defect it guards against (#1465); no recognition rule differs by year here',
}

/**
 * Program years that appear inside claimed files without being a change
 * boundary of their own. Anything not listed here must be covered by an entry.
 */
const ACKNOWLEDGED_YEARS: Record<string, string> = {
  '2016-2017':
    'District Recognition era predating the earliest snapshot Toast Stats stores (PY 2019-20); no displayed year is measured by it',
  '2017-2018': 'closing endpoint of the 2016-17 era range, not a boundary',
  '2021-2022': 'closing endpoint of the 2018-19 era range, not a boundary',
  '2024-2025': 'closing endpoint of the 2022-23 era range, not a boundary',
}

const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (SKIPPED_DIRS.test(entry)) continue
      out.push(...walk(path))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

/** repo-relative path → the rule-shaped program-year signals it carries. */
const scanRepo = () => {
  const found = new Map<string, ReturnType<typeof scanProgramYearSignals>>()
  for (const root of SCANNED_ROOTS) {
    for (const absolute of walk(join(REPO_ROOT, root))) {
      const signals = scanProgramYearSignals(readFileSync(absolute, 'utf-8'))
      if (signals.length > 0) {
        found.set(relative(REPO_ROOT, absolute), signals)
      }
    }
  }
  return found
}

const CLAIMED_FILES = new Set(PROGRAM_YEAR_RULE_CHANGES.flatMap(c => c.sources))
const LOGGED_YEARS = new Set(PROGRAM_YEAR_RULE_CHANGES.map(c => c.programYear))
const SIGNALS = scanRepo()

describe('program-year rule-change log — drift guard (#1400)', () => {
  it('finds rule-shaped program-year logic to guard (the scan is wired up)', () => {
    expect(SIGNALS.size).toBeGreaterThan(10)
  })

  it('every file with year-conditional rule logic is claimed or acknowledged', () => {
    const unclaimed = [...SIGNALS.entries()]
      .filter(
        ([file]) => !CLAIMED_FILES.has(file) && !(file in ACKNOWLEDGED_SITES)
      )
      .map(([file, signals]) => `${file}:${signals[0]!.line}`)

    expect(
      unclaimed,
      'These files talk about a program-year rule but no rule-change log entry ' +
        'claims them. Add the file to the `sources` of the entry it implements ' +
        'in frontend/src/content/programYearRuleChanges.ts — or, if it is not a ' +
        'rule change, to ACKNOWLEDGED_SITES with a reason.'
    ).toEqual([])
  })

  it('every program year named in a claimed file has a log entry', () => {
    const uncovered = new Set<string>()
    for (const [file, signals] of SIGNALS) {
      if (!CLAIMED_FILES.has(file)) continue
      for (const year of programYearsIn(signals)) {
        if (!LOGGED_YEARS.has(year) && !(year in ACKNOWLEDGED_YEARS)) {
          uncovered.add(`${year} (${file})`)
        }
      }
    }

    expect(
      [...uncovered].sort(),
      'A rule-bearing file names a program year the log does not cover — the ' +
        'shape of a new year-conditional branch. Add an entry for that year to ' +
        'frontend/src/content/programYearRuleChanges.ts (or ACKNOWLEDGED_YEARS ' +
        'with a reason, if the year is only a range endpoint).'
    ).toEqual([])
  })

  it('every claimed source path exists (the log cannot rot silently)', () => {
    const missing = [...CLAIMED_FILES].filter(
      file => !existsSync(join(REPO_ROOT, file))
    )
    expect(missing).toEqual([])
  })

  it('every acknowledgement is still needed (no stale excuses)', () => {
    const stale = Object.keys(ACKNOWLEDGED_SITES).filter(
      file => !SIGNALS.has(file)
    )
    expect(
      stale,
      'These files no longer carry a program-year rule signal — drop them from ' +
        'ACKNOWLEDGED_SITES so the list stays a decision record, not residue.'
    ).toEqual([])
  })
})
