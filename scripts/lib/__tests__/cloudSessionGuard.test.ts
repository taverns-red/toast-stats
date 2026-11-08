/**
 * Cloud-session label guard (#2519, ops#242).
 *
 * Cloud workers act as `rservant` on GitHub, and the ADR 0019 guard
 * (`cdn-json-compat.yml`) trusts `db-breaking-approved` when its latest
 * `labeled` event is by rservant. So a cloud agent applying the label would
 * pass as Ron. `scripts/cloud-session-guard.sh` is a PreToolUse hook that
 * refuses, in the cloud VM only, any tool call that applies, creates, edits
 * or removes that label, by any path we can see. It is a stopgap: the real
 * fix is a separate GitHub identity for agents (ops#242).
 *
 * Contract (Claude Code hooks): exit 2 blocks the tool call and feeds stderr
 * back to the model; exit 0 allows it.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const GUARD = resolve(ROOT, 'scripts/cloud-session-guard.sh')
const SETTINGS = resolve(ROOT, '.claude/settings.json')

const R = 'repos/taverns-red/toast-stats'
const API = `https://api.github.com/${R}`

function guard(
  toolInput: Record<string, unknown>,
  { remote = 'true', tool = 'Bash' }: { remote?: string; tool?: string } = {}
) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' }
  if (remote !== '') env.CLAUDE_CODE_REMOTE = remote
  return spawnSync('bash', [GUARD], {
    input: JSON.stringify({ tool_name: tool, tool_input: toolInput }),
    env,
    encoding: 'utf8',
  })
}

const bash = (command: string, remote = 'true') =>
  guard({ command }, { remote })

describe('refuses writes of db-breaking-approved in a cloud session', () => {
  it.each([
    // gh issue / pr edit and create
    [
      'gh issue edit --add-label',
      'gh issue edit 12 --add-label db-breaking-approved',
    ],
    [
      'gh pr edit --add-label',
      'gh pr edit 12 --add-label db-breaking-approved',
    ],
    [
      'gh pr edit --remove-label',
      'gh pr edit 12 --remove-label db-breaking-approved',
    ],
    [
      'gh pr edit, label among others',
      'gh pr edit 12 --add-label bug,db-breaking-approved',
    ],
    [
      'gh pr edit --add-label=',
      'gh pr edit 12 --add-label=db-breaking-approved',
    ],
    [
      'gh pr create --label',
      'gh pr create --title t --body b --label db-breaking-approved',
    ],
    ['gh issue create -l', 'gh issue create -t t -b b -l db-breaking-approved'],
    // gh label
    ['gh label create', 'gh label create db-breaking-approved --color ff0000'],
    ['gh label edit', 'gh label edit db-breaking-approved --description x'],
    [
      'gh label edit rename into it',
      'gh label edit other --name db-breaking-approved',
    ],
    ['gh label delete', 'gh label delete db-breaking-approved --yes'],
    [
      'gh label clone (copies it without naming it)',
      'gh label clone taverns-red/red-table --force',
    ],
    // gh api, REST
    [
      'gh api implicit POST -f labels[]',
      `gh api ${R}/issues/12/labels -f 'labels[]=db-breaking-approved'`,
    ],
    [
      'gh api -X POST -f labels[]',
      `gh api -X POST ${R}/issues/12/labels -f labels[]=db-breaking-approved`,
    ],
    [
      'gh api -X PUT replaces labels',
      `gh api -X PUT ${R}/issues/12/labels -f labels[]=db-breaking-approved`,
    ],
    [
      'gh api --method PATCH issue labels',
      `gh api --method PATCH ${R}/issues/12 -f 'labels[]=db-breaking-approved'`,
    ],
    [
      'gh api -XDELETE remove label',
      `gh api -XDELETE ${R}/issues/12/labels/db-breaking-approved`,
    ],
    [
      'gh api -X DELETE label',
      `gh api -X DELETE ${R}/labels/db-breaking-approved`,
    ],
    [
      'gh api create label -F name=',
      `gh api ${R}/labels -F name=db-breaking-approved -f color=ff0000`,
    ],
    [
      'gh api PATCH rename label',
      `gh api -X PATCH ${R}/labels/foo -f new_name=db-breaking-approved`,
    ],
    [
      'gh api POST issue with labels',
      `gh api ${R}/issues -f title=x -f 'labels[]=db-breaking-approved'`,
    ],
    [
      'gh api full URL',
      `gh api ${API}/issues/12/labels -f labels[]=db-breaking-approved`,
    ],
    [
      'gh api --raw-field',
      `gh api ${R}/issues/12/labels --raw-field labels[]=db-breaking-approved`,
    ],
    // curl / wget
    [
      'curl -X POST -d JSON',
      `curl -X POST -H "Authorization: token $T" ${API}/issues/12/labels -d '{"labels":["db-breaking-approved"]}'`,
    ],
    [
      'curl --request=PUT',
      `curl --request=PUT ${API}/issues/12/labels --data '{"labels":["db-breaking-approved"]}'`,
    ],
    [
      'curl -XDELETE',
      `curl -XDELETE ${API}/issues/12/labels/db-breaking-approved`,
    ],
    [
      'curl implicit POST --data-raw',
      `curl ${API}/labels --data-raw '{"name":"db-breaking-approved"}'`,
    ],
    [
      'curl --json',
      `curl ${API}/issues/12/labels --json '{"labels":["db-breaking-approved"]}'`,
    ],
    [
      'wget --post-data',
      `wget --post-data='{"labels":["db-breaking-approved"]}' ${API}/issues/12/labels`,
    ],
    [
      'wget --method=DELETE',
      `wget --method=DELETE ${API}/labels/db-breaking-approved`,
    ],
    [
      'python requests.post',
      `python3 -c "import requests; requests.post('${API}/issues/12/labels', json={'labels':['db-breaking-approved']})"`,
    ],
    [
      'node fetch POST',
      `node -e "fetch('${API}/issues/12/labels',{method:'POST',body:JSON.stringify({labels:['db-breaking-approved']})})"`,
    ],
    // spelling variants
    ['upper case', 'GH PR EDIT 12 --ADD-LABEL DB-BREAKING-APPROVED'],
    ['mixed case', 'gh pr edit 12 --add-label DB-Breaking-Approved'],
    ['double quotes', 'gh pr edit 12 --add-label "db-breaking-approved"'],
    ['split quoting', `gh pr edit 12 --add-label "db"'-breaking'"-approved"`],
    ['quoted command name', `"gh" 'label' create db-breaking-approved`],
    ['backslash escapes', 'gh pr edit 12 --add-label db\\-breaking\\-approved'],
    [
      'URL-encoded dashes',
      `gh api -X DELETE ${R}/labels/db%2Dbreaking%2Dapproved`,
    ],
    [
      'double URL-encoding',
      `gh api -X DELETE ${R}/labels/db%252Dbreaking%252Dapproved`,
    ],
    [
      'URL-encoded letters',
      `curl -X DELETE ${API}/labels/%64%62-breaking-approved`,
    ],
    [
      'JSON unicode escape',
      `curl -X POST ${API}/issues/12/labels -d '{"labels":["\\u0064b-breaking-approved"]}'`,
    ],
    ['ANSI-C hex escape', `gh label create $'\\x64b-breaking-approved'`],
    [
      'line continuation',
      'gh pr edit 12 \\\n  --add-label \\\n  db-breaking-approved',
    ],
    ['continuation inside gh', 'gh \\\nlabel \\\ncreate db-breaking-approved'],
    ['underscores', 'gh label create db_breaking_approved'],
    // wrappers
    [
      'env wrapper',
      'env GH_REPO=taverns-red/toast-stats gh pr edit 12 --add-label db-breaking-approved',
    ],
    [
      'bash -c wrapper',
      `bash -c 'gh pr edit 12 --add-label db-breaking-approved'`,
    ],
    ['sh -c wrapper', `sh -c "gh label create db-breaking-approved"`],
    ['eval wrapper', `eval "gh label delete db-breaking-approved --yes"`],
    ['absolute path to gh', '/usr/bin/gh label create db-breaking-approved'],
    [
      'chained after a harmless command',
      'npm test && gh pr edit 12 --add-label db-breaking-approved',
    ],
    // the name built at run time
    [
      'split across shell variables',
      'a=db-breaking; b=-approved; gh pr edit 12 --add-label "$a$b"',
    ],
    ['braced variables', 'gh label create "${A}${B}"'],
    ['command substitution', 'gh pr edit 12 --add-label "$(cat /tmp/l)"'],
    ['backticks', 'gh pr edit 12 --add-label `cat /tmp/l`'],
    ['xargs from a file', 'xargs -a /tmp/l gh pr edit 12 --add-label'],
    [
      'xargs from a pipe',
      'cat /tmp/l | xargs -I{} gh api -X POST repos/o/r/issues/12/labels -f labels[]={}',
    ],
    [
      'gh api with variable label',
      `gh api ${R}/issues/12/labels -f "labels[]=$L"`,
    ],
    ['base64-decoded command', 'echo Z2ggbGFiZWwgY3JlYXRl | base64 -d | sh'],
    [
      'base64 in a substitution',
      'gh $(echo bGFiZWw= | base64 --decode) create x',
    ],
    [
      'python b64decode exec',
      `python3 -c "import base64,os; os.system(base64.b64decode('Z2g=').decode())"`,
    ],
    // aliases
    ['gh alias for a label write', `gh alias set addl 'pr edit --add-label'`],
  ])('%s', (_name, command) => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/db-breaking-approved/)
    expect(r.stderr).toMatch(/Ron/)
  })
})

/**
 * red-district#1563: a check on the label's name misses these, so they are
 * refused on shape alone.
 */
describe('refuses label writes a name check cannot see', () => {
  it.each([
    // GraphQL takes label IDs, not names
    [
      'graphql addLabelsToLabelable',
      `gh api graphql -f query='mutation { addLabelsToLabelable(input: {labelableId: "PR_x", labelIds: ["LA_y"]}) { clientMutationId } }'`,
    ],
    [
      'graphql removeLabelsFromLabelable',
      `gh api graphql -f query='mutation { removeLabelsFromLabelable(input: {labelableId: "PR_x", labelIds: ["LA_y"]}) { clientMutationId } }'`,
    ],
    [
      'graphql createLabel',
      `gh api graphql -f query='mutation { createLabel(input: {repositoryId: "R", name: "x", color: "f00"}) { label { id } } }'`,
    ],
    [
      'graphql updateLabel',
      `gh api graphql -f query='mutation { updateLabel(input: {id: "LA_y", name: "x"}) { label { id } } }'`,
    ],
    [
      'graphql deleteLabel',
      `gh api graphql -f query='mutation { deleteLabel(input: {id: "LA_y"}) { clientMutationId } }'`,
    ],
    [
      'graphql clearLabelsFromLabelable',
      `gh api graphql -f query='mutation { clearLabelsFromLabelable(input: {labelableId: "PR_x"}) { clientMutationId } }'`,
    ],
    [
      'graphql updatePullRequest labelIds',
      `gh api graphql -f query='mutation { updatePullRequest(input: {pullRequestId: "PR_x", labelIds: ["LA_y"]}) { clientMutationId } }'`,
    ],
    [
      'graphql via curl',
      `curl -X POST https://api.github.com/graphql -d '{"query":"mutation { addLabelsToLabelable(input:{labelableId:\\"PR_x\\",labelIds:[\\"LA_y\\"]}) { clientMutationId } }"}'`,
    ],
    ['graphql query from a file', 'gh api graphql -F query=@mutation.graphql'],
    ['graphql --input', 'gh api graphql --input body.json'],
    [
      'graphql curl -d @file',
      'curl -X POST https://api.github.com/graphql -d @body.json',
    ],
    // payload from a file or stdin
    [
      '--input file to issue labels',
      `gh api ${R}/issues/12/labels --input f.json`,
    ],
    [
      '--input stdin to issue labels',
      `gh api -X PUT ${R}/issues/12/labels --input -`,
    ],
    [
      '--input file to PATCH an issue',
      `gh api -X PATCH ${R}/issues/12 --input f.json`,
    ],
    ['--input file to create a label', `gh api ${R}/labels --input f.json`],
    ['-F labels[]=@file', `gh api ${R}/issues/12/labels -F 'labels[]=@l.txt'`],
    ['-F labels[]=@- (stdin)', `gh api ${R}/issues/12/labels -F labels[]=@-`],
    ['-F name=@file to labels', `gh api ${R}/labels -F name=@n.txt`],
    ['curl -d @file', `curl -X POST ${API}/issues/12/labels -d @f.json`],
    ['curl -d @- (stdin)', `curl -X POST ${API}/issues/12/labels -d @-`],
    [
      'curl --data-binary @file',
      `curl ${API}/issues/12/labels --data-binary @f.json`,
    ],
    ['curl -T upload', `curl -X PUT -T f.json ${API}/issues/12/labels`],
    ['wget --post-file', `wget --post-file=f.json ${API}/issues/12/labels`],
    [
      'heredoc into --input',
      `gh api ${R}/issues/12/labels --input - <<'EOF'\n{"labels":["x"]}\nEOF`,
    ],
    ['opaque body to a URL in a variable', 'curl -X POST "$URL" -d @f.json'],
  ])('%s', (_name, command) => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })
})

describe('allows reads and other labels in a cloud session', () => {
  // #2528 moved the other-label writes (gh pr/issue edit, gh label create,
  // DELETE issues/N/labels/x), graphql and pushes to the allow-list tests
  // in cloudSessionGuardAllowList.test.ts.
  it.each([
    `gh api ${R}/labels`,
    `gh api ${R}/labels/db-breaking-approved`,
    `gh api ${R}/issues/12/labels`,
    `gh api ${R}/issues/12/events --paginate`,
    'gh pr view 12',
    'gh issue view 2519',
    `gh api ${R}/issues/12/labels -f 'labels[]=preview-smoke'`,
    // the CLAUDE.md patterns a worker uses
    `gh api ${R}/pulls -f title='fix: x (#42)' -f head=b -f base=main -F body=@pr-body.md`,
    `gh api ${R}/issues/42/comments -f body='done'`,
    `gh api ${R}/issues/42/comments -F body=@report.md`,
    `gh api ${R}/issues/42/comments --input comment.json`,
    `gh api ${R}/pulls --input pr.json`,
    // everyday work
    'npm run test:scripts',
    'git commit -m "docs: mention db-breaking-approved (#2519)"',
    'grep -rn db-breaking-approved scripts/',
    'cat scripts/cloud-session-guard.sh',
  ])('%s', command => {
    const r = bash(command)
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})

/**
 * #2526: gh (cobra) accepts a subcommand's flags before the command path,
 * so `gh -R x issue edit` runs `issue edit`. The guard must read the
 * command past them. gh's own root flags are only --help and --version
 * (`gh --help`); -R/--repo is inherited by issue, pr and label, --hostname
 * belongs to api and auth, and GH_REPO/GH_HOST are their env forms.
 */
const GH_FLAG_PREFIXES = [
  '-R taverns-red/toast-stats',
  '-Rtaverns-red/toast-stats',
  '--repo taverns-red/toast-stats',
  '--repo=taverns-red/toast-stats',
  '--hostname github.com',
  '--hostname=github.com',
  '-R taverns-red/toast-stats --hostname github.com --repo=taverns-red/toast-stats',
]

describe('refuses label writes behind gh flags before the command (#2526)', () => {
  const writes = [
    'issue edit 1 --add-label db-breaking-approved',
    'pr edit 2 --add-label db-breaking-approved',
    'label create db-breaking-approved',
    'label edit db-breaking-approved --description x',
    'label delete db-breaking-approved --yes',
    'label clone taverns-red/red-table --force',
    `api ${R}/issues/12/labels -f labels[]=db-breaking-approved`,
    `api ${R}/labels -f name=db-breaking-approved`,
  ]
  it.each(GH_FLAG_PREFIXES.flatMap(p => writes.map(w => `gh ${p} ${w}`)))(
    '%s',
    command => {
      const r = bash(command)
      expect(r.status).toBe(2)
      expect(r.stderr).toMatch(/Ron/)
    }
  )

  it.each([
    'gh issue -R taverns-red/toast-stats edit 1 --add-label db-breaking-approved',
    'gh pr --repo=taverns-red/toast-stats edit 2 --add-label db-breaking-approved',
    'gh label -R taverns-red/toast-stats create db-breaking-approved',
  ])('flags between the command and its verb: %s', command => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })

  // red-district review: the same flags anywhere in the argv
  const middle = [
    ['issue', 'edit 1 --add-label db-breaking-approved'],
    ['pr', 'edit 2 --add-label db-breaking-approved'],
    ['label', 'create db-breaking-approved'],
    ['label', 'edit db-breaking-approved --description x'],
  ]
  it.each(
    GH_FLAG_PREFIXES.flatMap(p =>
      middle.map(([group, rest]) => `gh ${group} ${p} ${rest}`)
    )
  )('flag in the middle: %s', command => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })
  const after = [
    'issue edit FLAG 1 --add-label db-breaking-approved',
    'pr edit 2 FLAG --add-label db-breaking-approved',
    'label create FLAG db-breaking-approved',
  ]
  it.each(
    GH_FLAG_PREFIXES.flatMap(p => after.map(a => `gh ${a.replace('FLAG', p)}`))
  )('flag after the subcommand: %s', command => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })
})

describe('allows reads behind gh flags before the command (#2526)', () => {
  const reads = [
    'pr view 1',
    'label list',
    'issue view 2519',
    `api ${R}/labels/db-breaking-approved`,
  ]
  // #2547: --hostname and gh label are not on the whole-command allow list.
  const refused = (c: string) => /hostname| label /.test(c)
  const all = GH_FLAG_PREFIXES.flatMap(p => reads.map(r => `gh ${p} ${r}`))
  it.each(all.filter(c => !refused(c)))('%s', command => {
    const r = bash(command)
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
  it.each(all.filter(refused))('refuses %s (#2547)', command => {
    expect(bash(command).status).toBe(2)
  })
})

describe('refused by the whole-command allow list (#2547)', () => {
  it.each([
    'gh label list',
    'gh label list --search db-breaking-approved',
    `curl -s ${API}/labels/db-breaking-approved`,
    'echo $HOME && ls',
  ])('%s', command => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })
})

describe('refuses tampering with the guard in a cloud session', () => {
  it.each([
    [
      'sed -i on the guard',
      'sed -i s/exit/true/ scripts/cloud-session-guard.sh',
    ],
    ['overwrite the guard', 'echo "exit 0" > scripts/cloud-session-guard.sh'],
    ['overwrite settings', 'echo {} > .claude/settings.json'],
    [
      'disable hooks in local settings',
      `echo '{"disableAllHooks":true}' > .claude/settings.local.json`,
    ],
    ['user settings', 'cat x.json | tee ~/.claude/settings.json'],
    [
      'git checkout the guard',
      'git checkout origin/old -- scripts/cloud-session-guard.mjs',
    ],
  ])('%s', (_name, command) => {
    const r = bash(command)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })

  it.each([
    [
      'Edit',
      {
        file_path: `${ROOT}/scripts/cloud-session-guard.sh`,
        old_string: 'a',
        new_string: 'b',
      },
    ],
    [
      'Write',
      { file_path: `${ROOT}/scripts/cloud-session-guard.mjs`, content: '' },
    ],
    ['Write', { file_path: `${ROOT}/.claude/settings.json`, content: '{}' }],
    ['Write', { file_path: '/root/.claude/settings.json', content: '{}' }],
    [
      'MultiEdit',
      { file_path: `${ROOT}/.claude/settings.local.json`, edits: [] },
    ],
  ])('%s of a protected file', (tool, input) => {
    const r = guard(input, { tool })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Ron/)
  })

  it('refuses writing a script that applies the label', () => {
    const r = guard(
      {
        file_path: '/tmp/x.sh',
        content: '#!/bin/sh\ngh pr edit 12 --add-label db-breaking-approved\n',
      },
      { tool: 'Write' }
    )
    expect(r.status).toBe(2)
  })

  it('allows ordinary edits', () => {
    const r = guard(
      {
        file_path: `${ROOT}/frontend/src/App.tsx`,
        old_string: 'a',
        new_string: 'b',
      },
      { tool: 'Edit' }
    )
    expect(r.status).toBe(0)
  })
})

describe('outside a cloud session', () => {
  it.each(['', 'false'])(
    'is a no-op when CLAUDE_CODE_REMOTE=%j: the local session may label',
    remote => {
      for (const command of [
        'gh pr edit 12 --add-label db-breaking-approved',
        'gh label clone taverns-red/red-table --force',
        `gh api graphql -f query='mutation { deleteLabel(input: {id: "x"}) { clientMutationId } }'`,
        'sed -i s/x/y/ scripts/cloud-session-guard.sh',
      ]) {
        const r = bash(command, remote)
        expect(r.status).toBe(0)
        expect(r.stdout).toBe('')
        expect(r.stderr).toBe('')
      }
    }
  )
})

describe('fails closed in a cloud session', () => {
  it('refuses when the hook input is not JSON', () => {
    const r = spawnSync('bash', [GUARD], {
      input: 'not json',
      env: { PATH: process.env.PATH ?? '', CLAUDE_CODE_REMOTE: 'true' },
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
  })
})

describe('.claude/settings.json wires the guard', () => {
  it('as a PreToolUse hook on Bash and on file edits', () => {
    const settings = JSON.parse(readFileSync(SETTINGS, 'utf8')) as {
      hooks: Record<
        string,
        { matcher?: string; hooks: { command: string; timeout?: number }[] }[]
      >
    }
    const pre = settings.hooks.PreToolUse ?? []
    const cmd = '"$CLAUDE_PROJECT_DIR"/scripts/cloud-session-guard.sh'
    const forTool = (t: string) =>
      pre.find(
        g =>
          new RegExp(`^(${g.matcher ?? ''})$`).test(t) &&
          g.hooks.some(h => h.command === cmd)
      )
    for (const t of ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      expect(forTool(t), t).toBeDefined()
    }
  })
})

describe('docs', () => {
  it('CLAUDE.md and docs/cloud-sessions.md name the guard', () => {
    for (const f of ['CLAUDE.md', 'docs/cloud-sessions.md']) {
      const md = readFileSync(resolve(ROOT, f), 'utf8')
      expect(md, f).toMatch(/cloud-session-guard/)
      expect(md, f).toMatch(/db-breaking-approved/)
    }
  })
})
