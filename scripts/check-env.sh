#!/usr/bin/env bash
# Pre-flight check for a WeAppDev session (POSIX shell: Linux / macOS / busybox).
#
# The phone's API server is the source of truth — node/adb are OPTIONAL.
# Checks: (1) API server reachable, (2) phone identity, (3) MCP endpoint,
# (4) only if --with-adb: adb + device + port forward.
#
# Usage: ./check-env.sh [host] [port]      # host defaults to 127.0.0.1
#        ./check-env.sh 192.168.1.23       # phone on LAN
#        ./check-env.sh --with-adb         # also create the USB forward
set -u

HOST="127.0.0.1"; PORT="9400"; WITH_ADB=0
for a in "$@"; do
  case "$a" in
    --with-adb) WITH_ADB=1 ;;
    9400) PORT="$a" ;;
    *) if [ "$HOST" = "127.0.0.1" ]; then HOST="$a"; else PORT="$a"; fi ;;
  esac
done
BASE="http://$HOST:$PORT"
fail=0
say() { printf '%s\n' "$*"; }
ok()  { printf '  ok    %s\n' "$*"; }
bad() { printf '  FAIL  %s\n' "$*"; fail=1; }

fetch() { # fetch <path> -> body on stdout
  if command -v curl >/dev/null 2>&1; then
    curl -s --noproxy '*' -m 5 "$BASE$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,urllib.request;sys.stdout.write(urllib.request.urlopen(sys.argv[1],timeout=5).read().decode("utf-8","replace"))' "$BASE$1"
  else
    return 9
  fi
}

say "== API server ($BASE) =="
STATUS=$(fetch /v1/status) || STATUS=""
if [ -z "$STATUS" ]; then
  bad "unreachable. Phone on LAN? -> ./check-env.sh <phone-ip>. USB only? -> rerun with --with-adb."
else
  ok "reachable"
  say "== phone identity =="
  if command -v python3 >/dev/null 2>&1; then
    echo "$STATUS" | python3 -c '
import json,sys
d=json.load(sys.stdin); m=d.get("mcp",{})
print("  ok    apiLevel=%s tools=%s version=%s" % (m.get("apiLevel"),m.get("toolsCount"),m.get("version")))
sys.exit(0 if d.get("running") else 1)' || bad "server reports running=false — open the WeAppDev app"
  else
    ok "status received (install python3 for a parsed summary)"
  fi
fi

say "== MCP endpoint =="
if command -v curl >/dev/null 2>&1; then
  R=$(curl -s --noproxy '*' -m 6 -X POST "$BASE/mcp" -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep -o '"name":"wad_' | wc -l | tr -d ' ')
  if [ "${R:-0}" -ge 1 ]; then ok "/mcp responds (~$R tools visible)"; else bad "/mcp not usable"; fi
else
  bad "no curl for the /mcp probe (a python3 fallback exists above; MCP clients do not need this probe)"
fi

if [ "$WITH_ADB" = "1" ]; then
  say "== adb (optional USB tunnel) =="
  if command -v adb >/dev/null 2>&1; then
    ok "adb present"
    D=$(adb devices | tail -n +2 | grep -w device | head -1 | cut -f1)
    if [ -n "$D" ]; then
      ok "device: $D"
      adb -s "$D" forward "tcp:$PORT" "tcp:$PORT" >/dev/null 2>&1 && ok "forward tcp:$PORT" || bad "forward failed"
    else
      bad "no device attached"
    fi
  else
    bad "adb not on PATH"
  fi
fi

say "== node (optional — only the Studio aggregator MCP needs it) =="
if command -v node >/dev/null 2>&1; then
  V=$(node -p 'process.versions.node' 2>/dev/null); MA=${V%%.*}
  if [ "${MA:-0}" -ge 22 ]; then ok "node $V"; else bad "node $V (aggregator wants >= 22; phone-direct mode ignores this)"; fi
else
  ok "node absent — fine for phone-direct MCP / REST; only the Studio aggregator needs it"
fi

say
if [ "$fail" -eq 0 ]; then
  say "ready: point MCP at $BASE/mcp or call REST on $BASE/v1/*  (Swagger: $BASE/docs)"
fi
exit $fail
