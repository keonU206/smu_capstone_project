#!/usr/bin/env bash
# 냉장 G.O.A.T 백엔드 연동 점검 (macOS / Linux / Git Bash)
# 필요: curl, python3
# 사용법: ./scripts/smoke-test.sh [BASE_URL]   (기본 http://localhost:8080)
#        WRITE=1 ./scripts/smoke-test.sh      # 입고 등록까지 (demo 데이터 변경)
set -u
BASE="${1:-http://localhost:8080}"
USER_ID="${SMOKE_USER:-demo}"
USER_PW="${SMOKE_PASSWORD:-demo1234}"
OUT="$(cd "$(dirname "$0")" && pwd)/smoke-result.txt"
TMP="$(mktemp -d)"
PASS=0; FAIL=0; LINES=()

check() { # name ok detail
  if [ "$2" = "1" ]; then PASS=$((PASS+1)); LINES+=("PASS | $1 | $3"); else FAIL=$((FAIL+1)); LINES+=("FAIL | $1 | $3"); fi
}
# call METHOD PATH [BODY] [TOKEN]  -> sets CODE, BODY file $TMP/body, CT
call() {
  local m="$1" p="$2" body="${3:-}" tok="${4-${TOKEN:-}}"
  local args=(-s -o "$TMP/body" -w '%{http_code} %{content_type}' -X "$m" --max-time 20 "$BASE$p")
  [ -n "$tok" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  local r; r=$(curl "${args[@]}" 2>/dev/null) || r="000 "
  CODE="${r%% *}"; CT="${r#* }"
}
j() { python3 -c "import json,sys
try: d=json.load(open('$TMP/body'))
except Exception: d=None
$1" 2>/dev/null; }

TODAY=$(date +%F)
FROM30=$(python3 -c "import datetime;print((datetime.date.today()-datetime.timedelta(days=30)).isoformat())")
MONTH1=$(date +%Y-%m-01)

call GET /v3/api-docs "" ""; check "서버 응답 /v3/api-docs" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE"
if [ "$CODE" = "000" ]; then echo "서버에 연결할 수 없습니다: $BASE"; printf '%s\n' "${LINES[@]}" > "$OUT"; exit 1; fi

call POST /api/users/login "{\"username\":\"$USER_ID\",\"password\":\"$USER_PW\"}" ""
TOKEN=$(j "print(d.get('accessToken',''))")
check "로그인 성공 → accessToken" "$([ "$CODE" = 200 ] && [ -n "$TOKEN" ] && echo 1)" "HTTP $CODE"
call POST /api/users/login "{\"username\":\"$USER_ID\",\"password\":\"wrong-password\"}" ""
check "로그인 실패 → 401" "$([ "$CODE" = 401 ] && echo 1)" "HTTP $CODE (403 이면 401 수정 미반영)"
call POST /api/users/signup "{\"username\":\"$USER_ID\",\"password\":\"whatever123\",\"ownerName\":\"dup\"}" ""
check "아이디 중복 가입 → 409" "$([ "$CODE" = 409 ] && echo 1)" "HTTP $CODE"
call GET /settings "" ""; check "토큰 없음 → 401" "$([ "$CODE" = 401 ] && echo 1)" "HTTP $CODE"
call GET /settings "" "invalid.token.value"; check "위조 토큰 → 401" "$([ "$CODE" = 401 ] && echo 1)" "HTTP $CODE"
[ -z "$TOKEN" ] && { printf '%s\n' "${LINES[@]}"; echo "로그인 실패로 중단"; exit 1; }

ACAO=$(curl -s -o /dev/null -D - -X OPTIONS "$BASE/settings" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
check "CORS preflight (localhost:5173)" "$([ "$ACAO" = "http://localhost:5173" ] && echo 1)" "Allow-Origin=$ACAO"

call GET "/prices/lowest-top?limit=50"
N=$(j "print(len(d))"); ID=$(j "print(d[0]['ingredientId'] if d else '')"); UNIT=$(j "print(d[0].get('unit') if d else '')")
check "최저가 목록 /prices/lowest-top" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE, ${N:-0}개"
check "  └ 필드 unit" "$([ -n "$UNIT" ] && [ "$UNIT" != None ] && echo 1)" "unit=$UNIT"
WP=$(j "print(sum(1 for x in d if x.get('todayPrice') is not None))")
check "  └ KAMIS 가격 있는 재료 수" "$([ "${WP:-0}" -gt 0 ] 2>/dev/null && echo 1)" "${WP:-0}/${N:-0} (0 이면 POST /admin/batch/kamis/run)"
if [ -n "$ID" ]; then
  call GET "/prices/$ID"
  KEYS=$(j "o=(d.get('onlinePrices') or [None])[0]; print('EMPTY' if o is None else ','.join(o.keys()))")
  check "가격 상세 /prices/$ID" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE"
  if [ "$KEYS" = "EMPTY" ]; then check "  └ onlinePrices 비어 있음 (isLowest 확인 불가)" 1 "온라인 가격 데이터 없음"
  else check "  └ isLowest/isDiscount 필드 (lowest 아님)" "$(echo "$KEYS" | grep -q isLowest && ! echo ",$KEYS," | grep -q ',lowest,' && echo 1)" "$KEYS"; fi
  call GET "/prices/$ID/trend?days=30"; P=$(j "print(len(d.get('points',[])))")
  check "가격 추세 /prices/$ID/trend" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE, points ${P:-0}개"
  call GET "/ingredients/$ID/batches"; check "재고 배치 /ingredients/$ID/batches" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE"
fi
call GET "/ingredients/low-stock?limit=10"; G=$(j "print(d[0].get('grade') if d else '-')")
check "재고 부족 /ingredients/low-stock" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE, grade=$G"
call GET /settings; C=$(j "print(d.get('configured'))")
check "매장 설정 GET /settings" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE, configured=$C"
call GET "/purchase-orders?from=$FROM30&to=$TODAY&page=0&size=20"; OK=$(j "print(int(all(k in d for k in ['content','totalPages','first','last'])))")
check "발주 목록 /purchase-orders" "$([ "$CODE" = 200 ] && [ "$OK" = 1 ] && echo 1)" "HTTP $CODE"
call GET "/purchase-orders/summary?from=$MONTH1&to=$TODAY"; check "발주 요약 /purchase-orders/summary" "$([ "$CODE" = 200 ] && echo 1)" "HTTP $CODE"
call GET "/purchase-orders/export?from=$FROM30&to=$TODAY"; check "엑셀 내보내기 /purchase-orders/export" "$([ "$CODE" = 200 ] && echo "$CT" | grep -q spreadsheetml && echo 1)" "HTTP $CODE $CT"

if [ "${WRITE:-0}" = 1 ] && [ -n "$ID" ]; then
  EXP=$(python3 -c "import datetime;print((datetime.date.today()+datetime.timedelta(days=14)).isoformat())")
  call POST /inventory/batches "{\"ingredientId\":$ID,\"quantity\":1,\"expirationDate\":\"$EXP\"}"; check "재고 입고 POST /inventory/batches" "$([ "$CODE" = 201 ] && echo 1)" "HTTP $CODE"
  call POST /inventory/batches "{\"ingredientId\":$ID,\"quantity\":1,\"expirationDate\":\"2000-01-01\"}"; check "  └ 지난 유통기한 → 400" "$([ "$CODE" = 400 ] && echo 1)" "HTTP $CODE"
fi

{ echo "서버 $BASE · $(date '+%F %H:%M') · PASS $PASS / FAIL $FAIL"; printf '%s\n' "${LINES[@]}"; } | tee "$OUT"
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
