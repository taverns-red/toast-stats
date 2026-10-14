/**
 * Program-year month-ends — runner (#1766, ADR-015 P7, D-6).
 *
 * Thin glue around ./lib/programYearMonthEnds.js for the rescrape step's
 * `program_year` input. Prints, on stdout, the program year's closed
 * month-end dates, space-separated (the only stdout output, R4).
 *
 * Usage: npx tsx scripts/program-year-month-ends.ts <YYYY-YYYY>
 *          [--registry <path>]   (default: docs/month-end-closing-dates.json)
 *
 * Exit codes: 0 ok · 1 no closed month in the program year, or the registry
 * is unreadable · 2 usage or a malformed program year.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  programYearMonthEnds,
  type ClosingRegistryMonth,
} from './lib/programYearMonthEnds.js'

const DEFAULT_REGISTRY = path.resolve(
  import.meta.dirname,
  '..',
  'docs/month-end-closing-dates.json'
)

function main(argv: string[]): number {
  const [programYear, flag, value, ...rest] = argv
  if (
    !programYear ||
    rest.length > 0 ||
    (flag !== undefined && (flag !== '--registry' || value === undefined))
  ) {
    process.stderr.write(
      'Usage: program-year-month-ends.ts <YYYY-YYYY> [--registry <path>]\n'
    )
    return 2
  }
  const registryPath = value ?? DEFAULT_REGISTRY

  let months: ClosingRegistryMonth[]
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as {
      months?: unknown
    }
    if (!Array.isArray(parsed.months)) throw new Error('no months array')
    months = parsed.months as ClosingRegistryMonth[]
  } catch (err) {
    process.stderr.write(
      `program-year-month-ends: cannot read the registry ${registryPath}: ${(err as Error).message}\n`
    )
    return 1
  }

  let dates: string[]
  try {
    dates = programYearMonthEnds(programYear, months)
  } catch (err) {
    process.stderr.write(`program-year-month-ends: ${(err as Error).message}\n`)
    return 2
  }
  if (dates.length === 0) {
    process.stderr.write(
      `program-year-month-ends: no month of ${programYear} has closed in ${registryPath}\n`
    )
    return 1
  }
  process.stderr.write(
    `program-year-month-ends: ${programYear} → ${dates.length} month-ends\n`
  )
  process.stdout.write(`${dates.join(' ')}\n`)
  return 0
}

process.exit(main(process.argv.slice(2)))
