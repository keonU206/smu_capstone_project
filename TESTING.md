# 냉장 G.O.A.T 통합 테스트 가이드 (백엔드 · 웹 · 모바일)

> **이 문서의 목적**: 백엔드 팀원이 이 모노레포(`keonU206/smu_capstone_project`)를 받아 **백엔드 + 웹 + 안드로이드 앱이 실제로 연동되는지** 직접 확인하게 하는 것.
> 사람과 AI 코딩 도구(Claude, Cursor, Copilot 등)가 모두 읽는다고 가정하고 썼다. AI는 맨 아래 [§9 AI 에이전트용 지침](#9-ai-에이전트용-지침)을 먼저 읽을 것.
>
> 기준 시점: 2026-10-05 · 기준 커밋: `main` (PR #1 머지 이후)

---

## 0. 한눈에 보기

```yaml
repo: https://github.com/keonU206/smu_capstone_project
structure:
  backend/:  Spring Boot 3.5.7 · Java 21 · MySQL 8 · Redis 7   # API 서버 (port 8080)
  frontend/: React 18 · Vite 6 · TypeScript · Tailwind v4        # 웹 (port 5173)
  mobile/:   React Native · Expo SDK 57 · Expo Router            # 안드로이드 앱 (APK)
  scripts/:  smoke-test.ps1 · run-smoke-test.bat · smoke-test.sh # API 자동 점검
  docs/backend-sync/: 백엔드 원본 레포 → 모노레포 차이 패치 2개
backend_upstream: https://github.com/gm-15/naengjang-goat_backend   # 백엔드 팀 원본 레포
demo_account: { username: demo, password: demo1234 }               # 서버 첫 기동 시 자동 생성
swagger: http://localhost:8080/swagger-ui/index.html
test_order: [1 백엔드 기동, 2 API 자동 점검, 3 웹 확인, 4 앱 확인, 5 결과 보고]
```

| 순서 | 할 일 | 걸리는 시간 | 문서 위치 |
|---|---|---|---|
| 1 | 준비물 설치 확인 | 5분 | [§1](#1-준비물) |
| 2 | 백엔드 버전 차이 이해 | 5분 | [§2](#2-백엔드-버전-차이-원본-레포-vs-모노레포) |
| 3 | 백엔드 기동 | 5~10분 (첫 실행) | [§3](#3-백엔드-기동) |
| 4 | API 자동 점검 | 1분 | [§4](#4-api-자동-점검-smoke-test) |
| 5 | 웹 프론트 확인 | 5분 | [§5](#5-웹-프론트엔드-frontend) |
| 6 | 안드로이드 앱 확인 | 10분 | [§6](#6-모바일-앱-mobile) |
| 7 | 결과 보고 | 2분 | [§8](#8-결과-보고-양식) |

---

## 1. 준비물

| 도구 | 버전 | 확인 명령 | 비고 |
|---|---|---|---|
| JDK | **21** | `java -version` | Gradle toolchain이 21을 요구. 17로는 빌드 실패 |
| Docker Desktop | 최신 | `docker info` | MySQL·Redis 컨테이너용. **엔진이 Running 상태**여야 함 |
| Node.js | 20 LTS 이상 | `node -v` | 웹·앱 공통 |
| Git | 아무 버전 | `git --version` | |
| (앱) 안드로이드 폰 + Expo Go | 최신 | Play 스토어 | PC와 **같은 와이파이** |
| (선택) Python 3 | 3.8+ | `python3 --version` | macOS/Linux 점검 스크립트(`smoke-test.sh`)용 |

```bash
git clone https://github.com/keonU206/smu_capstone_project.git
cd smu_capstone_project
# 이미 받았다면
git checkout main && git pull
```

---

## 2. 백엔드 버전 차이 (원본 레포 vs 모노레포)

### 2.1 결론

- 모노레포 `backend/` = 원본 레포(`gm-15/naengjang-goat_backend`) **최신 커밋 `d7814bb` + 10개 파일 수정**.
- 원본에만 있고 모노레포에 없는 코드는 **없음**. README 한 줄(팀원 이름)만 다름.
- 수정 10개는 성격이 두 갈래다.
  - **A. 연동 수정 6개 파일** — 웹·앱이 제대로 돌려면 필요. 원본 레포에도 반영 권장.
  - **B. 시연 패치 4개 파일** — 6월 시연 때 KAMIS 수집을 살리려고 넣은 임시 코드. 일부는 되돌려야 함.

### 2.2 A. 연동 수정 (원본 반영 권장) — `docs/backend-sync/01-integration-fixes.patch`

| 파일 | 원본 동작 | 모노레포 동작 | 왜 바꿨나 |
|---|---|---|---|
| `global/config/SecurityConfig.java` | 인증 실패 시 **403** · `/error` 막힘 | 인증 실패 시 **401** · `/error` permitAll | 웹·앱은 401을 받아야 자동 로그아웃. 403이면 토큰 만료(1시간) 뒤 화면이 전부 에러만 냄. `/error`가 막혀 있으면 400·404·409도 403으로 뭉개짐 |
| `user/service/UserService.java` | 아이디 중복 → `IllegalArgumentException`(→403) · 로그인 실패 → 403 | 아이디 중복 **409** · 로그인 실패 **401** | 프론트 에러 메시지 분기용 |
| `pricing/dto/OnlinePriceDto.java` | `boolean isLowest` → JSON 키가 **`lowest`** | 필드명 `lowest` + `@JsonProperty("isLowest")` → JSON 키 **`isLowest`** | Lombok `isXxx()` getter를 Jackson이 `xxx`로 직렬화. 프론트는 `isLowest`를 읽어서 최저가 배지가 안 떴음. `isDiscount`도 동일 |
| `pricing/service/OnlinePriceAggregator.java` | `.isLowest(...)` `.isDiscount(...)` | `.lowest(...)` `.discount(...)` | 위 필드명 변경에 따른 빌더 메서드명 변경 |
| `pricing/dto/LowestTopItemDto.java` | 단위 필드 없음 | `unit` 필드 추가 (재료 기본 단위 g·ml·개) | 재고 화면이 kg로 고정 표기 → 5000g이 "5000 kg"로 보이던 문제 |
| `pricing/service/LowestTopService.java` | — | `.unit(ingredient.getBaseUnit())` | 위 필드 채움 |

### 2.3 B. 시연 패치 (선택) — `docs/backend-sync/02-demo-patches.patch`

| 파일 | 내용 | 권장 조치 |
|---|---|---|
| `batch/service/KamisApiClient.java` | ① 날짜 형식 `yyyy/MM/dd` → `yyyy-MM-dd` ② `p_product_cls_code=01` → `02`(도매) ③ `p_category_code` → `p_item_category_code` ④ `p_convert_kg_yn=Y` 추가 ⑤ **조회 기준일을 2025-06-04로 고정** | ①~④는 KAMIS 응답이 비던 문제를 고친 것이라 **유지 권장**. ⑤는 **되돌려야 함** (`LocalDate.now().minusDays(1)`) |
| `batch/processor/KamisPriceProcessor.java` | `reportedDate`를 **2025-06-04로 고정** | **되돌려야 함** (`LocalDate.now().minusDays(1)`) |
| `inventory/service/LowStockService.java` | `@Transactional(readOnly = true)` 제거 (`UnexpectedRollbackException` 회피) | 유지 가능. 근본 해결은 `DepletionCalculatorService.calculate()`에 `REQUIRES_NEW` |
| `src/main/resources/application.properties` | 주석 한글 정리(원본은 인코딩 깨짐) + **`spring.flyway.enabled=false`** | 유지 권장. 원본은 Flyway V006이 JPA 전용 테이블을 ALTER 하다 실패할 수 있음 |

> ⚠️ **날짜 고정의 영향 (지금 모노레포에 그대로 있음)**
> KAMIS 배치를 돌리면 가격이 **2025-06-04 날짜로 저장**된다.
> - `/prices/lowest-top`, `/prices/{id}` → 최근 30건 기준이라 **정상 표시**
> - `/prices/{id}/trend` → **오늘 기준 최근 N일**을 보므로 **points가 비어 있음** → 발주 화면 가격 추세 차트·매수 신호가 안 뜸
>
> 추세까지 테스트하려면 위 두 파일의 날짜 고정을 되돌린 뒤 배치를 다시 돌려야 한다. 되돌리는 작업은 **백엔드 팀이 결정** 후 PR로.

### 2.4 원본 레포에 반영하는 법 (백엔드 팀용)

```bash
# 원본 레포 루트에서 (모노레포는 ../smu_capstone_project 에 있다고 가정)
cd naengjang-goat_backend
git checkout -b sync/monorepo-fixes
git apply --check ../smu_capstone_project/docs/backend-sync/01-integration-fixes.patch   # 충돌 확인
git apply        ../smu_capstone_project/docs/backend-sync/01-integration-fixes.patch
# 시연 패치까지 넣을 거면 (날짜 고정은 반영 후 되돌릴 것)
git apply        ../smu_capstone_project/docs/backend-sync/02-demo-patches.patch
./gradlew build
```

두 패치 모두 원본 `d7814bb` 기준으로 `git apply --check` 통과 확인함.

---

## 3. 백엔드 기동

### 3.1 가장 쉬운 방법 (Windows) — 한 번에 기동 + 점검

`scripts\run-smoke-test.bat` 더블클릭. 아래를 순서대로 자동 수행한다.

1. `java -version` 확인
2. Docker 엔진이 꺼져 있으면 Docker Desktop 실행 후 최대 5분 대기
3. Redis 기동. **3306 포트가 비어 있으면** compose의 MySQL, **이미 쓰이고 있으면**(PC에 MySQL 설치됨) 별도 테스트 MySQL을 **3307**로 띄우고 `DB_URL`을 자동으로 바꿈
4. 최소화된 창에서 `gradlew.bat bootRun` (로그: `scripts\backend.log`), 서버가 뜰 때까지 최대 10분 대기
5. `scripts\smoke-test.ps1` 실행 → `scripts\smoke-result.txt`

진행 기록은 `scripts\run-log.txt`. 백엔드 창은 점검 후에도 켜져 있다(웹·앱 테스트에 그대로 사용).

### 3.2 수동 방법 (모든 OS)

```bash
cd backend
docker compose up -d mysql redis        # MySQL 3306, Redis 6379
./gradlew bootRun                       # Windows: gradlew.bat bootRun
```

기동 성공 기준:

- 로그에 `Started InventorySystemApplication`
- 로그에 `[DataInitializer] 로그인 정보 → username=demo / password=demo1234` (첫 기동 시)
- http://localhost:8080/swagger-ui/index.html 열림

### 3.3 가격 데이터 넣기 (선택)

DB가 비어 있으면 최저가 화면에 "가격 수집 대기 중"만 나온다. 수동으로 수집 배치를 돌린다(인증 불필요).

```bash
curl -X POST http://localhost:8080/admin/batch/kamis/run   # 농수산물 (KAMIS)
curl -X POST http://localhost:8080/admin/batch/ekape/run   # 축산물 (EKAPE)
```

자동 실행은 매일 03:00(KAMIS) · 03:30(EKAPE).

### 3.4 백엔드 주의사항

| 상황 | 증상 | 해결 |
|---|---|---|
| PC에 MySQL이 이미 설치됨 | `docker compose up` 시 `Ports are not available ... 3306` | `run-smoke-test.bat` 사용(자동 3307 전환) 또는 로컬 MySQL 중지. 직접 하려면 `docker run -d --name goat-test-mysql -e MYSQL_ROOT_PASSWORD=43214321 -e MYSQL_DATABASE=naengjang_goat_db -p 3307:3306 mysql:8.0` 후 `DB_URL=jdbc:mysql://localhost:3307/naengjang_goat_db?useSSL=false&serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true` 환경변수로 기동 |
| Docker Desktop 응답 없음 | `docker info`가 수 분간 멈춤 | 트레이 고래 아이콘 → Quit → 재실행, 그래도 안 되면 재부팅 |
| JDK 17 이하 | Gradle이 Java 21 toolchain을 못 찾는다는 에러 | JDK 21 설치 후 `JAVA_HOME` 지정 |
| 8080 사용 중 | `Port 8080 was already in use` | 이전 백엔드 프로세스 종료 |
| Firebase 경고 | `FCM 비활성화` 류 로그 | 정상. 서비스 계정 JSON이 레포에 없어서 푸시만 꺼짐 |
| 스키마 | Flyway 비활성화, `ddl-auto=update`로 테이블 자동 생성 | 정상. `db/migration/V001~V008`은 참고용 |
| `chef02` 계정 | 루트 README에 있지만 자동 생성 안 됨 | 앱/웹에서 직접 회원가입 |

---

## 4. API 자동 점검 (smoke test)

백엔드가 떠 있는 상태에서 실행. **기본은 조회만** 하고 데이터를 바꾸지 않는다.

```powershell
# Windows (레포 루트)
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -BaseUrl http://192.168.0.12:8080
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -Write    # 입고 등록까지 (demo 데이터 변경)
```

```bash
# macOS / Linux / Git Bash (curl + python3 필요)
./scripts/smoke-test.sh                       # 기본 http://localhost:8080
./scripts/smoke-test.sh http://192.168.0.12:8080
WRITE=1 ./scripts/smoke-test.sh
```

결과는 화면 + `scripts/smoke-result.txt`. 점검 항목과 기대값:

| # | 점검 | 기대값 | FAIL이면 의심할 것 |
|---|---|---|---|
| 1 | `GET /v3/api-docs` | 200 | 서버 미기동 |
| 2 | 로그인 demo/demo1234 | 200 + accessToken | DataInitializer 미실행, DB 연결 |
| 3 | 로그인 비밀번호 틀림 | **401** | §2.2 A 미반영 (403이 나옴) |
| 4 | 아이디 중복 가입 | **409** | §2.2 A 미반영 |
| 5 | 토큰 없음 / 위조 토큰 | **401** | §2.2 A 미반영 |
| 6 | CORS preflight (Origin `http://localhost:5173`) | Allow-Origin 일치 | `CorsConfig` |
| 7 | `GET /prices/lowest-top` | 200, 각 항목에 **`unit`** | §2.2 A 미반영 |
| 8 | KAMIS 가격 있는 재료 수 | 1 이상 | §3.3 배치 실행 필요 |
| 9 | `GET /prices/{id}` onlinePrices | **`isLowest`/`isDiscount`** 키 (`lowest` 아님) | §2.2 A 미반영. 온라인 가격이 비어 있으면 "확인 불가"로 PASS 처리 |
| 10 | `GET /prices/{id}/trend` | 200 | points 0개는 §2.3 날짜 고정 영향 (FAIL 아님) |
| 11 | `GET /ingredients/{id}/batches` | 200 | |
| 12 | `GET /ingredients/low-stock` | 200, `grade`/`stockRatio`/`baseUnit` | `LowStockService` 트랜잭션 |
| 13 | `GET /settings` | 200, `configured` | |
| 14 | `GET /purchase-orders` | 200, `content`/`totalPages`/`first`/`last` | Spring Page 직렬화 방식 |
| 15 | `GET /purchase-orders/summary` | 200 | |
| 16 | `GET /purchase-orders/export` | 200, xlsx Content-Type | Apache POI |
| 17 | (`-Write`) 입고 등록 / 지난 유통기한 | 201 / **400** | `/error` permitAll 미반영 시 400이 403으로 보임 |

---

## 5. 웹 프론트엔드 (`frontend/`)

```bash
cd frontend
# ⚠️ 이 파일이 없으면 API 요청이 5173(자기 자신)으로 가서 전부 실패
echo "VITE_API_BASE_URL=http://localhost:8080" > .env.local            # macOS/Linux/Git Bash
# Set-Content .env.local "VITE_API_BASE_URL=http://localhost:8080"     # Windows PowerShell
npm install
npm run dev                                                  # http://localhost:5173
```

확인 순서 (demo / demo1234 로그인):

1. **메인** — 이번 달 발주 요약 카드
2. **최저가** — 재료 목록 → 재료 클릭 → KAMIS 시세 카드 + 온라인 최저가(최저가 카드에 파란 테두리·"최저가" 배지)
3. **최저가 상세 → 구매하러 가기** → 새 탭 갔다가 돌아오면 **발주 추가 모달** → 저장 → 발주 기록 탭으로 이동
4. **재고 관리** — 재료별 잔여량이 **g·ml·개**로 표시(5000 g (5 kg) 형태), 입고 모달 수량 단위도 재료 단위
5. **발주 관리** — 재고 부족 카드(긴급/주의/여유), 가격 추세 차트, 발주 기록, 엑셀 내보내기
6. **설정** — 영업시간·발주 요일 저장
7. 브라우저 폭을 390px 정도로 줄이면 **하단 탭바**가 나와야 함 (모바일 웹 대응)

주의:

- CORS 허용 Origin은 `localhost:3000/5173/5174`뿐. 다른 포트·IP로 띄우면 `CorsConfig`에 추가 필요.
- 토큰은 1시간 만료. 만료 후 아무 요청이나 401 → 로그인 화면으로 자동 이동하면 정상.

---

## 6. 모바일 앱 (`mobile/`)

> 🔔 **푸시 알림(FCM) 테스트는 [`mobile/PUSH_TESTING.md`](mobile/PUSH_TESTING.md)** — 개발 빌드 설치, 서버 주소(`.env`), 토큰 등록, Firebase 콘솔 수신 테스트, 문제 해결.

### 6.1 폰에서 바로 확인 (Expo Go, 빌드 불필요 · 푸시 제외)

```bash
cd mobile
npm install
npx expo start --go     # 터미널에 QR 코드 → 폰의 Expo Go 앱으로 스캔 (expo-dev-client 설치 후에는 --go 필요)
```

1. **PC IP 확인**: Windows `ipconfig` → IPv4 주소 (예: `192.168.0.12`) · macOS `ipconfig getifaddr en0`
2. **방화벽**: Windows 방화벽에서 **8080 인바운드 허용** (안 하면 폰에서 연결 실패)
3. 앱 로그인 화면 **오른쪽 위 서버 주소** → `http://192.168.0.12:8080` 입력 → **연결 테스트** → 저장
4. demo / demo1234 로그인 → 하단 탭 5개(메인·최저가·재고·발주·설정) 확인

### 6.2 APK 빌드

```bash
cd mobile
npx eas-cli@latest login                                  # Expo 무료 계정
npx eas-cli@latest build -p android --profile preview     # 10~20분 → .apk 링크
```

기본 서버 주소는 `mobile/eas.json`의 `EXPO_PUBLIC_API_BASE_URL`(빌드한 사람의 PC IP로 설정돼 있음). 빌드에만 쓰이는 값이라 각자 PC에서는 `mobile/.env`를 만들거나 앱 로그인 화면 오른쪽 위 서버 주소에서 바꾼다. 푸시가 필요하면 `--profile development`(개발 빌드) — 자세한 내용은 `mobile/PUSH_TESTING.md`.

### 6.3 모바일 주의사항

| 항목 | 내용 |
|---|---|
| `localhost` 금지 | 폰에서 localhost는 폰 자신. 반드시 PC IP. 에뮬레이터는 `http://10.0.2.2:8080` |
| HTTP 허용 | `app.json`에서 `usesCleartextTraffic: true` (테스트용). 배포 시 HTTPS로 바꾸고 끌 것 |
| Expo 웹 미리보기 | `npx expo start --web`(8081)는 백엔드 CORS에 없어서 API 실패. 실기기·에뮬레이터로 테스트 |
| 토큰 저장 | `expo-secure-store` (웹 미리보기만 localStorage) |
| 구매 후 발주 | 최저가 상세 → 구매하러 가기 → 브라우저에서 앱으로 돌아오면 발주 시트 자동 오픈 |
| 엑셀 | 발주 기록 → 엑셀 → 공유 시트(카톡·드라이브 등)로 전달 |
| 코드 공유 | `mobile/src/api`, `hooks`, `types`는 `frontend/src/app`과 같은 코드. API 계약 바꾸면 **두 곳 모두** 수정 |

---

## 7. 알려진 이슈 (테스트 중 만나도 정상인 것 / 아직 안 고친 것)

| 심각도 | 이슈 | 위치 | 상태 |
|---|---|---|---|
| 🔴 | KAMIS·네이버 API 키, JWT 시크릿, DB 비번 기본값이 공개 레포에 커밋됨 | `backend/src/main/resources/application.properties`, `backend/docker-compose.yml`, `backend/.github/workflows/ci.yml`, `backend/.claude/settings.local.json` | **키 재발급 필요** → 환경변수로 이동 |
| 🔴 | 소유자 확인 없이 남의 재고 조회·수정 가능 | `InventoryController` `/inventory/user/{userId}`, `/update`, `/decrease`, `IngredientController` `/{id}/batches` | 미수정 |
| 🟠 | 주문 중간 실패 시 이미 차감한 재고 복구 안 됨 | `OrderService.processOrder` (재료별 독립 커밋) | 미수정 |
| 🟠 | 남의 menuId로 주문하면 그 가게 재고 차감 | `OrderService` 메뉴 소유자 미확인 | 미수정 |
| 🟠 | `/admin/batch/**` 인증 없음 | `SecurityConfig` | 미수정 (dev 프로필 제한 권장) |
| 🟡 | 가격 추세·매수 신호 비어 있음 | §2.3 날짜 고정 | 되돌리면 해결 |
| 🟡 | 발주 단가(상품 1개 가격)와 수량(g) 단위가 섞여 합계가 부정확 | 최저가 상세 → 발주 시트 | 설계 결정 필요 |
| 🟡 | 주문 이력 조회가 `findAll()` 후 필터 | `OrderService.getOrders` | 미수정 |
| 🟡 | 재고 화면이 재료 50개까지만, 카드마다 `/batches` 호출 | 웹·앱 재고 화면 | 미수정 |

---

## 8. 결과 보고 양식

아래를 채워 팀 채팅이나 GitHub Issue에 올린다.

```markdown
### 연동 테스트 결과 — <이름> / <날짜>
- 환경: <Windows/macOS> · JDK <버전> · Node <버전> · MySQL <compose 3306 | test 3307 | 로컬>
- 백엔드 커밋: <git rev-parse --short HEAD>
- smoke test: PASS <n> / FAIL <n>   (smoke-result.txt 첨부)
- FAIL 항목과 원인 추정:
  - <항목> — <원인>
- 웹: 메인/최저가/상세→발주/재고 단위/발주 화면/설정/모바일 폭 — 각 OK/NG
- 앱: 서버 연결/로그인/탭 5개/구매 후 발주 시트/엑셀 공유 — 각 OK/NG
- 백엔드 로그 에러 (있으면 첫 에러 스택 20줄)
```

---

## 9. AI 에이전트용 지침

> 이 레포를 다루는 AI 도구는 아래 규칙을 따른다.

1. **목표**: §3 → §4 → §5 → §6 순서로 연동을 검증하고 §8 양식으로 보고한다. 기능 추가는 범위 밖.
2. **경로**: 백엔드 소스 루트는 `backend/src/main/java/com/naengjang_goat/inventory_system/`. 웹은 `frontend/src/app/`, 앱은 `mobile/src/`.
3. **API 계약 원천**: 백엔드 DTO(`*/dto/*.java`)가 기준. 프론트 타입은 `frontend/src/app/types/*.ts`와 `mobile/src/types/*.ts`(동일 내용). 계약을 바꾸면 세 곳을 함께 수정.
4. **하지 말 것**
   - API 키·비밀번호를 새로 커밋하거나 로그·이슈에 붙여넣기
   - `main`에 직접 push (브랜치 → PR)
   - `.env`, `.env.local`, `scripts/smoke-result.txt`, `scripts/*.log` 커밋
   - `mobile/android`, `mobile/ios` 폴더 수동 생성·수정 (Expo가 빌드 시 생성)
   - `git apply` 전 `--check` 생략
5. **판단 기준**
   - 401/403 관련 FAIL → `SecurityConfig.java`에 `exceptionHandling(... HttpStatusEntryPoint(UNAUTHORIZED))`와 `.requestMatchers("/error").permitAll()`이 있는지 먼저 확인
   - `isLowest`/`unit` FAIL → §2.2 패치 반영 여부 확인
   - trend points 0 → 버그 아님(§2.3)
   - DB 연결 실패 → 3306 충돌(§3.4) 먼저 의심
6. **빌드·검사 명령**
   - 백엔드: `cd backend && ./gradlew build` (테스트는 MySQL·Redis 필요)
   - 웹: `cd frontend && npm run build`
   - 앱: `cd mobile && npx tsc --noEmit && npx expo export -p android`
7. **보고**: 추측과 확인한 사실을 구분해서 쓴다. 실행하지 못한 단계는 "미실행"으로 표기.

---

## 부록. 이 문서가 참조하는 파일

| 파일 | 설명 |
|---|---|
| `scripts/run-smoke-test.bat` | Windows 원클릭: Docker → MySQL/Redis → 백엔드 → 점검 |
| `scripts/smoke-test.ps1` | Windows PowerShell API 점검 |
| `scripts/smoke-test.sh` | macOS/Linux/Git Bash API 점검 |
| `docs/backend-sync/01-integration-fixes.patch` | 원본 백엔드 → 연동 수정 (반영 권장) |
| `docs/backend-sync/02-demo-patches.patch` | 원본 백엔드 → 시연 패치 (선택, 날짜 고정 주의) |
| `mobile/README.md` | 앱 구조·빌드 상세 |
| `frontend/BACKEND_GUIDE.md`, `backend/docs/API_GUIDE.md` | API 상세 |
