/**
 * agent-cli dispatcher (#2418): every subcommand has --help that names
 * --json, usage errors exit 3, and --json output is parseable. No network:
 * the runner is a fake.
 */
import { describe, it, expect } from 'vitest'
import { main, SUBCOMMANDS } from '../agentCli/cli.js'
import { fail, fakeRunner, fixture, ok, noSleep } from './agentCliFakes.js'

function capture() {
  const out: string[] = []
  const err: string[] = []
  return {
    out,
    err,
    deps: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
      sleep: noSleep,
      runner: fakeRunner([]),
    },
  }
}

const NAMES = [
  'ci-wait',
  'main-status',
  'job-log',
  'live-version',
  'preview-url',
  'worktree-audit',
]

describe('agent-cli', () => {
  it('ships exactly the first-cut subcommands', () => {
    expect(Object.keys(SUBCOMMANDS).sort()).toEqual([...NAMES].sort())
  })

  it('top-level --help lists every subcommand', async () => {
    const c = capture()
    expect(await main(['--help'], c.deps)).toBe(0)
    const text = c.out.join('\n')
    for (const n of NAMES) expect(text).toContain(n)
    expect(text).toMatch(/read-only/i)
  })

  it.each(NAMES)('%s --help documents --json and exits 0', async name => {
    const c = capture()
    expect(await main([name, '--help'], c.deps)).toBe(0)
    const text = c.out.join('\n')
    expect(text).toContain(`agent-cli ${name}`)
    expect(text).toContain('--json')
  })

  it('exits 3 on an unknown subcommand or a missing argument', async () => {
    expect(await main(['merge-it'], capture().deps)).toBe(3)
    expect(await main(['ci-wait'], capture().deps)).toBe(3)
    expect(await main(['preview-url', 'abc'], capture().deps)).toBe(3)
  })

  it('prints parseable JSON for preview-url --json', async () => {
    const c = capture()
    c.deps.runner = fakeRunner([
      [/issues\/2416\/comments/, ok(fixture('issue-comments-2416.json'))],
      [/^gh pr view 2416 /, ok('{"state":"OPEN"}')],
    ])
    const code = await main(['preview-url', '2416', '--json'], {
      ...c.deps,
      now: () => Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(code).toBe(0)
    expect(JSON.parse(c.out.join(''))).toMatchObject({
      pr: 2416,
      expired: false,
    })
  })

  describe('ci-wait --interval/--timeout are seconds, flag or default (#2463)', () => {
    const PENDING = JSON.stringify([
      {
        name: 'build',
        state: 'IN_PROGRESS',
        bucket: 'pending',
        link: '',
        workflow: 'CI',
        startedAt: '2026-11-02T00:00:00Z',
        completedAt: '',
      },
    ])

    /** Run ci-wait against checks that never finish, on a fake clock. */
    async function runPending(extra: string[]) {
      const c = capture()
      let clock = 0
      const sleeps: number[] = []
      const code = await main(['ci-wait', '123', '--json', ...extra], {
        ...c.deps,
        runner: fakeRunner([[/^gh pr checks 123 /, fail('', 8, PENDING)]]),
        now: () => clock,
        sleep: async ms => {
          sleeps.push(ms)
          clock += ms
        },
      })
      const r = JSON.parse(c.out.join('')) as {
        timedOut: boolean
        waitedMs: number
      }
      return { code, sleeps, r }
    }

    it('with no flags polls every 30 000 ms for up to 3 600 000 ms', async () => {
      const { code, sleeps, r } = await runPending([])
      expect(code).toBe(2)
      expect(r.timedOut).toBe(true)
      // intervalMs === 30_000
      expect(new Set(sleeps)).toEqual(new Set([30_000]))
      // timeoutMs === 3_600_000: waits until the next sleep would overrun it.
      expect(r.waitedMs).toBe(3_600_000)
      expect(sleeps).toHaveLength(120)
    })

    it('converts passed --interval and --timeout from seconds to ms', async () => {
      const { sleeps, r } = await runPending([
        '--interval',
        '60',
        '--timeout',
        '300',
      ])
      expect(new Set(sleeps)).toEqual(new Set([60_000]))
      expect(r.waitedMs).toBe(300_000)
    })
  })

  it('in --json mode reports a tool error as JSON on stdout and exits 3', async () => {
    const c = capture()
    const code = await main(['main-status', '--json'], c.deps)
    expect(code).toBe(3)
    expect(JSON.parse(c.out.join(''))).toHaveProperty('error')
  })
})
