import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLowStock } from "../../hooks/useLowStock";
import { usePriceTrend } from "../../hooks/usePriceTrend";
import { defaultRange, useExportPurchaseOrders, usePurchaseOrders } from "../../hooks/usePurchaseOrders";
import type { LowStockItem, PurchaseOrder, StockGrade } from "../../types/order";
import { formatQuantity, formatLocalDate } from "../../lib/date";
import { PriceChart, type ChartPoint } from "../../components/PriceChart";
import { C, GRADIENT } from "../../components/theme";
import {
  Badge,
  Card,
  EmptyState,
  GradientButton,
  InfoCard,
  PageHeader,
  Screen,
  SectionTitle,
  SelectField,
  Skeleton,
  Spinner,
  type Tone,
} from "../../components/ui";

type TabKey = "low-stock" | "history";

export default function OrderScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(params.tab === "history" ? "history" : "low-stock");
  useEffect(() => {
    if (params.tab === "history") setTab("history");
  }, [params.tab]);

  const { data: items = [], isLoading, isRefetching, refetch } = useLowStock(10);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId === null && items.length > 0) setSelectedId(items[0].ingredientId);
  }, [items, selectedId]);
  const selectedItem = items.find((i) => i.ingredientId === selectedId) ?? null;

  const { data: trend } = usePriceTrend(selectedId ?? undefined, 30);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signalShownFor, setSignalShownFor] = useState<number | null>(null);
  useEffect(() => {
    if (trend?.currentBuySignal && trend.ingredientId !== signalShownFor) {
      setSignalOpen(true);
      setSignalShownFor(trend.ingredientId);
    }
  }, [trend, signalShownFor]);

  const dangerCount = items.filter((i) => i.grade === "DANGER").length;

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => {
        refetch();
        qc.invalidateQueries({ queryKey: ["purchase-orders"] });
        qc.invalidateQueries({ queryKey: ["price-trend"] });
      }}
    >
      <PageHeader title="발주 관리" description="재고 부족 상품 및 가격 추세" />

      {dangerCount > 0 && (
        <LinearGradient colors={["#F97316", "#EF4444"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="warning-outline" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>긴급 발주 필요</Text>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>재고가 심각하게 부족한 상품이 {dangerCount}개 있습니다</Text>
          </View>
        </LinearGradient>
      )}

      {/* Price trend */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>가격 추세</Text>
        <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2, marginBottom: 12 }}>최근 30일 가격 변동 + 매수 신호</Text>
        {items.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <SelectField
              title="재료 선택"
              value={selectedId}
              options={items.map((i) => ({ value: i.ingredientId, label: i.ingredientName }))}
              onChange={setSelectedId}
            />
          </View>
        )}
        <TrendSection item={selectedItem} />
      </Card>

      {/* Tabs */}
      <View style={{ flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: C.border, padding: 4, marginBottom: 16 }}>
        {(
          [
            ["low-stock", "재고 부족"],
            ["history", "발주 기록"],
          ] as const
        ).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, borderRadius: 9, overflow: "hidden" }}>
              {on ? (
                <LinearGradient colors={GRADIENT} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
                </LinearGradient>
              ) : (
                <View style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: C.textSub, fontWeight: "500" }}>{label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {tab === "low-stock" ? (
        <LowStockList items={items} isLoading={isLoading} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <HistoryList />
      )}

      {/* Buy signal */}
      <Modal visible={signalOpen && !!trend && !!selectedItem} transparent animationType="fade" onRequestClose={() => setSignalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: 24 }} onPress={() => setSignalOpen(false)}>
          <Pressable style={{ backgroundColor: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 360, alignItems: "center" }}>
            <Text style={{ fontSize: 44 }}>💰</Text>
            <Text style={{ fontSize: 19, fontWeight: "800", color: C.text, marginTop: 8, textAlign: "center" }}>
              {selectedItem?.ingredientName}이(가) 매우 쌉니다!
            </Text>
            <Text style={{ color: C.textSub, marginTop: 6, textAlign: "center" }}>{trend?.signalReason}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" }}>
              <GradientButton title="닫기" variant="outline" onPress={() => setSignalOpen(false)} style={{ flex: 1 }} />
              <GradientButton
                title="상세 보기"
                style={{ flex: 1 }}
                onPress={() => {
                  setSignalOpen(false);
                  if (trend) router.push(`/lowest-price/${trend.ingredientId}`);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function TrendSection({ item }: { item: LowStockItem | null }) {
  const { data, isLoading } = usePriceTrend(item?.ingredientId, 30);
  if (!item) return <Text style={{ color: C.textSub }}>재료를 선택해주세요</Text>;
  if (isLoading) return <Spinner />;
  if (!data || data.points.length === 0)
    return <Text style={{ color: C.textSub, paddingVertical: 16 }}>추세 데이터가 아직 없습니다 (KAMIS 일일 배치 실행 후 표시)</Text>;

  const history: ChartPoint[] = data.points
    .map((p) => ({ date: p.date, price: p.wholesalePrice ?? p.retailPrice ?? 0 }))
    .filter((p) => p.price > 0);
  if (history.length === 0) return <Text style={{ color: C.textSub }}>가격 데이터가 모두 비어있습니다</Text>;

  const last = data.points[data.points.length - 1];
  return (
    <View>
      {data.currentBuySignal && (
        <View style={{ flexDirection: "row", gap: 6, backgroundColor: C.successSoft, borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <Text>💰</Text>
          <Text style={{ flex: 1, color: "#047857", fontSize: 13 }}>{data.signalReason}</Text>
        </View>
      )}
      <PriceChart
        history={history}
        monthly={last.monthAvg ?? 0}
        weekly={last.weekAvg ?? 0}
        current={last.wholesalePrice ?? last.retailPrice ?? 0}
      />
    </View>
  );
}

function LowStockList({
  items,
  isLoading,
  selectedId,
  onSelect,
}: {
  items: LowStockItem[];
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (isLoading) return <Skeleton count={3} height={150} />;
  if (items.length === 0) return <EmptyState icon="checkmark-circle-outline" title="재고 부족 항목이 없습니다" description="모든 재료가 안전 재고 이상입니다." />;

  return (
    <View style={{ gap: 14 }}>
      {items.map((item, index) => (
        <StockCard key={item.ingredientId} item={item} index={index} selected={item.ingredientId === selectedId} onPress={() => onSelect(item.ingredientId)} />
      ))}
      <InfoCard
        title="재고 등급 안내"
        lines={[
          "긴급 (빨강): 재고율 30% 이하 — 발주 알림 대상",
          "주의 (주황): 재고율 30~60% — 주의 필요",
          "여유 (초록): 재고율 60% 초과",
          "재고율 = 현재 재고 ÷ (다음 발주일까지 남은 일수 × 일평균 소모량)",
        ]}
      />
    </View>
  );
}

const GRADE: Record<StockGrade, { label: string; tone: Tone; color: string; bar: [string, string] }> = {
  DANGER: { label: "긴급", tone: "danger", color: C.danger, bar: ["#EF4444", "#F97316"] },
  NORMAL: { label: "주의", tone: "warning", color: C.warning, bar: ["#F59E0B", "#EAB308"] },
  SUFFICIENT: { label: "여유", tone: "success", color: C.success, bar: ["#10B981", "#14B8A6"] },
};

function StockCard({ item, index, selected, onPress }: { item: LowStockItem; index: number; selected: boolean; onPress: () => void }) {
  const pct = Math.min(100, Math.round(item.stockRatio * 100));
  const g = GRADE[item.grade];
  return (
    <View>
      <Card onPress={onPress} selected={selected}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
              <Badge label={g.label} tone={g.tone} />
              {item.orderAlert && <Badge label="발주 권장" tone="warning" />}
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: C.text }}>{item.ingredientName}</Text>
            <Text style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
              현재 <Text style={{ fontWeight: "700", color: g.color }}>{formatQuantity(item.currentStock)}{item.baseUnit}</Text>
              {item.dailyAvgSales > 0 ? ` · 일평균 소모 ${formatQuantity(item.dailyAvgSales)}${item.baseUnit}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: g.color }}>{pct}%</Text>
            <Text style={{ fontSize: 11, color: C.textMute }}>재고율</Text>
          </View>
        </View>
        <View style={{ height: 8, backgroundColor: "#F1F5F9", borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
          <LinearGradient colors={g.bar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(pct, 2)}%`, height: "100%" }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: C.border }}>
          <Text style={{ flex: 1, fontSize: 12, color: C.textMute }}>
            {item.estimatedDepletionDate ? `예상 소진 ${item.estimatedDepletionDate}` : "소진 예상 데이터 없음"} ·{" "}
            {item.nextOrderDayDistance > 0 ? `${item.nextOrderDayDistance}일 후 발주일` : "오늘 발주일"}
          </Text>
          <Pressable onPress={() => router.push(`/lowest-price/${item.ingredientId}`)} hitSlop={10} style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: C.primary, fontWeight: "600", fontSize: 13 }}>최저가</Text>
            <Ionicons name="chevron-forward" size={16} color={C.primary} />
          </Pressable>
        </View>
      </Card>
      <View style={{ position: "absolute", top: -8, left: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }}>
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{index + 1}</Text>
      </View>
    </View>
  );
}

function HistoryList() {
  const range = useMemo(() => defaultRange(30), []);
  const [page, setPage] = useState(0);
  const { data, isLoading } = usePurchaseOrders({ from: range.from, to: range.to, page, size: 20 });
  const exportMutation = useExportPurchaseOrders();
  const grouped = useMemo(() => groupByDate(data?.content ?? []), [data]);

  if (isLoading) return <Skeleton count={3} height={100} />;
  if (!data || data.content.length === 0)
    return <EmptyState icon="receipt-outline" title="아직 발주 기록이 없습니다" description="최저가 상세 페이지에서 발주를 추가해 보세요." />;

  const doExport = () =>
    exportMutation.mutate(
      { from: range.from, to: range.to },
      { onError: (e) => Alert.alert("내보내기 실패", e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.") },
    );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: C.textSub, flex: 1 }}>
          {range.from} ~ {range.to} · 총 {data.totalElements}건
        </Text>
        <GradientButton title="엑셀" icon="download-outline" small variant="soft" onPress={doExport} loading={exportMutation.isPending} />
      </View>

      {grouped.map(({ label, sublabel, records }) => (
        <View key={label} style={{ gap: 10 }}>
          <SectionTitle>
            {label}
            {sublabel ? <Text style={{ fontSize: 13, color: C.primary, fontWeight: "600" }}>  {sublabel}</Text> : null}
          </SectionTitle>
          {records.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                <Badge label={r.supplier} />
                {r.status !== "PENDING" && <Badge label={statusLabel(r.status)} tone={r.status === "CONFIRMED" ? "success" : "danger"} />}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>{r.ingredientName}</Text>
                  <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                    단가 {Number(r.unitPrice).toLocaleString("ko-KR")}원 × {formatQuantity(r.quantity)}
                    {r.baseUnit}
                  </Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: "800", color: C.primary }}>{Number(r.totalAmount).toLocaleString("ko-KR")}원</Text>
              </View>
              {r.memo ? <Text style={{ fontSize: 12, color: C.textSub, marginTop: 8 }}>📝 {r.memo}</Text> : null}
            </Card>
          ))}
        </View>
      ))}

      {data.totalPages > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 4 }}>
          <GradientButton title="이전" small variant="outline" disabled={data.first} onPress={() => setPage((p) => Math.max(0, p - 1))} />
          <Text style={{ color: C.textSub }}>
            {data.number + 1} / {data.totalPages}
          </Text>
          <GradientButton title="다음" small variant="outline" disabled={data.last} onPress={() => setPage((p) => p + 1)} />
        </View>
      )}
    </View>
  );
}

function groupByDate(records: PurchaseOrder[]) {
  const groups = new Map<string, PurchaseOrder[]>();
  for (const r of records) {
    const arr = groups.get(r.orderedAt) ?? [];
    arr.push(r);
    groups.set(r.orderedAt, arr);
  }
  const today = formatLocalDate(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = formatLocalDate(y);
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, recs]) => ({
      label: key,
      sublabel: key === today ? "오늘" : key === yesterday ? "어제" : undefined,
      records: recs,
    }));
}

function statusLabel(s: PurchaseOrder["status"]) {
  return s === "PENDING" ? "대기" : s === "CONFIRMED" ? "확정" : "취소";
}
