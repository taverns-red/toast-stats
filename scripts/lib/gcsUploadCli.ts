/**
 * #2972: argument handling for scripts/gcs-upload.ts. Exit: 0 ok - 1 failure
 * or "already exists" with --on-exists fail - 2 usage - 10 (exists
 * subcommand only) the object exists.
 */
export interface UploadCliDeps {
  token: string | undefined
  fetch: typeof fetch
  log: (line: string) => void
}

export const runUploadCli = async (
  _argv: string[],
  _deps: UploadCliDeps
): Promise<number> => {
  throw new Error('not implemented')
}
