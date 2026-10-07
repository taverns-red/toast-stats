#!/usr/bin/env npx ts-node
/**
 * One-Time Historical Rescrape (#205)
 *
 * Downloads month-specific CSVs from the Toastmasters dashboard using the
 * 4-segment URL format: reportType~districtId~monthEndDate~closingDate~programYear
 *
 * Reads (dataMonth, closingDate) pairs from docs/month-end-closing-dates.json.
 * For each closed month, downloads district summary + per-district CSVs and
 * saves them to the local raw-csv cache for subsequent rebuild.
 *
 * Usage:
 *   npx ts-node scripts/rescrape-historical.ts --dry-run
 *   npx ts-node scripts/rescrape-historical.ts --execute
 *   npx ts-node scripts/rescrape-historical.ts --execute --year 2025-2026
 *   npx ts-node scripts/rescrape-historical.ts --execute --from-month 2025-07
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  HttpCsvDownloader,
  buildExportUrl,
  type BackfillDateSpec,
  type ReportType,
} from '../packages/collector-cli/src/services/HttpCsvDownloader.js'
import { calculateProgramYear } from '../packages/collector-cli/src/utils/CachePaths.js'
import { validateCsvBody } from '../packages/collector-cli/src/utils/csvBodyGuard.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClosingDateEntry {
  dataMonth: string // "YYYY-MM"
  closingDate: string // "YYYY-MM-DD"
}

interface ClosingDatesFile {
  months: ClosingDateEntry[]
}

interface Args {
  cacheDir: string
  dryRun: boolean
  ratePerSecond: number
  filterYear: string | null
  fromMonth: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DISTRICT_REPORT_TYPES: ReportType[] = [
  'clubperformance',
  'divisionperformance',
  'districtperformance',
]

const CLOSING_DATES_PATH = path.resolve(
  process.cwd(),
  'docs/month-end-closing-dates.json'
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let cacheDir = path.resolve(process.cwd(), 'cache')
  let dryRun = true
  let ratePerSecond = 2
  let filterYear: string | null = null
  let fromMonth: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--execute') dryRun = false
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--cache-dir' && argv[i + 1]) cacheDir = argv[++i]!
    else if (arg === '--rate' && argv[i + 1])
      ratePerSecond = parseFloat(argv[++i]!)
    else if (arg === '--year' && argv[i + 1]) filterYear = argv[++i]!
    else if (arg === '--from-month' && argv[i + 1]) fromMonth = argv[++i]!
  }

  return { cacheDir, dryRun, ratePerSecond, filterYear, fromMonth }
}

/**
 * Compute the last day of a given YYYY-MM month.
 * e.g., "2025-08" → Date(2025, 8, 0) = Aug 31, 2025
 */
function lastDayOfMonth(dataMonth: string): Date {
  const [yearStr, monthStr] = dataMonth.split('-')
  const year = parseInt(yearStr!, 10)
  const month = parseInt(monthStr!, 10)
  // Day 0 of the next month = last day of this month
  return new Date(year, month, 0)
}

/**
 * Convert YYYY-MM-DD string to Date object.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Build the raw-csv directory path for a given closing date and optional district.
 */
function buildCacheDir(
  cacheDir: string,
  closingDate: string,
  districtId?: string
): string {
  const parts = [cacheDir, 'raw-csv', closingDate]
  if (districtId) parts.push(`district-${districtId}`)
  return path.join(...parts)
}

/**
 * Map report type to CSV filename.
 */
function reportToCsvFilename(reportType: ReportType): string {
  const map: Record<ReportType, string> = {
    clubperformance: 'club-performance.csv',
    divisionperformance: 'division-performance.csv',
    districtperformance: 'district-performance.csv',
    districtsummary: 'all-districts.csv',
  }
  return map[reportType]
}

// ── Core Logic ────────────────────────────────────────────────────────────────

async function downloadAndSaveCSV(
  downloader: HttpCsvDownloader,
  spec: BackfillDateSpec,
  outputPath: string,
  dryRun: boolean
): Promise<{ downloaded: boolean; bytes: number; rejected?: string }> {
  if (dryRun) {
    const url = buildExportUrl(spec)
    console.log(`  [dry-run] ${url}`)
    console.log(`            → ${outputPath}`)
    return { downloaded: false, bytes: 0 }
  }

  // Skip if a usable file already exists. Size alone is not usability: TI's
  // HTML error page is 8 KB (#1671), so an existing body must also be a CSV.
  try {
    const stat = await fs.stat(outputPath)
    if (
      stat.size > 500 &&
      validateCsvBody(await fs.readFile(outputPath, 'utf-8'), spec.reportType)
        .ok
    ) {
      return { downloaded: false, bytes: 0 }
    }
  } catch {
    // File doesn't exist — proceed with download
  }

  const result = await downloader.downloadCsv(spec)

  // A 200 is not proof of a CSV (#1671). Never write TI's HTML error page to
  // raw-csv; remove a stale copy so transform sees an explicit gap instead.
  const body = validateCsvBody(result.content, spec.reportType)
  if (!body.ok) {
    await fs.rm(outputPath, { force: true })
    return { downloaded: false, bytes: 0, rejected: body.reason }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, result.content, 'utf-8')
  return { downloaded: true, bytes: result.byteSize }
}

async function writeMetadata(
  cacheDir: string,
  closingDate: string,
  dataMonth: string,
  programYear: string,
  districtIds: string[],
  dryRun: boolean
): Promise<void> {
  const metaPath = path.join(cacheDir, 'raw-csv', closingDate, 'metadata.json')

  if (dryRun) {
    console.log(`  [dry-run] Would write metadata to ${metaPath}`)
    return
  }

  const metadata = {
    date: closingDate,
    programYear,
    source: 'rescrape-historical',
    cacheVersion: 1,
    isClosingPeriod: true,
    dataMonth,
    collectedAt: new Date().toISOString(),
    csvFiles: {
      allDistricts: true,
      districts: Object.fromEntries(
        districtIds.map(id => [
          id,
          {
            clubPerformance: true,
            divisionPerformance: true,
            districtPerformance: true,
          },
        ])
      ),
    },
  }

  await fs.mkdir(path.dirname(metaPath), { recursive: true })
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { cacheDir, dryRun, ratePerSecond, filterYear, fromMonth } = parseArgs()

  // 1. Read closing dates
  const raw = await fs.readFile(CLOSING_DATES_PATH, 'utf-8')
  const data = JSON.parse(raw) as ClosingDatesFile

  // 2. Filter entries
  let entries = data.months.slice()
  if (filterYear) {
    entries = entries.filter(e => {
      // Derive program year from dataMonth, NOT closingDate.
      // June's closing date (7/20) falls in July → wrong program year.
      const py = calculateProgramYear(e.dataMonth + '-01')
      return py === filterYear
    })
  }
  if (fromMonth) {
    entries = entries.filter(e => e.dataMonth >= fromMonth)
  }

  console.log('='.repeat(72))
  console.log(
    dryRun
      ? 'Historical Rescrape [DRY RUN — no downloads]'
      : '⚠️  Historical Rescrape [EXECUTE — downloading from dashboard]'
  )
  console.log('='.repeat(72))
  console.log(`Closing dates file: ${CLOSING_DATES_PATH}`)
  console.log(`Cache dir:          ${cacheDir}`)
  console.log(`Entries:            ${entries.length} months`)
  console.log(`Rate:               ${ratePerSecond} req/s`)
  if (filterYear) console.log(`Filter year:        ${filterYear}`)
  if (fromMonth) console.log(`From month:         ${fromMonth}`)
  console.log()

  // 3. Initialize downloader
  const downloader = new HttpCsvDownloader({
    ratePerSecond,
    cooldownEvery: 50,
    cooldownMs: 3000,
  })

  let totalDownloaded = 0
  let totalSkipped = 0
  let totalErrors = 0
  // Bodies refused as not-a-CSV (#1671). Reported separately from fetch
  // errors: TI serves its HTML error page for some reports permanently (e.g.
  // district U club-performance for 2019-06), so they must be visible in the
  // summary without failing every run that covers that month.
  let totalRejected = 0
  let totalBytes = 0

  for (const entry of entries) {
    const { dataMonth, closingDate } = entry
    const monthEndDate = lastDayOfMonth(dataMonth)
    const closingDateObj = parseDate(closingDate)
    // Derive program year from dataMonth, NOT closingDate.
    // June's closing date (7/20) falls in July → wrong program year.
    const programYear = calculateProgramYear(dataMonth + '-01')

    console.log(
      `\n── ${dataMonth} (closing: ${closingDate}, program year: ${programYear}) ──`
    )

    // 3a. Download district summary
    const summarySpec: BackfillDateSpec = {
      programYear,
      reportType: 'districtsummary',
      date: closingDateObj,
      monthEndDate,
    }
    const summaryPath = path.join(
      buildCacheDir(cacheDir, closingDate),
      'all-districts.csv'
    )

    try {
      const summaryResult = await downloadAndSaveCSV(
        downloader,
        summarySpec,
        summaryPath,
        dryRun
      )
      if (summaryResult.rejected) {
        // Without a summary there is no district list for this month.
        console.error(
          `  ✗ Rejected: districtsummary is not a CSV — ${summaryResult.rejected}`
        )
        totalRejected++
        continue
      } else if (summaryResult.downloaded) {
        totalDownloaded++
        totalBytes += summaryResult.bytes
      } else if (!dryRun) {
        totalSkipped++
      }
    } catch (err) {
      console.error(
        `  ✗ Failed: districtsummary — ${err instanceof Error ? err.message : String(err)}`
      )
      totalErrors++
      continue // Can't discover districts if summary fails
    }

    // 3b. Parse districts from summary
    let districtIds: string[]
    if (dryRun) {
      districtIds = ['(dry-run)']
      console.log('  [dry-run] Would parse district IDs from summary')
    } else {
      const summaryContent = await fs.readFile(summaryPath, 'utf-8')
      districtIds = downloader.parseDistrictsFromSummary(summaryContent)
      console.log(
        `  Found ${districtIds.length} districts: ${districtIds.slice(0, 8).join(', ')}${districtIds.length > 8 ? '...' : ''}`
      )
    }

    // 3c. Download per-district CSVs
    if (!dryRun) {
      for (const districtId of districtIds) {
        for (const reportType of DISTRICT_REPORT_TYPES) {
          const spec: BackfillDateSpec = {
            programYear,
            reportType,
            districtId,
            date: closingDateObj,
            monthEndDate,
          }
          const csvPath = path.join(
            buildCacheDir(cacheDir, closingDate, districtId),
            reportToCsvFilename(reportType)
          )

          try {
            const result = await downloadAndSaveCSV(
              downloader,
              spec,
              csvPath,
              dryRun
            )
            if (result.rejected) {
              console.error(
                `  ✗ Rejected: ${reportType} district=${districtId} is not a CSV — ${result.rejected}`
              )
              totalRejected++
            } else if (result.downloaded) {
              totalDownloaded++
              totalBytes += result.bytes
            } else {
              totalSkipped++
            }
          } catch (err) {
            console.error(
              `  ✗ Failed: ${reportType} district=${districtId} — ${err instanceof Error ? err.message : String(err)}`
            )
            totalErrors++
          }
        }
      }
    }

    // 3d. Write metadata
    await writeMetadata(
      cacheDir,
      closingDate,
      dataMonth,
      programYear,
      districtIds,
      dryRun
    )

    if (!dryRun) {
      console.log(
        `  ✓ downloaded=${totalDownloaded} skipped=${totalSkipped} errors=${totalErrors} rejected=${totalRejected}`
      )
    }
  }

  console.log()
  console.log('='.repeat(72))
  console.log(`Rescrape complete`)
  console.log(`  Months:      ${entries.length}`)
  console.log(
    `  Downloaded:  ${totalDownloaded} CSVs (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`
  )
  console.log(`  Skipped:     ${totalSkipped}`)
  console.log(`  Errors:      ${totalErrors}`)
  console.log(
    `  Rejected:    ${totalRejected} (not a CSV, not written — #1671)`
  )
  console.log(`  Requests:    ${downloader.getRequestCount()}`)

  if (totalRejected > 0) {
    console.error(
      `\n⚠ ${totalRejected} responses were not CSVs (TI error pages) and were not written. Transform reports each as a gap.`
    )
  }

  if (totalErrors > 0) {
    console.error(
      `\n⚠ ${totalErrors} errors occurred. Check output above for details.`
    )
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
