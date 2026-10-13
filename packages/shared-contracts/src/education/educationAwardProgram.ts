/**
 * Which education program an award code belongs to (#1802, Ron 2026-10-11).
 *
 * Every ledger award counts in totals; charts stack Legacy and Pathways, and
 * the level × path matrix shows Pathways only. So the tag must be decided per
 * code, and a code nobody has mapped must stay visible as `Other` rather than
 * be folded into either program by guesswork.
 *
 * - `Pathways`: a level award — a two- or three-capital path + level 1–5
 *   (`PM1`, `BT1`…; `CES1` "CS: Entertaining + Storytelling Level 1",
 *   recorded in the D49 daily feed 2026-10-12, #1801).
 * - `DTM`: Distinguished Toastmaster exists in both eras; it is counted once
 *   under its own code.
 * - `Legacy`: the pre-Pathways communication and leadership tracks, as
 *   recorded in TI's archive for 2003-04 → 2018-19.
 * - `Other`: anything else, e.g. `PWMENTORPGM` (Pathways Mentor Program, not
 *   a level), or the blank code TI renders for a pending award.
 *
 * Takes the bare code (`CC`, not `CCCompetent Communicator`): the collector
 * splits it from the award cell's markup.
 */

export type EducationAwardProgram = 'Pathways' | 'Legacy' | 'DTM' | 'Other'

const PATHWAYS_LEVEL = /^([A-Z]{2,3})([1-5])$/

/** Legacy codes seen in the archive (recorded D61 2003-04, 2009-10, 2018-19). */
const LEGACY_CODES: ReadonlySet<string> = new Set([
  // Communication track
  'CC',
  'ACB',
  'ACS',
  'ACG',
  'CTM',
  'ATM',
  'ATMB',
  'ATMS',
  'ATMG',
  // Leadership track
  'CL',
  'AL',
  'ALB',
  'ALS',
  'LDREXC',
])

export function educationAwardProgram(
  awardCode: string
): EducationAwardProgram {
  if (PATHWAYS_LEVEL.test(awardCode)) return 'Pathways'
  if (awardCode === 'DTM') return 'DTM'
  if (LEGACY_CODES.has(awardCode)) return 'Legacy'
  return 'Other'
}

/**
 * A Pathways level code's path and level (`PM1` → `{ path: 'PM', level: 1 }`);
 * `null` for anything that is not a Pathways level. The level × path matrix
 * (#1801, #1793) is keyed by these.
 */
export function pathwaysLevel(
  awardCode: string
): { path: string; level: 1 | 2 | 3 | 4 | 5 } | null {
  const m = PATHWAYS_LEVEL.exec(awardCode)
  if (!m) return null
  return { path: m[1] as string, level: Number(m[2]) as 1 | 2 | 3 | 4 | 5 }
}

/** Legacy codes, longest first, so `ALB` wins over `AL` and `ATMB` over `ATM`. */
const LEGACY_BY_LENGTH = [...LEGACY_CODES].sort((a, b) => b.length - a.length)

/** A title starts with a capital followed by a lower-case letter. */
const TITLE_START = /^[A-Z][a-z]/

/**
 * The bare award code from the award as TI renders it — the code immediately
 * followed by its title (`CCCompetent Communicator` → `CC`) (#1801).
 *
 * The ledger history carries `awardCode`, split by the collector from the
 * cell markup; the reports dataset carries only this string. Both must be
 * tagged by one rule, so the split is proven against every recorded ledger
 * (award, awardCode) pair. In order:
 * 1. a Pathways level: two or three capitals + a level digit (`PM1`, `CES1`);
 * 2. `DTM`;
 * 3. the longest legacy code followed by a title (`ALB` + `Advanced…`);
 * 4. otherwise the leading run of capitals and digits that ends where a
 *    title begins (`PWMENTORPGM` + `Pathways…`);
 * 5. `''` when the string carries no code (a pending award): Other.
 */
export function awardCodeFromAward(award: string): string {
  const text = award.trim()
  const pathways = /^([A-Z]{2,3}[1-5])(?![0-9])/.exec(text)
  if (pathways) return pathways[1] as string
  if (text.startsWith('DTM') && TITLE_START.test(text.slice(3))) return 'DTM'
  for (const code of LEGACY_BY_LENGTH) {
    if (text.startsWith(code) && TITLE_START.test(text.slice(code.length))) {
      return code
    }
  }
  const other = /^([A-Z0-9]+)(?=[A-Z][a-z])/.exec(text)
  return other ? (other[1] as string) : ''
}
