/**
 * The changed-file list of a pull request, read from the REST API with the
 * job's own token (no install, only fetch). Shared by the `changes` jobs of
 * ci.yml (#2607, scripts/ci-changes.ts) and pr-preview.yml (#2865,
 * scripts/preview-changes.ts).
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_PR_NUMBER.
 */

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return v
}

export interface PrFile {
  filename: string
  previous_filename?: string
}

/**
 * Every path a page of changes touches. A rename lists only the new name as
 * `filename`, so the old one is read from `previous_filename`: a move out of a
 * preview path still needs a preview (#2865 F3).
 */
export function collectFilenames(page: PrFile[]): string[] {
  return page.flatMap(f =>
    f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]
  )
}

export async function changedFiles(): Promise<string[]> {
  const token = requireEnv('GITHUB_TOKEN')
  const repo = requireEnv('GITHUB_REPOSITORY')
  const pr = requireEnv('GATE_PR_NUMBER')
  const files: string[] = []
  for (let page = 1; ; page++) {
    let body: PrFile[] | undefined
    for (let attempt = 1; attempt <= 3 && !body; attempt++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
          },
        }
      )
      if (res.ok) body = (await res.json()) as PrFile[]
      else if (res.status >= 500 && attempt < 3)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      else throw new Error(`GET pulls/${pr}/files -> ${res.status}`)
    }
    files.push(...collectFilenames(body!))
    if (body!.length < 100) return files
  }
}
