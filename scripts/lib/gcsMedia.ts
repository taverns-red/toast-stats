/**
 * Object reads for the pipeline's GCS scripts (#1729).
 *
 * `gateBucket` is the bucket the pre-promotion content gate reads through.
 */

import type { Storage } from '@google-cloud/storage'
import type { GateBucket } from './promotionContentGateIo.js'

export function gateBucket(storage: Storage, bucketName: string): GateBucket {
  return storage.bucket(bucketName) as unknown as GateBucket
}
