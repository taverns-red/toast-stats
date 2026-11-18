/**
 * #2972: create-only object upload over the Cloud Storage JSON API.
 */

export type OnExists = 'skip' | 'fail'

export type UploadSource =
  | { kind: 'file'; path: string }
  | { kind: 'gcs'; bucket: string; object: string }

export interface UploadOptions {
  bucket: string
  object: string
  source: UploadSource
  contentType: string
  cacheControl: string
  /** Required, no default: each call site decides what "already there" means. */
  onExists: OnExists
  token: string
  fetch: typeof fetch
}

export type UploadResult = 'created' | 'skipped'

export class ObjectExistsError extends Error {}

export const uploadObject = async (
  _o: UploadOptions
): Promise<UploadResult> => {
  throw new Error('not implemented')
}

export const objectExists = async (
  _bucket: string,
  _object: string,
  _token: string,
  _fetch: typeof fetch
): Promise<boolean> => {
  throw new Error('not implemented')
}
