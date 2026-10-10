#!/usr/bin/env bash
# HengSch sync-bridge 部署验收探针（在桥所在机器上运行）
# 用法: bash probe.sh [BASE] [TOKEN]     默认 http://127.0.0.1:8642
set -u
BASE="${1:-http://127.0.0.1:8642}"
TOKEN="${2:?usage: probe.sh BASE TOKEN}"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "ok   - $1"; }
bad(){ FAIL=$((FAIL+1)); echo "FAIL - $1 ($2)"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
AUTH="Authorization: Bearer $TOKEN"

[ "$(code "$BASE/health")" = "200" ] && ok "health 200" || bad "health" "got=$(code "$BASE/health")"
[ "$(code -H "$AUTH" "$BASE/sync")" = "200" ] && ok "GET authed 200" || bad "GET authed" "got=$(code -H "$AUTH" "$BASE/sync")"
[ "$(code "$BASE/sync")" = "401" ] && ok "GET no token 401" || bad "GET no token" "got=$(code "$BASE/sync")"
[ "$(code -H 'Authorization: Bearer wrong-wrong-wrong' "$BASE/sync")" = "401" ] && ok "GET bad token 401" || bad "GET bad token"

READ=$(curl -s -H "$AUTH" "$BASE/sync")
ETAG=$(printf '%s' "$READ" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.etag===null||j.etag===undefined?"":j.etag)})')
STATE=$(printf '%s' "$READ" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.state===null||j.state===undefined?"":j.state)})')

# 幂等写回：内容不变，测通写路径但不动真实数据；无文件时才建最小档
NEED_SEED=0
if [ -z "$STATE" ]; then
  STATE='{"version":1,"todos":[],"groups":[]}'
  ETAG=""
  NEED_SEED=1
fi

C=$(code -X PUT -H "$AUTH" --data-raw "$STATE" "$BASE/sync?etag=$ETAG")
if [ "$C" = "200" ]; then
  if [ "$NEED_SEED" = "1" ]; then ok "seed PUT 200 (created minimal state)"; else ok "PUT idempotent 200"; fi
else
  bad "PUT" "status=$C"
fi

# 回读内容未变
BACK=$(curl -s -H "$AUTH" "$BASE/sync" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{process.stdout.write(JSON.parse(d).state||"")})')
if [ "$BACK" = "$STATE" ]; then ok "roundtrip content unchanged"; else bad "roundtrip" "content differs"; fi

C=$(code -X PUT -H "$AUTH" --data-raw tampered "$BASE/sync?etag=deadbeef0000")
[ "$C" = "409" ] && ok "PUT stale etag 409" || bad "PUT stale etag" "status=$C"
C=$(code -X DELETE -H "$AUTH" "$BASE/sync")
[ "$C" = "405" ] && ok "DELETE 405" || bad "DELETE" "status=$C"
[ "$(code "$BASE/nope")" = "404" ] && ok "unknown path 404" || bad "unknown path"

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
