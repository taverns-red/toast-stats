/**
 * Local pipeline harness — CLI (#1768, ADR-015 step 10, P3-2).
 *
 *   npm run pipeline:local -- --mode <daily|rescrape|rescrape-historical>
 *     --fixture <date> [--districts <id,id>] [--truncated-store] [--keep]
 *
 * Seeds a fresh gcloud-shim world (a staging and a production bucket, the
 * fixture corpus of scripts/lib/pipelineHarness.ts), runs the mode for the
 * fixture date the way data-pipeline.yml sequences it, through the real
 * scripts/pipeline/* scripts, gates and promoter, then checks every prod
 * object: a byte-for-byte twin of staging where this run promoted it,
 * untouched otherwise, exactly one gzip layer under the CDN prefixes, and
 * parseable. No network and no GCS.
 *
 * --fixture: one of the corpus dates (FIXTURE_DATES).
 * --districts: rescrape only, an explicit subset (default: discover).
 * --keep: leave the world on disk and print its path.
 *
 * Stdout: one JSON summary (R4: logs go to stderr).
 * Exit: 0 — the run finished (promoted or held) and prod is a twin;
 *       1 — the run failed or a prod-twin violation; 2 — usage.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  FIXTURE_DATES,
  HARNESS_MODES,
  HARNESS_PROD,
  createWorld,
  prodTwinViolations,
  readBucket,
  runPipeline,
  type HarnessMode,
} from './lib/pipelineHarness.js'

function usage(msg: string): never {
  process.stderr.write(
    `pipeline-local: ${msg}\n` +
      'usage: pipeline-local --mode <daily|rescrape|rescrape-historical> ' +
      `--fixture <${Object.values(FIXTURE_DATES).join('|')}> ` +
      '[--districts <id,id>] [--truncated-store] [--keep]\n'
  )
  process.exit(2)
}

function parseArgs(argv: string[]) {
  const out: {
    mode?: string
    fixture?: string
    districts?: string
    truncated: boolean
    keep: boolean
  } = { truncated: false, keep: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const value = () => argv[++i] ?? usage(`${a} needs a value`)
    if (a === '--mode') out.mode = value()
    else if (a === '--fixture') out.fixture = value()
    else if (a === '--districts') out.districts = value()
    else if (a === '--truncated-store') out.truncated = true
    else if (a === '--keep') out.keep = true
    else usage(`unknown argument ${a}`)
  }
  return out
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.mode || !HARNESS_MODES.includes(args.mode as HarnessMode)) {
    usage(`--mode must be one of ${HARNESS_MODES.join(', ')}`)
  }
  const dates: string[] = Object.values(FIXTURE_DATES)
  if (!args.fixture || !dates.includes(args.fixture)) {
    usage(`--fixture must be one of ${dates.join(', ')}`)
  }
  if (args.districts !== undefined && args.mode !== 'rescrape') {
    usage('--districts applies to rescrape only')
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-local-'))
  try {
    const world = createWorld(dir, { truncatedStore: args.truncated })
    const prodBefore = readBucket(world.root, HARNESS_PROD)
    const run = await runPipeline(world, {
      mode: args.mode as HarnessMode,
      date: args.fixture,
      districts: args.districts,
    })
    for (const s of run.steps) {
      process.stderr.write(`── ${s.step} (exit ${s.status})\n${s.stderr}\n`)
    }
    const violations = prodTwinViolations(world, prodBefore, run.promoted)
    process.stdout.write(
      JSON.stringify(
        {
          mode: args.mode,
          fixture: args.fixture,
          outcome: run.outcome,
          failedStep: run.failedStep ?? null,
          counts: run.counts ?? null,
          manifestObjects: run.manifest.length,
          completeness: run.completeness?.reason ?? null,
          heldDates: run.completeness?.heldDates ?? [],
          content: run.content?.reason ?? null,
          promoted: run.promoted.length,
          prodObjects: readBucket(world.root, HARNESS_PROD).size,
          prodTwinViolations: violations,
          world: args.keep ? dir : null,
        },
        null,
        2
      ) + '\n'
    )
    return run.outcome === 'failed' || violations.length > 0 ? 1 : 0
  } finally {
    if (!args.keep) fs.rmSync(dir, { recursive: true, force: true })
  }
}

main()
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    process.stderr.write(`pipeline-local: unexpected: ${String(err)}\n`)
    process.exitCode = 1
  })
