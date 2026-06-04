import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useParams } from "react-router";
import { AppShell } from "../components/common/AppShell";
import { PageHeader } from "../components/common/PageHeader";
import { Spinner } from "../components/common/LoadingState";
import { GradientButton } from "../components/common/GradientButton";
import { usePriceDetail } from "../hooks/usePriceDetail";
import { useCreatePurchaseOrder } from "../hooks/usePurchaseOrders";
import { useCreateBatch } from "../hooks/useInventoryBatches";
import type { OnlinePrice, PriceDetail } from "../types/ingredient";

interface VisitedSource {
  source: string;
  sourceLabel: string;
  productName: string;
  price: number;
}

export default function LowestPriceDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const ingredientId = Number(id);
  const { data, isLoading, isError } = usePriceDetail(ingredientId);

  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [pending, setPending] = useState<VisitedSource | null>(null);
  const [lastVisited, setLastVisited] = useState<VisitedSource | null>(null);
  const [quantity, setQuantity] = useState<string>("1");
  const [supplier, setSupplier] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [expirationDate, setExpirationDate] = useState<string>(
    defaultExpirationDate(),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createMutation = useCreatePurchaseOrder();
  const createBatchMutation = useCreateBatch();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && pending) {
        setLastVisited(pending);
        setSupplier(pending.sourceLabel);
        setShowOrderConfirm(true);
        setPending(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pending]);

  const handleExternalClick = (
    v: VisitedSource | (Omit<VisitedSource, "productName"> & { productName?: string }),
    url: string,
  ) => {
    setPending({
      source: v.source,
      sourceLabel: v.sourceLabel,
      productName: v.productName ?? data?.name ?? "",
      price: v.price,
    });
    window.open(url, "_blank");
  };

  const handleConfirmOrder = async () => {
    if (!data || !lastVisited) return;
    setErrorMsg(null);
    const qty = Number.parseFloat(quantity);
    if (!qty || qty <= 0) {
      setErrorMsg("수량을 0보다 큰 숫자로 입력해주세요.");
      return;
    }
    if (!supplier.trim()) {
      setErrorMsg("공급자를 입력해주세요.");
      return;
    }
    if (!expirationDate) {
      setErrorMsg("유통기한을 입력해주세요.");
      return;
    }
    try {
      // 1) 발주 기록 등록 (purchase_orders)
      await createMutation.mutateAsync({
        ingredientId: data.ingredientId,
        quantity: qty,
        baseUnit: data.unit || "kg",
        unitPrice: lastVisited.price,
        supplier: supplier.trim(),
        memo: memo.trim() || undefined,
      });

      // 2) 재고 배치 자동 입고 (inventory_batch)
      //    발주 = 즉시 입고로 간주. 시연·MVP용 단순화.
      try {
        await createBatchMutation.mutateAsync({
          ingredientId: data.ingredientId,
          quantity: qty,
          costPerUnit: lastVisited.price || undefined,
          inboundDate: undefined, // 백엔드가 오늘로 채움
          expirationDate,
        });
      } catch (batchErr) {
        // 발주는 성공했으니 입고 실패는 경고만
        console.warn("발주는 등록됐지만 재고 자동 입고 실패:", batchErr);
      }

      resetModal();
      navigate("/order?tab=history");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `발주 저장 실패: ${err.message}`
          : "발주 저장에 실패했습니다.",
      );
    }
  };

  const resetModal = () => {
    setShowOrderConfirm(false);
    setQuantity("1");
    setSupplier("");
    setMemo("");
    setExpirationDate(defaultExpirationDate());
    setErrorMsg(null);
  };

  if (isLoading) {
    return (
      <AppShell variant="main">
        <PageHeader title="로딩 중..." backTo="/lowest-price" />
        <Spinner />
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell variant="main">
        <PageHeader title="조회 실패" backTo="/lowest-price" />
        <div className="text-center py-12">
          <p className="text-[#64748b]">재료 정보를 불러오지 못했습니다.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="main">
      <PageHeader title={data.name} backTo="/lowest-price" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: KAMIS + 안내 */}
        <div className="space-y-4">
          <KamisCard data={data} />
          <PriceInfoCard hasOnline={data.onlinePrices.length > 0} />
        </div>

        {/* Right: 온라인 가격 / 검색 fallback */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {data.onlinePrices.length > 0 ? (
            <OnlinePricesList
              prices={data.onlinePrices}
              onVisit={handleExternalClick}
            />
          ) : (
            <SearchLinksFallback
              data={data}
              onVisit={handleExternalClick}
            />
          )}
        </motion.div>
      </div>

      {/* Order confirm modal */}
      <AnimatePresence>
        {showOrderConfirm && lastVisited && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6 overflow-y-auto py-8"
            onClick={resetModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md p-6"
            >
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#38BDF8] flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>

              <h2 className="text-xl font-semibold text-[#1e293b] text-center mb-1">
                발주 추가
              </h2>
              <p className="text-[#64748b] text-center mb-4 text-sm">
                방문한 사이트의 가격으로 발주를 기록합니다.
              </p>

              <div className="mb-4 p-3 rounded-lg bg-[#F0F9FF] border border-[#e2e8f0] text-sm space-y-1">
                <div className="flex justify-between text-[#64748b]">
                  <span>재료</span>
                  <span className="font-medium text-[#1e293b]">{data.name}</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>출처</span>
                  <span className="font-medium text-[#1e293b]">
                    {lastVisited.sourceLabel}
                  </span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>단가</span>
                  <span className="font-medium text-[#0EA5E9]">
                    {lastVisited.price.toLocaleString()}원
                  </span>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm text-[#334155] mb-1.5">
                    수량 *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl bg-white border-2 border-[#e2e8f0] focus:border-[#0EA5E9] focus:outline-none transition-colors"
                    />
                    <span className="text-[#64748b] font-medium min-w-[24px]">
                      {data.unit || "kg"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[#334155] mb-1.5">
                    공급자 *
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="예: 농협유통, 쿠팡"
                    className="w-full px-4 py-3 rounded-xl bg-white border-2 border-[#e2e8f0] focus:border-[#0EA5E9] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#334155] mb-1.5">
                    유통기한 *
                  </label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border-2 border-[#e2e8f0] focus:border-[#0EA5E9] focus:outline-none transition-colors"
                    required
                  />
                  <p className="text-xs text-[#94a3b8] mt-1">
                    발주 즉시 재고에 자동 입고됩니다
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-[#334155] mb-1.5">
                    메모 (선택)
                  </label>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    placeholder="배송 요청 사항 등"
                    className="w-full px-4 py-3 rounded-xl bg-white border-2 border-[#e2e8f0] focus:border-[#0EA5E9] focus:outline-none transition-colors resize-none"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="flex gap-3">
                <GradientButton
                  variant="outline"
                  onClick={resetModal}
                  disabled={
                    createMutation.isPending || createBatchMutation.isPending
                  }
                >
                  취소
                </GradientButton>
                <GradientButton
                  onClick={handleConfirmOrder}
                  disabled={
                    createMutation.isPending || createBatchMutation.isPending
                  }
                >
                  {createMutation.isPending || createBatchMutation.isPending
                    ? "저장 중..."
                    : "발주 추가"}
                </GradientButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function KamisCard({ data }: { data: PriceDetail }) {
  const k = data.kamis;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-5 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#38BDF8] text-white"
    >
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <span className="text-sm font-medium">KAMIS 공식 시세</span>
      </div>

      {k && k.currentPricePerKg !== null ? (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold">
              {k.currentPricePerKg.toLocaleString()}원
            </span>
            <span className="text-sm opacity-90">/ kg</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/10 rounded-lg px-3 py-2">
              <div className="opacity-80">주 평균</div>
              <div className="font-semibold text-sm mt-0.5">
                {k.weekAvg !== null ? `${k.weekAvg.toLocaleString()}원` : "—"}
              </div>
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-2">
              <div className="opacity-80">월 평균</div>
              <div className="font-semibold text-sm mt-0.5">
                {k.monthAvg !== null
                  ? `${k.monthAvg.toLocaleString()}원`
                  : "—"}
              </div>
            </div>
          </div>
          {k.priceDate && (
            <div className="text-xs opacity-80 mt-3">기준일: {k.priceDate}</div>
          )}
        </>
      ) : (
        <div>
          <div className="text-2xl font-semibold mb-1">데이터 수집 중</div>
          <div className="text-xs opacity-90">
            KAMIS 일일 배치 실행 후 표시됩니다.
          </div>
        </div>
      )}
    </motion.div>
  );
}

function PriceInfoCard({ hasOnline }: { hasOnline: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="p-4 rounded-xl bg-white border-2 border-[#e2e8f0]"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-[#0EA5E9] mt-0.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="font-semibold text-[#1e293b] mb-2">가격 비교 안내</h3>
          <ul className="space-y-1.5 text-sm text-[#64748b]">
            <li>• KAMIS: 농산물 유통정보 공식 시세</li>
            <li>
              • 온라인 가격:{" "}
              {hasOnline
                ? "네이버 쇼핑·식자재왕 실시간 크롤링"
                : "수집된 항목 없음 — 검색 페이지 링크로 대체"}
            </li>
            <li>• 가격은 수시로 변동될 수 있습니다</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function OnlinePricesList({
  prices,
  onVisit,
}: {
  prices: OnlinePrice[];
  onVisit: (v: VisitedSource, url: string) => void;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold text-[#1e293b] mb-3">
        온라인 최저가
      </h2>
      <div className="space-y-3">
        {prices.map((p, index) => (
          <motion.div
            key={`${p.source}-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * index }}
            className={`bg-white rounded-xl p-4 border-2 transition-all ${
              p.isLowest
                ? "border-[#0EA5E9] shadow-lg shadow-[#0EA5E9]/10"
                : "border-[#e2e8f0]"
            }`}
          >
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F0F9FF] to-white flex items-center justify-center border-2 border-[#e2e8f0] flex-shrink-0">
                  <span className="text-base">🛒</span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[#1e293b] truncate">
                    {p.sourceLabel}
                  </div>
                  <div className="text-xs text-[#94a3b8] truncate">
                    {p.productName}
                  </div>
                  {p.isLowest && (
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] text-white">
                      최저가
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xl font-bold text-[#0EA5E9]">
                  {p.price.toLocaleString()}원
                </div>
                {p.unitPricePerKg !== null && (
                  <div className="text-xs text-[#94a3b8]">
                    kg당 {p.unitPricePerKg.toLocaleString()}원
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() =>
                onVisit(
                  {
                    source: p.source,
                    sourceLabel: p.sourceLabel,
                    productName: p.productName,
                    price: p.price,
                  },
                  p.productUrl,
                )
              }
              className={`w-full py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                p.isLowest
                  ? "bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] text-white hover:shadow-lg"
                  : "bg-[#F0F9FF] text-[#0EA5E9] hover:bg-[#0EA5E9] hover:text-white"
              }`}
            >
              <span>구매하러 가기</span>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function SearchLinksFallback({
  data,
  onVisit,
}: {
  data: PriceDetail;
  onVisit: (v: VisitedSource, url: string) => void;
}) {
  const labelMap: Record<string, string> = {
    NAVER_SEARCH: "네이버 쇼핑",
    SIKJAJAEWANG_SEARCH: "식자재왕",
  };
  return (
    <>
      <h2 className="text-lg font-semibold text-[#1e293b] mb-1">
        외부 검색
      </h2>
      <p className="text-sm text-[#64748b] mb-3">
        수집된 온라인 가격이 없습니다. 아래 사이트에서 직접 검색해 보세요.
      </p>
      <div className="space-y-3">
        {data.externalSearchLinks.map((link, index) => {
          const label = labelMap[link.source] ?? link.source;
          return (
            <motion.button
              key={link.source}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
              onClick={() =>
                onVisit(
                  {
                    source: link.source,
                    sourceLabel: label,
                    productName: data.name,
                    price: 0,
                  },
                  link.url,
                )
              }
              className="w-full bg-white rounded-xl p-4 border-2 border-[#e2e8f0] hover:border-[#0EA5E9] transition-all text-left flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F0F9FF] to-white flex items-center justify-center border-2 border-[#e2e8f0]">
                  <span className="text-base">🔍</span>
                </div>
                <div>
                  <div className="font-semibold text-[#1e293b]">{label}</div>
                  <div className="text-xs text-[#94a3b8]">
                    "{data.name}" 검색 페이지로 이동
                  </div>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-[#94a3b8] group-hover:text-[#0EA5E9] group-hover:translate-x-1 transition-all"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        💡 수동 검색 후 돌아오시면 가격을 직접 입력해 발주 기록을 추가할 수
        있습니다 (검색 페이지 방문 후 새로운 모달이 자동으로 열립니다).
      </div>
    </>
  );
}

// ────────── helpers ──────────

/** 기본 유통기한: 오늘 + 14일 (yyyy-MM-dd) */
function defaultExpirationDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
