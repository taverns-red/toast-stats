/**
 * The counted-education-award rule (#1592, #1599, #1976).
 *
 * A Pathways level award (a two- or three-capital path + level 1–5: `PM1`,
 * `BT1`, `CES1`) or DTM counts; anything else — e.g. `PWMENTORPGMPathways
 * Mentor Program` or `EOMOnline Meeting Mastery` — does not. TI renders the
 * award as its code immediately followed by its title.
 *
 * Shared because three sides must agree on it: collector-cli counts distinct
 * members per club over counted awards only (`DailyReportParser`), the
 * frontend counts awards per club by it (`educationAwardRankings`), and the
 * #1801 rollup tags programs by `educationAwardProgram`. So the rule is
 * defined by that one vocabulary: a new path needs no change here.
 */
import {
  awardCodeFromAward,
  educationAwardProgram,
} from './educationAwardProgram.js'

export function isCountedEducationAward(award: string): boolean {
  const program = educationAwardProgram(awardCodeFromAward(award))
  return program === 'Pathways' || program === 'DTM'
}
