/**
 * Scoped promotion — the I/O around ./manifestPromotion.ts (#1763, ADR-015
 * P6). Invoked by scripts/promote-run-manifest.ts, which documents the
 * flags, env, outputs and exit codes. Kept in-process-callable (env and
 * output streams injected) so the two-bucket shim tests do not pay a `tsx`
 * cold start per case under a loaded suite (lesson from #1748). Only gcloud
 * (or the shim) is spawned, with the injected env.
 */

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import {
  formatPromotionPlan,
  parseIndexDates,
  parseSnapshotDateListing,
  planManifestPromotion,
  resolveHeldDates,
  type CompletenessVerdict,
  type CopyBatch,
  type PromotionPlan,
} from './manifestPromotion.js'
import { parseRunManifest, type RunManifestEntry } from './runManifest.js'

export const DEFAULT_COMPLETENESS_GATE_FILE = '/tmp/completeness-gate.json'
const MAX_SUMMARY_LINES = 60

export interface RunnerIo {
  env: Record<string, string | undefined>
  /** The plan (dry run only). */
  out: (s: string) => void
  /** Logs (R4). */
  err: (s: string) => void
}

export async function runPromoteRunManifest(
  argv: readonly string[],
  io: RunnerIo
): Promise<number> {
  const { env } = io
  const gcloud = env.GCLOUD || 'gcloud'
  const log = (msg: string) => io.err(`${msg}\n`)
  const emit = (key: string, value: string | number | boolean) => {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
  const summary = (md: string) => {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md)
  }

  /** stdout of a read-only gcloud call, or null on failure. */
  const gcloudRead = (args: string[]): string | null => {
    const r = spawnSync(gcloud, args, { encoding: 'utf-8', env })
    if (r.status !== 0) {
      log(
        `[promote] gcloud ${args.join(' ')} failed: ${(r.stderr ?? '').trim()}`
      )
      return null
    }
    return r.stdout
  }

  const readIndexDates = (staging: string): string[] | null => {
    const dates = gcloudRead([
      'storage',
      'cat',
      `gs://${staging}/v1/dates.json`,
    ])
    const latest = gcloudRead([
      'storage',
      'cat',
      `gs://${staging}/v1/latest.json`,
    ])
    if (dates === null || latest === null) return null
    try {
      return parseIndexDates(dates, latest)
    } catch (e) {
      log(`[promote] staging index unreadable: ${String(e)}`)
      return null
    }
  }

  const readProdDates = (prod: string): Set<string> | null => {
    const ls = gcloudRead(['storage', 'ls', `gs://${prod}/snapshots/`])
    return ls === null ? null : parseSnapshotDateListing(ls)
  }

  const copyBatch = (b: CopyBatch, staging: string, prod: string) =>
    new Promise<boolean>(resolve => {
      const child = spawn(
        gcloud,
        [
          'storage',
          'cp',
          ...b.paths.map(p => `gs://${staging}/${p}`),
          `gs://${prod}/${b.dir}`,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], env }
      )
      // gcloud's progress is a log: stdout stays for the plan (R4).
      child.stdout.on('data', d => io.err(String(d)))
      child.stderr.on('data', d => io.err(String(d)))
      child.on('error', e => {
        log(`[promote] ${b.dir}: ${String(e)}`)
        resolve(false)
      })
      child.on('close', code => resolve(code === 0))
    })

  /** One phase's batches, `concurrency` at a time; stop at the first failure. */
  const runPhase = async (
    batches: CopyBatch[],
    staging: string,
    prod: string,
    concurrency: number
  ) => {
    let next = 0
    let copied = 0
    let ok = true
    const worker = async () => {
      while (ok && next < batches.length) {
        const b = batches[next++]!
        if (await copyBatch(b, staging, prod)) {
          copied += b.paths.length
        } else {
          ok = false
          log(
            `::error title=Scoped promotion::copy into gs://${prod}/${b.dir} failed`
          )
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
    return { ok, copied }
  }

  const args = new Set(argv)
  const execute = args.has('--execute')
  if (execute === args.has('--dry-run')) {
    log('usage: promote-run-manifest.ts --dry-run [--assume-pass] | --execute')
    return 2
  }
  if (execute && args.has('--assume-pass')) {
    log('[promote] --assume-pass is for --dry-run only')
    return 2
  }
  const staging = env.GCS_BUCKET
  const prod = env.GCS_BUCKET_PRODUCTION
  const manifestFile = env.RUN_MANIFEST_FILE
  if (!staging || !prod || !manifestFile) {
    log(
      '[promote] GCS_BUCKET, GCS_BUCKET_PRODUCTION and RUN_MANIFEST_FILE must be set'
    )
    return 2
  }

  let entries: RunManifestEntry[]
  try {
    entries = parseRunManifest(readFileSync(manifestFile, 'utf-8'))
  } catch (e) {
    log(
      `::error title=Scoped promotion::run manifest unusable — nothing promoted: ${String(e)}`
    )
    return 2
  }

  const verdict: CompletenessVerdict | null = args.has('--assume-pass')
    ? { promote: true }
    : readVerdict(env.COMPLETENESS_GATE_FILE || DEFAULT_COMPLETENESS_GATE_FILE)
  const held = resolveHeldDates(verdict)

  // The index and listing reads matter only when globals could promote.
  const wroteGlobals = entries.some(e =>
    /^(v1|config|time-series)\//.test(e.path)
  )
  const checkIndex = wroteGlobals && !held.all && held.dates.length === 0
  let plan: PromotionPlan
  try {
    plan = planManifestPromotion({
      entries,
      held,
      indexDates: checkIndex ? readIndexDates(staging) : null,
      prodDates: checkIndex ? readProdDates(prod) : null,
    })
  } catch (e) {
    log(`::error title=Scoped promotion::${String(e)} — nothing promoted`)
    return 2
  }

  const text = formatPromotionPlan(plan, staging, prod)
  if (!execute) io.out(text)
  log(
    `[promote] ${execute ? 'execute' : 'dry run'}: ${plan.objectCount} object(s); ` +
      `dates ${plan.promotedDates.join(' ') || '(none)'}; held ${plan.heldDates.join(' ') || '(none)'}; ` +
      `globals ${plan.globals.promote ? 'promote' : `held — ${plan.globals.reason}`}`
  )
  summary(
    summaryMarkdown(
      plan,
      text,
      execute ? 'execute' : 'dry run (nothing written)'
    )
  )
  emit('objects_planned', plan.objectCount)
  emit('promoted_dates', plan.promotedDates.join(','))
  emit('held_dates', plan.heldDates.join(','))
  emit('globals_promoted', plan.globals.promote)

  if (!execute) return 0
  if (plan.heldAll) {
    log(`::error title=Scoped promotion::${plan.heldAll}`)
    emit('objects_copied', 0)
    emit('complete', false)
    // A verdict that holds everything (the gate errored) is a hold: exit 0
    // so the promotion-held steps still run. No verdict at all means the
    // step ran out of order or the file was lost — fail the step.
    return verdict === null ? 2 : 0
  }

  const concurrency = Number(env.PROMOTE_CONCURRENCY) || 4
  let copied = 0
  let ok = true
  for (const phase of ['dates', 'globals', 'entry'] as const) {
    const r = await runPhase(
      plan.batches.filter(b => b.phase === phase),
      staging,
      prod,
      // One call at a time: the shard indexes (#1782), then the two v1/
      // entry points in one call; never race them.
      phase === 'entry' ? 1 : concurrency
    )
    copied += r.copied
    if (!r.ok) {
      ok = false
      break
    }
  }
  const complete =
    ok &&
    plan.heldDates.length === 0 &&
    (plan.globals.paths.length === 0 || plan.globals.promote)
  emit('objects_copied', copied)
  emit('complete', complete)
  log(`[promote] copied ${copied} of ${plan.objectCount}; complete=${complete}`)
  summary(
    `- **Copied**: ${copied} of ${plan.objectCount}${ok ? '' : ' — ❌ a copy failed; later phases not run'}\n`
  )
  return ok ? 0 : 1
}

function readVerdict(file: string): CompletenessVerdict | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf-8')) as CompletenessVerdict
    return typeof v?.promote === 'boolean' ? v : null
  } catch {
    return null
  }
}

function summaryMarkdown(
  plan: PromotionPlan,
  text: string,
  mode: string
): string {
  const copies = text.split('\n').filter(l => l.startsWith('copy\t'))
  const globals =
    plan.globals.paths.length === 0
      ? 'none written'
      : plan.globals.promote
        ? 'promote'
        : `HELD — ${plan.globals.reason}`
  const md = [
    `## 📦 Scoped promotion (#1763) — ${mode}`,
    `- **Objects to copy**: ${plan.objectCount} (dates: ${plan.promotedDates.join(', ') || 'none'})`,
    `- **Held dates**: ${plan.heldDates.join(', ') || 'none'}`,
    `- **Globals (v1/, config/, time-series/)**: ${globals}`,
    `- **Never promoted (internal)**: ${plan.excluded.length}`,
    plan.heldAll ? `- ⚠️ ${plan.heldAll}` : '',
    '',
    copies.length > 0 ? '```' : '',
    ...copies
      .slice(0, MAX_SUMMARY_LINES)
      .map(l => l.split('\t').slice(1).join('  ')),
    copies.length > MAX_SUMMARY_LINES
      ? `… ${copies.length - MAX_SUMMARY_LINES} more (full plan in the step log)`
      : '',
    copies.length > 0 ? '```' : '',
    '',
  ]
  return md.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n') + '\n'
}
