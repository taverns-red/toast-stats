#!/usr/bin/env bash
# Copy the enriched, soft-deleted generations of snapshots/<date>/
# district_<id>.json out to the private recovery bucket (#2239).
#
# Usage: scripts/ops/fac-recovery-2239-copy-out.sh
#          [--execute | --pilot | --recover] [--allow-prod] [--parallel N]
#          [--manifest FILE] [--state-dir DIR] <source-bucket> <date>...
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
#        precondition is on the LIVE object (objects.restore ifGenerationMatch):
#        a daily or rebuild that changed it since the listing fails closed.
#        The restore makes a new live generation R with E's bytes; L is
#        soft-deleted (versioning is off).
#      check: R's md5 == E's md5
#   2. gcloud storage cp --no-clobber gs://<src>/<name>#R \
#        gs://toast-stats-fac-recovery-2239/fac-2239/<date>/district_<id>.json
#        a server-side copy: the stored (gzip) bytes and Content-Encoding.
#      check: the copy's md5 == E's md5 (a pre-existing copy fails here)
#   3. gcloud storage restore gs://<src>/<name>#L --if-generation-match=R
#      check: the live md5 == L's md5 (the stripped bytes, a new generation)
#
# Between 1 and 3 the pre-scrub (#2026) bytes are the live object. Safety:
#   - Preflight (every mode but --recover; it refuses any write otherwise,
#     and changes no IAM itself — the operator does): the recovery bucket
#     enforces public access prevention and grants nothing to allUsers or
#     allAuthenticatedUsers; a staging source's allUsers binding is ALREADY
#     off. A prod source (--allow-prod) cannot be closed; only its source
#     check is skipped.
#   - A persistent, append-only journal, <state-dir>/journal.jsonl (default
#     .routine-tmp/fac-2239-copyout-<UTC time>/, never deleted), gets a line
#     BEFORE each step and after it, so a crash leaves the undo state.
#   - Every command between steps 1 and 3 is checked. Any failure there
#     restores L for that object (--if-generation-match on the generation
#     that holds E's bytes, never forced: if another writer replaced it, it
#     is reported, not reverted) and stops every worker.
#   - Workers ignore INT/HUP/TERM, so Ctrl-C or a closed terminal lets each
#     in-flight object finish step 3. The parent traps them, starts nothing
#     new, waits, and prints the report (exit 130).
#   - --recover rebuilds the undo state from the journal plus fresh listings
#     (for a hard crash, or a call that completed server-side after its
#     worker died) and puts every pre-scrub live object back to its L.
#   - Before each batch (one date; --pilot: one object) it re-checks that no
#     data-pipeline run is in progress, pausing PAUSE_SECONDS (default 300)
#     until none is.
#   - At the end it prints the CDN invalidations for every date it touched.
#
# The plan always comes from a fresh listing (live, soft-deleted and the
# destination): per live district_<id>.json (never the _reports.json
# sidecar), E is the newest soft-deleted generation larger than 1.5x the
# live size. --manifest (the stored inventory, a JSON array of {bucket,
# name, generation, md5}) cross-checks E's md5 (not its generation: step 3
# soft-deletes R, a newer generation with E's bytes, which a resumed plan
# picks). Each object's action:
#   copy               to do
#   done               the destination already holds E's md5 (a rerun)
#   no-candidate       no generation above the threshold; skipped, counted
#   conflict           the destination holds other bytes      } block the
#   manifest-mismatch  E's md5 differs from the stored one    } whole run
#
# Modes: default a dry run (only reads: listings, bucket describe and IAM).
# --execute: every copy. --pilot: exactly one object (the plan's first copy).
# --recover: no copy; puts pre-scrub live objects back (see recover()).
# --allow-prod: required to name toast-stats-data-ca as the source.
#
# Env: GCLOUD (default gcloud), GH (default gh), PAUSE_SECONDS.
# Output: stdout is JSON lines (R4): {"type":"plan"} per object, or
# {"type":"recover"} per object in --recover; {"type":"cdn-invalidate"} when
# a date was touched; one {"type":"summary"} last. Logs go to stderr.
# Exit codes: 0 done (or a clean plan) · 1 blocked, refused or failed ·
#             2 usage · 130 interrupted (in-flight objects finished)
set -euo pipefail

readonly DEST_BUCKET='toast-stats-fac-recovery-2239'
readonly DEST_ROOT="gs://${DEST_BUCKET}/fac-2239"
readonly PROD_BUCKET='toast-stats-data-ca'
readonly PROD_URL_MAP='toast-stats-cdn-url-map'
readonly STAGING_URL_MAP='toast-stats-cdn-staging-url-map'
readonly REPO_SLUG='taverns-red/toast-stats'
GCLOUD="${GCLOUD:-gcloud}"
GH="${GH:-gh}"
PAUSE_SECONDS="${PAUSE_SECONDS:-300}"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname "${SELF}")/../.." && pwd)"

# Append one journal line: jnl <state-dir> <name> <event> [key=value ...].
# RUN_ID (exported by the parent) tags the run.
jnl() {
  local sd="$1" name="$2" event="$3" kv k
  shift 3
  local args=(--arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg run "${RUN_ID:-}"
    --arg name "${name}" --arg event "${event}")
  local filter='{ts: $ts, run: $run, name: $name, event: $event}'
  for kv in "$@"; do
    k="${kv%%=*}"
    args+=(--arg "${k}" "${kv#*=}")
    filter="${filter} + {${k}: \$${k}}"
  done
  jq -nc "${args[@]}" "${filter}" >>"${sd}/journal.jsonl"
}

# ── One object, steps 1-3 (run by xargs as `<script> __one ...`) ──
# Journal events: step1-begin, step1-ok, step2-begin, step2-ok, step3-begin,
# done · skipped · failed-unchanged (step 1 changed nothing) · rollback-begin,
# rolled-back (L live again) · live-changed (another writer; reported, not
# reverted) · stuck (E may still be live; act on it).
one_object() {
  # Every command below is checked by hand (#2240 B2): a failure must
  # never exit this worker with E live and nothing recorded.
  set +e
  trap '' INT HUP TERM
  local sd="$1" bucket="$2" name="$3" e="$4" emd5="$5" l="$6" lmd5="$7"
  local dst="$8"
  local url="gs://${bucket}/${name}" r=""
  LIVE_GEN="" LIVE_MD5=""

  J() {
    local ev="$1"
    shift
    jnl "${sd}" "${name}" "${ev}" bucket="${bucket}" e="${e}" emd5="${emd5}" \
      l="${l}" lmd5="${lmd5}" r="${r}" "$@"
  }
  halt() {
    : >"${sd}/STOP"
    exit 255 # xargs starts nothing more
  }
  # The live generation and md5, from a describe that must parse.
  live_state() {
    local d
    d="$("${GCLOUD}" storage objects describe "${url}" --format=json)" || return 1
    LIVE_GEN="$(jq -er '.generation' <<<"${d}" 2>/dev/null)" || return 1
    LIVE_MD5="$(jq -er '.md5_hash' <<<"${d}" 2>/dev/null)" || return 1
  }
  live_state_retry() {
    local i
    for i in 1 2 3; do
      live_state && return 0
      sleep "${i}"
    done
    return 1
  }
  # After step 1 succeeded: put L back if E (ours) is live, then stop all.
  bail() {
    local why="$1"
    echo "copy-out: ${name}: ${why}; restoring L" >&2
    J rollback-begin reason="${why}"
    if ! live_state_retry; then
      J stuck reason="${why}; the live object cannot be read"
      halt
    fi
    if [ "${LIVE_MD5}" = "${lmd5}" ]; then
      J rolled-back reason="${why} (L was already live)"
      halt
    fi
    if [ "${LIVE_MD5}" != "${emd5}" ]; then
      J live-changed reason="${why}; the live object is neither E nor L: another writer"
      halt
    fi
    r="${LIVE_GEN}"
    if "${GCLOUD}" storage restore "${url}#${l}" --if-generation-match="${r}" >&2 &&
      live_state_retry && [ "${LIVE_MD5}" = "${lmd5}" ]; then
      J rolled-back reason="${why}"
      halt
    fi
    if live_state_retry && [ "${LIVE_MD5}" != "${emd5}" ] && [ "${LIVE_MD5}" != "${lmd5}" ]; then
      J live-changed reason="${why}; restore of L not applied: another writer replaced ${r}"
    else
      J stuck reason="${why}; restore of L failed"
    fi
    halt
  }

  if [ -e "${sd}/STOP" ]; then
    J skipped
    return 0
  fi
  if ! J step1-begin; then
    echo "copy-out: ${name}: cannot write the journal; not starting" >&2
    halt
  fi
  # 1. restore E over L
  if ! "${GCLOUD}" storage restore "${url}#${e}" --if-generation-match="${l}" >&2; then
    if ! live_state_retry; then
      J stuck reason="step 1 failed and the live object cannot be read"
      halt
    fi
    if [ "${LIVE_MD5}" = "${lmd5}" ]; then
      J failed-unchanged reason="restore of E failed; the live object is unchanged"
      halt
    fi
    if [ "${LIVE_MD5}" = "${emd5}" ]; then
      r="${LIVE_GEN}"
      bail "restore of E reported a failure but E is live"
    fi
    J live-changed reason="restore of E failed; the live object changed (another writer)"
    halt
  fi
  J step1-ok || bail "cannot write the journal after step 1"
  live_state || bail "cannot read the live object after step 1"
  if [ "${LIVE_MD5}" != "${emd5}" ]; then
    # Not our bytes: someone wrote between the restore and the describe.
    J live-changed reason="after step 1 the live object is not E (another writer)"
    halt
  fi
  r="${LIVE_GEN}"
  # 2. server-side copy out, never over an existing object
  J step2-begin || bail "cannot write the journal before step 2"
  "${GCLOUD}" storage cp --no-clobber "${url}#${r}" "${dst}" >&2 ||
    bail "copy to ${dst} failed"
  local d dmd5
  d="$("${GCLOUD}" storage objects describe "${dst}" --format=json)" ||
    bail "cannot describe ${dst}"
  dmd5="$(jq -er '.md5_hash' <<<"${d}" 2>/dev/null)" || bail "cannot read ${dst}'s md5"
  [ "${dmd5}" = "${emd5}" ] || bail "${dst} does not hold E's md5"
  J step2-ok || bail "cannot write the journal after step 2"
  # 3. restore L back over R
  J step3-begin || bail "cannot write the journal before step 3"
  if ! "${GCLOUD}" storage restore "${url}#${l}" --if-generation-match="${r}" >&2; then
    if ! live_state_retry; then
      J stuck reason="restore of L failed and the live object cannot be read"
      halt
    fi
    if [ "${LIVE_MD5}" = "${emd5}" ] && [ "${LIVE_GEN}" = "${r}" ]; then
      J stuck reason="restore of L failed; E is still live as ${r}"
      halt
    fi
    if [ "${LIVE_MD5}" != "${lmd5}" ]; then
      J live-changed reason="restore of L failed its precondition: another writer replaced ${r}; not forced"
      halt
    fi
  fi
  if ! live_state_retry; then
    J stuck reason="cannot verify the live object after restoring L"
    halt
  fi
  if [ "${LIVE_MD5}" != "${lmd5}" ]; then
    if [ "${LIVE_MD5}" = "${emd5}" ]; then
      J stuck reason="after restoring L the live object is still E"
    else
      J live-changed reason="after restoring L the live object is another writer's"
    fi
    halt
  fi
  J "done"
  return 0
}

if [ "${1:-}" = "__one" ]; then
  shift
  one_object "$@"
  exit 0
fi

usage() {
  echo "usage: fac-recovery-2239-copy-out.sh [--execute | --pilot | --recover] [--allow-prod] [--parallel N] [--manifest FILE] [--state-dir DIR] <source-bucket> <date>..." >&2
  exit 2
}

MODE=dry-run
ALLOW_PROD=0
PARALLEL=8
MANIFEST=""
STATE_DIR=""
POSITIONAL=()
set_mode() {
  [ "${MODE}" = dry-run ] || usage
  MODE="$1"
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --execute) set_mode execute ;;
    --pilot) set_mode pilot ;;
    --recover) set_mode recover ;;
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
    --state-dir)
      [ "$#" -ge 2 ] || usage
      STATE_DIR="$2"
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
[[ "${PAUSE_SECONDS}" =~ ^[0-9]+$ ]] || usage
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
URL_MAP="${STAGING_URL_MAP}"
[ "${BUCKET}" = "${PROD_BUCKET}" ] && URL_MAP="${PROD_URL_MAP}"

# stdout is reserved for the JSON lines; fd 3 keeps it.
exec 3>&1 1>&2

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}" # listings only; the journal lives in STATE_DIR
  return 0
}
trap cleanup EXIT
if [ -n "${MANIFEST}" ]; then
  cp "${MANIFEST}" "${WORK}/manifest.json"
else
  echo '[]' >"${WORK}/manifest.json"
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
export RUN_ID
if [ "${MODE}" != dry-run ]; then
  STATE_DIR="${STATE_DIR:-${REPO}/.routine-tmp/fac-2239-copyout-${RUN_ID}}"
  mkdir -p "${STATE_DIR}"
  touch "${STATE_DIR}/journal.jsonl"
  echo "copy-out: journal ${STATE_DIR}/journal.jsonl (kept; --recover reads it)"
fi

# Listings of one date into $WORK/{live,soft,dest}.json.
list_date() {
  local d="$1"
  "${GCLOUD}" storage objects list "gs://${BUCKET}/snapshots/${d}/district_*.json" \
    --format=json >"${WORK}/live.json"
  "${GCLOUD}" storage objects list "gs://${BUCKET}/snapshots/${d}/district_*.json" \
    --soft-deleted --format=json >"${WORK}/soft.json"
  "${GCLOUD}" storage objects list "${DEST_ROOT}/${d}/district_*.json" \
    --format=json >"${WORK}/dest.json"
}

cdn_line() {
  # The dates given as arguments, one invalidation each.
  [ "$#" -gt 0 ] || return 0
  printf '%s\n' "$@" | awk 'NF && !seen[$0]++' |
    jq -R -s -c --arg map "${URL_MAP}" '
      split("\n") | map(select(length > 0))
      | {type: "cdn-invalidate",
         commands: map("gcloud compute url-maps invalidate-cdn-cache " + $map
                       + " --path='"'"'/snapshots/" + . + "/*'"'"'")}' >&3
  echo "copy-out: invalidate the CDN for the dates touched (commands on stdout)"
}

# ══ --recover ══
# Per live district_<id>.json of each date, from fresh listings plus the
# journal (any run in --state-dir) and the manifest:
#   pre-scrub evidence: the live md5 is a journalled E, a manifest md5, or
#     the md5 of a soft-deleted generation of the same object;
#   then the target is the journalled L, else the newest soft-deleted
#     generation under live/1.5 in size; it is restored with
#     --if-generation-match=<live>, and the live md5 checked against it.
#   A journalled object that is neither E nor L now: live-changed (another
#   writer), reported, not reverted. Anything else: ok, untouched.
recover() {
  local d out="${WORK}/recover.jsonl" journal_all="${WORK}/journal-all.json"
  : >"${out}"
  jq -s 'map(select(.l != null and .l != "")) | group_by(.name)
    | map(last) | map({key: .name, value: .}) | from_entries' \
    "${STATE_DIR}/journal.jsonl" >"${journal_all}"
  for d in "${DATES[@]}"; do
    list_date "${d}"
    jq -c -n --slurpfile live "${WORK}/live.json" --slurpfile soft "${WORK}/soft.json" \
      --slurpfile man "${WORK}/manifest.json" --slurpfile jr "${journal_all}" \
      --arg bucket "${BUCKET}" --arg date "${d}" '
      ($soft[0]) as $S | ($man[0]) as $M | ($jr[0]) as $J
      | $live[0]
      | map(select(.name | test("/district_[A-Za-z0-9]+\\.json$")))
      | sort_by(.name)[]
      | . as $l
      | ($J[$l.name]) as $j
      | ([$j.emd5?] + [$M[] | select(.bucket == $bucket and .name == $l.name) | .md5]
         + [$S[] | select(.name == $l.name) | .md5_hash]
         | map(select(. != null and . != ""))) as $evidence
      | ([$S[] | select(.name == $l.name and (.size * 1.5) < $l.size)]
         | sort_by(.generation | tonumber) | last) as $small
      | {date: $date, name: $l.name, live: $l.generation, liveMd5: $l.md5_hash,
         prescrub: ($evidence | index($l.md5_hash) != null),
         target: (if $j != null then $j.l elif $small != null then $small.generation else null end),
         targetMd5: (if $j != null then $j.lmd5 elif $small != null then $small.md5_hash else null end),
         journalled: ($j != null), jlmd5: ($j.lmd5?)}' >>"${WORK}/candidates.jsonl"
  done
  local line name live target tmd5 action touched=()
  while IFS= read -r line; do
    name="$(jq -r .name <<<"${line}")"
    live="$(jq -r .live <<<"${line}")"
    target="$(jq -r '.target // ""' <<<"${line}")"
    tmd5="$(jq -r '.targetMd5 // ""' <<<"${line}")"
    action=ok
    if jq -e .prescrub <<<"${line}" >/dev/null; then
      if [ -z "${target}" ]; then
        action="no-target"
      else
        touched+=("$(jq -r .date <<<"${line}")")
        jnl "${STATE_DIR}" "${name}" recover-begin bucket="${BUCKET}" l="${target}" lmd5="${tmd5}" r="${live}"
        if "${GCLOUD}" storage restore "gs://${BUCKET}/${name}#${target}" \
          --if-generation-match="${live}" >&2 &&
          [ "$("${GCLOUD}" storage objects describe "gs://${BUCKET}/${name}" --format=json |
            jq -r .md5_hash)" = "${tmd5}" ]; then
          action=restored
        else
          action=failed
        fi
        jnl "${STATE_DIR}" "${name}" "recover-${action}" bucket="${BUCKET}" l="${target}" lmd5="${tmd5}" r="${live}"
      fi
    elif jq -e '.journalled and .liveMd5 != .jlmd5' <<<"${line}" >/dev/null; then
      action="live-changed"
    fi
    jq -c --arg action "${action}" \
      '{type: "recover", date, name, action: $action, live, target}' <<<"${line}" >>"${out}"
  done <"${WORK}/candidates.jsonl"
  cat "${out}" >&3
  cdn_line "${touched[@]+"${touched[@]}"}"
  jq -s -c --arg bucket "${BUCKET}" --arg sd "${STATE_DIR}" '
    def n(a): map(select(.action == a)) | length;
    {type: "summary", mode: "recover", bucket: $bucket, stateDir: $sd,
     objects: length, restored: n("restored"), ok: n("ok"),
     failed: n("failed"), noTarget: n("no-target"), liveChanged: n("live-changed")}' \
    "${out}" >&3
  if jq -s -e 'any(.[]; .action != "ok" and .action != "restored")' "${out}" >/dev/null; then
    exit 1
  fi
  exit 0
}

if [ "${MODE}" = recover ]; then
  : >"${WORK}/candidates.jsonl"
  recover
fi

# ══ Preflight (verify, never change) ══
PREFLIGHT='{}'
preflight() {
  local ok=true reasons=() d pap iam pub src_pub='[]' src_checked=false
  if d="$("${GCLOUD}" storage buckets describe "gs://${DEST_BUCKET}" --format=json)"; then
    pap="$(jq -r '.public_access_prevention // ""' <<<"${d}" 2>/dev/null)" || pap=""
    [ "${pap}" = enforced ] || {
      ok=false
      reasons+=("gs://${DEST_BUCKET} public_access_prevention is '${pap}', not enforced")
    }
  else
    ok=false
    pap=""
    reasons+=("gs://${DEST_BUCKET} cannot be described (does it exist?)")
  fi
  local public_members='[.bindings[]?.members[]? | select(. == "allUsers" or . == "allAuthenticatedUsers")] | unique'
  if iam="$("${GCLOUD}" storage buckets get-iam-policy "gs://${DEST_BUCKET}" --format=json)" &&
    pub="$(jq -c "${public_members}" <<<"${iam}" 2>/dev/null)"; then
    [ "${pub}" = '[]' ] || {
      ok=false
      reasons+=("gs://${DEST_BUCKET} grants ${pub}")
    }
  else
    ok=false
    pub='null'
    reasons+=("gs://${DEST_BUCKET} IAM policy cannot be read")
  fi
  if [ "${BUCKET}" != "${PROD_BUCKET}" ]; then
    src_checked=true
    if iam="$("${GCLOUD}" storage buckets get-iam-policy "gs://${BUCKET}" --format=json)" &&
      src_pub="$(jq -c "${public_members}" <<<"${iam}" 2>/dev/null)"; then
      [ "${src_pub}" = '[]' ] || {
        ok=false
        reasons+=("gs://${BUCKET} still grants ${src_pub}: remove the allUsers objectViewer binding first")
      }
    else
      ok=false
      src_pub='null'
      reasons+=("gs://${BUCKET} IAM policy cannot be read")
    fi
  else
    echo "copy-out: ${PROD_BUCKET} stays public; its window is seconds per object (A3-prod)"
  fi
  PREFLIGHT="$(jq -c -n --argjson ok "${ok}" --arg pap "${pap}" --argjson destPublic "${pub}" \
    --argjson sourceChecked "${src_checked}" --argjson sourcePublic "${src_pub}" \
    '{ok: $ok, destPublicAccessPrevention: $pap, destPublicMembers: $destPublic,
      sourceChecked: $sourceChecked, sourcePublicMembers: $sourcePublic,
      reasons: $ARGS.positional}' --args "${reasons[@]+"${reasons[@]}"}")"
  local reason
  for reason in "${reasons[@]+"${reasons[@]}"}"; do echo "::error::copy-out: ${reason}"; done
  [ "${ok}" = true ]
}
PREFLIGHT_OK=1
preflight || PREFLIGHT_OK=0
if [ "${PREFLIGHT_OK}" != 1 ] && [ "${MODE}" != dry-run ]; then
  jq -c -n --arg mode "${MODE}" --arg bucket "${BUCKET}" --argjson p "${PREFLIGHT}" \
    '{type: "summary", mode: $mode, bucket: $bucket, preflight: $p}' >&3
  echo "::error::copy-out: preflight failed; nothing written"
  exit 1
fi

# ══ Plan: a fresh listing per date ══
PLAN="${WORK}/plan.jsonl"
: >"${PLAN}"
for d in "${DATES[@]}"; do
  list_date "${d}"
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
                elif $d != null and $d.md5_hash == $e.md5_hash then "done"
                elif $m != null and $m.md5 != $e.md5_hash then "manifest-mismatch"
                elif $d != null then "conflict"
                else "copy" end)}' >>"${PLAN}"
done
cat "${PLAN}" >&3
[ -n "${STATE_DIR}" ] && cp "${PLAN}" "${STATE_DIR}/plan.jsonl"

count() { jq -s --arg a "$1" 'map(select(.action == $a)) | length' "${PLAN}"; }
BLOCKED=$(($(count conflict) + $(count manifest-mismatch)))
plan_summary() {
  jq -s -c --arg mode "${MODE}" --arg bucket "${BUCKET}" --argjson dates "${#DATES[@]}" \
    --argjson p "${PREFLIGHT}" '
    def n(a): map(select(.action == a)) | length;
    {type: "summary", mode: $mode, bucket: $bucket, dates: $dates,
     objects: length, copy: n("copy"), done: n("done"),
     noCandidate: n("no-candidate"), conflict: n("conflict"),
     manifestMismatch: n("manifest-mismatch"),
     bytes: (map(select(.action == "copy") | .enriched.size) | add // 0),
     preflight: $p}' "${PLAN}"
}

if [ "${MODE}" = dry-run ]; then
  plan_summary >&3
  echo "copy-out: dry run; nothing written. --pilot copies one object, --execute $(count copy)."
  [ "${BLOCKED}" -eq 0 ] && [ "${PREFLIGHT_OK}" = 1 ] || exit 1
  exit 0
fi

# ══ Execute / pilot ══
if [ "${BLOCKED}" -ne 0 ]; then
  plan_summary >&3
  echo "::error::copy-out: the plan is blocked (${BLOCKED} conflict/manifest-mismatch); nothing written"
  exit 1
fi

INTERRUPTED=0
on_signal() {
  INTERRUPTED=1
  : >"${STATE_DIR}/STOP"
  echo "copy-out: interrupted; in-flight objects finish their restore-back, nothing new starts"
}
rm -f "${STATE_DIR}/STOP"
trap on_signal INT TERM HUP

# Block until no data-pipeline run is in progress. 1 if gh cannot tell, or
# if interrupted while waiting.
wait_for_clear_pipeline() {
  local running
  while :; do
    [ "${INTERRUPTED}" = 0 ] || return 1
    running="$("${GH}" run list --repo "${REPO_SLUG}" --workflow data-pipeline.yml \
      --status in_progress --json databaseId --jq length)" || running="unknown"
    [ "${running}" = 0 ] && return 0
    if [ "${running}" = unknown ]; then
      echo "::error::copy-out: cannot tell whether a data-pipeline run is in progress; stopping"
      return 1
    fi
    echo "copy-out: ${running} data-pipeline run(s) in progress; paused for ${PAUSE_SECONDS}s"
    sleep "${PAUSE_SECONDS}" || true
  done
}

# The batches: one per date, or (pilot) the plan's first copy only.
jq -r 'select(.action == "copy") | .date' "${PLAN}" | awk '!seen[$0]++' >"${WORK}/batches"
if [ "${MODE}" = pilot ]; then
  head -1 "${WORK}/batches" >"${WORK}/batches.1"
  mv "${WORK}/batches.1" "${WORK}/batches"
fi
GATE_FAILED=0
while IFS= read -r d; do
  [ -e "${STATE_DIR}/STOP" ] && break
  if ! wait_for_clear_pipeline; then
    GATE_FAILED=1
    break
  fi
  jq -r --arg d "${d}" 'select(.action == "copy" and .date == $d)
    | [.name, .enriched.generation, .enriched.md5, .live.generation, .live.md5, .destination]
    | .[]' "${PLAN}" >"${WORK}/todo"
  if [ "${MODE}" = pilot ]; then
    head -6 "${WORK}/todo" >"${WORK}/todo.1"
    mv "${WORK}/todo.1" "${WORK}/todo"
  fi
  # 6 fields per object, none with whitespace. xargs and every worker
  # ignore INT/HUP/TERM (inherited); only this shell handles them.
  (
    trap '' INT HUP TERM
    exec xargs -n 6 -P "${PARALLEL}" bash "${SELF}" __one "${STATE_DIR}" "${BUCKET}" \
      <"${WORK}/todo"
  ) &
  XPID=$!
  while kill -0 "${XPID}" 2>/dev/null; do
    wait "${XPID}" 2>/dev/null || true
  done
done <"${WORK}/batches"

# ══ Report, from this run's journal lines ══
jq -s -c --arg run "${RUN_ID}" --arg bucket "${BUCKET}" '
  map(select(.run == $run and .name != "")) | group_by(.name) | map(last)' \
  "${STATE_DIR}/journal.jsonl" >"${WORK}/last.json"
jq -c '.[] | select(.event != "done") | {type: "result", name, event, r, reason}' \
  "${WORK}/last.json" >&3
jq -s -r --arg run "${RUN_ID}" 'map(select(.run == $run and .event == "step1-begin")
  | .name | split("/")[1]) | unique | .[]' "${STATE_DIR}/journal.jsonl" >"${WORK}/touched"
TOUCHED=()
while IFS= read -r d; do TOUCHED+=("${d}"); done <"${WORK}/touched"
cdn_line "${TOUCHED[@]+"${TOUCHED[@]}"}"
RECOVER_CMD="scripts/ops/fac-recovery-2239-copy-out.sh --recover --state-dir ${STATE_DIR}"
[ "${BUCKET}" = "${PROD_BUCKET}" ] && RECOVER_CMD="${RECOVER_CMD} --allow-prod"
RECOVER_CMD="${RECOVER_CMD} ${BUCKET} ${DATES[*]}"
plan_summary | jq -c --slurpfile last "${WORK}/last.json" --arg bucket "${BUCKET}" \
  --argjson interrupted "$([ "${INTERRUPTED}" = 1 ] && echo true || echo false)" \
  --argjson gateFailed "$([ "${GATE_FAILED}" = 1 ] && echo true || echo false)" \
  --arg sd "${STATE_DIR}" --arg recover "${RECOVER_CMD}" '
  ($last[0]) as $L
  | def stuckish: [.event] | inside(["step1-begin", "step1-ok", "step2-begin",
      "step2-ok", "step3-begin", "rollback-begin", "stuck"]);
  ($L | map(select(.event == "done")) | length) as $copied
  | . + {copied: $copied, done: (.done + $copied),
     failed: ($L | map(select(.event != "done" and .event != "skipped")) | length),
     skipped: ($L | map(select(.event == "skipped")) | length),
     stuck: ($L | map(select(stuckish)
       | {name, event, live: .r, reason,
          undo: (if (.r // "") != "" then
                   "gcloud storage restore gs://" + $bucket + "/" + .name + "#" + .l
                   + " --if-generation-match=" + .r + "   # only while the live md5 is E (" + .emd5 + ")"
                 else null end)})),
     liveChanged: ($L | map(select(.event == "live-changed")) | map({name, reason})),
     interrupted: $interrupted, pipelineGateFailed: $gateFailed,
     stateDir: $sd}
  | if (.stuck | length) > 0 then . + {recover: $recover} else . end' >&3

if [ "${INTERRUPTED}" = 1 ]; then
  exit 130
fi
if jq -e 'any(.[]; .event != "done" and .event != "skipped")' "${WORK}/last.json" >/dev/null ||
  [ "${GATE_FAILED}" = 1 ]; then
  echo "::error::copy-out: stopped on a failure; see the summary"
  exit 1
fi
exit 0
