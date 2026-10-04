#!/usr/bin/env bash
# Runs every quality gate of the repo and reports PASS/FAIL per section.
# Output of passing sections goes only to the log file; output of failing sections is printed.
# Exits non-zero if any section fails.
set -uo pipefail

cd "$(dirname "$0")/.."

LOG="${QA_LOG:-.qa/qa.log}"
mkdir -p "$(dirname "$LOG")"
: >"$LOG"

# Plain output for agents: no colors, no spinners.
export NO_COLOR=1 NEXT_TELEMETRY_DISABLED=1

failed=()
summary=()

section() {
  local name="$1"
  shift
  local out start secs status
  out="$(mktemp)"
  start=$SECONDS
  echo "== $name: running $*"
  "$@" >"$out" 2>&1
  status=$?
  secs=$((SECONDS - start))
  { echo "== $name: $*"; cat "$out"; echo; } >>"$LOG"
  if [ "$status" -eq 0 ]; then
    echo "== $name: PASS (${secs}s)"
    summary+=("PASS  $name")
  else
    echo "== $name: FAIL (${secs}s, exit $status)"
    cat "$out"
    echo "== end of $name output"
    summary+=("FAIL  $name")
    failed+=("$name")
  fi
  rm -f "$out"
}

section biome npx biome check --colors=off
section typecheck npm run --silent typecheck
section build npm run --silent build
section vitest npm test --silent
section playwright npm run --silent test:e2e

echo
echo "== summary"
printf '%s\n' "${summary[@]}"
echo "full log: $LOG"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "QA FAILED: ${failed[*]}"
  exit 1
fi
echo "QA PASSED"
