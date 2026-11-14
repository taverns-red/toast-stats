/**
 * Data-restore copy picker (#2539, #2492). Picks, per object, which
 * soft-deleted generation to restore after a bad publish, or that the object
 * was created by the bad run and goes. Logic: scripts/lib/dataRestorePlan.ts.
 *
 * Plan mode (default, makes no GCS call; reads two listing files):
 *   plan-data-restore.ts --live live.json --soft-deleted soft.json \
 *     --since <ISO time the bad run began> [--paths paths.txt] [--out plan.json]
 * where the listings are `gcloud storage ls --json <urls>` and
 * `gcloud storage ls --soft-deleted --json <urls>`.
 *
 * Execute mode (WRITE; runs gcloud storage restore / rm):
 *   plan-data-restore.ts --execute --plan plan.json \
 *     --live live.json --soft-deleted soft.json
 * Fresh listings are re-planned and must equal the saved plan, else it
 * refuses and does nothing.
 *
 * stdout: the plan (plan mode) or the commands run (execute), as JSON (R4).
 * stderr: logs. Exit: 0 ok · 1 refused / failed · 2 usage.
 * Env: GCLOUD (default gcloud).
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  RestorePlanError,
  executePlan,
  parseListing,
  planRestore,
  verifyPlan,
  type RestorePlan,
} from './lib/dataRestorePlan.js'

const { values } = parseArgs({
  options: {
    live: { type: 'string' },
    'soft-deleted': { type: 'string' },
    since: { type: 'string' },
    paths: { type: 'string' },
    out: { type: 'string' },
    plan: { type: 'string' },
    execute: { type: 'boolean', default: false },
  },
  strict: true,
})

const readJson = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8'))

function usage(): never {
  process.stderr.write(
    'usage: plan-data-restore.ts --live F --soft-deleted F --since ISO [--paths F] [--out F]\n' +
      '       plan-data-restore.ts --execute --plan F --live F --soft-deleted F\n'
  )
  process.exit(2)
}

try {
  if (!values.live || !values['soft-deleted']) usage()
  const live = parseListing(readJson(values.live))
  const softDeleted = parseListing(readJson(values['soft-deleted']))

  if (values.execute) {
    if (!values.plan) usage()
    const saved = readJson(values.plan) as RestorePlan
    const current = planRestore({
      live,
      softDeleted,
      since: saved.since,
      paths: saved.entries.map(e => e.name),
    })
    verifyPlan(saved, current)
    const gcloud = process.env.GCLOUD || 'gcloud'
    const ran: string[][] = []
    executePlan(saved, argv => {
      process.stderr.write(`${gcloud} ${argv.join(' ')}\n`)
      execFileSync(gcloud, argv, { stdio: ['ignore', 2, 2] })
      ran.push(argv)
    })
    process.stdout.write(JSON.stringify({ executed: ran }, null, 2) + '\n')
  } else {
    if (!values.since) usage()
    const paths = values.paths
      ? readFileSync(values.paths, 'utf8')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
      : undefined
    const plan = planRestore({ live, softDeleted, since: values.since, paths })
    const text = JSON.stringify(plan, null, 2) + '\n'
    if (values.out) writeFileSync(values.out, text)
    process.stdout.write(text)
    const counts = plan.entries.reduce<Record<string, number>>((m, e) => {
      m[e.action] = (m[e.action] ?? 0) + 1
      return m
    }, {})
    process.stderr.write(`plan: ${JSON.stringify(counts)}\n`)
    if (plan.refused > 0) {
      process.stderr.write(
        `${plan.refused} object(s) refused: resolve by hand; --execute will not run this plan\n`
      )
      process.exit(1)
    }
  }
} catch (e) {
  process.stderr.write(
    `${e instanceof RestorePlanError ? 'refused' : 'error'}: ${e instanceof Error ? e.message : String(e)}\n`
  )
  process.exit(1)
}
