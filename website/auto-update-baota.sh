#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_ROOT="${SCGS_SITE_ROOT:-$SCRIPT_DIR}"

if [[ ! -f "$SITE_ROOT/auto-update.js" && -f "$SITE_ROOT/website/auto-update.js" ]]; then
  SITE_ROOT="$SITE_ROOT/website"
fi

LOG_DIR="${AUTO_UPDATE_LOG_DIR:-$SITE_ROOT/.tmp/auto-update}"
LOG_FILE="$LOG_DIR/run.log"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

mkdir -p "$LOG_DIR"

{
  echo "[$(date '+%F %T')] auto-update start"
  echo "site root: $SITE_ROOT"

  if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "ERROR: node executable not found. Set NODE_BIN=/path/to/node or install Node.js for the cron user."
    exit 127
  fi

  if [[ ! -f "$SITE_ROOT/auto-update.js" ]]; then
    echo "ERROR: $SITE_ROOT/auto-update.js not found. Check SCGS_SITE_ROOT or deploy auto-update.js to the site root."
    exit 2
  fi

  cd "$SITE_ROOT"
  export SCGS_LOCAL_SITE_ROOT=true
  "$NODE_BIN" auto-update.js "$@"
  echo "[$(date '+%F %T')] auto-update done"
} >> "$LOG_FILE" 2>&1
