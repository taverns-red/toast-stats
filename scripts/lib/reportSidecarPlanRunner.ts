/**
 * The report-sidecar manifest — the I/O around ./reportSidecarPlan.ts
 * (#1767). Invoked by scripts/plan-report-sidecars.ts, which documents the
 * env, outputs and exit codes. In-process callable (env and log stream
 * injected) so the shim tests do not pay a `tsx` start per case; only
 * gcloud (or the shim) is spawned.
 *
 * Reads only: `storage cat` of prod's v1/dates.json, one-level `storage ls`
 * of each carried date in both buckets, and `storage cp gs://… <local dir>`
 * downloads of the carried objects, to hash them. Under the 588 pin a
 * download inflates the one Content-Encoding layer (#1702), so the hash is
 * of the bytes a browser is served: the hash gcs-upload.sh records, and the
 * one the content gate checks. (On a gcloud that kept the gzip bytes the
 * hash would not match and the gate would hold: fail closed.)
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  CARRY_STAGE,
  DEFAULT_CARRY_DAYS,
  carryDates,
  heldSidecarDates,
  parseDateList,
  runSidecarEntries,
  sidecarManifest,
  sidecarNames,
  sidecarVerdict,
} from './reportSidecarPlan.js'
import { parseRunManifest, type RunManifestEntry } from './runManifest.js'

export const DEFAULT_SIDECAR_MANIFEST_FILE =
  '/tmp/report-sidecars/written.jsonl'
export const DEFAULT_SIDECAR_VERDICT_FILE = '/tmp/report-sidecars/verdict.json'

export interface PlanIo {
  env: Record<string, string | undefined>
  /** Logs (R4). */
  err: (s: string) => void
}

const NO_MATCH = /matched no objects|No URLs matched/

class ReadError extends Error {}

export async function runPlanReportSidecars(io: PlanIo): Promise<number> {
  const { env } = io
  const gcloud = env.GCLOUD || 'gcloud'
  const log = (msg: string) => io.err(`${msg}\n`)
  const emit = (key: string, value: string | number) => {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
  const summary = (md: string) => {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md)
  }

  const staging = env.GCS_BUCKET
  const prod = env.GCS_BUCKET_PRODUCTION
  const runFile = env.RUN_MANIFEST_FILE
  const outFile =
    env.REPORT_SIDECAR_MANIFEST_FILE || DEFAULT_SIDECAR_MANIFEST_FILE
  const verdictFile =
    env.REPORT_SIDECAR_VERDICT_FILE || DEFAULT_SIDECAR_VERDICT_FILE
  // Never leave an earlier plan behind for the gate or the promoter.
  rmSync(outFile, { force: true })
  rmSync(verdictFile, { force: true })
  if (!staging || !prod || !runFile || staging === prod) {
    log(
      '[report-sidecars] GCS_BUCKET, GCS_BUCKET_PRODUCTION (different) and RUN_MANIFEST_FILE must be set'
    )
    return 2
  }

  let runEntries: RunManifestEntry[]
  let promoted: string[]
  let days = DEFAULT_CARRY_DAYS
  try {
    runEntries = parseRunManifest(readFileSync(runFile, 'utf-8'))
    promoted = parseDateList(env.PROMOTED_DATES ?? '')
    if (env.CARRY_DAYS) {
      days = Number(env.CARRY_DAYS)
      if (!Number.isInteger(days) || days < 1) {
        throw new Error(
          `CARRY_DAYS is not a positive integer: '${env.CARRY_DAYS}'`
        )
      }
    }
  } catch (e) {
    log(
      `::error title=Report sidecars::${String(e)} — no sidecar manifest, nothing promoted`
    )
    return 2
  }

  const run = (args: string[]) =>
    spawnSync(gcloud, args, {
      encoding: 'utf-8',
      env: env as NodeJS.ProcessEnv,
    })
  const read = (args: string[], what: string): string => {
    const r = run(args)
    if (r.status !== 0) {
      throw new ReadError(`${what}: ${(r.stderr ?? '').trim()}`)
    }
    return r.stdout
  }
  /** Sidecar names under one bucket's date directory; none if it is absent. */
  const listSidecars = (bucket: string, date: string): string[] => {
    const r = run(['storage', 'ls', `gs://${bucket}/snapshots/${date}/`])
    if (r.status === 0) return sidecarNames(r.stdout, bucket, date)
    if (NO_MATCH.test(r.stderr ?? '')) return []
    throw new ReadError(
      `could not list gs://${bucket}/snapshots/${date}/: ${(r.stderr ?? '').trim()}`
    )
  }

  const work = mkdtempSync(path.join(env.RUNNER_TEMP || tmpdir(), 'sidecars-'))
  try {
    const datesJson = read(
      ['storage', 'cat', `gs://${prod}/v1/dates.json`],
      `could not read gs://${prod}/v1/dates.json`
    )
    let indexed: string[]
    try {
      const dates = (JSON.parse(datesJson) as { dates?: unknown }).dates
      if (!Array.isArray(dates)) throw new Error('no dates[]')
      indexed = dates.filter(
        (d): d is string =>
          typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      )
    } catch (e) {
      throw new ReadError(`prod v1/dates.json is unusable: ${String(e)}`)
    }

    const own = runSidecarEntries(runEntries)
    const ownPaths = new Set(own.map(e => e.path))
    const held = heldSidecarDates(runEntries, promoted)
    const carried: RunManifestEntry[] = []
    for (const date of carryDates(indexed, promoted, days)) {
      const inProd = new Set(listSidecars(prod, date))
      const missing = listSidecars(staging, date).filter(
        n => !inProd.has(n) && !ownPaths.has(`snapshots/${date}/${n}`)
      )
      if (missing.length === 0) continue
      const dir = path.join(work, date)
      mkdirSync(dir, { recursive: true })
      read(
        [
          'storage',
          'cp',
          ...missing.map(n => `gs://${staging}/snapshots/${date}/${n}`),
          `${dir}/`,
        ],
        `could not download ${missing.length} sidecar(s) of ${date}`
      )
      for (const n of missing) {
        const bytes = readFileSync(path.join(dir, n))
        carried.push({
          path: `snapshots/${date}/${n}`,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          date,
          stage: CARRY_STAGE,
        })
      }
    }

    const entries = sidecarManifest(own, carried)
    const verdict = sidecarVerdict(held)
    mkdirSync(path.dirname(verdictFile), { recursive: true })
    writeFileSync(verdictFile, JSON.stringify(verdict, null, 2) + '\n')
    if (entries.length > 0) {
      mkdirSync(path.dirname(outFile), { recursive: true })
      writeFileSync(
        outFile,
        entries.map(e => JSON.stringify(e)).join('\n') + '\n'
      )
    }
    emit('objects', entries.length)
    emit('carried', carried.length)
    emit('held_dates', verdict.heldDates.join(','))
    log(
      `[report-sidecars] ${entries.length} object(s): ${own.length} written by this run, ` +
        `${carried.length} carried; held ${verdict.heldDates.join(' ') || '(none)'}`
    )
    const carriedDates = [...new Set(carried.map(e => e.date))].join(', ')
    summary(
      [
        '## 📎 Report sidecars (#1767)',
        `- **Sidecar manifest**: ${entries.length} object(s) — ${own.length} this run wrote, ${carried.length} carried${carried.length > 0 ? ` (${carriedDates})` : ''}; content-gated, then promoted through the manifest promoter`,
        `- **Held dates**: ${verdict.heldDates.join(', ') || 'none'}`,
        '',
      ].join('\n')
    )
    return 0
  } catch (e) {
    if (!(e instanceof ReadError)) throw e
    log(`::error title=Report sidecars::${e.message} — nothing planned`)
    rmSync(outFile, { force: true })
    rmSync(verdictFile, { force: true })
    return 1
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
