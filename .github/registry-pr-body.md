The daily pipeline derived closing-date entries that `docs/month-end-closing-dates.json` does not yet record.

Every entry here is **proven** by raw-csv metadata in GCS: a month becomes derivable only once a later collection date exists, so its closing window has demonstrably ended. Manually curated outage entries are never regressed by a derived one (`planRegistryUpdates`).

Auto-opened by the closing-registry auto-remediation job (#1419). Review the diff and merge — the next daily run then finds the registry fresh and auto-closes the open `closing-registry-stale` alert.
