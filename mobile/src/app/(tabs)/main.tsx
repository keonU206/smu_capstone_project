import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { authStorage } from "../../lib/auth-storage";
import { PurchaseSummaryCard } from "../../components/PurchaseSummaryCard";
import { C } from "../../components/theme";
import { Card, IconTile, Screen, s, type IconName } from "../../components/ui";

export default function MainScreen() {
  const qc = useQueryClient();
  const username = authStorage.getUsername();

  const logout = () =>
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: () => {
          authStorage.clear();
          qc.clear();
          router.replace("/login");
        },
      },
    ]);

  return (
    <Screen
      refreshing={false}
      onRefresh={() => qc.invalidateQueries({ queryKey: ["purchase-summary"] })}
    >
      <View style={[s.rowBetween, { alignItems: "center", marginBottom: 16 }]}>
        <Text style={{ fontSize: 15, color: C.textSub }}>
          {username ? `${username} 사장님, 안녕하세요 👋` : "안녕하세요 👋"}
        </Text>
        <Pressable onPress={logout} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="log-out-outline" size={18} color={C.textSub} />
          <Text style={{ color: C.textSub }}>로그아웃</Text>
        </Pressable>
      </View>

      <PurchaseSummaryCard />

      <View style={{ gap: 12 }}>
        <ServiceCard icon="pricetag-outline" title="최저가 페이지" desc="최저가 상품을 확인하세요" onPress={() => router.navigate("/lowest-price")} />
        <ServiceCard icon="cube-outline" title="재고 관리" desc="입고 등록과 잔여 재고 확인" onPress={() => router.navigate("/inventory")} />
        <ServiceCard icon="clipboard-outline" title="발주 페이지" desc="재고 부족 상품과 발주 기록" onPress={() => router.navigate("/order")} />
      </View>
    </Screen>
  );
}

function ServiceCard({ icon, title, desc, onPress }: { icon: IconName; title: string; desc: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ padding: 18 }}>
      <View style={[s.row, { gap: 14 }]}>
        <IconTile name={icon} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 19, fontWeight: "700", color: C.text }}>{title}</Text>
          <Text style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>{desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.textMute} />
      </View>
    </Card>
  );
}
