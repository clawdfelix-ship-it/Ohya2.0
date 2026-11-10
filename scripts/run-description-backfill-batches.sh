#!/usr/bin/env bash
# One-time resumable description backfill. Every invocation handles at most 100
# products. No scheduler/service configuration is changed by this script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
RUN_ID="description-backfill-$(date +%Y%m%d-%H%M%S)"
BATCH=0

while true; do
  BATCH=$((BATCH + 1))
  LOG="logs/${RUN_ID}-batch-$(printf '%04d' "$BATCH").log"
  echo "[$(date '+%F %T %Z')] batch ${BATCH} starting (limit=100) log=${LOG}"
  set +e
  /opt/homebrew/bin/node scripts/backfill-mzakka-descriptions-v2.js --limit 100 >"$LOG" 2>&1
  rc=$?
  set -e
  echo "[$(date '+%F %T %Z')] batch ${BATCH} exit=${rc}"
  if [ "$rc" -eq 1 ]; then
    echo "Stopped: fatal batch error; see ${LOG}" >&2
    exit 1
  fi
  if grep -q 'DESCRIPTION_BACKFILL_DONE.*"selected":0' "$LOG"; then
    echo "All remaining candidates have been attempted. Inspect checkpoint for failures/skips."
    exit 0
  fi
  # Exit 2 means some IDs failed/mismatched. Keep them in the failure report
  # instead of retrying the same product indefinitely; retry them once all
  # healthy candidates have been processed.
done
