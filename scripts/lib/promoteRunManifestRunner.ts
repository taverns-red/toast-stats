/**
 * Scoped promotion — the I/O around ./manifestPromotion.ts (#1763, ADR-015
 * P6). Invoked by scripts/promote-run-manifest.ts, which documents the
 * flags, env, outputs and exit codes. Kept in-process-callable (env and
 * output streams injected) so the two-bucket shim tests do not pay a `tsx`
 * cold start per case under a loaded suite (lesson from #1748). Only gcloud
 * (or the shim) is spawned, with the injected env.
 */

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import {
  MAX_SOURCES_PER_COPY,
  formatPromotionPlan,
  parseIndexDates,
  parseSnapshotDateListing,
  planManifestPromotion,
  resolveHeldDates,
  type CompletenessVerdict,
  type CopyBatch,
  type PromotionPlan,
} from './manifestPromotion.js'
import {
  parseRunManifest,
  parseRunRemovals,
  type RunManifestEntry,
  type RunRemovalEntry,
} from './runManifest.js'

/** One prefix per line; blank lines ignored. Validation is the planner's. */
export function parseDeletesFile(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
}

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

  /** `rm -r` one prod prefix (#1767); false on failure. */
  const deletePrefix = (prefix: string, prod: string) =>
    new Promise<boolean>(resolve => {
      const child = spawn(
        gcloud,
        ['storage', 'rm', '-r', `gs://${prod}/${prefix}/`],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
        }
      )
      child.stdout.on('data', d => io.err(String(d)))
      child.stderr.on('data', d => io.err(String(d)))
      child.on('error', e => {
        log(`[promote] rm ${prefix}: ${String(e)}`)
        resolve(false)
      })
      child.on('close', code => resolve(code === 0))
    })

  /** `rm` exact prod objects (#2232); false on failure. */
  const removeObjects = (paths: readonly string[], prod: string) =>
    new Promise<boolean>(resolve => {
      const child = spawn(
        gcloud,
        ['storage', 'rm', ...paths.map(p => `gs://${prod}/${p}`)],
        { stdio: ['ignore', 'pipe', 'pipe'], env }
      )
      child.stdout.on('data', d => io.err(String(d)))
      child.stderr.on('data', d => io.err(String(d)))
      child.on('error', e => {
        log(`[promote] rm: ${String(e)}`)
        resolve(false)
      })
      child.on('close', code => resolve(code === 0))
    })

  /**
   * The objects prod holds under `snapshots/<date>/`, bucket stripped;
   * empty when it holds none, null when the listing failed.
   */
  const listProdDate = (date: string, prod: string): Set<string> | null => {
    const r = spawnSync(
      gcloud,
      ['storage', 'ls', `gs://${prod}/snapshots/${date}/**`],
      { encoding: 'utf-8', env }
    )
    if (r.status !== 0) {
      if ((r.stderr ?? '').includes('matched no objects')) return new Set()
      log(`[promote] gcloud storage ls of prod ${date} failed: ${r.stderr}`)
      return null
    }
    const prefix = `gs://${prod}/`
    return new Set(
      r.stdout
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith(prefix))
        .map(l => l.slice(prefix.length))
    )
  }

  /**
   * Remove the planned objects prod still holds (#2232), date by date. One
   * prod never had (or an earlier attempt removed) is skipped, so a re-run
   * converges. Returns how many were removed and whether all went.
   */
  const runRemovals = async (paths: readonly string[], prod: string) => {
    const byDate = new Map<string, string[]>()
    for (const p of paths) {
      const d = p.split('/')[1]!
      byDate.set(d, [...(byDate.get(d) ?? []), p])
    }
    let removed = 0
    let ok = true
    for (const [date, planned] of byDate) {
      const present = listProdDate(date, prod)
      if (present === null) {
        ok = false
        log(
          `::error title=Scoped promotion::could not list prod snapshots/${date}/; its ${planned.length} removal(s) did not run`
        )
        continue
      }
      const todo = planned.filter(p => present.has(p))
      if (todo.length < planned.length) {
        log(
          `[promote] ${planned.length - todo.length} removal(s) on ${date} already absent from prod`
        )
      }
      for (let i = 0; i < todo.length; i += MAX_SOURCES_PER_COPY) {
        const chunk = todo.slice(i, i + MAX_SOURCES_PER_COPY)
        if (await removeObjects(chunk, prod)) removed += chunk.length
        else {
          ok = false
          log(
            `::error title=Scoped promotion::removing ${chunk.length} stale object(s) of ${date} from prod failed; nothing else removes them (#2232)`
          )
        }
      }
    }
    return { removed, ok }
  }

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

  // The prune reconcile's delete manifest (#1767). Set but unreadable is
  // bad input: never promote a reconcile without the deletes it planned.
  let deletes: string[] | undefined
  const deletesFile = env.PROD_DELETES_FILE
  if (deletesFile) {
    try {
      deletes = parseDeletesFile(readFileSync(deletesFile, 'utf-8'))
    } catch (e) {
      log(
        `::error title=Prune reconcile::delete manifest ${deletesFile} unreadable — nothing promoted: ${String(e)}`
      )
      return 2
    }
  }

  // The run's removals (#2232). A run that removed nothing has no file;
  // one that is there but unreadable is bad input: never promote a date
  // without the removals its run made in staging.
  let removals: RunRemovalEntry[] = []
  const removalsFile = env.RUN_REMOVALS_FILE
  if (removalsFile && existsSync(removalsFile)) {
    try {
      removals = parseRunRemovals(readFileSync(removalsFile, 'utf-8'))
    } catch (e) {
      log(
        `::error title=Scoped promotion::run removals ${removalsFile} unusable — nothing promoted: ${String(e)}`
      )
      return 2
    }
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
      deletes,
      removals,
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
  // For the promotion-held alert (#1763 PR 2): why the globals held, if
  // they did. GITHUB_OUTPUT is line-based, so it stays on one line.
  emit(
    'globals_reason',
    plan.globals.promote ? '' : plan.globals.reason.replace(/\s+/g, ' ')
  )
  if (deletesFile) emit('prefixes_planned', plan.deletes.paths.length)
  emit('removals_planned', plan.removals.paths.length)

  if (!execute) return 0
  if (plan.heldAll) {
    log(`::error title=Scoped promotion::${plan.heldAll}`)
    emit('objects_copied', 0)
    emit('objects_removed', 0)
    emit('complete', false)
    if (deletesFile) emit('prefixes_deleted', 0)
    // A verdict that holds everything (the gate errored) is a hold: exit 0
    // so the promotion-held steps still run. No verdict at all means the
    // step ran out of order or the file was lost — fail the step. A prune
    // reconcile has no promotion-held flow: its held deletes fail it (#1767).
    if (verdict === null) return 2
    return plan.deletes.paths.length > 0 ? 1 : 0
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
  // Deletes last (#1767): only after every copy succeeded, so prod's
  // index has stopped naming the dates. One at a time. A failed delete
  // warns and the rest go on, as the old reconcile's `rm || true` did: a
  // leftover directory no index names is swept by the next prune's plan.
  let deleted = 0
  const runDeletes = ok && plan.deletes.promote
  if (runDeletes) {
    for (const prefix of plan.deletes.paths) {
      if (await deletePrefix(prefix, prod)) deleted++
      else
        log(
          `::warning title=Prune reconcile::could not delete gs://${prod}/${prefix}/; the next prune sweeps it`
        )
    }
  }
  const deletesHeld = plan.deletes.paths.length > 0 && !plan.deletes.promote
  if (deletesHeld) {
    log(
      `::error title=Prune reconcile::${plan.deletes.paths.length} prod prefix(es) not deleted — ${plan.deletes.reason}`
    )
  }
  // Removals last (#2232): a failed district's stale per-date objects, only
  // after every copy succeeded. A held one stays with its held date.
  const removal =
    ok && plan.removals.paths.length > 0
      ? await runRemovals(plan.removals.paths, prod)
      : { removed: 0, ok: plan.removals.paths.length === 0 }
  const complete =
    ok &&
    plan.heldDates.length === 0 &&
    (plan.globals.paths.length === 0 || plan.globals.promote) &&
    !deletesHeld &&
    deleted === (runDeletes ? plan.deletes.paths.length : 0) &&
    removal.ok &&
    plan.removals.held.length === 0
  emit('objects_copied', copied)
  emit('objects_removed', removal.removed)
  emit('complete', complete)
  if (deletesFile) emit('prefixes_deleted', deleted)
  log(
    `[promote] copied ${copied} of ${plan.objectCount}` +
      (deletesFile
        ? `; deleted ${deleted} of ${plan.deletes.paths.length} prefix(es)`
        : '') +
      `; removed ${removal.removed} of ${plan.removals.paths.length} stale object(s)` +
      `; complete=${complete}`
  )
  summary(
    `- **Copied**: ${copied} of ${plan.objectCount}${ok ? '' : ' — ❌ a copy failed; later phases not run'}\n` +
      (deletesFile
        ? `- **Prod prefixes deleted (#1767)**: ${deleted} of ${plan.deletes.paths.length}${deletesHeld ? ` — ❌ held: ${plan.deletes.reason}` : ''}\n`
        : '') +
      (plan.removals.paths.length + plan.removals.held.length > 0
        ? `- **Stale objects removed (#2232)**: ${removal.removed} of ${plan.removals.paths.length}${removal.ok ? '' : ' — ❌ a removal failed'}${plan.removals.held.length ? `; ${plan.removals.held.length} held with their date` : ''}\n`
        : '')
  )
  if (!ok) return 1
  // Nothing else ever removes a stale object: a failed removal fails the step.
  if (!removal.ok) return 1
  // A reconcile that could not delete is a failed reconcile: prod keeps
  // dates staging pruned, and the next daily's count gate would freeze.
  return deletesHeld ? 1 : 0
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
    plan.deletes.paths.length > 0
      ? `- **Prod prefixes to delete (#1767)**: ${plan.deletes.paths.length} — ${plan.deletes.promote ? 'after the entry points' : `HELD — ${plan.deletes.reason}`}`
      : '',
    plan.removals.paths.length + plan.removals.held.length > 0
      ? `- **Stale objects to remove (#2232)**: ${plan.removals.paths.length} after the entry points; ${plan.removals.held.length} held with their date`
      : '',
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
