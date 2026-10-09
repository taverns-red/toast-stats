/**
 * Every per-date mode fails the run on a compute or store failure unless the
 * operator passed `allow_partial` (#1708, plan S1-3, decision D7).
 *
 * Only daily failed the run. In `rebuild`, `rescrape` and
 * `rescrape-historical` a non-zero `compute-analytics` exit was a
 * `::warning::` plus `FAILED++`; the step stayed green and the run went on
 * to promote. The first corrupt write of the 2026-10 incident came from a
 * rebuild (run 37535062136).
 *
 * The contract, sourced from the workflow YAML so the glue cannot drift:
 *  - a compute failure in a per-date loop is counted, not swallowed;
 *  - the loop finishes (per-date uploads are intended), the stores are
 *    pushed, and THEN `scripts/partial-failure-gate.sh` fails the step
 *    when the count is non-zero — unless `inputs.allow_partial` is true;
 *  - `allow_partial` is a boolean dispatch input defaulting to false,
 *    mirroring `allow_value_changes`.
 * The gate script itself is exercised for real below.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const GATE = path.resolve(process.cwd(), 'scripts/partial-failure-gate.sh')
const COUNTERS = path.resolve(process.cwd(), 'scripts/compute-counters.jq')

interface Step {
  id?: string
  name?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

interface Input {
  type?: string
  default?: unknown
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  on: { workflow_dispatch: { inputs: Record<string, Input> } }
  jobs: Record<string, { steps?: Step[] }>
}
const pipelineSteps = workflow.jobs.pipeline.steps ?? []

const PER_DATE_MODES = ['rebuild', 'rescrape', 'rescrape-historical'] as const

/** The mode a step is gated to, from `if: steps.mode.outputs.mode == 'x'`. */
function stepMode(step: Step): string | undefined {
  return /^steps\.mode\.outputs\.mode == '([a-z-]+)'$/.exec(
    (step.if ?? '').trim()
  )?.[1]
}

/**
 * Logical lines of a run block: comments and blank lines dropped, and
 * backslash-continued lines joined into one command.
 */
function codeLines(run: string): string[] {
  const out: string[] = []
  let buffer = ''
  for (const raw of run.split('\n')) {
    const line = raw.replace(/^\s*#.*$/, '').trimEnd()
    if (/\\$/.test(line)) {
      buffer += line.slice(0, -1) + ' '
      continue
    }
    const joined = buffer + line
    buffer = ''
    if (joined.trim() !== '') out.push(joined)
  }
  return out
}

/** The body of every `if ! <...compute-analytics...>; then ... fi` block. */
function computeFailureBranches(run: string): string[] {
  const lines = codeLines(run)
  const branches: string[] = []
  lines.forEach((line, i) => {
    if (!/if ! .*collector-cli compute-analytics\b/.test(line)) return
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*fi\s*$/.test(lines[j])) break
      body.push(lines[j])
    }
    branches.push(body.join('\n'))
  })
  return branches
}

const GATE_CALL = /bash scripts\/partial-failure-gate\.sh "([a-z-]+)" /

describe('data-pipeline.yml: per-date modes fail on compute failure (#1708)', () => {
  it('declares allow_partial as a boolean dispatch input defaulting to false', () => {
    const input = workflow.on.workflow_dispatch.inputs.allow_partial
    expect(input).toBeDefined()
    expect(input.type).toBe('boolean')
    expect(input.default).toBe(false)
  })

  it('finds a compute-analytics loop for every per-date mode (non-vacuous)', () => {
    const modes = pipelineSteps
      .filter(s => typeof s.run === 'string')
      .filter(s => computeFailureBranches(s.run as string).length > 0)
      .map(stepMode)
    expect(new Set(modes)).toEqual(new Set(PER_DATE_MODES))
  })

  for (const mode of PER_DATE_MODES) {
    describe(mode, () => {
      const modeSteps = pipelineSteps.filter(s => stepMode(s) === mode)
      const loopIndex = modeSteps.findIndex(
        s => computeFailureBranches(s.run ?? '').length > 0
      )
      const loop = modeSteps[loopIndex]
      const gateIndex = modeSteps.findIndex(s => GATE_CALL.test(s.run ?? ''))
      const gate = modeSteps[gateIndex]

      it('counts every compute failure into FAILED', () => {
        const branches = computeFailureBranches(loop.run ?? '')
        expect(branches.length).toBeGreaterThan(0)
        for (const body of branches) {
          expect(body).toMatch(/FAILED=\$\(\(FAILED \+ 1\)\)/)
        }
      })

      it('captures the compute JSON for the counters instead of discarding stdout', () => {
        for (const line of codeLines(loop.run ?? '')) {
          if (!/collector-cli compute-analytics\b/.test(line)) continue
          expect(line).toMatch(/>\s*"\$\{COMPUTE_JSON\}"/)
          expect(line).not.toMatch(/2>&1/)
        }
        expect(loop.run).toMatch(/scripts\/compute-counters\.jq/)
      })

      it('runs the partial-failure gate for this mode, at or after the loop', () => {
        expect(gate, `no partial-failure gate step for ${mode}`).toBeDefined()
        expect(GATE_CALL.exec(gate.run ?? '')?.[1]).toBe(mode)
        expect(gateIndex).toBeGreaterThanOrEqual(loopIndex)
      })

      it('wires ALLOW_PARTIAL to inputs.allow_partial on the gate step', () => {
        expect(gate.env?.ALLOW_PARTIAL).toBe('${{ inputs.allow_partial }}')
      })

      it('makes the gate the last command of its step, after every store push', () => {
        const lines = codeLines(gate.run ?? '')
        expect(lines[lines.length - 1]).toMatch(GATE_CALL)
      })

      it('feeds the gate the loop FAILED count', () => {
        const call = codeLines(gate.run ?? '').at(-1) ?? ''
        if (gate === loop) {
          expect(call).toMatch(/"\$\{FAILED\}"\s*$/)
        } else {
          // Separate step: the loop must hand its count over as an output.
          expect(loop.id).toBeTruthy()
          expect(loop.run).toMatch(
            /echo "failed=\$\{FAILED\}" >> "\$GITHUB_OUTPUT"/
          )
          expect(gate.env?.LOOP_FAILED).toBe(
            `\${{ steps.${loop.id}.outputs.failed }}`
          )
          expect(call).toMatch(/"\$\{LOOP_FAILED\}"\s*$/)
        }
      })

      it('no longer downgrades the run-level failure to a warning', () => {
        expect(loop.run).not.toMatch(/::warning::\$\{FAILED\} dates failed/)
      })
    })
  }

  it('prints the store counters in the daily step summary too', () => {
    const daily = pipelineSteps.find(
      s => s.name === '[daily] Compute Analytics'
    )
    expect(daily?.run).toMatch(/scripts\/compute-counters\.jq/)
  })
})

function gate(failed: string, env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partial-gate-'))
  const summary = path.join(dir, 'summary.md')
  try {
    const r = spawnSync('bash', [GATE, 'rebuild', failed], {
      encoding: 'utf-8',
      env: {
        PATH: process.env.PATH ?? '',
        GITHUB_STEP_SUMMARY: summary,
        ...env,
      },
    })
    const md = fs.existsSync(summary) ? fs.readFileSync(summary, 'utf-8') : ''
    return { status: r.status, out: r.stdout + r.stderr, md }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('scripts/partial-failure-gate.sh (#1708)', () => {
  it('passes a run with no failures', () => {
    const r = gate('0')
    expect(r.status).toBe(0)
    expect(r.out).not.toMatch(/::error::/)
  })

  it('fails a run with failures by default', () => {
    const r = gate('3')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/::error::.*3 .*rebuild/)
    expect(r.out).toMatch(/allow_partial/)
    expect(r.md).toMatch(/3/)
  })

  it('fails when allow_partial is anything but the literal true', () => {
    expect(gate('3', { ALLOW_PARTIAL: 'false' }).status).toBe(1)
    expect(gate('3', { ALLOW_PARTIAL: '' }).status).toBe(1)
    expect(gate('3', { ALLOW_PARTIAL: 'yes' }).status).toBe(1)
  })

  it('lets a run with failures continue when allow_partial is true', () => {
    const r = gate('3', { ALLOW_PARTIAL: 'true' })
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/::warning::.*3 .*allow_partial/)
    expect(r.md).toMatch(/allow_partial/)
  })

  it('fails closed on a missing or non-numeric count', () => {
    expect(gate('').status).toBe(2)
    expect(gate('abc').status).toBe(2)
    expect(gate('', { ALLOW_PARTIAL: 'true' }).status).toBe(2)
  })
})

function counters(jsonl: string): { status: number | null; out: string } {
  const r = spawnSync('jq', ['-rs', '-f', COUNTERS], {
    input: jsonl,
    encoding: 'utf-8',
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

describe('scripts/compute-counters.jq (#1708)', () => {
  it('sums the store counters across per-date compute outputs', () => {
    const r = counters(
      [
        {
          timeSeries: { written: 3, failed: 1 },
          clubTrends: { written: 4, failed: 0 },
          clubRace: { written: 1, failed: 0 },
        },
        {
          timeSeries: { written: 2, failed: 0 },
          clubTrends: { written: 2, failed: 2 },
          clubRace: { written: 0, failed: 1 },
        },
      ]
        .map(o => JSON.stringify(o))
        .join('\n')
    )
    expect(r.status).toBe(0)
    expect(r.out).toContain('- **Time-series points**: 5 written, 1 failed')
    expect(r.out).toContain('- **Club-trends stores**: 6 written, 2 failed')
    expect(r.out).toContain('- **Club-race store**: 1 written, 1 failed')
  })

  it('reports zeros for an empty input or an output without counters', () => {
    expect(counters('').out).toContain(
      '- **Time-series points**: 0 written, 0 failed'
    )
    expect(counters('{"status":"failed"}').out).toContain(
      '- **Club-race store**: 0 written, 0 failed'
    )
  })
})
