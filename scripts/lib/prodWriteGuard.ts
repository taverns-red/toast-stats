/**
 * Prod-Write Guard — Pure Functions (#1754)
 *
 * `data-pipeline.yml` has a `skip_promotion` dispatch input for staging-only
 * proof runs: the run goes through the count, value and content gates,
 * reports them, and must then write NOTHING to production. That promise only
 * holds if every step that touches prod is conditioned on the input, and a
 * step added later must not quietly break it.
 *
 * So the guard classifies steps by what their `run:` body DOES, not by their
 * name: a step is prod-writing if it
 *   - copies, syncs or moves INTO the production bucket
 *     (`gcloud storage cp|rsync|mv` whose destination is prod),
 *   - removes or updates a production object,
 *   - invalidates the Cloud CDN, or
 *   - writes to the `promotion-held` issue flow (label/issue create, comment,
 *     close). An intentional skip must not open or close alerts.
 * Reads from prod (`ls`, `cat`, `objects list|describe`, or a cp FROM prod)
 * are not writes.
 *
 * Such a step is guarded only if its `if:` (or its job's `if:`) has the
 * skip clause as a TOP-LEVEL `&&` conjunct. A clause that sits inside an
 * `||` group does not guarantee the skip.
 */

export interface WorkflowStep {
  name?: string
  id?: string
  if?: string
  run?: string
}

export interface WorkflowJob {
  if?: string
  steps?: WorkflowStep[]
}

export interface Workflow {
  jobs: Record<string, WorkflowJob>
}

export interface ProdWriteStep {
  job: string
  step: string
  reasons: string[]
  guarded: boolean
}

/** Guard clause for steps in the job that owns the `mode` step. */
export const SKIP_CLAUSE_SAME_JOB =
  "steps.mode.outputs.skip_promotion != 'true'"
/** Guard clause for steps in jobs downstream of `pipeline`. */
export const SKIP_CLAUSE_DOWNSTREAM =
  "needs.pipeline.outputs.skip_promotion != 'true'"

const PROD_REF = /GCS_BUCKET_PRODUCTION|toast-stats-data-ca/

/** Join `\`-continued lines and drop full-line shell comments. */
function shellCommands(run: string): string[] {
  return run
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'))
}

/** The command up to the first `||`, `&&`, `|`, `;` or redirection. */
function firstSimpleCommand(cmd: string): string {
  return cmd.split(/\s(?:\|\||&&|\||;|\d?>>?)\s?/)[0].trim()
}

/** Why `run` writes to production; empty when it does not. */
export function prodWriteReasons(run: string): string[] {
  const reasons: string[] = []
  for (const cmd of shellCommands(run)) {
    const simple = firstSimpleCommand(cmd)
    const storage = simple.match(
      /gcloud\s+storage\s+(cp|rsync|mv|rm|objects\s+update)\b/
    )
    if (storage) {
      const verb = storage[1].replace(/\s+/g, ' ')
      const tokens = simple.split(/\s+/)
      const target =
        verb === 'rm' || verb === 'objects update'
          ? tokens.some(t => PROD_REF.test(t))
          : PROD_REF.test(tokens[tokens.length - 1] ?? '')
      if (target) reasons.push(`gcloud storage ${verb} → production`)
    }
    if (/invalidate-cdn-cache/.test(cmd)) reasons.push('CDN invalidation')
    if (
      /\bgh\s+(issue\s+(create|comment|close)|label\s+create)\b/.test(cmd) &&
      /promotion-held/.test(run)
    ) {
      reasons.push('promotion-held issue flow')
    }
  }
  return [...new Set(reasons)]
}

/** The top-level `&&` conjuncts of a GitHub expression. */
export function topLevelConjuncts(expr: string): string[] {
  let flat = expr.replace(/\s+/g, ' ').trim()
  // Collapse parenthesised groups so their inner `&&` are not split on.
  let prev
  do {
    prev = flat
    flat = flat.replace(/\([^()]*\)/g, '(…)')
  } while (flat !== prev)
  if (/\|\|/.test(flat)) return [] // a top-level OR guarantees nothing
  return flat.split('&&').map(c => c.trim())
}

function hasClause(expr: string | undefined, clause: string): boolean {
  return expr !== undefined && topLevelConjuncts(expr).includes(clause)
}

/** Every prod-writing step in the workflow, with its guard status. */
export function findProdWriteSteps(
  workflow: Workflow,
  ownerJob = 'pipeline'
): ProdWriteStep[] {
  const out: ProdWriteStep[] = []
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const clause =
      jobName === ownerJob ? SKIP_CLAUSE_SAME_JOB : SKIP_CLAUSE_DOWNSTREAM
    for (const [i, step] of (job.steps ?? []).entries()) {
      const reasons = prodWriteReasons(step.run ?? '')
      if (reasons.length === 0) continue
      out.push({
        job: jobName,
        step: step.name ?? step.id ?? `#${i}`,
        reasons,
        guarded: hasClause(job.if, clause) || hasClause(step.if, clause),
      })
    }
  }
  return out
}
