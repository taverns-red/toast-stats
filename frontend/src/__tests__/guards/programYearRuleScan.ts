/**
 * Program-year rule-signal scanner (#1400).
 *
 * Finds the places where source code says "this program year is different" —
 * the raw material for the rule-change log's drift guard
 * (`programYearRuleChangeLog.test.ts`). Pure string in, signals out, so the
 * detection rules can be tested against synthetic sources rather than only
 * against a repo snapshot that would drift with the thing it guards.
 *
 * A signal is a line that BOTH:
 *   1. names a program year — as a literal (`2026-2027`, `2026-27`) or as a
 *      comparison against a start year (`startYear >= 2026`), and
 *   2. sits within a few lines of rule-change language ("new for", "retired",
 *      "prerequisite", "ruleset", "onward", …).
 *
 * Condition 2 is what keeps the guard usable. Program years appear in hundreds
 * of incidental places — cache paths, `@param` examples, file names — and a
 * census that flags all of them is noise an author learns to silence. Both
 * halves are deliberately loose: a real rule branch essentially always either
 * compares a year or explains itself in a comment.
 */

/** `2026-2027` or `2026-27`, but never an ISO date (`2026-08`). */
const PROGRAM_YEAR_LITERAL = /\b(20\d{2})-(\d{2}|20\d{2})\b/g

/** `startYear >= 2026`, `programYearStart < 2022`, … */
const YEAR_COMPARISON =
  /\w*(?:year|Year|YEAR)\w*\s*(?:>=|<=|>|<|===|!==|==)\s*(20\d{2})\b/g

/** Vocabulary a rule change is described in. */
const RULE_LANGUAGE =
  /\b(new for|new tier|newly|starting in|starts in|onward|onwards|no longer|retired|renamed|introduc\w*|prerequisite\w*|required|requirement\w*|rule\w*|era|from PY|as of PY|changed|change[ds]?|deprecat\w*|added|dropped|alternative|only from|first published)/i

/** How many lines either side of the year count as "explains itself". */
export const CONTEXT_LINES = 3

/** One rule-shaped mention of a program year. */
export interface ProgramYearSignal {
  /** 1-based line number. */
  line: number
  /** The line's trimmed text. */
  text: string
  /** Normalised program years named on that line, e.g. `['2026-2027']`. */
  programYears: string[]
}

/**
 * Normalise a program year to `YYYY-YYYY`, or null when the two halves are not
 * consecutive years — which is how ISO dates (`2026-08-01`) and version-ish
 * pairs are excluded without a date parser.
 */
export const normaliseProgramYear = (
  startYear: string,
  endYear: string
): string | null => {
  const start = Number.parseInt(startYear, 10)
  const end =
    endYear.length === 2
      ? 2000 + Number.parseInt(endYear, 10)
      : Number.parseInt(endYear, 10)
  return end === start + 1 ? `${start}-${start + 1}` : null
}

/** Scan one source file's text for rule-shaped program-year mentions. */
export const scanProgramYearSignals = (source: string): ProgramYearSignal[] => {
  const lines = source.split('\n')
  const signals: ProgramYearSignal[] = []

  lines.forEach((line, index) => {
    const years = new Set<string>()

    for (const match of line.matchAll(PROGRAM_YEAR_LITERAL)) {
      const year = normaliseProgramYear(match[1]!, match[2]!)
      if (year) years.add(year)
    }
    for (const match of line.matchAll(YEAR_COMPARISON)) {
      const start = Number.parseInt(match[1]!, 10)
      years.add(`${start}-${start + 1}`)
    }
    if (years.size === 0) return

    const context = lines
      .slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1)
      .join('\n')
    if (!RULE_LANGUAGE.test(context)) return

    signals.push({
      line: index + 1,
      text: line.trim(),
      programYears: [...years].sort(),
    })
  })

  return signals
}

/** Every program year named by a file's signals. */
export const programYearsIn = (
  signals: ProgramYearSignal[]
): ReadonlySet<string> => new Set(signals.flatMap(s => s.programYears))
