# gcs-objects-list fixtures (#1730)

Recorded 2026-10-10 with the exact read-only call the value-diff step makes
(gcloud 583):

```
gcloud storage objects list \
  "gs://<bucket>/snapshots/*/all-districts-rankings.json" --format=json
```

Trimmed to four dates; entries are verbatim. Notes on the real shape:

- Hash keys are `crc32c_hash` and `md5_hash` (base64), not the JSON-API
  `crc32c` / `md5Hash`.
- The prod listing includes **noncurrent generations** (they carry
  `noncurrent_time`) next to the live object of the same name; see
  `2017-01-31` in `prod-rankings.json`. Only the live entry counts.
- Objects are stored `content_encoding: gzip`; the hashes are of the stored
  (compressed) bytes, which promotion copies unchanged.
