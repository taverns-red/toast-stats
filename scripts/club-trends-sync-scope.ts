/**
 * Club-trends sync scope — Runner (#1728, plan E2-2)
 *
 * Thin glue around ./lib/clubTrendsSyncScope.js. Prints, on stdout, the value
 * for sync-stores.sh's CLUB_TRENDS_PROGRAM_YEARS: space-separated PY labels,
 * or `all` when the resolver gave no usable verdict (pull the whole store).
 *
 * Usage: npx tsx scripts/club-trends-sync-scope.ts \
 *          --program-year <resolved PY|unknown> --date <YYYY-MM-DD> [--date ...]
 *
 * Exit codes: 0 ok · 2 usage or a malformed date. Logs go to stderr (R4).
 */

import { clubTrendsProgramYears } from './lib/clubTrendsSyncScope.js'

function main(argv: string[]): number {
  let programYear: string | undefined
  const dates: string[] = []
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) break
    if (flag === '--program-year') programYear = value
    else if (flag === '--date') dates.push(value)
    else {
      process.stderr.write(`club-trends-sync-scope: unknown flag ${flag}\n`)
      return 2
    }
  }
  if (argv.length % 2 !== 0 || dates.length === 0) {
    process.stderr.write(
      'Usage: club-trends-sync-scope.ts --program-year <PY> --date <YYYY-MM-DD> [--date ...]\n'
    )
    return 2
  }

  let years: string[] | null
  try {
    years = clubTrendsProgramYears(programYear, dates)
  } catch (err) {
    process.stderr.write(`club-trends-sync-scope: ${String(err)}\n`)
    return 2
  }
  if (years === null) {
    process.stderr.write(
      `club-trends-sync-scope: no usable resolved PY ('${programYear ?? ''}'); pulling the whole store\n`
    )
  }
  process.stdout.write(`${years === null ? 'all' : years.join(' ')}\n`)
  return 0
}

process.exit(main(process.argv.slice(2)))
