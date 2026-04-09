#!/bin/zsh

set -euo pipefail

base_url="${OPENCLAW_BASE_URL:-http://localhost:3000}"
secret="${OPENCLAW_TUYA_SECRET:-${OPENCLAW_SECRET:-}}"
endpoint="${base_url%/}/api/openclaw/tuya"

headers=(
  -H "Content-Type: application/json"
)

if [[ -n "$secret" ]]; then
  headers+=(-H "Authorization: Bearer $secret")
fi

curl --fail --silent --show-error \
  -X POST "$endpoint" \
  "${headers[@]}" \
  -d '{"device":"GGT Light","action":"on"}'
