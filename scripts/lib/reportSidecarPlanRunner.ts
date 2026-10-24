/**
 * The report-sidecar manifest — the I/O around ./reportSidecarPlan.ts
 * (#1767). Invoked by scripts/plan-report-sidecars.ts, which documents the
 * env, outputs and exit codes. In-process callable (env and log stream
 * injected) so the shim tests do not pay a `tsx` start per case; only
 * gcloud (or the shim) is spawned.
 *
 * Reads only: `storage cat` of prod's v1/dates.json and of both buckets'
 * derived/education-rollup/index.json (#2222), one-level `storage ls` of
 * each carried date in both buckets, and `storage cp gs://… <local dir>`
 * downloads of the carried objects and the planned rollup, to hash them. Under the 588 pin a
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
  applySidecarContentGate,
  carryDates,
  heldSidecarDates,
  parseDateList,
  runSidecarEntries,
  sidecarManifest,
  sidecarNames,
  sidecarVerdict,
  type SidecarGateResult,
  type SidecarVerdict,
} from './reportSidecarPlan.js'
import { parseRunManifest, type RunManifestEntry } from './runManifest.js'
import {
  EDUCATION_ROLLUP_STAGE,
  planEducationRollup,
  type EducationRollupPlan,
} from './educationRollupPlan.js'
import { EDUCATION_ROLLUP_INDEX_PATH } from '@taverns-red/shared-contracts'

export const DEFAULT_SIDECAR_MANIFEST_FILE =
  '/tmp/report-sidecars/written.jsonl'
export const DEFAULT_SIDECAR_VERDICT_FILE = '/tmp/report-sidecars/verdict.json'
export const DEFAULT_SIDECAR_GATE_FILE =
  '/tmp/report-sidecars/content-gate.json'
export const DEFAULT_EDUCATION_ROLLUP_MANIFEST_FILE =
  '/tmp/education-rollup/written.jsonl'
export const DEFAULT_EDUCATION_ROLLUP_VERDICT_FILE =
  '/tmp/education-rollup/verdict.json'

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
  const rollupFile =
    env.EDUCATION_ROLLUP_MANIFEST_FILE || DEFAULT_EDUCATION_ROLLUP_MANIFEST_FILE
  const rollupVerdictFile =
    env.EDUCATION_ROLLUP_VERDICT_FILE || DEFAULT_EDUCATION_ROLLUP_VERDICT_FILE
  // Never leave an earlier plan behind for the gate or the promoter.
  for (const f of [outFile, verdictFile, rollupFile, rollupVerdictFile]) {
    rmSync(f, { force: true })
  }
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

  /**
   * Plan staging's education rollup into its own manifest: when its
   * reports date is one prod indexes and prod does not already have it.
   * Never throws: a malformed index, a read or a download error is
   * `education_rollup=error`, a warning and a summary line, and no rollup
   * manifest, so nothing of it promotes.
   */
  const planRollup = (indexed: readonly string[]) => {
    const catOrNull = (bucket: string, p: string): string | null => {
      const r = run(['storage', 'cat', `gs://${bucket}/${p}`])
      if (r.status === 0) return r.stdout
      if (NO_MATCH.test(r.stderr ?? '')) return null
      throw new Error(
        `could not read gs://${bucket}/${p}: ${(r.stderr ?? '').trim()}`
      )
    }
    let action: EducationRollupPlan['action'] | 'error'
    let reason: string
    let entries: RunManifestEntry[] = []
    try {
      const rollup = planEducationRollup({
        stagingIndex: catOrNull(staging, EDUCATION_ROLLUP_INDEX_PATH),
        prodIndex: catOrNull(prod, EDUCATION_ROLLUP_INDEX_PATH),
        prodIndexedDates: indexed,
      })
      if (rollup.paths.length > 0) {
        const dir = path.join(work, 'education-rollup')
        mkdirSync(dir, { recursive: true })
        read(
          [
            'storage',
            'cp',
            ...rollup.paths.map(p => `gs://${staging}/${p}`),
            `${dir}/`,
          ],
          `could not download the ${rollup.paths.length} education rollup object(s)`
        )
        entries = rollup.paths.map(p => ({
          path: p,
          sha256: createHash('sha256')
            .update(readFileSync(path.join(dir, path.basename(p))))
            .digest('hex'),
          date: null,
          stage: EDUCATION_ROLLUP_STAGE,
        }))
      }
      action = rollup.action
      reason = rollup.reason
    } catch (e) {
      action = 'error'
      reason = `${e instanceof Error ? e.message : String(e)} — the rollup is held; the sidecars are not affected`
      entries = []
      log(`::warning title=Education rollup::${reason.replace(/\s+/g, ' ')}`)
    }
    if (entries.length > 0) {
      mkdirSync(path.dirname(rollupFile), { recursive: true })
      writeFileSync(
        rollupFile,
        entries.map(e => JSON.stringify(e)).join('\n') + '\n'
      )
      mkdirSync(path.dirname(rollupVerdictFile), { recursive: true })
      writeFileSync(
        rollupVerdictFile,
        JSON.stringify({ promote: true, heldDates: [] }, null, 2) + '\n'
      )
    }
    emit('rollup_objects', entries.length)
    emit('education_rollup', action)
    log(`[report-sidecars] education rollup: ${action} — ${reason}`)
    summary(`- 🎓 **Education rollup (#2222)**: ${action} — ${reason}\n`)
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

    // The education rollup (#2222), first and on its own (review M1): a
    // fault in it holds only the rollup, as the old continue-on-error
    // mirror did, never the sidecars below.
    planRollup(indexed)

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

/** The content gate's result file, or null when it is absent or unusable. */
function readGateResult(
  file: string,
  log: (msg: string) => void
): SidecarGateResult | null {
  try {
    const g = JSON.parse(
      readFileSync(file, 'utf-8')
    ) as Partial<SidecarGateResult>
    if (typeof g.promote !== 'boolean' || !Array.isArray(g.failures)) {
      throw new Error('no promote/failures')
    }
    return { promote: g.promote, failures: g.failures }
  } catch (e) {
    log(
      `[report-sidecars] content gate result ${file} is unusable: ${String(e)}`
    )
    return null
  }
}

/**
 * `plan-report-sidecars.ts --apply-content-gate` (#2227): after the content
 * gate, drop every date with a failing sidecar from the sidecar manifest and
 * add it to the verdict, so the promoter copies the other dates. Rewrites
 * REPORT_SIDECAR_MANIFEST_FILE (removed when nothing is left) and
 * REPORT_SIDECAR_VERDICT_FILE in place; reads CONTENT_GATE_FILE.
 * Outputs: objects, content_promote ("false" when the gate held any date),
 * content_held_dates, held_dates. Exit: 0 applied · 2 no planned manifest or
 * verdict to apply it to.
 */
export async function runApplySidecarContentGate(io: PlanIo): Promise<number> {
  const { env } = io
  const log = (msg: string) => io.err(`${msg}\n`)
  const emit = (key: string, value: string | number) => {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
  const outFile =
    env.REPORT_SIDECAR_MANIFEST_FILE || DEFAULT_SIDECAR_MANIFEST_FILE
  const verdictFile =
    env.REPORT_SIDECAR_VERDICT_FILE || DEFAULT_SIDECAR_VERDICT_FILE
  const gateFile = env.CONTENT_GATE_FILE || DEFAULT_SIDECAR_GATE_FILE

  let entries: RunManifestEntry[]
  let verdict: SidecarVerdict
  try {
    entries = parseRunManifest(readFileSync(outFile, 'utf-8'))
    verdict = JSON.parse(readFileSync(verdictFile, 'utf-8')) as SidecarVerdict
    if (
      typeof verdict.promote !== 'boolean' ||
      !Array.isArray(verdict.heldDates)
    ) {
      throw new Error(`${verdictFile} is not a sidecar verdict`)
    }
  } catch (e) {
    log(
      `::error title=Report sidecars::${String(e)} — no planned sidecar manifest to apply the content gate to; nothing promoted`
    )
    rmSync(outFile, { force: true })
    return 2
  }

  const r = applySidecarContentGate(
    entries,
    verdict,
    readGateResult(gateFile, log)
  )
  writeFileSync(verdictFile, JSON.stringify(r.verdict, null, 2) + '\n')
  if (r.entries.length > 0) {
    writeFileSync(
      outFile,
      r.entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    )
  } else {
    rmSync(outFile, { force: true })
  }

  const contentPromote = r.contentHeldDates.length === 0 && r.heldAll === null
  emit('objects', r.entries.length)
  emit('content_promote', String(contentPromote))
  emit('content_held_dates', r.contentHeldDates.join(','))
  emit('held_dates', r.verdict.heldDates.join(','))

  if (contentPromote) {
    log(
      `[report-sidecars] content gate passed: ${r.entries.length} object(s) to promote`
    )
    return 0
  }
  const held = r.contentHeldDates.join(', ') || '(none)'
  log(
    `::warning title=Report sidecars::the content gate held ${held}${r.heldAll ? ` (${r.heldAll})` : ''}; ` +
      `${r.entries.length} object(s) of the other dates still promote`
  )
  if (env.GITHUB_STEP_SUMMARY) {
    const cell = (t: string) => t.replaceAll('|', '\\|')
    const rows = r.failures
      .slice(0, 50)
      .map(f => `| ${f.date || '—'} | ${cell(f.path)} | ${cell(f.reason)} |`)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        '## 🧪 Report sidecars held by the content gate (#2227)',
        r.heldAll
          ? `- **Every date held** — ${r.heldAll}.`
          : `- **Held date(s)**: ${held} — their sidecars stay in staging; the other dates still promote (${r.entries.length} object(s)).`,
        '',
        ...(rows.length > 0
          ? ['| Date | Object | Reason |', '| --- | --- | --- |', ...rows]
          : []),
        ...(r.failures.length > 50
          ? [
              `_…and ${r.failures.length - 50} more; see the content gate summary._`,
            ]
          : []),
        '',
      ].join('\n')
    )
  }
  return 0
}

/** Red stub (#2222 M2): does nothing. */
export async function runApplyEducationRollupHold(
  _io: PlanIo
): Promise<number> {
  return 0
}
