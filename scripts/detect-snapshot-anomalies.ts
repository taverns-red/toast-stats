#!/usr/bin/env npx ts-node
/**
 * Script to detect anomalous data changes between consecutive snapshots.
 *
 * Scans snapshot directories and identifies:
 * - Large increases followed by large decreases (spike patterns)
 * - Large decreases followed by large increases (dip patterns)
 * - Single-snapshot outliers with extreme changes
 *
 * Usage:
 *   npx ts-node scripts/detect-snapshot-anomalies.ts [cache-dir]
 *   npx ts-node scripts/detect-snapshot-anomalies.ts --threshold 20 [cache-dir]
 *   npx ts-node scripts/detect-snapshot-anomalies.ts --json [cache-dir]
 *
 * Options:
 *   --threshold N   Percentage change threshold to flag (default: 15)
 *   --json          Output results as JSON
 *   --verbose       Show all changes, not just anomalies
 */

import * as fs from 'fs'
import * as path from 'path'
import { isDistrictSnapshotFile } from './lib/snapshotFileNames.js'

// Types for snapshot data
interface DistrictStatistics {
  districtId: string
  asOfDate: string
  membership: {
    total: number
    change?: number
  }
  clubs: {
    total: number
    active: number
    distinguished: number
  }
  ranking?: {
    paidClubs: number
    totalPayments: number
    distinguishedClubs: number
  }
}

interface PerDistrictData {
  districtId: string
  status: 'success' | 'failed'
  data: DistrictStatistics
}

interface SnapshotMetadata {
  snapshotId: string
  createdAt: string
  status: 'success' | 'partial' | 'failed'
  dataAsOfDate: string
}

interface SnapshotSummary {
  snapshotId: string
  date: string
  totalMembership: number
  totalClubs: number
  activeClubs: number
  distinguishedClubs: number
  totalPayments: number
  districtCount: number
}

interface DataChange {
  metric: string
  previousValue: number
  currentValue: number
  absoluteChange: number
  percentChange: number
}

interface Anomaly {
  type: 'spike' | 'dip' | 'large_increase' | 'large_decrease'
  metric: string
  snapshots: string[]
  values: number[]
  percentChanges: number[]
  description: string
}

interface ScanResult {
  snapshotsScanned: number
  anomaliesFound: number
  snapshots: SnapshotSummary[]
  changes: Array<{
    from: string
    to: string
    changes: DataChange[]
  }>
  anomalies: Anomaly[]
  errors: Array<{ snapshot: string; error: string }>
}

/**
 * Check if a directory name is a valid ISO date (YYYY-MM-DD)
 */
function isISODateDirectory(dirName: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dirName)
}

/**
 * Read snapshot metadata from a snapshot directory
 */
function readSnapshotMetadata(snapshotDir: string): SnapshotMetadata | null {
  const metadataPath = path.join(snapshotDir, 'metadata.json')

  if (!fs.existsSync(metadataPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(metadataPath, 'utf-8')
    return JSON.parse(content) as SnapshotMetadata
  } catch {
    return null
  }
}

/**
 * Read all district data from a snapshot directory
 */
function readSnapshotDistricts(snapshotDir: string): DistrictStatistics[] {
  const districts: DistrictStatistics[] = []

  const files = fs.readdirSync(snapshotDir)
  for (const file of files) {
    // district_<id>.json only — never the district_<id>_reports.json
    // daily-reports sidecar that shares the directory (#1428).
    if (isDistrictSnapshotFile(file)) {
      try {
        const filePath = path.join(snapshotDir, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(content) as PerDistrictData

        if (data.status === 'success' && data.data) {
          districts.push(data.data)
        }
      } catch {
        // Skip malformed files
      }
    }
  }

  return districts
}

/**
 * Aggregate district data into a snapshot summary
 */
function aggregateSnapshot(
  snapshotId: string,
  districts: DistrictStatistics[]
): SnapshotSummary {
  let totalMembership = 0
  let totalClubs = 0
  let activeClubs = 0
  let distinguishedClubs = 0
  let totalPayments = 0

  for (const district of districts) {
    totalMembership += district.membership?.total ?? 0
    totalClubs += district.clubs?.total ?? 0
    activeClubs += district.clubs?.active ?? 0
    distinguishedClubs += district.clubs?.distinguished ?? 0
    totalPayments += district.ranking?.totalPayments ?? 0
  }

  return {
    snapshotId,
    date: snapshotId,
    totalMembership,
    totalClubs,
    activeClubs,
    distinguishedClubs,
    totalPayments,
    districtCount: districts.length,
  }
}

/**
 * Calculate changes between two snapshots
 */
function calculateChanges(
  previous: SnapshotSummary,
  current: SnapshotSummary
): DataChange[] {
  const changes: DataChange[] = []

  const metrics: Array<{ key: keyof SnapshotSummary; label: string }> = [
    { key: 'totalMembership', label: 'Total Membership' },
    { key: 'totalClubs', label: 'Total Clubs' },
    { key: 'activeClubs', label: 'Active Clubs' },
    { key: 'distinguishedClubs', label: 'Distinguished Clubs' },
    { key: 'totalPayments', label: 'Total Payments' },
    { key: 'districtCount', label: 'District Count' },
  ]

  for (const { key, label } of metrics) {
    const prevValue = previous[key] as number
    const currValue = current[key] as number
    const absoluteChange = currValue - prevValue
    const percentChange =
      prevValue !== 0 ? (absoluteChange / prevValue) * 100 : 0

    changes.push({
      metric: label,
      previousValue: prevValue,
      currentValue: currValue,
      absoluteChange,
      percentChange,
    })
  }

  return changes
}

/**
 * Detect anomalies in a series of snapshots
 */
function detectAnomalies(
  snapshots: SnapshotSummary[],
  threshold: number
): Anomaly[] {
  const anomalies: Anomaly[] = []

  if (snapshots.length < 2) {
    return anomalies
  }

  const metrics: Array<{ key: keyof SnapshotSummary; label: string }> = [
    { key: 'totalMembership', label: 'Total Membership' },
    { key: 'totalClubs', label: 'Total Clubs' },
    { key: 'activeClubs', label: 'Active Clubs' },
    { key: 'distinguishedClubs', label: 'Distinguished Clubs' },
    { key: 'totalPayments', label: 'Total Payments' },
  ]

  for (const { key, label } of metrics) {
    const values = snapshots.map(s => s[key] as number)
    const dates = snapshots.map(s => s.snapshotId)

    // Calculate percent changes between consecutive snapshots
    const percentChanges: number[] = []
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1]
      const curr = values[i]
      const change = prev !== 0 ? ((curr! - prev!) / prev!) * 100 : 0
      percentChanges.push(change)
    }

    // Detect spike patterns (large increase followed by large decrease)
    for (let i = 0; i < percentChanges.length - 1; i++) {
      const change1 = percentChanges[i]
      const change2 = percentChanges[i + 1]

      if (
        change1 !== undefined &&
        change2 !== undefined &&
        change1 > threshold &&
        change2 < -threshold
      ) {
        anomalies.push({
          type: 'spike',
          metric: label,
          snapshots: [dates[i]!, dates[i + 1]!, dates[i + 2]!],
          values: [values[i]!, values[i + 1]!, values[i + 2]!],
          percentChanges: [change1, change2],
          description: `${label} spiked +${change1.toFixed(1)}% then dropped ${change2.toFixed(1)}%`,
        })
      }

      // Detect dip patterns (large decrease followed by large increase)
      if (
        change1 !== undefined &&
        change2 !== undefined &&
        change1 < -threshold &&
        change2 > threshold
      ) {
        anomalies.push({
          type: 'dip',
          metric: label,
          snapshots: [dates[i]!, dates[i + 1]!, dates[i + 2]!],
          values: [values[i]!, values[i + 1]!, values[i + 2]!],
          percentChanges: [change1, change2],
          description: `${label} dipped ${change1.toFixed(1)}% then recovered +${change2.toFixed(1)}%`,
        })
      }
    }

    // Detect single large changes
    for (let i = 0; i < percentChanges.length; i++) {
      const change = percentChanges[i]
      if (change !== undefined && Math.abs(change) > threshold * 2) {
        // Only flag if not already part of a spike/dip pattern
        const isPartOfPattern = anomalies.some(
          a =>
            a.metric === label &&
            (a.type === 'spike' || a.type === 'dip') &&
            a.snapshots.includes(dates[i]!) &&
            a.snapshots.includes(dates[i + 1]!)
        )

        if (!isPartOfPattern) {
          anomalies.push({
            type: change > 0 ? 'large_increase' : 'large_decrease',
            metric: label,
            snapshots: [dates[i]!, dates[i + 1]!],
            values: [values[i]!, values[i + 1]!],
            percentChanges: [change],
            description: `${label} changed ${change > 0 ? '+' : ''}${change.toFixed(1)}% in one snapshot`,
          })
        }
      }
    }
  }

  return anomalies
}

/**
 * Scan snapshots directory for anomalies
 */
function scanSnapshots(cacheDir: string, threshold: number): ScanResult {
  const snapshotsDir = path.join(cacheDir, 'snapshots')
  const result: ScanResult = {
    snapshotsScanned: 0,
    anomaliesFound: 0,
    snapshots: [],
    changes: [],
    anomalies: [],
    errors: [],
  }

  if (!fs.existsSync(snapshotsDir)) {
    return result
  }

  // Get all snapshot directories sorted by date
  const entries = fs.readdirSync(snapshotsDir, { withFileTypes: true })
  const snapshotDirs = entries
    .filter(e => e.isDirectory() && isISODateDirectory(e.name))
    .map(e => e.name)
    .sort()

  for (const snapshotId of snapshotDirs) {
    const snapshotDir = path.join(snapshotsDir, snapshotId)

    try {
      const metadata = readSnapshotMetadata(snapshotDir)
      if (!metadata || metadata.status === 'failed') {
        continue
      }

      const districts = readSnapshotDistricts(snapshotDir)
      if (districts.length === 0) {
        continue
      }

      const summary = aggregateSnapshot(snapshotId, districts)
      result.snapshots.push(summary)
      result.snapshotsScanned++
    } catch (error) {
      result.errors.push({
        snapshot: snapshotId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Calculate changes between consecutive snapshots
  for (let i = 1; i < result.snapshots.length; i++) {
    const previous = result.snapshots[i - 1]
    const current = result.snapshots[i]
    if (previous && current) {
      const changes = calculateChanges(previous, current)
      result.changes.push({
        from: previous.snapshotId,
        to: current.snapshotId,
        changes,
      })
    }
  }

  // Detect anomalies
  result.anomalies = detectAnomalies(result.snapshots, threshold)
  result.anomaliesFound = result.anomalies.length

  return result
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  cacheDir: string
  threshold: number
  jsonOutput: boolean
  verbose: boolean
} {
  let threshold = 15
  let jsonOutput = false
  let verbose = false
  const nonFlagArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--threshold' && args[i + 1]) {
      threshold = parseInt(args[i + 1]!, 10)
      i++
    } else if (arg === '--json') {
      jsonOutput = true
    } else if (arg === '--verbose') {
      verbose = true
    } else if (arg && !arg.startsWith('--')) {
      nonFlagArgs.push(arg)
    }
  }

  let cacheDir = nonFlagArgs[0] ?? process.env['CACHE_DIR'] ?? './cache'
  cacheDir = path.resolve(cacheDir)

  return { cacheDir, threshold, jsonOutput, verbose }
}

/**
 * Format a number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString()
}

/**
 * Main execution
 */
function main(): void {
  const args = process.argv.slice(2)
  const { cacheDir, threshold, jsonOutput, verbose } = parseArgs(args)

  if (!jsonOutput) {
    console.log('='.repeat(70))
    console.log('Snapshot Anomaly Detector')
    console.log('='.repeat(70))
    console.log(`Cache directory: ${cacheDir}`)
    console.log(`Change threshold: ${threshold}%`)
    console.log('')
  }

  const result = scanSnapshots(cacheDir, threshold)

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.anomaliesFound > 0 ? 1 : 0)
  }

  // Human-readable output
  console.log('Summary:')
  console.log('-'.repeat(40))
  console.log(`Snapshots scanned: ${result.snapshotsScanned}`)
  console.log(`Anomalies found: ${result.anomaliesFound}`)
  console.log(`Errors: ${result.errors.length}`)
  console.log('')

  if (result.snapshots.length > 0) {
    console.log('Snapshot Overview:')
    console.log('-'.repeat(70))
    console.log(
      'Date'.padEnd(12) +
        'Members'.padStart(12) +
        'Clubs'.padStart(10) +
        'Active'.padStart(10) +
        'Disting.'.padStart(10) +
        'Districts'.padStart(10)
    )
    console.log('-'.repeat(70))

    for (const snapshot of result.snapshots) {
      console.log(
        snapshot.date.padEnd(12) +
          formatNumber(snapshot.totalMembership).padStart(12) +
          formatNumber(snapshot.totalClubs).padStart(10) +
          formatNumber(snapshot.activeClubs).padStart(10) +
          formatNumber(snapshot.distinguishedClubs).padStart(10) +
          formatNumber(snapshot.districtCount).padStart(10)
      )
    }
    console.log('')
  }

  if (verbose && result.changes.length > 0) {
    console.log('Changes Between Snapshots:')
    console.log('='.repeat(70))

    for (const change of result.changes) {
      console.log(`\n${change.from} → ${change.to}:`)
      for (const c of change.changes) {
        const sign = c.percentChange >= 0 ? '+' : ''
        console.log(
          `  ${c.metric.padEnd(20)} ${formatNumber(c.previousValue).padStart(10)} → ${formatNumber(c.currentValue).padStart(10)} (${sign}${c.percentChange.toFixed(1)}%)`
        )
      }
    }
    console.log('')
  }

  if (result.anomalies.length > 0) {
    console.log('ANOMALIES DETECTED:')
    console.log('='.repeat(70))

    for (const anomaly of result.anomalies) {
      const typeLabel =
        anomaly.type === 'spike'
          ? '⚠️  SPIKE'
          : anomaly.type === 'dip'
            ? '⚠️  DIP'
            : anomaly.type === 'large_increase'
              ? '📈 LARGE INCREASE'
              : '📉 LARGE DECREASE'

      console.log(`\n${typeLabel}: ${anomaly.metric}`)
      console.log(`  ${anomaly.description}`)
      console.log(`  Snapshots: ${anomaly.snapshots.join(' → ')}`)
      console.log(`  Values: ${anomaly.values.map(formatNumber).join(' → ')}`)
    }
    console.log('')
  } else {
    console.log('✓ No anomalies detected within the threshold')
    console.log('')
  }

  if (result.errors.length > 0) {
    console.log('Errors:')
    console.log('-'.repeat(40))
    for (const err of result.errors) {
      console.log(`  ${err.snapshot}: ${err.error}`)
    }
    console.log('')
  }

  process.exit(result.anomaliesFound > 0 ? 1 : 0)
}

main()
