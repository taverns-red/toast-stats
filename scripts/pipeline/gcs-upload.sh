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

SHA256=(sha256sum)
command -v sha256sum >/dev/null 2>&1 || SHA256=(shasum -a 256)
plan >"${WORK}/plan.tsv"

# Skip what staging already holds (#2566). Opt-in: GCS_UPLOAD_SKIP_UNCHANGED=true.
# A rebuild re-sent ~1,160 objects per date though most were unchanged, and
# every upload is a class-A write. For `cp` of files, list each destination
# directory ONCE (`gcloud storage objects list <dir>/*`: one request per
# 1,000 objects, no per-object download) and send only the objects whose
# stored md5, Content-Encoding, Cache-Control (and Content-Type, when given)
# differ from what this call would write. The manifest below is written from
# the FULL plan whatever is skipped: promotion copies exactly the manifest,
# and the content gate checks staging's served bytes against its sha256, both
# of which hold for an object that is already there byte for byte.
#
# `-Z` gzips with the current time in the gzip header, so its stored bytes
# never repeat and their md5 is no use. So that the bytes repeat, a `-Z`
# call is made as the SDK does it, by hand: `gzip -n` locally (no name, no
# time) and `--content-encoding=gzip` with `no-transform` appended to
# Cache-Control (metadata_util.get_cache_control). The stored object is the
# same as `-Z`'s; only its bytes are now reproducible. The first run after
# this change finds no md5 match and sends everything once. A listing entry
# without md5_hash (a composite object), a listing that fails, or any flag
# this does not understand: everything in question is uploaded.
UPLOAD_ARGS=("${ARGS[@]}")
NOTHING_TO_UPLOAD=0

skip_unchanged() {
  local a s f d i=0 gz=0 ctype="" cache="" want_cache
  local flags=() dirs=() changed=() total skipped
  local n=$((${#ARGS[@]} - 1))
  for a in "${ARGS[@]:0:${n}}"; do
    case "${a}" in
      -Z) gz=1 ;;
      -r | -R) flags+=("${a}") ;;
      --content-type=*)
        ctype="${a#--content-type=}"
        flags+=("${a}")
        ;;
      --cache-control=*) cache="${a#--cache-control=}" ;;
      -*) return 0 ;; # a flag this does not model: upload everything
    esac
  done
  for s in "${SRCS[@]}"; do
    if [[ "${s}" == *'*'* ]]; then
      while IFS= read -r f; do
        [ -d "${f}" ] && return 0
      done < <(compgen -G "${s}")
    elif [ -d "${s}" ]; then
      return 0
    fi
  done

  # Several sources to a destination without a trailing slash: the destination
  # is a directory only because there are several. Skipping down to one source
  # could turn it into an object NAMED like the destination. Upload everything.
  if [ "$(wc -l <"${WORK}/plan.tsv" | tr -d ' ')" -gt 1 ] &&
    [[ "${ARGS[${n}]}" != */ ]]; then
    return 0
  fi

  want_cache="${cache}"
  if [ "${gz}" = 1 ]; then want_cache="${cache:+${cache}, }no-transform"; fi

  # One listing per destination directory.
  while IFS= read -r d; do dirs+=("${d}"); done < <(
    cut -f2 "${WORK}/plan.tsv" | sed 's|[^/]*$||; s|/$||' | LC_ALL=C sort -u
  )
  : >"${WORK}/remote.tsv"
  for d in "${dirs[@]}"; do
    if "${GCLOUD}" storage objects list "gs://${DST_BUCKET}/${d:+${d}/}*" \
      --format=json >"${WORK}/listing.json" 2>"${WORK}/listing.err"; then
      jq -r '.[] | [.name, (.md5_hash // ""), (.content_encoding // ""),
        (.cache_control // ""), (.content_type // "")] | @tsv' \
        "${WORK}/listing.json" >>"${WORK}/remote.tsv" || true
    else
      echo "gcs-upload: could not list gs://${DST_BUCKET}/${d}/ ($(head -n 1 "${WORK}/listing.err")); uploading all of it" >&2
    fi
  done

  # `<object>\t<local md5>\t<file to send>` for every planned object.
  : >"${WORK}/local.tsv"
  mkdir -p "${WORK}/gz"
  while IFS=$'\t' read -r f d; do
    i=$((i + 1))
    if [ "${gz}" = 1 ]; then
      mkdir -p "${WORK}/gz/${i}"
      gzip -n -9 -c <"${f}" >"${WORK}/gz/${i}/$(basename "${f}")"
      f="${WORK}/gz/${i}/$(basename "${f}")"
    fi
    printf '%s\t%s\t%s\n' "${d}" \
      "$(openssl dgst -md5 -binary <"${f}" | base64)" "${f}" >>"${WORK}/local.tsv"
  done <"${WORK}/plan.tsv"

  local enc=""
  if [ "${gz}" = 1 ]; then enc=gzip; fi
  while IFS= read -r f; do changed+=("${f}"); done < <(
    awk -F'\t' -v enc="${enc}" -v cache="${want_cache}" -v ctype="${ctype}" \
      -v remote="${WORK}/remote.tsv" '
      # (FILENAME, not NR == FNR: an empty remote listing makes that true for
      # the local file too.)
      FILENAME == remote { r[$1] = $2 "\t" $3 "\t" $4 "\t" $5; next }
      {
        split(r[$1], v, "\t")
        if ($2 != "" && v[1] == $2 && v[2] == enc && v[3] == cache &&
            (ctype == "" || v[4] == ctype)) next
        print $3
      }' "${WORK}/remote.tsv" "${WORK}/local.tsv"
  )
  total="$(wc -l <"${WORK}/local.tsv" | tr -d ' ')"
  skipped=$((total - ${#changed[@]}))
  echo "gcs-upload: skip-unchanged: ${skipped} of ${total} object(s) already in gs://${DST_BUCKET}/ byte for byte, uploading ${#changed[@]} (#2566)" >&2

  if [ "${#changed[@]}" -eq 0 ]; then
    NOTHING_TO_UPLOAD=1
    return 0
  fi
  if [ "${gz}" = 1 ]; then flags+=("--content-encoding=gzip"); fi
  if [ -n "${want_cache}" ]; then flags+=("--cache-control=${want_cache}"); fi
  UPLOAD_ARGS=("${flags[@]+"${flags[@]}"}" "${changed[@]}" "${ARGS[${n}]}")
}

if [ "${GCS_UPLOAD_SKIP_UNCHANGED:-}" = true ] && [ "${VERB}" = cp ] &&
  [ -s "${WORK}/plan.tsv" ]; then
  skip_unchanged
fi
if [ "${NOTHING_TO_UPLOAD}" = 0 ]; then
  "${GCLOUD}" storage "${VERB}" "${UPLOAD_ARGS[@]}"
fi

# One hashing pass and one jq for the whole call: a historical program year
# uploads ~13 000 objects.
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
