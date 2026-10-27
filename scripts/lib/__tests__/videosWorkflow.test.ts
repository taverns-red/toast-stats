/**
 * Workflow contract: how-to video renders (#2293).
 *
 * Rendered videos are build outputs and never enter the source tree, not
 * even `.pr-assets` (Ron, PR #2295). They are rendered on a runner and
 * delivered as an Actions artifact. The workflow must stay opt-in (manual
 * dispatch, or a PR that touches `videos/**`), hold no cloud credentials,
 * and only gain PR-write access for the sticky comment. Sourced from the
 * YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/videos.yml')

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}
interface Job {
  needs?: string | string[]
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown> }
  outputs?: Record<string, string>
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  steps: Step[]
}
interface Workflow {
  on: {
    workflow_dispatch?: {
      inputs?: Record<string, { type?: string; options?: string[] }>
    }
    pull_request?: { paths?: string[] }
    [k: string]: unknown
  }
  permissions?: Record<string, string>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs: Record<string, Job>
}

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf-8') : ''
const wf = (raw ? parse(raw) : { on: {}, jobs: {} }) as Workflow
const jobs = Object.values(wf.jobs)
const steps = jobs.flatMap(j => j.steps)

describe('videos.yml (#2293)', () => {
  it('exists and is opt-in: manual dispatch or a PR touching videos/**', () => {
    expect(raw).not.toBe('')
    expect(Object.keys(wf.on).sort()).toEqual([
      'pull_request',
      'workflow_dispatch',
    ])
    expect(wf.on.pull_request?.paths).toContain('videos/**')
    expect(
      wf.on.pull_request?.paths?.every(
        // .nvmrc: setup-node reads it, so workflowPathFilterContract requires it.
        p =>
          p.startsWith('videos/') ||
          p === '.github/workflows/videos.yml' ||
          p === '.nvmrc'
      )
    ).toBe(true)
  })

  it('takes a scenario and a desktop/mobile/both format on dispatch', () => {
    const inputs = wf.on.workflow_dispatch?.inputs ?? {}
    expect(inputs['scenario']).toBeDefined()
    expect(inputs['format']?.type).toBe('choice')
    expect(inputs['format']?.options).toEqual(['desktop', 'mobile', 'both'])
  })

  it('reads contents only; PR write is for the sticky comment', () => {
    expect(wf.permissions).toEqual({ contents: 'read' })
    const writers = jobs.filter(j =>
      Object.values(j.permissions ?? {}).includes('write')
    )
    expect(writers).toHaveLength(1)
    // actions: read lists this run's artifacts for the links (#2353).
    expect(writers[0]!.permissions).toEqual({
      contents: 'read',
      actions: 'read',
      'pull-requests': 'write',
    })
    expect(writers[0]!.steps.some(s => /sticky/i.test(s.uses ?? ''))).toBe(true)
  })

  it('holds no cloud credentials and writes nowhere but the artifact', () => {
    expect(raw).not.toMatch(/google-github-actions|gcloud|gsutil|secrets\./)
    expect(raw).not.toMatch(/aws-actions|azure\/login/)
  })

  it('uploads the MP4s as an artifact pinned to a SHA, kept ~30 days', () => {
    const upload = steps.find(s =>
      (s.uses ?? '').startsWith('actions/upload-artifact@')
    )
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/)
    expect(String(upload?.with?.['path'])).toMatch(/videos\/out\/.*\.mp4/)
    expect(upload?.with?.['retention-days']).toBe(30)
  })

  describe('keeps the music previews out of the video artifact (#2344)', () => {
    const uploads = steps.filter(s =>
      (s.uses ?? '').startsWith('actions/upload-artifact@')
    )
    const paths = (s: Step | undefined) =>
      String(s?.with?.['path'] ?? '')
        .split('\n')
        .map(p => p.trim())
        .filter(Boolean)
    // videos-publish.yml downloads exactly this name and refuses any file
    // that is not one of the planned MP4s (scripts/lib/videoPublish.ts).
    const VIDEO_NAME =
      'videos-${{ steps.args.outputs.scenario }}-${{ github.run_id }}'
    const video = uploads.find(s => s.with?.['name'] === VIDEO_NAME)
    const music = uploads.find(s =>
      paths(s).some(p => p.startsWith('videos/out/music/'))
    )
    const render = wf.jobs['render'] as Job & {
      outputs?: Record<string, string>
    }
    const comment = jobs.find(j =>
      j.steps.some(s => /sticky/i.test(s.uses ?? ''))
    )
    const message = String(
      comment?.steps.find(s => /sticky/i.test(s.uses ?? ''))?.with?.[
        'message'
      ] ?? ''
    )

    it('uploads only MP4s under the name the publish workflow downloads', () => {
      expect(video).toBeDefined()
      expect(paths(video).length).toBeGreaterThan(0)
      for (const p of paths(video))
        expect(p).toMatch(/^videos\/out\/[^/]*\.mp4$/)
    })

    it('uploads the music previews as their own artifact', () => {
      expect(music).toBeDefined()
      expect(music).not.toBe(video)
      expect(paths(music)).toEqual(['videos/out/music/*.m4a'])
      expect(music!.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/)
      expect(music!.with?.['name']).toBe(
        'videos-music-${{ steps.args.outputs.scenario }}-${{ github.run_id }}'
      )
      expect(music!.with?.['if-no-files-found']).toBe('error')
      expect(music!.with?.['retention-days']).toBe(30)
    })

    // The render job is a matrix with one leg per scenario (#2353), so a job
    // output would hold only the last leg's URL. The comment job lists the
    // run's artifacts instead and links each scenario's videos and music.
    it("links every scenario's videos and music previews from the sticky comment", () => {
      expect(render).toBeDefined()
      const list = comment?.steps.find(s =>
        /actions\/runs\/.*\/artifacts/.test(s.run ?? '')
      )
      expect(list?.run).toMatch(/videos-\$s-\$GITHUB_RUN_ID/)
      expect(list?.run).toMatch(/videos-music-\$s-\$GITHUB_RUN_ID/)
      expect(message).toMatch(/steps\.\w+\.outputs\.links/)
    })
  })

  describe('renders every scenario a PR changes, one matrix leg each (#2353)', () => {
    const plan = wf.jobs['plan']
    const render = wf.jobs['render']
    const step = plan?.steps.find(s => /scenario/i.test(s.name ?? '') && s.run)

    it('plans the scenarios in a job the render matrix reads', () => {
      expect(plan).toBeDefined()
      expect(plan!.outputs?.['scenarios']).toMatch(
        /steps\.\w+\.outputs\.scenarios/
      )
      expect(render!.needs).toContain('plan')
      expect(render!.strategy?.['fail-fast']).toBe(false)
      expect(render!.strategy?.matrix?.['scenario']).toBe(
        '${{ fromJSON(needs.plan.outputs.scenarios) }}'
      )
      // The artifact name the publish workflow downloads stays per scenario.
      const args = render!.steps.find(s =>
        /Resolve scenario/.test(s.name ?? '')
      )
      expect(JSON.stringify(args)).toContain('matrix.scenario')
    })

    it("diffs against the PR base, which needs the merge commit's parent", () => {
      const checkout = plan!.steps.find(s =>
        (s.uses ?? '').startsWith('actions/checkout@')
      )
      expect(checkout?.with?.['fetch-depth']).toBe(2)
    })

    // Run the step's own script in a scratch repo: base commit, then a PR
    // commit, so HEAD^1 is the base exactly as on a pull_request merge ref.
    function runPlan(
      changed: Record<string, string | null>,
      env: Record<string, string>
    ): string[] {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'videos-plan-'))
      try {
        const git = (...a: string[]) =>
          spawnSync('git', a, { cwd: dir, encoding: 'utf-8' })
        git('init', '-q')
        git('config', 'user.email', 't@example.test')
        git('config', 'user.name', 'T')
        const write = (f: string, c: string) => {
          fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
          fs.writeFileSync(path.join(dir, f), c)
        }
        write('videos/src/scenarios/v2.ts', 'v2')
        write('videos/src/scenarios/v9.ts', 'v9')
        write('README.md', 'x')
        git('add', '-A')
        git('commit', '-qm', 'base')
        for (const [f, c] of Object.entries(changed)) {
          if (c === null) fs.rmSync(path.join(dir, f))
          else write(f, c)
        }
        git('add', '-A')
        git('commit', '-qm', 'pr', '--allow-empty')
        const out = path.join(dir, 'out.txt')
        const res = spawnSync('bash', ['-c', step!.run!], {
          cwd: dir,
          encoding: 'utf-8',
          env: {
            ...process.env,
            GITHUB_OUTPUT: out,
            RUNNER_TEMP: dir,
            ...env,
          },
        })
        expect(res.status, res.stderr).toBe(0)
        const line = fs
          .readFileSync(out, 'utf-8')
          .split('\n')
          .find(l => l.startsWith('scenarios='))
        return JSON.parse(line!.slice('scenarios='.length)) as string[]
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }

    it('on a PR, renders each added or changed scenario file', () => {
      expect(
        runPlan(
          {
            'videos/src/scenarios/v1.ts': 'new',
            'videos/src/scenarios/v3.ts': 'new',
            'videos/src/scenarios/v2.ts': 'changed',
            'videos/src/scenarios/index.ts': 'x',
          },
          { EVENT: 'pull_request', IN_SCENARIO: '' }
        )
      ).toEqual(['v1', 'v2', 'v3'])
    })

    it('on a PR that changes no scenario file, renders v2 as before', () => {
      expect(
        runPlan(
          { 'videos/src/layout.ts': 'x', 'videos/src/scenarios/v9.ts': null },
          { EVENT: 'pull_request', IN_SCENARIO: '' }
        )
      ).toEqual(['v2'])
    })

    it('on dispatch, renders the chosen scenario only', () => {
      expect(
        runPlan(
          { 'videos/src/scenarios/v1.ts': 'new' },
          { EVENT: 'workflow_dispatch', IN_SCENARIO: 'v4' }
        )
      ).toEqual(['v4'])
    })
  })

  it('never commits or pushes a render', () => {
    expect(raw).not.toMatch(/git (add|commit|push)/)
  })

  it('bounds each job with a render-sized timeout', () => {
    for (const job of jobs) {
      expect(job['timeout-minutes']).toBeGreaterThan(0)
      expect(job['timeout-minutes']).toBeLessThanOrEqual(45)
    }
  })

  it('runs one render per PR at a time', () => {
    expect(wf.concurrency?.group).toMatch(/pull_request\.number/)
    expect(wf.concurrency?.['cancel-in-progress']).toBe(true)
  })
})
