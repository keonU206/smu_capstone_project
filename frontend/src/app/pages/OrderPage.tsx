import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams } from "react-router";
import { AppShell } from "../components/common/AppShell";
import { PageHeader } from "../components/common/PageHeader";
import { CategoryBadge } from "../components/common/CategoryBadge";
import { GradientButton } from "../components/common/GradientButton";
import { CardSkeleton, Spinner } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import { PriceChart, type ChartPoint } from "../components/common/PriceChart";
import { useLowStock } from "../hooks/useLowStock";
import { usePriceTrend } from "../hooks/usePriceTrend";
import {
  defaultRange,
  useExportPurchaseOrders,
  usePurchaseOrders,
} from "../hooks/usePurchaseOrders";
import type {
  LowStockItem,
  PurchaseOrder,
  StockGrade,
} from "../types/order";

type TabKey = "low-stock" | "history";

export default function OrderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: items = [], isLoading } = useLowStock(10);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const activeTab: TabKey =
    searchParams.get("tab") === "history" ? "history" : "low-stock";

  const setActiveTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "history") next.set("tab", "history");
    else next.delete("tab");
    setSearchParams(next);
  };

  useEffect(() => {
    if (selectedId === null && items.length > 0) {
      setSelectedId(items[0].ingredientId);
    }
  }, [items, selectedId]);

  const selectedItem =
    items.find((i) => i.ingredientId === selectedId) ?? null;

  // buy-signal 알림 (선택된 재료의 trend 응답 기반)
  const { data: selectedTrend } = usePriceTrend(selectedId ?? undefined, 30);
  const [showBuySignal, setShowBuySignal] = useState(false);
  const [signalShownFor, setSignalShownFor] = useState<number | null>(null);

  useEffect(() => {
    if (
      selectedTrend?.currentBuySignal &&
      selectedTrend.ingredientId !== signalShownFor
    ) {
      setShowBuySignal(true);
      setSignalShownFor(selectedTrend.ingredientId);
    }
  }, [selectedTrend, signalShownFor]);

  return (
    <AppShell variant="main">
      <PageHeader
        title="발주 관리"
        description="재고 부족 상품 및 가격 추세"
        backTo="/main"
      />

      {/* Price trend section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6 p-5 rounded-2xl bg-white border-2 border-[#e2e8f0]"
      >
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-[#1e293b] mb-1">
              가격 추세
            </h2>
            <p className="text-sm text-[#64748b]">
              최근 30일 가격 변동 + 매수 신호
            </p>
          </div>
          {items.length > 0 && (
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="px-4 py-2.5 rounded-xl bg-white border-2 border-[#e2e8f0] focus:border-[#0EA5E9] focus:outline-none text-[#1e293b] min-w-[180px]"
            >
              {items.map((item) => (
                <option key={item.ingredientId} value={item.ingredientId}>
                  {item.ingredientName}
                </option>
              ))}
            </select>
          )}
        </div>
        <PriceTrendSection selectedItem={selectedItem} />
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-4 flex items-center justify-between"
      >
        <div className="inline-flex bg-white border-2 border-[#e2e8f0] rounded-xl p-1">
          <TabButton
            active={activeTab === "low-stock"}
            onClick={() => setActiveTab("low-stock")}
          >
            재고 부족
          </TabButton>
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          >
            발주 기록
          </TabButton>
        </div>
      </motion.div>

      {activeTab === "low-stock" ? (
        <LowStockTab
          items={items}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          onNavigateToDetail={(id) => navigate(`/lowest-price/${id}`)}
        />
      ) : (
        <HistoryTab />
      )}

      {/* Buy signal modal */}
      <AnimatePresence>
        {showBuySignal && selectedTrend && selectedItem && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
            onClick={() => setShowBuySignal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-sm p-6 relative overflow-hidden"
            >
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-[#0EA5E9]/20 to-[#38BDF8]/20 blur-2xl pointer-events-none" />
              <div className="relative">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#38BDF8] flex items-center justify-center text-3xl shadow-lg shadow-[#0EA5E9]/30">
                  💰
                </div>
                <h2 className="text-xl font-semibold text-[#1e293b] text-center mb-2">
                  {selectedItem.ingredientName}이(가) 매우 쌉니다!
                </h2>
                <p className="text-[#64748b] text-center mb-5 text-sm leading-relaxed">
                  {selectedTrend.signalReason}
                </p>
                <div className="flex gap-3">
                  <GradientButton
                    variant="outline"
                    onClick={() => setShowBuySignal(false)}
                  >
                    닫기
                  </GradientButton>
                  <GradientButton
                    onClick={() => {
                      setShowBuySignal(false);
                      navigate(`/lowest-price/${selectedTrend.ingredientId}`);
                    }}
                  >
                    상세 보기
                  </GradientButton>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] text-white shadow-md"
          : "text-[#64748b] hover:text-[#0EA5E9]"
      }`}
    >
      {children}
    </button>
  );
}

function PriceTrendSection({
  selectedItem,
}: {
  selectedItem: LowStockItem | null;
}) {
  const { data, isLoading } = usePriceTrend(
    selectedItem?.ingredientId,
    30,
  );

  if (!selectedItem) return <EmptyState title="재료를 선택해주세요" />;
  if (isLoading) return <Spinner />;
  if (!data || data.points.length === 0) {
    return (
      <EmptyState
        title="추세 데이터가 아직 없습니다"
        description="KAMIS 일일 배치 실행 후 표시됩니다."
      />
    );
  }

  // TrendPoint[] → ChartPoint[] 변환 (wholesalePrice 우선, fallback retailPrice)
  const history: ChartPoint[] = data.points
    .map((p) => ({
      date: p.date,
      price: p.wholesalePrice ?? p.retailPrice ?? 0,
    }))
    .filter((p) => p.price > 0);

  if (history.length === 0) {
    return <EmptyState title="가격 데이터가 모두 비어있습니다" />;
  }

  const last = data.points[data.points.length - 1];
  const monthly = last.monthAvg ?? 0;
  const weekly = last.weekAvg ?? 0;
  const current = last.wholesalePrice ?? last.retailPrice ?? 0;

  return (
    <div>
      {data.currentBuySignal && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] text-white text-sm flex items-center gap-2">
          <span>💰</span>
          <span className="font-medium">{data.signalReason}</span>
        </div>
      )}
      <PriceChart
        history={history}
        monthly={monthly}
        weekly={weekly}
        current={current}
      />
    </div>
  );
}

function LowStockTab({
  items,
  isLoading,
  selectedId,
  onSelect,
  onNavigateToDetail,
}: {
  items: LowStockItem[];
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNavigateToDetail: (id: number) => void;
}) {
  if (isLoading) return <CardSkeleton count={3} heightClass="h-40" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="재고 부족 항목이 없습니다"
        description="모든 재료가 안전 재고 이상입니다."
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item, index) => (
          <StockCard
            key={item.ingredientId}
            item={item}
            index={index}
            isSelected={item.ingredientId === selectedId}
            onClick={() => onSelect(item.ingredientId)}
            onDetailClick={() => onNavigateToDetail(item.ingredientId)}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-6 p-4 rounded-xl bg-white border-2 border-[#e2e8f0]"
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
            <h3 className="font-semibold text-[#1e293b] mb-2">재고 등급 안내</h3>
            <ul className="space-y-1.5 text-sm text-[#64748b]">
              <li>
                • <b>DANGER</b> (빨강): stockRatio ≤ 30% — 발주 알림 대상
              </li>
              <li>
                • <b>NORMAL</b> (노랑): 30% &lt; ratio ≤ 60% — 주의 필요
              </li>
              <li>
                • <b>SUFFICIENT</b> (초록): &gt; 60% — 여유 있음
              </li>
              <li>
                • stockRatio = currentStock ÷ (nextOrderDayDistance × dailyAvgSales)
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StockCard({
  item,
  index,
  isSelected,
  onClick,
  onDetailClick,
}: {
  item: LowStockItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDetailClick: () => void;
}) {
  const ratioPct = Math.min(100, Math.round(item.stockRatio * 100));
  const badge = gradeBadge(item.grade);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.06 * index }}
      onClick={onClick}
      className={`bg-white rounded-xl p-4 border-2 transition-all cursor-pointer group relative ${
        isSelected
          ? "border-[#0EA5E9] shadow-lg shadow-[#0EA5E9]/10"
          : "border-[#e2e8f0] hover:border-[#0EA5E9] hover:shadow-md"
      }`}
    >
      <div className="absolute -left-2 -top-2 w-8 h-8 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#38BDF8] flex items-center justify-center text-white font-bold text-sm shadow-lg">
        {index + 1}
      </div>

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <CategoryBadge label={badge.label} tone={badge.tone} />
            {item.orderAlert && (
              <CategoryBadge label="발주 권장" tone="warning" />
            )}
          </div>
          <h3 className="font-semibold text-[#1e293b] mb-1 truncate">
            {item.ingredientName}
          </h3>
          <div className="text-sm text-[#64748b]">
            현재{" "}
            <span className="font-semibold text-[#1e293b]">
              {formatStock(item.currentStock)}
              {item.baseUnit}
            </span>
            {item.dailyAvgSales > 0 && (
              <>
                {" · "}
                일평균 소모 {formatStock(item.dailyAvgSales)}
                {item.baseUnit}
              </>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div
            className={`text-2xl font-bold ${
              item.grade === "DANGER"
                ? "text-red-500"
                : item.grade === "NORMAL"
                  ? "text-amber-500"
                  : "text-emerald-500"
            }`}
          >
            {ratioPct}%
          </div>
          <div className="text-xs text-[#94a3b8]">재고율</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${ratioPct}%` }}
            transition={{ delay: 0.3 + index * 0.06, duration: 0.5 }}
            className={`h-full bg-gradient-to-r ${gradeBarColor(item.grade)}`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#94a3b8] pt-3 border-t border-[#e2e8f0]">
        <span>
          {item.estimatedDepletionDate
            ? `예상 소진 ${item.estimatedDepletionDate}`
            : "소진 예상 데이터 없음"}
          {" · "}
          {item.nextOrderDayDistance > 0
            ? `${item.nextOrderDayDistance}일 후 발주일`
            : "오늘 발주일"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDetailClick();
          }}
          className="flex items-center gap-1 text-[#0EA5E9] hover:underline"
        >
          <span>최저가</span>
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

function HistoryTab() {
  const range = useMemo(() => defaultRange(30), []);
  const [page, setPage] = useState(0);
  const { data, isLoading } = usePurchaseOrders({
    from: range.from,
    to: range.to,
    page,
    size: 20,
  });
  const exportMutation = useExportPurchaseOrders();

  const grouped = useMemo(() => groupByDate(data?.content ?? []), [data]);

  if (isLoading) return <CardSkeleton count={3} heightClass="h-28" />;
  if (!data || data.content.length === 0) {
    return (
      <EmptyState
        title="아직 발주 기록이 없습니다"
        description="최저가 상세 페이지에서 발주를 추가해 보세요."
      />
    );
  }

  const handleExport = () => {
    exportMutation.mutate({ from: range.from, to: range.to });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-[#64748b]">
          기간: {range.from} ~ {range.to} · 총 {data.totalElements}건
        </div>
        <button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="text-sm px-4 py-2 rounded-lg border-2 border-[#e2e8f0] text-[#0EA5E9] font-medium hover:bg-[#F0F9FF] transition-colors disabled:opacity-60 flex items-center gap-2"
        >
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
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {exportMutation.isPending ? "내보내는 중..." : "엑셀 내보내기"}
        </button>
      </div>

      {grouped.map(({ label, sublabel, records }) => (
        <div key={label}>
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="text-base font-semibold text-[#1e293b]">{label}</h3>
            {sublabel && (
              <span className="text-xs text-[#94a3b8]">{sublabel}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {records.map((record, i) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
                className="bg-white rounded-xl p-4 border-2 border-[#e2e8f0] hover:border-[#0EA5E9] transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CategoryBadge label={record.supplier} />
                    {record.status !== "PENDING" && (
                      <CategoryBadge
                        label={statusLabel(record.status)}
                        tone={
                          record.status === "CONFIRMED"
                            ? "success"
                            : "danger"
                        }
                      />
                    )}
                  </div>
                </div>
                <h4 className="font-semibold text-[#1e293b] mb-1 truncate">
                  {record.ingredientName}
                </h4>
                <div className="text-sm text-[#64748b] mb-1">
                  단가 {Number(record.unitPrice).toLocaleString()}원 ×{" "}
                  {formatStock(record.quantity)}
                  {record.baseUnit}
                </div>
                <div className="text-sm font-semibold text-[#0EA5E9]">
                  소계 {Number(record.totalAmount).toLocaleString()}원
                </div>
                {record.memo && (
                  <div className="mt-2 text-xs text-[#94a3b8] truncate">
                    📝 {record.memo}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={data.first}
            className="px-3 py-1.5 rounded-lg border-2 border-[#e2e8f0] text-sm disabled:opacity-50 hover:border-[#0EA5E9] transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-[#64748b]">
            {data.number + 1} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={data.last}
            className="px-3 py-1.5 rounded-lg border-2 border-[#e2e8f0] text-sm disabled:opacity-50 hover:border-[#0EA5E9] transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

// ────────── helpers ──────────

interface GroupedHistory {
  label: string;
  sublabel?: string;
  records: PurchaseOrder[];
}

function groupByDate(records: PurchaseOrder[]): GroupedHistory[] {
  const groups = new Map<string, PurchaseOrder[]>();
  for (const r of records) {
    const key = r.orderedAt;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, recs]) => {
      let sublabel: string | undefined;
      if (key === todayKey) sublabel = "오늘";
      else if (key === yesterdayKey) sublabel = "어제";
      return { label: key, sublabel, records: recs };
    });
}

function formatStock(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

function gradeBadge(grade: StockGrade): {
  label: string;
  tone: "danger" | "warning" | "success";
} {
  switch (grade) {
    case "DANGER":
      return { label: "DANGER", tone: "danger" };
    case "NORMAL":
      return { label: "NORMAL", tone: "warning" };
    case "SUFFICIENT":
      return { label: "SUFFICIENT", tone: "success" };
  }
}

function gradeBarColor(grade: StockGrade): string {
  switch (grade) {
    case "DANGER":
      return "from-red-500 to-orange-500";
    case "NORMAL":
      return "from-amber-500 to-yellow-500";
    case "SUFFICIENT":
      return "from-emerald-500 to-teal-500";
  }
}

function statusLabel(status: PurchaseOrder["status"]): string {
  switch (status) {
    case "PENDING":
      return "대기";
    case "CONFIRMED":
      return "확정";
    case "CANCELLED":
      return "취소";
  }
}
