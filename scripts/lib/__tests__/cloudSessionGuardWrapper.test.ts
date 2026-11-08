/**
 * #2542: the cloud guard wrapper must fail closed. Claude Code blocks a tool
 * call only on exit 2, so any other non-zero status from the checker (a
 * missing file, a throw, a syntax error, a kill) has to become 2, or the
 * command runs unchecked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const WRAPPER = resolve(process.cwd(), 'scripts/cloud-session-guard.sh')

let dir: string
let wrapper: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guard-wrapper-2542-'))
  wrapper = join(dir, 'cloud-session-guard.sh')
  copyFileSync(WRAPPER, wrapper)
  chmodSync(wrapper, 0o755)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function checker(source: string) {
  writeFileSync(join(dir, 'cloud-session-guard.mjs'), source)
}

function run(remote = 'true') {
  return spawnSync('bash', [wrapper], {
    input: '{"tool_name":"Bash","tool_input":{"command":"ls"}}',
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', CLAUDE_CODE_REMOTE: remote },
  })
}

describe('cloud-session-guard.sh fails closed (#2542)', () => {
  it('blocks when the checker file is missing', () => {
    expect(run().status).toBe(2)
  })

  it('blocks when the checker throws', () => {
    checker("throw new Error('boom')\n")
    expect(run().status).toBe(2)
  })

  it('blocks when the checker has a syntax error', () => {
    checker('const = ;\n')
    expect(run().status).toBe(2)
  })

  it('blocks when the checker is killed (exit 137)', () => {
    checker("process.kill(process.pid, 'SIGKILL')\n")
    const r = run()
    expect(r.status).toBe(2)
  })

  it('says why on stderr when it blocks for a checker failure', () => {
    checker("throw new Error('boom')\n")
    expect(run().stderr).toMatch(/could not run/)
  })

  it('passes the checker allow (0) and block (2) through', () => {
    checker('process.exit(0)\n')
    expect(run().status).toBe(0)
    checker('process.exit(2)\n')
    expect(run().status).toBe(2)
  })

  it('does nothing outside the cloud, even with no checker', () => {
    expect(run('').status).toBe(0)
  })

  // #2547: the remote check is the wrapper's first line, so outside the
  // cloud it exits 0 before it looks for node or the checker at all. An
  // empty PATH proves no external command (node included) runs.
  it('exits 0 outside the cloud before starting node', () => {
    checker('process.exit(2)\n')
    const noPath = mkdtempSync(join(tmpdir(), 'guard-nopath-'))
    try {
      for (const remote of [undefined, '', 'false', 'TRUE']) {
        const env: NodeJS.ProcessEnv = { PATH: noPath }
        if (remote !== undefined) env.CLAUDE_CODE_REMOTE = remote
        const r = spawnSync('/bin/bash', [wrapper], {
          input:
            '{"tool_name":"Read","tool_input":{"file_path":"/etc/passwd"}}',
          encoding: 'utf8',
          env,
        })
        expect(r.status, String(remote)).toBe(0)
        expect(r.stderr).toBe('')
      }
      const cloud = spawnSync('/bin/bash', [wrapper], {
        input: '{}',
        encoding: 'utf8',
        env: { PATH: noPath, CLAUDE_CODE_REMOTE: 'true' },
      })
      expect(cloud.status).toBe(2)
    } finally {
      rmSync(noPath, { recursive: true, force: true })
    }
  })
})
