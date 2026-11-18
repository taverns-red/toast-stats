/**
 * #2972: argument handling for scripts/gcs-upload.ts.
 *
 *   put    --bucket B --object O --file F             --content-type T --cache-control C --on-exists skip|fail
 *   copy   --bucket B --object O --from-bucket SB     --content-type T --cache-control C --on-exists skip|fail
 *   exists --bucket B --object O
 *
 * `copy` streams the object of the same name from SB (objects.get) into B.
 * --on-exists has no default. Exit: 0 ok (or skipped) - 1 failure, or "already
 * exists" with --on-exists fail - 2 usage - 10 (`exists` only) the object
 * exists. The token comes from ACCESS_TOKEN and is never logged.
 */
import { parseArgs } from 'node:util'
import { objectExists, uploadObject, ObjectExistsError } from './gcsUpload.js'

export interface UploadCliDeps {
  token: string | undefined
  fetch: typeof fetch
  log: (line: string) => void
}

const OPTIONS = {
  bucket: { type: 'string' },
  object: { type: 'string' },
  file: { type: 'string' },
  'from-bucket': { type: 'string' },
  'content-type': { type: 'string' },
  'cache-control': { type: 'string' },
  'on-exists': { type: 'string' },
} as const

export const runUploadCli = async (
  argv: string[],
  deps: UploadCliDeps
): Promise<number> => {
  const usage = (why: string): number => {
    deps.log(`usage error: ${why}`)
    return 2
  }
  const [command, ...rest] = argv
  let values: Record<string, string | undefined>
  try {
    values = parseArgs({ args: rest, options: OPTIONS, strict: true }).values
  } catch (err) {
    return usage(err instanceof Error ? err.message : String(err))
  }
  if (command !== 'put' && command !== 'copy' && command !== 'exists')
    return usage('subcommand must be put, copy or exists')
  if (!deps.token) return usage('ACCESS_TOKEN is not set')
  const { bucket, object } = values
  if (!bucket || !object) return usage('--bucket and --object are required')

  try {
    if (command === 'exists') {
      const found = await objectExists(bucket, object, deps.token, deps.fetch)
      deps.log(`gs://${bucket}/${object}: ${found ? 'exists' : 'absent'}`)
      return found ? 10 : 0
    }
    const contentType = values['content-type']
    const cacheControl = values['cache-control']
    const onExists = values['on-exists']
    if (!contentType || !cacheControl)
      return usage('--content-type and --cache-control are required')
    if (onExists !== 'skip' && onExists !== 'fail')
      return usage('--on-exists skip|fail is required (no default)')
    const fromBucket = values['from-bucket']
    const file = values['file']
    if (command === 'put' && !file) return usage('put needs --file')
    if (command === 'copy' && !fromBucket)
      return usage('copy needs --from-bucket')

    const result = await uploadObject({
      bucket,
      object,
      source:
        command === 'put'
          ? { kind: 'file', path: file! }
          : { kind: 'gcs', bucket: fromBucket!, object },
      contentType,
      cacheControl,
      onExists,
      token: deps.token,
      fetch: deps.fetch,
    })
    deps.log(`gs://${bucket}/${object}: ${result}`)
    return 0
  } catch (err) {
    deps.log(
      err instanceof ObjectExistsError
        ? `${err.message}; objects here are immutable, use a new name or version`
        : err instanceof Error
          ? err.message
          : String(err)
    )
    return 1
  }
}
