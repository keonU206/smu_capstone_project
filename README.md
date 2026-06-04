# 냉장 G.O.A.T (smu_capstone_project)

소상공인을 위한 식재료 발주·재고 관리 서비스.
KAMIS 공식 시세 + 외부 가격 비교 + 재고 입출고 + 매수 신호 자동 알림을 한 화면에서 제공.

---

## 📂 프로젝트 구조

```
naengjang-goat/
├── frontend/      React 18 + Vite 6 + TypeScript + Tailwind v4
│                  - 5개 화면 + 발주/재고/설정 도메인
│                  - React Query 기반 데이터 페칭
├── backend/       Spring Boot 3 + Java 21 + MySQL 8 + Redis 7
│                  - JWT 인증, KAMIS API 연동, Spring Batch
│                  - 동료(sim, park) 작성 코드 + 시연용 패치 일부
└── plan_kim_*.md  단계별 구현 계획 문서
```

---

## 🚀 실행 방법

### 1. 백엔드 의존 컨테이너
```bash
cd backend
docker compose up -d mysql redis
```

### 2. 백엔드 기동
```bash
cd backend
./gradlew bootRun
```
- 포트: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/swagger-ui/index.html`

### 3. 프론트엔드 기동
```bash
cd frontend
npm install
npm run dev
```
- 포트: `http://localhost:5173`
- `.env.local` 의 `VITE_API_BASE_URL=http://localhost:8080`

### 4. 데모 계정
```
demo / demo1234       (운영 중 사장님)
chef02 / chef1234     (신규 가입 사장님)
```

---

## 🎯 핵심 기능

| 도메인 | 화면 | 백엔드 API |
|---|---|---|
| 인증 | LoginPage | POST /api/users/login, signup |
| 온보딩 | OnboardPage | POST /api/users/onboard |
| 매장 설정 | SettingsPage | GET/PUT /settings |
| 최저가 | LowestPricePage | GET /prices/lowest-top |
| 가격 상세 | LowestPriceDetailPage | GET /prices/{id} |
| 가격 추세 | OrderPage 차트 | GET /prices/{id}/trend |
| 재고 부족 | OrderPage 탭 | GET /ingredients/low-stock |
| 재고 관리 | InventoryPage | GET /ingredients/{id}/batches, POST /inventory/batches |
| 발주 등록 | LowestPriceDetailPage 모달 | POST /purchase-orders |
| 발주 목록 | OrderPage 탭 | GET /purchase-orders |
| 발주 집계 | MainPage 위젯 | GET /purchase-orders/summary |
| 엑셀 다운로드 | OrderPage | GET /purchase-orders/export |

---

## 📚 문서

- `BACKEND_GUIDE.md` (frontend/) — 백엔드 연동 가이드
- `plan_kim_0423_01.md` ~ `plan_kim_0604_04.md` — 단계별 구현 계획
- `frontend-evaluation.html` (frontend/) — 프론트엔드 품질 보고서

---

## 🛠 기술 스택

### Frontend
- React 18, TypeScript, Vite 6
- Tailwind CSS v4, shadcn/ui
- React Query v5 (TanStack), React Router v7
- recharts, motion (animation)

### Backend
- Spring Boot 3, Java 21
- MySQL 8, Redis 7 (Redisson 분산락)
- Spring Batch (KAMIS 일일 가격 수집)
- JWT 인증

### Infra
- Docker Compose (MySQL + Redis)
- KAMIS Open API
- NAVER 쇼핑 API
