import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { usePriceDetail } from "../../../hooks/usePriceDetail";
import { useCreatePurchaseOrder } from "../../../hooks/usePurchaseOrders";
import { useCreateBatch } from "../../../hooks/useInventoryBatches";
import type { OnlinePrice, PriceDetail } from "../../../types/ingredient";
import { futureISO } from "../../../lib/date";
import { C, GRADIENT } from "../../../components/theme";
import { DateTimeField } from "../../../components/pickers";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  GradientButton,
  InfoCard,
  Input,
  PageHeader,
  Screen,
  SectionTitle,
  Sheet,
  Spinner,
} from "../../../components/ui";

interface VisitedSource {
  source: string;
  sourceLabel: string;
  productName: string;
  price: number;
}

export default function LowestPriceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ingredientId = Number(id);
  const { data, isLoading, isError, refetch, isRefetching } = usePriceDetail(ingredientId);

  const pendingRef = useRef<VisitedSource | null>(null);
  const [visited, setVisited] = useState<VisitedSource | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 외부 쇼핑몰(브라우저)에서 앱으로 돌아오면 발주 추가 시트를 연다 (웹의 visibilitychange 대응)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && pendingRef.current) {
        setVisited(pendingRef.current);
        pendingRef.current = null;
        setSheetOpen(true);
      }
    });
    return () => sub.remove();
  }, []);

  const visit = async (v: VisitedSource, url: string) => {
    pendingRef.current = v;
    try {
      await Linking.openURL(url);
    } catch {
      pendingRef.current = null;
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <PageHeader title="로딩 중..." back />
        <Spinner />
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen>
        <PageHeader title="조회 실패" back />
        <EmptyState icon="alert-circle-outline" title="재료 정보를 불러오지 못했습니다" actionLabel="다시 시도" onAction={() => refetch()} />
      </Screen>
    );
  }

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <PageHeader title={data.name} back />
      <KamisCard data={data} />

      {data.onlinePrices.length > 0 ? (
        <>
          <SectionTitle>온라인 최저가</SectionTitle>
          <View style={{ gap: 12 }}>
            {data.onlinePrices.map((p, i) => (
              <OnlinePriceCard key={`${p.source}-${i}`} p={p} onVisit={visit} />
            ))}
          </View>
        </>
      ) : (
        <SearchFallback data={data} onVisit={visit} />
      )}

      <View style={{ marginTop: 16 }}>
        <InfoCard
          title="가격 비교 안내"
          lines={[
            "KAMIS: 농산물 유통정보 공식 시세",
            data.onlinePrices.length > 0 ? "온라인 가격: 네이버 쇼핑·식자재왕 실시간 크롤링" : "온라인 가격: 수집된 항목 없음 — 검색 페이지로 대체",
            "구매 페이지에서 돌아오면 발주 기록 창이 자동으로 열립니다",
          ]}
        />
      </View>

      <Pressable
        onPress={() => {
          setVisited({ source: "MANUAL", sourceLabel: "", productName: data.name, price: data.kamis?.currentPricePerKg ?? 0 });
          setSheetOpen(true);
        }}
        style={{ alignItems: "center", paddingVertical: 16 }}
      >
        <Text style={{ color: C.primary, fontWeight: "600" }}>+ 직접 발주 기록하기</Text>
      </Pressable>

      {visited && (
        <OrderSheet
          visible={sheetOpen}
          data={data}
          visited={visited}
          onClose={() => setSheetOpen(false)}
          onDone={() => {
            setSheetOpen(false);
            router.navigate({ pathname: "/order", params: { tab: "history" } });
          }}
        />
      )}
    </Screen>
  );
}

function KamisCard({ data }: { data: PriceDetail }) {
  const k = data.kamis;
  return (
    <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 20, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="stats-chart-outline" size={16} color="#fff" />
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>KAMIS 공식 시세</Text>
      </View>
      {k && k.currentPricePerKg !== null ? (
        <>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 8 }}>
            {k.currentPricePerKg.toLocaleString("ko-KR")}원<Text style={{ fontSize: 15, fontWeight: "500" }}> / kg</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {[
              ["주 평균", k.weekAvg],
              ["월 평균", k.monthAvg],
            ].map(([label, v]) => (
              <View key={label as string} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, padding: 10 }}>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>{label}</Text>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginTop: 2 }}>
                  {v !== null ? `${(v as number).toLocaleString("ko-KR")}원` : "—"}
                </Text>
              </View>
            ))}
          </View>
          {k.priceDate ? <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 10 }}>기준일: {k.priceDate}</Text> : null}
        </>
      ) : (
        <>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 8 }}>데이터 수집 중</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 }}>KAMIS 일일 배치 실행 후 표시됩니다.</Text>
        </>
      )}
    </LinearGradient>
  );
}

function OnlinePriceCard({ p, onVisit }: { p: OnlinePrice; onVisit: (v: VisitedSource, url: string) => void }) {
  return (
    <Card selected={p.isLowest}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 20 }}>🛒</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: C.text }}>{p.sourceLabel}</Text>
          <Text style={{ fontSize: 12, color: C.textSub }} numberOfLines={1}>
            {p.productName}
          </Text>
          {p.isLowest && <Badge label="최저가" />}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.primary }}>{p.price.toLocaleString("ko-KR")}원</Text>
          {p.unitPricePerKg !== null && (
            <Text style={{ fontSize: 11, color: C.textMute }}>kg당 {p.unitPricePerKg.toLocaleString("ko-KR")}원</Text>
          )}
        </View>
      </View>
      <GradientButton
        title="구매하러 가기"
        icon="open-outline"
        small
        variant={p.isLowest ? "primary" : "soft"}
        style={{ marginTop: 12 }}
        onPress={() => onVisit({ source: p.source, sourceLabel: p.sourceLabel, productName: p.productName, price: p.price }, p.productUrl)}
      />
    </Card>
  );
}

function SearchFallback({ data, onVisit }: { data: PriceDetail; onVisit: (v: VisitedSource, url: string) => void }) {
  const labelMap: Record<string, string> = { NAVER_SEARCH: "네이버 쇼핑", SIKJAJAEWANG_SEARCH: "식자재왕" };
  return (
    <>
      <SectionTitle>외부 검색</SectionTitle>
      <Text style={{ color: C.textSub, fontSize: 13, marginTop: -6, marginBottom: 12 }}>
        수집된 온라인 가격이 없습니다. 아래 사이트에서 직접 검색해 보세요.
      </Text>
      <View style={{ gap: 12 }}>
        {data.externalSearchLinks.map((link) => {
          const label = labelMap[link.source] ?? link.source;
          return (
            <Card key={link.source} onPress={() => onVisit({ source: link.source, sourceLabel: label, productName: data.name, price: 0 }, link.url)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 22 }}>🔍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: C.text }}>{label}</Text>
                  <Text style={{ fontSize: 12, color: C.textSub }}>"{data.name}" 검색 페이지로 이동</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={C.textMute} />
              </View>
            </Card>
          );
        })}
      </View>
    </>
  );
}

function OrderSheet({
  visible,
  data,
  visited,
  onClose,
  onDone,
}: {
  visible: boolean;
  data: PriceDetail;
  visited: VisitedSource;
  onClose: () => void;
  onDone: () => void;
}) {
  const createMutation = useCreatePurchaseOrder();
  const createBatchMutation = useCreateBatch();
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(visited.price || ""));
  const [supplier, setSupplier] = useState(visited.sourceLabel);
  const [memo, setMemo] = useState("");
  const [expirationDate, setExpirationDate] = useState(futureISO(14));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const busy = createMutation.isPending || createBatchMutation.isPending;

  useEffect(() => {
    if (visible) {
      setQuantity("1");
      setUnitPrice(String(visited.price || ""));
      setSupplier(visited.sourceLabel);
      setMemo("");
      setExpirationDate(futureISO(14));
      setErrorMsg(null);
    }
  }, [visible, visited]);

  const confirm = async () => {
    setErrorMsg(null);
    const qty = Number.parseFloat(quantity);
    const price = Number.parseFloat(unitPrice);
    if (!qty || qty <= 0) return setErrorMsg("수량을 0보다 큰 숫자로 입력해주세요.");
    if (Number.isNaN(price) || price < 0) return setErrorMsg("단가를 입력해주세요.");
    if (!supplier.trim()) return setErrorMsg("공급자를 입력해주세요.");
    if (!expirationDate) return setErrorMsg("유통기한을 입력해주세요.");
    try {
      await createMutation.mutateAsync({
        ingredientId: data.ingredientId,
        quantity: qty,
        baseUnit: data.unit || "kg",
        unitPrice: price,
        supplier: supplier.trim(),
        memo: memo.trim() || undefined,
      });
      // 발주 = 즉시 입고로 간주 (웹과 동일한 MVP 단순화)
      try {
        await createBatchMutation.mutateAsync({
          ingredientId: data.ingredientId,
          quantity: qty,
          costPerUnit: price || undefined,
          expirationDate,
        });
      } catch (e) {
        console.warn("발주는 등록됐지만 재고 자동 입고 실패:", e);
      }
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? `발주 저장 실패: ${err.message}` : "발주 저장에 실패했습니다.");
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="발주 추가" subtitle="방문한 사이트의 가격으로 발주를 기록합니다">
      <View style={{ backgroundColor: C.primarySoft, borderRadius: 12, padding: 14, gap: 6 }}>
        <Row k="재료" v={data.name} />
        {visited.sourceLabel ? <Row k="출처" v={visited.sourceLabel} /> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="수량 *">
            <Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" suffix={data.unit || "kg"} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="단가 *">
            <Input value={unitPrice} onChangeText={setUnitPrice} keyboardType="number-pad" suffix="원" />
          </Field>
        </View>
      </View>
      <Field label="공급자 *">
        <Input value={supplier} onChangeText={setSupplier} placeholder="예: 농협유통, 쿠팡" />
      </Field>
      <Field label="유통기한 *" hint="발주 즉시 재고에 자동 입고됩니다">
        <DateTimeField value={expirationDate} onChange={setExpirationDate} minimumDate={new Date()} />
      </Field>
      <Field label="메모 (선택)">
        <Input value={memo} onChangeText={setMemo} placeholder="배송 요청 사항 등" multiline style={{ minHeight: 60, textAlignVertical: "top" }} />
      </Field>
      <ErrorBox message={errorMsg} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <GradientButton title="취소" variant="outline" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
        <GradientButton title="발주 추가" onPress={confirm} loading={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: C.textSub, fontSize: 14 }}>{k}</Text>
      <Text style={{ color: C.text, fontWeight: "600", fontSize: 14 }}>{v}</Text>
    </View>
  );
}
