#!/usr/bin/env bash
set -Eeuo pipefail

SITE_ROOT="${SCGS_SITE_ROOT:-/www/wwwroot/scgs.tv}"
LOG_DIR="${AUTO_UPDATE_LOG_DIR:-$SITE_ROOT/.tmp/auto-update}"
LOG_FILE="$LOG_DIR/run.log"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

mkdir -p "$LOG_DIR"

{
  echo "[$(date '+%F %T')] auto-update start"
  cd "$SITE_ROOT"
  export SCGS_LOCAL_SITE_ROOT=true
  "$NODE_BIN" auto-update.js "$@"
  echo "[$(date '+%F %T')] auto-update done"
} >> "$LOG_FILE" 2>&1
