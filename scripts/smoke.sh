#!/bin/sh
set -eu

APP_URL="${APP_URL:-http://localhost:3100}"
GATEWAY_HEALTH_URL="${GATEWAY_HEALTH_URL:-http://localhost:8181/health}"

check() {
  name="$1"
  url="$2"
  expected="$3"
  body="$(curl --fail --silent --show-error --max-time 10 "$url")"
  printf '%s' "$body" | grep -q "$expected" || {
    echo "[smoke] FALLA: $name no esta sano: $body" >&2
    exit 1
  }
  echo "[smoke] $name OK ($url)"
}

check web "${APP_URL%/}/api/health" '"db":"ok"'
check gateway "$GATEWAY_HEALTH_URL" '"status":"ok"'
