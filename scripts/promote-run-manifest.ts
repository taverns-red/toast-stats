/**
 * Scoped promotion — Runner (#1763, ADR-015 P6, migration step 5).
 *
 * Copies the objects this run wrote (the run manifest, #1762) from staging
 * to production, for the dates the completeness gate passed. The plan and
 * every design decision live in ./lib/manifestPromotion.ts; this file is the
 * I/O around it.
 *
 *   --dry-run   print the plan, one line per manifest object, to stdout
 *               (`copy\t<phase>\t<src>\t<dst>`, `hold\t…`, `skip\t…`) and a
 *               summary; reads buckets, writes NOTHING.
 *   --execute   the same plan, then `gcloud storage cp <srcs…> gs://prod/<dir>/`
 *               per destination directory: server-side rewrites, so the bytes
 *               and headers (Content-Encoding, Cache-Control) arrive as staged.
 *               Dates, then globals, then the v1/ entry points; a failed copy
 *               stops the run before the next phase and exits 1.
 *   --assume-pass  (dry run only) preview without a completeness verdict,
 *               e.g. against a published runs/<id>/written.jsonl.
 *
 * Reads (both modes, only when the run wrote globals and no date is held):
 * staging v1/dates.json + v1/latest.json (`storage cat`) and prod's date
 * directories (`storage ls gs://prod/snapshots/`).
 *
 * Env: GCS_BUCKET, GCS_BUCKET_PRODUCTION, RUN_MANIFEST_FILE,
 *      COMPLETENESS_GATE_FILE (default /tmp/completeness-gate.json),
 *      GCLOUD (default gcloud), PROMOTE_CONCURRENCY (default 4).
 * Outputs (GITHUB_OUTPUT): objects_planned, promoted_dates, held_dates,
 *      globals_promoted; with --execute also objects_copied and complete
 *      ('true' only when every promotable object of the run was copied).
 * Exit: 0 — plan printed / copies done (holds are not errors: the
 *      promotion-held flow reports them); 1 — a copy failed; 2 — bad input
 *      (no manifest, malformed manifest, no verdict for --execute).
 * Logs go to stderr (R4).
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
} from './lib/manifestPromotion.js'
import { parseRunManifest } from './lib/runManifest.js'

const GCLOUD = process.env.GCLOUD || 'gcloud'
const DEFAULT_GATE_FILE = '/tmp/completeness-gate.json'
const MAX_SUMMARY_LINES = 60

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emit(key: string, value: string | number | boolean): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

function summary(md: string): void {
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) appendFileSync(f, md)
}

function readVerdict(file: string): CompletenessVerdict | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf-8')) as CompletenessVerdict
    return typeof v?.promote === 'boolean' ? v : null
  } catch {
    return null
  }
}

/** stdout of a read-only gcloud call, or null on failure. */
function gcloudRead(args: string[]): string | null {
  const r = spawnSync(GCLOUD, args, { encoding: 'utf-8' })
  if (r.status !== 0) {
    log(`[promote] gcloud ${args.join(' ')} failed: ${(r.stderr ?? '').trim()}`)
    return null
  }
  return r.stdout
}

function readIndexDates(staging: string): string[] | null {
  const dates = gcloudRead(['storage', 'cat', `gs://${staging}/v1/dates.json`])
  const latest = gcloudRead([
    'storage',
    'cat',
    `gs://${staging}/v1/latest.json`,
  ])
  if (dates === null || latest === null) return null
  try {
    return parseIndexDates(dates, latest)
  } catch (err) {
    log(`[promote] staging index unreadable: ${String(err)}`)
    return null
  }
}

function readProdDates(prod: string): Set<string> | null {
  const ls = gcloudRead(['storage', 'ls', `gs://${prod}/snapshots/`])
  return ls === null ? null : parseSnapshotDateListing(ls)
}

function copyBatch(
  b: CopyBatch,
  staging: string,
  prod: string
): Promise<boolean> {
  const args = [
    'storage',
    'cp',
    ...b.paths.map(p => `gs://${staging}/${p}`),
    `gs://${prod}/${b.dir}`,
  ]
  return new Promise(resolve => {
    const child = spawn(GCLOUD, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    // gcloud's progress is a log: keep stdout for the plan (R4).
    child.stdout.on('data', d => process.stderr.write(d))
    child.stderr.on('data', d => process.stderr.write(d))
    child.on('error', err => {
      log(`[promote] ${b.dir}: ${String(err)}`)
      resolve(false)
    })
    child.on('close', code => resolve(code === 0))
  })
}

/** Run one phase's batches, `concurrency` at a time; stop at the first failure. */
async function runPhase(
  batches: CopyBatch[],
  staging: string,
  prod: string,
  concurrency: number
): Promise<{ ok: boolean; copied: number }> {
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

function summarise(plan: PromotionPlan, text: string, mode: string): void {
  const copies = text.split('\n').filter(l => l.startsWith('copy\t'))
  const md = [
    `## 📦 Scoped promotion (#1763) — ${mode}`,
    `- **Objects to copy**: ${plan.objectCount} (dates: ${plan.promotedDates.join(', ') || 'none'})`,
    `- **Held dates**: ${plan.heldDates.join(', ') || 'none'}`,
    `- **Globals (v1/, config/, time-series/)**: ${plan.globals.paths.length === 0 ? 'none written' : plan.globals.promote ? 'promote' : `HELD — ${plan.globals.reason}`}`,
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
  summary(md.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n') + '\n')
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2))
  const execute = args.has('--execute')
  if (execute === args.has('--dry-run')) {
    log('usage: promote-run-manifest.ts --dry-run [--assume-pass] | --execute')
    return 2
  }
  if (execute && args.has('--assume-pass')) {
    log('[promote] --assume-pass is for --dry-run only')
    return 2
  }
  const staging = process.env.GCS_BUCKET
  const prod = process.env.GCS_BUCKET_PRODUCTION
  const manifestFile = process.env.RUN_MANIFEST_FILE
  if (!staging || !prod || !manifestFile) {
    log(
      '[promote] GCS_BUCKET, GCS_BUCKET_PRODUCTION and RUN_MANIFEST_FILE must be set'
    )
    return 2
  }

  let entries
  try {
    entries = parseRunManifest(readFileSync(manifestFile, 'utf-8'))
  } catch (err) {
    log(
      `::error title=Scoped promotion::run manifest unusable — nothing promoted: ${String(err)}`
    )
    return 2
  }

  const verdict = args.has('--assume-pass')
    ? { promote: true }
    : readVerdict(process.env.COMPLETENESS_GATE_FILE || DEFAULT_GATE_FILE)
  const held = resolveHeldDates(verdict)

  // The index/listing reads matter only when globals could promote.
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
  } catch (err) {
    log(`::error title=Scoped promotion::${String(err)} — nothing promoted`)
    return 2
  }

  const text = formatPromotionPlan(plan, staging, prod)
  if (!execute) process.stdout.write(text)
  log(
    `[promote] ${execute ? 'execute' : 'dry run'}: ${plan.objectCount} object(s); ` +
      `dates ${plan.promotedDates.join(' ') || '(none)'}; held ${plan.heldDates.join(' ') || '(none)'}; ` +
      `globals ${plan.globals.promote ? 'promote' : `held — ${plan.globals.reason}`}`
  )
  summarise(plan, text, execute ? 'execute' : 'dry run (nothing written)')
  emit('objects_planned', plan.objectCount)
  emit('promoted_dates', plan.promotedDates.join(','))
  emit('held_dates', plan.heldDates.join(','))
  emit('globals_promoted', plan.globals.promote)

  if (!execute) return 0
  if (plan.heldAll) {
    log(`::error title=Scoped promotion::${plan.heldAll}`)
    emit('objects_copied', 0)
    emit('complete', false)
    return 2
  }

  const concurrency = Number(process.env.PROMOTE_CONCURRENCY) || 4
  let copied = 0
  let ok = true
  for (const phase of ['dates', 'globals', 'entry'] as const) {
    const r = await runPhase(
      plan.batches.filter(b => b.phase === phase),
      staging,
      prod,
      // The two entry points go in one call; never race them.
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

main()
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    log(`[promote] unexpected: ${String(err)}`)
    process.exitCode = 2
  })
