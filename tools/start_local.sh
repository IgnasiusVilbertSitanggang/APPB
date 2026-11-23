#!/usr/bin/env bash
# Start (or stop) the Python local API for the APPB migration demo.
# No Java, Maven, or MySQL required. PID and log live in /tmp/opencode.
set -euo pipefail

MIGRASI_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_SCRIPT="$MIGRASI_DIR/tools/local_api.py"
RUN_DIR="/tmp/opencode"
PID_FILE="$RUN_DIR/appb-local-api.pid"
LOG_FILE="$RUN_DIR/appb-local-api.log"
API_URL="http://127.0.0.1:8080/api"

mkdir -p "$RUN_DIR" "$MIGRASI_DIR/.local"

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  grep -qa "local_api.py" "/proc/$pid/cmdline" 2>/dev/null
}

wait_health() {
  local attempts="${1:-40}"
  for ((i = 0; i < attempts; i++)); do
    if python3 -c 'import sys, urllib.request; r = urllib.request.urlopen("http://127.0.0.1:8080/api/health", timeout=1); sys.exit(0 if r.status == 200 else 1)' 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

stop_api() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    kill "$pid"
    rm -f "$PID_FILE"
    echo "API lokal dihentikan (PID $pid)."
  else
    rm -f "$PID_FILE"
    echo "API lokal tidak sedang berjalan."
  fi
}

start_api() {
  if is_running; then
    echo "API lokal sudah berjalan (PID $(cat "$PID_FILE"))."
  else
    rm -f "$PID_FILE"
    # API membaca PostgreSQL branch ken dan menulis cache .local/db.json.
    nohup python3 "$API_SCRIPT" >"$LOG_FILE" 2>&1 &
    echo "$!" >"$PID_FILE"
    if ! wait_health; then
      echo "Gagal menjalankan API. Log terakhir:" >&2
      tail -n 30 "$LOG_FILE" >&2 || true
      exit 1
    fi
    echo "API lokal dimulai (PID $(cat "$PID_FILE"))."
  fi
  echo
  echo "Health : $API_URL/health"
  echo "Snapshot: $API_URL/snapshot"
  echo "Log    : $LOG_FILE"
  echo "Data   : $MIGRASI_DIR/.local/db.json"
  echo "Frontend (setelah nginx.local.conf dipasang): http://localhost:8081/"
}

case "${1:---start}" in
  --start) start_api ;;
  --stop) stop_api ;;
  --restart) stop_api; start_api ;;
  --status)
    if is_running; then
      echo "API lokal berjalan (PID $(cat "$PID_FILE"))."
    else
      echo "API lokal tidak berjalan."
    fi
    ;;
  *)
    echo "Usage: $0 [--start|--stop|--restart|--status]" >&2
    exit 2
    ;;
esac
