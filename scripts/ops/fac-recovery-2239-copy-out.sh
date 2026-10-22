#!/usr/bin/env bash
# Copy the enriched, soft-deleted generations of snapshots/<date>/
# district_<id>.json out to the private recovery bucket (#2239).
#
# Usage: scripts/ops/fac-recovery-2239-copy-out.sh [--execute] [--allow-prod]
#          [--parallel N] [--manifest FILE] <source-bucket> <date>...
#
# #2237's strip left these dates' live district files without their
# Find-A-Club fields; the enriched generations survive only as soft-deleted
# objects, which "cannot be read, modified, or overwritten", only listed and
# restored, in place (docs.cloud.google.com/storage/docs/soft-delete; the
# JSON API objects.restore has no destination). So each object is copied out
# by restoring it over the live one for a few seconds:
#
#   1. gcloud storage restore gs://<src>/<name>#E --if-generation-match=L
#        E: the enriched generation, L: the live (stripped) one. The
#        precondition is on the LIVE object (objects.restore ifGenerationMatch),
#        so a daily or rebuild that changed it since the listing fails closed.
#        The restore creates a new live generation R with E's bytes; L is
#        soft-deleted (versioning is off).
#      check: R's md5 == E's md5
#   2. gcloud storage cp --no-clobber gs://<src>/<name>#R \
#        gs://toast-stats-fac-recovery-2239/fac-2239/<date>/district_<id>.json
#        a server-side copy: the stored (gzip) bytes and Content-Encoding.
#      check: the copy's md5 == E's md5 (a pre-existing copy fails here)
#   3. gcloud storage restore gs://<src>/<name>#L --if-generation-match=R
#      check: the live md5 == L's md5 (the stripped bytes, a new generation)
#
# Between 1 and 3 the pre-scrub (#2026) bytes are the live, public object.
# Before --execute on staging, the operator removes the bucket's allUsers
# objectViewer binding and re-adds it after, then invalidates the CDN paths
# (fac-recovery plan, section 1). This script does neither.
#
# The plan always comes from a fresh listing (live, soft-deleted and the
# destination): per live district_<id>.json (never the _reports.json
# sidecar), E is the newest soft-deleted generation larger than 1.5x the
# live size. --manifest (the stored inventory, a JSON array of {bucket,
# name, generation, md5}) only cross-checks it. Each object's action:
#   copy               to do
#   done               the destination already holds E's md5 (a rerun)
#   no-candidate       no generation above the threshold; skipped, counted
#   conflict           the destination holds other bytes      } block the
#   manifest-mismatch  E differs from the stored manifest     } whole run
#
# Default: a dry run. Only `objects list` calls; nothing is written.
# --execute: refused while a data-pipeline run is in progress, or when the
# plan is blocked. Up to --parallel objects at a time (default 8). The first
# failure stops it: no new object starts, and every object left between
# steps 1 and 3 is listed with the restore that puts its live copy back.
# --allow-prod: required to name toast-stats-data-ca as the source.
#
# Env: GCLOUD (default gcloud), GH (default gh).
# Output: stdout is JSON lines (R4): one {"type":"plan"} per object, then one
# {"type":"summary"}. Logs go to stderr.
# Exit codes: 0 done (or a clean plan) · 1 blocked, refused or failed ·
#             2 usage
set -euo pipefail

readonly DEST_BUCKET='toast-stats-fac-recovery-2239'
readonly DEST_ROOT="gs://${DEST_BUCKET}/fac-2239"
readonly PROD_BUCKET='toast-stats-data-ca'
readonly REPO_SLUG='taverns-red/toast-stats'
GCLOUD="${GCLOUD:-gcloud}"
GH="${GH:-gh}"

# ── One object, steps 1-3 (run by xargs as `<script> __one ...`) ──
# State file: <step>\t<R>\t<L>\t<reason>. Steps: started, restored-enriched,
# copied, done, failed (before step 1 changed anything), skipped.
one_object() {
  local state="$1" bucket="$2" name="$3" e="$4" emd5="$5" l="$6" lmd5="$7"
  local dst="$8"
  local sf
  sf="${state}/$(printf '%s' "${name}" | tr '/' '_')"
  local url="gs://${bucket}/${name}" r="" md5=""
  record() { printf '%s\t%s\t%s\t%s\n' "$1" "${r}" "${l}" "${2:-}" >"${sf}"; }
  stop() {
    record "$1" "$2"
    : >"${state}/STOP"
    echo "copy-out: ${name}: $2" >&2
    exit 255 # xargs starts nothing more
  }
  if [ -e "${state}/STOP" ]; then
    record skipped
    return 0
  fi
  record started
  # 1. restore E over L
  local desc
  if ! "${GCLOUD}" storage restore "${url}#${e}" --if-generation-match="${l}" >&2; then
    desc="$("${GCLOUD}" storage objects describe "${url}" --format=json)" || desc='{}'
    if [ "$(jq -r '.md5_hash // ""' <<<"${desc}")" = "${lmd5}" ]; then
      stop failed "restore of the enriched generation ${e} failed; live unchanged"
    fi
    r="$(jq -r '.generation // ""' <<<"${desc}")"
    stop restored-enriched "restore of ${e} failed and the live object is not L any more"
  fi
  desc="$("${GCLOUD}" storage objects describe "${url}" --format=json)" ||
    stop restored-enriched "cannot describe the restored object"
  r="$(jq -r .generation <<<"${desc}")"
  [ "$(jq -r .md5_hash <<<"${desc}")" = "${emd5}" ] ||
    stop restored-enriched "the restored generation ${r} is not E's md5"
  record restored-enriched
  # 2. server-side copy out, never over an existing object
  "${GCLOUD}" storage cp --no-clobber "${url}#${r}" "${dst}" >&2 ||
    stop restored-enriched "copy to ${dst} failed"
  md5="$("${GCLOUD}" storage objects describe "${dst}" --format=json | jq -r .md5_hash)" ||
    stop restored-enriched "cannot describe ${dst}"
  [ "${md5}" = "${emd5}" ] ||
    stop restored-enriched "${dst} does not hold E's md5"
  record copied
  # 3. restore L back over R
  "${GCLOUD}" storage restore "${url}#${l}" --if-generation-match="${r}" >&2 ||
    stop copied "restore of the live generation ${l} failed"
  md5="$("${GCLOUD}" storage objects describe "${url}" --format=json | jq -r .md5_hash)" ||
    stop copied "cannot describe the live object after restoring L"
  [ "${md5}" = "${lmd5}" ] ||
    stop copied "the live object is not L's md5 after restoring it"
  record "done"
}

if [ "${1:-}" = "__one" ]; then
  shift
  one_object "$@"
  exit 0
fi

usage() {
  echo "usage: fac-recovery-2239-copy-out.sh [--execute] [--allow-prod] [--parallel N] [--manifest FILE] <source-bucket> <date>..." >&2
  exit 2
}

EXECUTE=0
ALLOW_PROD=0
PARALLEL=8
MANIFEST=""
POSITIONAL=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --execute) EXECUTE=1 ;;
    --allow-prod) ALLOW_PROD=1 ;;
    --parallel)
      [ "$#" -ge 2 ] || usage
      PARALLEL="$2"
      shift
      ;;
    --manifest)
      [ "$#" -ge 2 ] || usage
      MANIFEST="$2"
      shift
      ;;
    -*) usage ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done
[ "${#POSITIONAL[@]}" -ge 2 ] || usage
BUCKET="${POSITIONAL[0]}"
DATES=("${POSITIONAL[@]:1}")
[[ "${PARALLEL}" =~ ^[0-9]+$ ]] && [ "${PARALLEL}" -ge 1 ] && [ "${PARALLEL}" -le 32 ] || usage
[[ "${BUCKET}" =~ ^[a-z0-9][a-z0-9._-]*[a-z0-9]$ ]] || usage
for d in "${DATES[@]}"; do
  [[ "${d}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || usage
done
if [ "${BUCKET}" = "${DEST_BUCKET}" ]; then
  echo "copy-out: the recovery bucket cannot be the source" >&2
  exit 2
fi
if [ "${BUCKET}" = "${PROD_BUCKET}" ] && [ "${ALLOW_PROD}" != 1 ]; then
  echo "copy-out: ${PROD_BUCKET} is production; pass --allow-prod (approval A3-prod)" >&2
  exit 2
fi
if [ -n "${MANIFEST}" ] && ! jq -e 'type == "array"' "${MANIFEST}" >/dev/null 2>&1; then
  echo "copy-out: --manifest ${MANIFEST} is not a JSON array" >&2
  exit 2
fi

# stdout is reserved for the JSON lines; fd 3 keeps it.
exec 3>&1 1>&2

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT
PLAN="${WORK}/plan.jsonl"
: >"${PLAN}"
if [ -n "${MANIFEST}" ]; then
  cp "${MANIFEST}" "${WORK}/manifest.json"
else
  echo '[]' >"${WORK}/manifest.json"
fi

# ── Plan: a fresh listing per date ──
for d in "${DATES[@]}"; do
  "${GCLOUD}" storage objects list "gs://${BUCKET}/snapshots/${d}/district_*.json" \
    --format=json >"${WORK}/live.json"
  "${GCLOUD}" storage objects list "gs://${BUCKET}/snapshots/${d}/district_*.json" \
    --soft-deleted --format=json >"${WORK}/soft.json"
  "${GCLOUD}" storage objects list "${DEST_ROOT}/${d}/district_*.json" \
    --format=json >"${WORK}/dest.json"
  jq -c -n --arg date "${d}" --arg bucket "${BUCKET}" --arg root "${DEST_ROOT}" \
    --slurpfile live "${WORK}/live.json" --slurpfile soft "${WORK}/soft.json" \
    --slurpfile dest "${WORK}/dest.json" \
    --slurpfile man "${WORK}/manifest.json" '
    ($soft[0]) as $S | ($dest[0]) as $D | ($man[0]) as $M
    | $live[0]
    | map(select(.name | test("/district_[A-Za-z0-9]+\\.json$")))
    | sort_by(.name)[]
    | . as $l
    | ([$S[] | select(.name == $l.name and .size > 1.5 * $l.size)]
        | sort_by(.generation | tonumber) | last) as $e
    | ($l.name | sub("^snapshots/"; "")) as $rel
    | ([$D[] | select(.name == ("fac-2239/" + $rel))] | first) as $d
    | ([$M[] | select(.bucket == $bucket and .name == $l.name)] | first) as $m
    | {type: "plan", date: $date, bucket: $bucket, name: $l.name,
       enriched: (if $e == null then null
                  else {generation: $e.generation, md5: $e.md5_hash, size: $e.size} end),
       live: {generation: $l.generation, md5: $l.md5_hash, size: $l.size},
       destination: ($root + "/" + $rel),
       action: (if $e == null then "no-candidate"
                elif $m != null and ($m.generation != $e.generation or $m.md5 != $e.md5_hash)
                  then "manifest-mismatch"
                elif $d != null and $d.md5_hash == $e.md5_hash then "done"
                elif $d != null then "conflict"
                else "copy" end)}' >>"${PLAN}"
done
cat "${PLAN}" >&3

count() { jq -s --arg a "$1" 'map(select(.action == $a)) | length' "${PLAN}"; }
BLOCKED=$(($(count conflict) + $(count manifest-mismatch)))
plan_summary() {
  jq -s -c --argjson execute "$1" --arg bucket "${BUCKET}" --argjson dates "${#DATES[@]}" '
    def n(a): map(select(.action == a)) | length;
    {type: "summary", execute: ($execute == 1), bucket: $bucket, dates: $dates,
     objects: length, copy: n("copy"), done: n("done"),
     noCandidate: n("no-candidate"), conflict: n("conflict"),
     manifestMismatch: n("manifest-mismatch"),
     bytes: (map(select(.action == "copy") | .enriched.size) | add // 0)}' "${PLAN}"
}

if [ "${EXECUTE}" != 1 ]; then
  plan_summary 0 >&3
  echo "copy-out: dry run; nothing written. Re-run with --execute to copy $(count copy) object(s)."
  [ "${BLOCKED}" -eq 0 ] || exit 1
  exit 0
fi

# ── Execute ──
if [ "${BLOCKED}" -ne 0 ]; then
  plan_summary 1 >&3
  echo "::error::copy-out: the plan is blocked (${BLOCKED} conflict/manifest-mismatch); nothing written"
  exit 1
fi
RUNNING="$("${GH}" run list --repo "${REPO_SLUG}" --workflow data-pipeline.yml \
  --status in_progress --json databaseId --jq length)" || RUNNING="unknown"
if [ "${RUNNING}" != "0" ]; then
  plan_summary 1 >&3
  echo "::error::copy-out: data-pipeline runs in progress: ${RUNNING}; nothing written"
  exit 1
fi
if [ "${BUCKET}" != "${PROD_BUCKET}" ]; then
  echo "copy-out: reminder: the staging allUsers objectViewer binding should be off for this window"
fi

STATE="${WORK}/state"
mkdir -p "${STATE}"
jq -r 'select(.action == "copy")
  | [.name, .enriched.generation, .enriched.md5, .live.generation, .live.md5, .destination]
  | .[]' "${PLAN}" >"${WORK}/todo"
if [ -s "${WORK}/todo" ]; then
  # 6 fields per object; no field holds whitespace (names are
  # snapshots/<date>/district_<id>.json, md5s base64).
  xargs -n 6 -P "${PARALLEL}" bash "$0" __one "${STATE}" "${BUCKET}" \
    <"${WORK}/todo" || true
fi

# ── Report ──
: >"${WORK}/results.jsonl"
for f in "${STATE}"/*; do
  [ -f "${f}" ] || continue
  [ "$(basename "${f}")" = STOP ] && continue
  IFS=$'\t' read -r step r l reason <"${f}" || true
  # The state file is the name with `/` → `_`: map it back through the plan.
  name="$(jq -r --arg k "$(basename "${f}")" \
    'select((.name | gsub("/"; "_")) == $k) | .name' "${PLAN}")"
  # restored-enriched / copied: E's bytes are live as R; the undo restores L
  # over R. started: interrupted inside step 1, state unknown: inspect it.
  jq -c -n --arg name "${name}" --arg step "${step}" --arg r "${r}" \
    --arg l "${l}" --arg reason "${reason}" --arg bucket "${BUCKET}" '
    {type: "result", name: $name, step: $step, live: $r, reason: $reason}
    + (if ($step == "restored-enriched" or $step == "copied") and $r != ""
       then {stuck: true,
             undo: ("gcloud storage restore gs://" + $bucket + "/" + $name + "#" + $l
                    + " --if-generation-match=" + $r)}
       elif $step == "started" or $step == "restored-enriched" or $step == "copied"
       then {stuck: true, undo: null}
       else {} end)' >>"${WORK}/results.jsonl"
done
jq -c 'select(.step != "done")' "${WORK}/results.jsonl" >&3 || true
plan_summary 1 | jq -c --slurpfile res "${WORK}/results.jsonl" '
  ($res | map(select(.step == "done")) | length) as $copied
  | . + {copied: $copied, done: (.done + $copied),
         failed: ($res | map(select(.step != "done" and .step != "skipped")) | length),
         skipped: ($res | map(select(.step == "skipped")) | length),
         stuck: ($res | map(select(.stuck == true)
                 | {name, step, live, undo}))}' >&3
if jq -e 'select(.step != "done" and .step != "skipped")' "${WORK}/results.jsonl" >/dev/null 2>&1; then
  echo "::error::copy-out: stopped on a failure; see the stuck list"
  exit 1
fi
exit 0
