/**
 * Test doubles for the agent CLI (#2418). No network, no real gh or git:
 * every command a subcommand runs is answered from a scripted table, and
 * recorded so a test can assert exactly what was (and was not) run.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExecResult, Runner } from '../agentCli/exec.js'

export const FIXTURES = join(__dirname, 'fixtures', 'agent-cli')

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

export function ok(stdout: string): ExecResult {
  return { stdout, stderr: '', code: 0 }
}

export function fail(stderr: string, code = 1, stdout = ''): ExecResult {
  return { stdout, stderr, code }
}

type Answer = ExecResult | ExecResult[]

/**
 * A runner that answers by matching `cmd + args` (joined with spaces)
 * against each rule's pattern, first match wins. An array answer is
 * consumed one entry per call (the last entry repeats), which scripts
 * "503 then success" retries. An unmatched command fails loudly so a test
 * never silently depends on an unscripted call.
 */
export function fakeRunner(rules: Array<[RegExp, Answer]>): Runner & {
  calls: string[]
} {
  const calls: string[] = []
  const counters = new Map<number, number>()
  const runner = (async (cmd: string, args: readonly string[]) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    for (let i = 0; i < rules.length; i++) {
      const [pattern, answer] = rules[i]
      if (!pattern.test(line)) continue
      if (!Array.isArray(answer)) return answer
      const n = counters.get(i) ?? 0
      counters.set(i, n + 1)
      return answer[Math.min(n, answer.length - 1)]
    }
    return fail(`fakeRunner: unscripted command: ${line}`, 99)
  }) as Runner & { calls: string[] }
  runner.calls = calls
  return runner
}

export const noSleep = (): Promise<void> => Promise.resolve()
