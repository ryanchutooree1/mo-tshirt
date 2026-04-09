#!/bin/zsh

set -euo pipefail

click_widget_fallback() {
  local x="${GGT_LIGHT_WIDGET_X:-58}"
  local y="${GGT_LIGHT_WIDGET_Y:-104}"

  swift -module-cache-path /tmp/swift-module-cache -e '
import Cocoa
import ApplicationServices

let x = Double(CommandLine.arguments[1]) ?? 58
let y = Double(CommandLine.arguments[2]) ?? 104
let p = CGPoint(x: x, y: y)

let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!
let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)!
let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)!

move.post(tap: .cghidEventTap)
usleep(80000)
down.post(tap: .cghidEventTap)
usleep(50000)
up.post(tap: .cghidEventTap)
print("Clicked GGT Light widget at (\(Int(x)), \(Int(y))).")
' "$x" "$y"
}

base_url="${OPENCLAW_BASE_URL:-http://localhost:3000}"
secret="${OPENCLAW_TUYA_SECRET:-${OPENCLAW_SECRET:-}}"
endpoint="${base_url%/}/api/openclaw/tuya"

headers=(
  -H "Content-Type: application/json"
)

if [[ -n "$secret" ]]; then
  headers+=(-H "Authorization: Bearer $secret")
fi

tmp_body="$(mktemp)"
http_code="$(
  curl --silent --show-error \
    -o "$tmp_body" \
    -w "%{http_code}" \
    -X POST "$endpoint" \
    "${headers[@]}" \
    -d '{"device":"GGT Light","action":"on"}' || true
)"

if [[ "$http_code" == "200" ]]; then
  cat "$tmp_body"
  rm -f "$tmp_body"
  exit 0
fi

if [[ -s "$tmp_body" ]]; then
  cat "$tmp_body" >&2
fi
rm -f "$tmp_body"

if [[ "${GGT_LIGHT_ALLOW_WIDGET_FALLBACK:-1}" == "1" ]]; then
  echo "Falling back to desktop widget click." >&2
  click_widget_fallback
  exit 0
fi

echo "Failed to turn on GGT Light through the API and widget fallback is disabled." >&2
exit 1
