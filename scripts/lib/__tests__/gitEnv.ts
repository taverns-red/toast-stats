/**
 * The env for a git child process in a test: `base` without any GIT_*
 * variable, plus `extra`. A hook-exported GIT_DIR would point the child at
 * the shared repository instead of its cwd. Enforced by
 * testsSpawnGitWithCleanEnv.test.ts.
 */
export function gitEnv(
  extra: Record<string, string> = {},
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(base)) {
    if (!k.startsWith('GIT_')) env[k] = v
  }
  return { ...env, ...extra }
}
