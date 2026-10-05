<#
  냉장 G.O.A.T 백엔드-프론트 연동 점검 스크립트 (Windows PowerShell 5.1+ / 7)

  사용법 (백엔드가 켜진 상태에서, 레포 루트에서):
    powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -BaseUrl http://192.168.0.12:8080
    powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -Write   # 입고·설정 저장까지 (demo 데이터 변경)

  결과: 화면 표 + scripts\smoke-result.txt
#>
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$User = "demo",
  [string]$Password = "demo1234",
  [switch]$Write
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$results = New-Object System.Collections.Generic.List[object]
$script:token = $null

function Call {
  param([string]$Method, [string]$Path, $Body = $null, [string]$Token = $script:token, [hashtable]$Headers = @{})
  $h = @{} + $Headers
  if ($Token) { $h["Authorization"] = "Bearer $Token" }
  $p = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $h; UseBasicParsing = $true; TimeoutSec = 20 }
  if ($null -ne $Body) {
    $p["Body"] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 6 -Compress))
    $p["ContentType"] = "application/json; charset=utf-8"
  }
  try {
    $r = Invoke-WebRequest @p
    $text = $null
    $ct = [string]$r.Headers["Content-Type"]
    if ($ct -match "json") { $text = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) }
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $(if ($text) { $text | ConvertFrom-Json } else { $null }); ContentType = $ct; Raw = $text; Headers = $r.Headers }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { return [pscustomobject]@{ Status = 0; Json = $null; ContentType = ""; Raw = $_.Exception.Message; Headers = @{} } }
    return [pscustomobject]@{ Status = [int]$resp.StatusCode; Json = $null; ContentType = ""; Raw = ""; Headers = @{} }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) { return [pscustomobject]@{ Status = [int]$resp.StatusCode; Json = $null; ContentType = ""; Raw = ""; Headers = @{} } }
    return [pscustomobject]@{ Status = 0; Json = $null; ContentType = ""; Raw = $_.Exception.Message; Headers = @{} }
  }
}

function Check {
  param([string]$Name, [bool]$Ok, [string]$Detail = "")
  $results.Add([pscustomobject]@{ Result = $(if ($Ok) { "PASS" } else { "FAIL" }); Test = $Name; Detail = $Detail })
}

function HasProp($obj, [string]$name) { return $null -ne $obj -and ($obj.PSObject.Properties.Name -contains $name) }

$today = Get-Date
$fmt = "yyyy-MM-dd"
$from30 = $today.AddDays(-30).ToString($fmt)
$monthStart = (Get-Date -Day 1).ToString($fmt)
$to = $today.ToString($fmt)

# 0. 서버 도달
$r = Call GET "/v3/api-docs" -Token ""
Check "서버 응답 (/v3/api-docs)" ($r.Status -eq 200) "HTTP $($r.Status) $($r.Raw)"
if ($r.Status -eq 0) {
  $results | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
  Write-Host "서버에 연결할 수 없습니다: $BaseUrl — 백엔드가 켜져 있는지 확인하세요." -ForegroundColor Red
  $results | Format-Table -AutoSize | Out-String -Width 300 | Out-File -Encoding utf8 (Join-Path $PSScriptRoot "smoke-result.txt")
  exit 1
}

# 1. 인증
$r = Call POST "/api/users/login" @{ username = $User; password = $Password } -Token ""
$script:token = if ($r.Json) { $r.Json.accessToken } else { $null }
Check "로그인 성공 → accessToken" ($r.Status -eq 200 -and $script:token) "HTTP $($r.Status)"

$r = Call POST "/api/users/login" @{ username = $User; password = "wrong-password" } -Token ""
Check "로그인 실패 → 401" ($r.Status -eq 401) "HTTP $($r.Status) (403 이면 인증 수정 미반영)"

$r = Call POST "/api/users/signup" @{ username = $User; password = "whatever123"; ownerName = "중복테스트" } -Token ""
Check "아이디 중복 가입 → 409" ($r.Status -eq 409) "HTTP $($r.Status)"

$r = Call GET "/settings" -Token ""
Check "토큰 없음 → 401" ($r.Status -eq 401) "HTTP $($r.Status)"

$r = Call GET "/settings" -Token "invalid.token.value"
Check "위조 토큰 → 401 (앱·웹 자동 로그아웃 조건)" ($r.Status -eq 401) "HTTP $($r.Status)"

if (-not $script:token) {
  $results | Format-Table -AutoSize | Out-String -Width 300 | Write-Host
  Write-Host "로그인에 실패해 나머지 점검을 건너뜁니다. demo 계정(DataInitializer)이 있는지 확인하세요." -ForegroundColor Red
  $results | Format-Table -AutoSize | Out-String -Width 300 | Out-File -Encoding utf8 (Join-Path $PSScriptRoot "smoke-result.txt")
  exit 1
}

# 2. CORS (웹 개발 서버 5173)
try {
  $pre = Invoke-WebRequest -Uri "$BaseUrl/settings" -Method Options -UseBasicParsing -TimeoutSec 10 -Headers @{
    "Origin" = "http://localhost:5173"; "Access-Control-Request-Method" = "GET"; "Access-Control-Request-Headers" = "authorization" }
  $acao = [string]$pre.Headers["Access-Control-Allow-Origin"]
  Check "CORS preflight (localhost:5173)" ($acao -eq "http://localhost:5173") "Allow-Origin=$acao"
} catch { Check "CORS preflight (localhost:5173)" $false $_.Exception.Message }

# 3. 가격
$r = Call GET "/prices/lowest-top?limit=50"
$items = @($r.Json)
Check "최저가 목록 /prices/lowest-top" ($r.Status -eq 200) "HTTP $($r.Status), $($items.Count)개"
$first = $items | Select-Object -First 1
if ($first) {
  Check "  └ 필드 ingredientId/name/todayPrice/monthAvg" ((HasProp $first "ingredientId") -and (HasProp $first "name") -and (HasProp $first "todayPrice") -and (HasProp $first "monthAvg")) ""
  Check "  └ 필드 unit (재고 단위 수정)" ((HasProp $first "unit") -and $first.unit) "unit=$($first.unit)"
  $withPrice = @($items | Where-Object { $_.todayPrice -ne $null }).Count
  Check "  └ KAMIS 가격 수집된 재료 수" ($withPrice -gt 0) "$withPrice / $($items.Count) (0 이면 POST /admin/batch/kamis/run 실행)"
  $id = $first.ingredientId

  $d = Call GET "/prices/$id"
  Check "가격 상세 /prices/$id" ($d.Status -eq 200 -and (HasProp $d.Json "onlinePrices")) "HTTP $($d.Status)"
  $op = @($d.Json.onlinePrices) | Select-Object -First 1
  if ($op) {
    Check "  └ onlinePrices 에 isLowest/isDiscount (lowest 아님)" ((HasProp $op "isLowest") -and (HasProp $op "isDiscount") -and -not (HasProp $op "lowest")) ($op.PSObject.Properties.Name -join ",")
  } else {
    Check "  └ onlinePrices 비어 있음 (isLowest 확인 불가)" $true "크롤링·네이버 데이터 없음 — externalSearchLinks $(@($d.Json.externalSearchLinks).Count)개"
  }

  $t = Call GET "/prices/$id/trend?days=30"
  Check "가격 추세 /prices/$id/trend" ($t.Status -eq 200 -and (HasProp $t.Json "points")) "HTTP $($t.Status), points $(@($t.Json.points).Count)개, buySignal=$($t.Json.currentBuySignal)"

  $b = Call GET "/ingredients/$id/batches"
  $b0 = @($b.Json) | Select-Object -First 1
  Check "재고 배치 /ingredients/$id/batches" ($b.Status -eq 200) "HTTP $($b.Status), $(@($b.Json).Count)건"
  if ($b0) { Check "  └ 필드 batchId/quantity/expiresAt" ((HasProp $b0 "batchId") -and (HasProp $b0 "quantity") -and (HasProp $b0 "expiresAt")) "" }
} else {
  Check "  └ 재료 없음" $false "demo 계정에 재료가 없습니다 (온보딩 필요)"
}

# 4. 재고 부족
$r = Call GET "/ingredients/low-stock?limit=10"
$l0 = @($r.Json) | Select-Object -First 1
Check "재고 부족 /ingredients/low-stock" ($r.Status -eq 200) "HTTP $($r.Status), $(@($r.Json).Count)개"
if ($l0) {
  Check "  └ 필드 grade/stockRatio/baseUnit/nextOrderDayDistance" ((HasProp $l0 "grade") -and (HasProp $l0 "stockRatio") -and (HasProp $l0 "baseUnit") -and (HasProp $l0 "nextOrderDayDistance")) "grade=$($l0.grade)"
}

# 5. 설정
$r = Call GET "/settings"
Check "매장 설정 GET /settings" ($r.Status -eq 200 -and (HasProp $r.Json "configured")) "HTTP $($r.Status), configured=$($r.Json.configured), open=$($r.Json.openTime)"
$settings = $r.Json

# 6. 발주
$r = Call GET "/purchase-orders?from=$from30&to=$to&page=0&size=20"
Check "발주 목록 /purchase-orders" ($r.Status -eq 200 -and (HasProp $r.Json "content") -and (HasProp $r.Json "totalPages") -and (HasProp $r.Json "first") -and (HasProp $r.Json "last")) "HTTP $($r.Status), total=$($r.Json.totalElements)"

$r = Call GET "/purchase-orders/summary?from=$monthStart&to=$to"
Check "발주 요약 /purchase-orders/summary" ($r.Status -eq 200 -and (HasProp $r.Json "totalCount") -and (HasProp $r.Json "byIngredient")) "HTTP $($r.Status), count=$($r.Json.totalCount)"

$r = Call GET "/purchase-orders/export?from=$from30&to=$to"
Check "엑셀 내보내기 /purchase-orders/export" ($r.Status -eq 200 -and $r.ContentType -match "spreadsheetml") "HTTP $($r.Status), $($r.ContentType)"

# 7. 쓰기 (옵션)
if ($Write -and $first) {
  $exp = $today.AddDays(14).ToString($fmt)
  $r = Call POST "/inventory/batches" @{ ingredientId = $first.ingredientId; quantity = 1; expirationDate = $exp }
  Check "재고 입고 POST /inventory/batches (1$($first.unit))" ($r.Status -eq 201) "HTTP $($r.Status)"
  $r = Call POST "/inventory/batches" @{ ingredientId = $first.ingredientId; quantity = 1; expirationDate = "2000-01-01" }
  Check "  └ 지난 유통기한 → 400 (에러 코드 유지)" ($r.Status -eq 400) "HTTP $($r.Status)"
  if ($settings -and $settings.configured) {
    $r = Call PUT "/settings" @{ openTime = $settings.openTime.Substring(0,5); closeTime = $settings.closeTime.Substring(0,5); orderDay = $settings.orderDay; inventoryDay = $settings.inventoryDay }
    Check "설정 저장 PUT /settings (같은 값)" ($r.Status -eq 200) "HTTP $($r.Status)"
  }
}

# 결과
$pass = @($results | Where-Object Result -eq "PASS").Count
$fail = @($results | Where-Object Result -eq "FAIL").Count
$table = $results | Format-Table -AutoSize -Wrap | Out-String -Width 300
Write-Host $table
Write-Host "PASS $pass / FAIL $fail  (서버 $BaseUrl, $(Get-Date -Format 'yyyy-MM-dd HH:mm'))" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
("서버 $BaseUrl · $(Get-Date -Format 'yyyy-MM-dd HH:mm') · PASS $pass / FAIL $fail`r`n" + $table) | Out-File -Encoding utf8 (Join-Path $PSScriptRoot "smoke-result.txt")
