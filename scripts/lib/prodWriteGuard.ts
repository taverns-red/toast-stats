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
 *   - runs the scoped promoter with `--execute` (#1763; it calls gcloud
 *     itself, so the pattern above cannot see its writes),
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
  env?: Record<string, unknown>
}

export interface WorkflowJob {
  if?: string
  env?: Record<string, unknown>
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

/**
 * The simple commands of a line, split at `||`, `&&`, `|`, `;` and
 * redirections. Every one is checked, not only the first: a write after a
 * pipe (`… | xargs gcloud storage rm …`) or an `&&` is still a write (#2285).
 */
function simpleCommands(cmd: string): string[] {
  return cmd
    .split(/\s(?:\|\||&&|\||;|\d?>>?)\s?/)
    .map(c => c.trim())
    .filter(c => c !== '')
}

/**
 * The gcloud binary, bare, by path, or held in a variable (`"${GCLOUD}"`,
 * `$GCLOUD`), followed by a write verb of `gcloud storage` (#2285).
 */
const GCLOUD_STORAGE_WRITE =
  /(?:gcloud|\$\{?[A-Za-z_]*GCLOUD[A-Za-z_]*\}?)["']?\s+storage\s+(cp|rsync|mv|rm|objects\s+update)\b/

/**
 * gsutil and a write verb, past its top-level flags. `-h`, `-o`, `-u` and
 * `-i` take a value; the rest (`-m`, `-q`, …) do not (#2285).
 */
const GSUTIL_WRITE =
  /\bgsutil(?:\s+(?:-[hoiu]\s+(?:"[^"]*"|'[^']*'|\S+)|-[A-Za-z]+))*\s+(cp|rsync|mv|rm|setmeta|compose|rewrite|acl|defacl|retention)\b/

/** Verbs whose destination is their last argument; the others act in place. */
const LAST_ARG_IS_TARGET: ReadonlySet<string> = new Set([
  'cp',
  'rsync',
  'mv',
  'compose',
])

/**
 * Shell variables that hold a production reference, directly or through
 * another such variable (#2285): `DEST="gs://${GCS_BUCKET_PRODUCTION}/v1"`,
 * then `D="${DEST}/x"`. `env` is the step's and job's `env:` map, whose
 * entries are variables of the same kind. A value that merely mentions
 * prod (a `$(gcloud storage cat …)` read) also counts: the guard errs
 * towards flagging, and only a variable at the HEAD of a destination (the
 * bucket position) makes that destination prod.
 */
function prodVariables(run: string, env: Record<string, unknown>): string[] {
  const assignments: Array<[string, string]> = Object.entries(env).map(
    ([k, v]) => [k, String(v)]
  )
  const assign =
    /(?:^|[\s;&|(])(?:(?:export|local|readonly|declare(?:\s+-\w+)*)\s+)?([A-Za-z_]\w*)=("(?:[^"\\]|\\.)*"|'[^']*'|\$\([^)]*\)|[^\s;]*)/g
  for (const m of run.matchAll(assign)) assignments.push([m[1], m[2]])
  const vars = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const [name, value] of assignments) {
      if (vars.has(name)) continue
      if (PROD_REF.test(value) || [...vars].some(v => refsVar(value, v))) {
        vars.add(name)
        grew = true
      }
    }
  }
  return [...vars]
}

function refsVar(text: string, name: string): boolean {
  return new RegExp(`\\$\\{?${name}\\b`).test(text)
}

/** Does this destination token name prod, by name or by a prod variable? */
function isProdTarget(token: string, prodVars: readonly string[]): boolean {
  if (PROD_REF.test(token)) return true
  const head = token.replace(/^["']+/, '').replace(/^gs:\/\//, '')
  const m = head.match(/^\$\{?([A-Za-z_]\w*)/)
  return m !== null && prodVars.includes(m[1])
}

/**
 * Scripts that may be handed the prod bucket because they only read it,
 * keyed by path, with what they do. The contract test checks each file has
 * no storage write verb, so a write added to one turns the guard red.
 */
export const READ_ONLY_PROD_SCRIPTS: Readonly<Record<string, string>> = {
  'scripts/pipeline/check-report-sidecars.sh':
    'lists staging and prod report sidecars per date (#1767)',
}

const SCRIPT_FILE = /^(?:\.\/)?[^\s"'=]+\.(?:sh|bash|ts|mts|cts|js|mjs|cjs|py)$/

/**
 * A script invoked with a production reference among its words (an
 * argument, a `--flag=value`, or a `VAR=value` prefix), unless it is on
 * READ_ONLY_PROD_SCRIPTS. The guard cannot see inside the script, so it
 * must assume the script writes (#2285).
 */
function scriptGivenProd(
  simple: string,
  prodVars: readonly string[]
): string | undefined {
  const tokens = simple.split(/\s+/)
  const strip = (t: string) => t.replace(/^["']+|["']+$/g, '')
  const i = tokens.findIndex(t => SCRIPT_FILE.test(strip(t)))
  if (i === -1) return undefined
  const script = strip(tokens[i]).replace(/^\.\//, '')
  if (script in READ_ONLY_PROD_SCRIPTS) return undefined
  const givenProd = tokens.some(
    (t, j) => j !== i && (PROD_REF.test(t) || prodVars.some(v => refsVar(t, v)))
  )
  return givenProd ? script : undefined
}

/** Why `run` writes to production; empty when it does not. */
export function prodWriteReasons(
  run: string,
  env: Record<string, unknown> = {}
): string[] {
  const reasons: string[] = []
  const prodVars = prodVariables(run.replace(/\\\r?\n/g, ' '), env)
  for (const cmd of shellCommands(run)) {
    for (const simple of simpleCommands(cmd)) {
      const script = scriptGivenProd(simple, prodVars)
      if (script) reasons.push(`script given the production bucket: ${script}`)
      for (const [tool, pattern] of [
        ['gcloud storage', GCLOUD_STORAGE_WRITE],
        ['gsutil', GSUTIL_WRITE],
      ] as const) {
        const m = simple.match(pattern)
        if (!m) continue
        const verb = m[1].replace(/\s+/g, ' ')
        const tokens = simple.split(/\s+/)
        const target = LAST_ARG_IS_TARGET.has(verb)
          ? isProdTarget(tokens[tokens.length - 1] ?? '', prodVars)
          : tokens.some(t => isProdTarget(t, prodVars))
        if (target) reasons.push(`${tool} ${verb} → production`)
      }
    }
    // The scoped promoter (#1763) writes prod through its own gcloud calls,
    // invisible to the pattern above; its dry run only reads.
    if (/promote-run-manifest\.ts\b.*--execute\b/.test(cmd)) {
      reasons.push('manifest promotion → production')
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
  // Collapse parenthesised groups, innermost first, so their inner `&&`
  // are not split on. The placeholder has no parentheses, so an enclosing
  // group collapses on the next pass (nested groups, #1763).
  let prev
  do {
    prev = flat
    flat = flat.replace(/\([^()]*\)/g, '⟨group⟩')
  } while (flat !== prev)
  if (/\|\|/.test(flat)) return [] // a top-level OR guarantees nothing
  return flat.split('&&').map(c => c.trim())
}

function hasClause(expr: string | undefined, clause: string): boolean {
  return expr !== undefined && topLevelConjuncts(expr).includes(clause)
}

/**
 * Steps allowed to `gcloud storage rsync` into prod, with the issue that
 * retires each. None is left: the whole-prefix promotion rsync went in
 * #1763 PR 2, and the prune reconcile's v1/ + config/ re-sync in #1767
 * (it promotes its regenerated indexes through the run manifest).
 */
export const PROD_RSYNC_EXEMPT: Readonly<Record<string, string>> = {}

/**
 * Every step that rsyncs INTO prod. The contract test pins this to exactly
 * the PROD_RSYNC_EXEMPT steps of data-pipeline.yml.
 */
export function prodRsyncSteps(workflow: Workflow): ProdWriteStep[] {
  return findProdWriteSteps(workflow).filter(
    s =>
      s.reasons.includes('gcloud storage rsync → production') ||
      s.reasons.includes('gsutil rsync → production')
  )
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
      const reasons = prodWriteReasons(step.run ?? '', {
        ...job.env,
        ...step.env,
      })
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

/**
 * The reasons that are not a direct data write: the one prod-write
 * mechanism (the manifest promoter, which every staged object reaches prod
 * through, gated) and the promotion's side effects.
 */
const NOT_A_DIRECT_WRITE: ReadonlySet<string> = new Set([
  'manifest promotion → production',
  'CDN invalidation',
  'promotion-held issue flow',
])

/**
 * Steps allowed to write prod data outside the manifest promote, by step
 * name, with the issue that retires each. None is left: the report
 * sidecars moved onto the promote in #1767, and the education rollup
 * (mirror-education-rollup.sh, deleted) in #2222. The contract test
 * (dataPipelineReportSidecarManifest.test.ts) pins `directProdWriteSteps`
 * to none, and this to empty.
 */
export const DIRECT_PROD_WRITE_EXEMPT: Readonly<Record<string, string>> = {}

/**
 * Every step that writes prod data by itself — a `gcloud storage` copy,
 * move, remove or update into prod, or a script known to — instead of
 * through scripts/promote-run-manifest.ts (#1767, ADR-015 step 9: one
 * prod-write mechanism).
 */
export function directProdWriteSteps(workflow: Workflow): ProdWriteStep[] {
  return findProdWriteSteps(workflow).filter(s =>
    s.reasons.some(r => !NOT_A_DIRECT_WRITE.has(r))
  )
}
