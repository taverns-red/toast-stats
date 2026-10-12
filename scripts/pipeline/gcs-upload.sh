#!/usr/bin/env bash
# Upload to staging AND record it in the run manifest (#1762, ADR-015 P5).
#
# Usage: scripts/pipeline/gcs-upload.sh <stage> cp    [cp flags...] <src>... <gs://dst>
#        scripts/pipeline/gcs-upload.sh <stage> rsync -r <srcdir>/ <gs://prefix/>
#
# Runs `gcloud storage <cp|rsync> <args...>` exactly as given, then appends
# one line per object written to $RUN_MANIFEST_FILE:
#   {"path":"snapshots/2026-10-10/district_61.json","sha256":"<hex>",
#    "date":"2026-10-10","stage":"<stage>"}
# - path:   the object name, bucket stripped;
# - sha256: of the local, uncompressed bytes — what a browser gets back after
#           the one `-Z` layer is peeled. The same hash as the time-series
#           `x-goog-meta-sha256` (#1731, plan E2-1);
# - date:   the YYYY-MM-DD of a `snapshots/`, `raw-csv/` or `raw-fac/` path,
#           else null;
# - stage:  who wrote it, for the gate summaries.
# The workflow publishes the file to runs/<github_run_id>/written.jsonl; the
# content gate reads every object in it, the completeness gate takes its
# dates from it (scripts/lib/runManifest.ts).
#
# Sources: files, directories (`cp -r`, `rsync -r`: every file under them)
# and local wildcards (`-r "/tmp/out/*.json"`, which gcloud expands itself).
# An rsync records every source file: those it skipped as identical are
# already what the manifest says.
#
# Refuses (exit 2, nothing uploaded): RUN_MANIFEST_FILE unset — an
# unrecorded write is invisible to the gates; a download (gs:// source or
# local destination) — it records uploads only; a production destination —
# prod is written by the gated promote step only (#1755).
# A failed upload records nothing and exits with gcloud's status.
#
# Env: GCLOUD (default `gcloud`), RUN_MANIFEST_FILE (required),
#      GCS_BUCKET_PRODUCTION (refused as a destination).
set -euo pipefail

usage() {
  echo "usage: gcs-upload.sh <stage> <cp|rsync> <gcloud storage args...> <gs://dst>" >&2
  exit 2
}

STAGE="${1:-}"
VERB="${2:-}"
[ -n "${STAGE}" ] && [ "$#" -ge 4 ] || usage
case "${VERB}" in cp | rsync) ;; *) usage ;; esac
shift 2
ARGS=("$@")

if [ -z "${RUN_MANIFEST_FILE:-}" ]; then
  echo "::error::gcs-upload: RUN_MANIFEST_FILE is not set; refusing an unrecorded upload (#1762)" >&2
  exit 2
fi

DST="${ARGS[${#ARGS[@]} - 1]}"
SRCS=()
for a in "${ARGS[@]:0:${#ARGS[@]}-1}"; do
  case "${a}" in -*) ;; *) SRCS+=("${a}") ;; esac
done
[ "${#SRCS[@]}" -gt 0 ] || usage

if [[ "${DST}" != gs://* ]]; then
  echo "::error::gcs-upload: '${DST}' is not a bucket destination; this wrapper records uploads only" >&2
  exit 2
fi
DST_BUCKET="${DST#gs://}"
DST_BUCKET="${DST_BUCKET%%/*}"
if [ "${DST_BUCKET}" = "toast-stats-data-ca" ] ||
  { [ -n "${GCS_BUCKET_PRODUCTION:-}" ] && [ "${DST_BUCKET}" = "${GCS_BUCKET_PRODUCTION}" ]; }; then
  echo "::error::gcs-upload: refusing a production destination (${DST}); prod is written by the gated promote step only" >&2
  exit 2
fi
for s in "${SRCS[@]}"; do
  if [[ "${s}" == gs://* ]]; then
    echo "::error::gcs-upload: '${s}' is a bucket source; this wrapper records uploads only" >&2
    exit 2
  fi
  # Checked before the upload, so nothing goes up that cannot be recorded.
  # (Flags take `--flag=value`: a separate value word would read as a source
  # and fail here.)
  if [[ "${s}" != *'*'* ]] && [ ! -e "${s}" ]; then
    echo "::error::gcs-upload: source '${s}' does not exist" >&2
    exit 2
  fi
done
DST_PATH="${DST#gs://"${DST_BUCKET}"}"
DST_PATH="${DST_PATH#/}"

# v1/ and config/ stay identity-encoded (#1852). Cloud CDN dynamic
# compression (compression-mode AUTOMATIC on the backend bucket) compresses
# them at the edge, and it skips any response that already has a
# Content-Encoding or whose Cache-Control has no-transform. `-Z` sets both.
# Stored identity also means every pipeline reader of these objects
# (`gcloud storage cat|cp`, the gates, the daily index merge) gets plain
# bytes back on any gcloud version: no #1702 decode dependency.
case "${DST_PATH}" in
  v1/* | config/* | v1 | config)
    for a in "${ARGS[@]:0:${#ARGS[@]}-1}"; do
      case "${a}" in
        -Z | --gzip-* | --content-encoding=* | *no-transform*)
          echo "::error::gcs-upload: '${a}' on ${DST_PATH}: v1/ and config/ are stored identity and compressed by Cloud CDN at the edge; an encoded or no-transform upload disables that and changes the bytes pipeline readers get (#1852, #1702)" >&2
          exit 2
          ;;
      esac
    done
    ;;
esac

GCLOUD="${GCLOUD:-gcloud}"
"${GCLOUD}" storage "${VERB}" "${ARGS[@]}"

# `<file>\t<object path>` for every object the call wrote.
plan() {
  local s f matches=()
  for s in "${SRCS[@]}"; do
    if [[ "${s}" == *'*'* ]]; then
      while IFS= read -r f; do matches+=("${f}"); done < <(compgen -G "${s}" | LC_ALL=C sort)
    else
      matches+=("${s}")
    fi
  done
  for s in "${matches[@]}"; do
    if [ -d "${s}" ]; then
      local root="${s%/}" prefix
      if [ "${VERB}" = "rsync" ]; then
        prefix="${DST_PATH%/}"
      else
        prefix="${DST_PATH%/}/$(basename "${root}")"
      fi
      while IFS= read -r f; do
        printf '%s\t%s\n' "${f}" "${prefix:+${prefix}/}${f#"${root}/"}"
      done < <(find "${root}" -type f | LC_ALL=C sort)
    elif [[ "${DST_PATH}" == */ ]] || [ -z "${DST_PATH}" ] || [ "${#matches[@]}" -gt 1 ]; then
      printf '%s\t%s\n' "${s}" "${DST_PATH%/}${DST_PATH:+/}$(basename "${s}")"
    else
      printf '%s\t%s\n' "${s}" "${DST_PATH}"
    fi
  done
}

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

# One hashing pass and one jq for the whole call: a historical program year
# uploads ~13 000 objects.
SHA256=(sha256sum)
command -v sha256sum >/dev/null 2>&1 || SHA256=(shasum -a 256)
plan >"${WORK}/plan.tsv"
[ -s "${WORK}/plan.tsv" ] || exit 0
cut -f1 "${WORK}/plan.tsv" | tr '\n' '\0' | xargs -0 "${SHA256[@]}" |
  awk '{print $1}' >"${WORK}/sha.txt"
if [ "$(wc -l <"${WORK}/sha.txt")" -ne "$(wc -l <"${WORK}/plan.tsv")" ]; then
  echo "::error::gcs-upload: could not hash every uploaded file; the manifest would be incomplete" >&2
  exit 1
fi
mkdir -p "$(dirname "${RUN_MANIFEST_FILE}")"
paste "${WORK}/sha.txt" <(cut -f2 "${WORK}/plan.tsv") |
  jq -Rc --arg stage "${STAGE}" '
    split("\t") as [$sha, $path]
    | {path: $path,
       sha256: $sha,
       date: (($path | capture("^(snapshots|raw-csv|raw-fac)/(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})/").d) // null),
       stage: $stage}' >>"${RUN_MANIFEST_FILE}"
