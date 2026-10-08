// mobile/src/lib/notifications.ts
// FCM 기기 토큰 등록 + 알림 수신/탭 처리
// 백엔드는 FCM으로 직접 발송하므로 Expo Push Token이 아니라 getDevicePushTokenAsync()의 FCM 토큰을 등록한다.

import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { updateFcmToken } from "../api/users";
import { authStorage } from "./auth-storage";

// 앱이 켜져 있을 때(포그라운드)도 배너 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = "default";

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "기본 알림",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** 로그인 직후 + 앱 시작 시(로그인 상태) 호출 */
export async function registerFcmToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[FCM] 에뮬레이터/웹은 건너뜀");
    return null;
  }
  if (!authStorage.isAuthenticated()) return null;

  await ensureAndroidChannel(); // Android 13+는 채널이 있어야 권한 팝업이 뜸
  if (!(await ensurePermission())) {
    console.log("[FCM] 알림 권한 거부됨");
    return null;
  }

  const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
  console.log("[FCM] token", fcmToken); // Firebase 콘솔 테스트 메시지용으로 복사
  await updateFcmToken(fcmToken);
  return fcmToken;
}

/** 알림 data → 이동할 화면 (백엔드에 data 추가되면 자동으로 상세 이동) */
function routeFromNotification(data: Record<string, unknown> | undefined) {
  const ingredientId = data?.ingredientId;
  if (ingredientId) {
    router.push(`/lowest-price/${ingredientId}`);
    return;
  }
  // 현재 백엔드 알림은 매수 신호뿐이고 data가 없으므로 발주 탭으로
  router.push("/order");
}

/** 루트 레이아웃에서 1회 호출. 반환값은 cleanup 함수 */
export function setupNotificationListeners(): () => void {
  // 토큰이 바뀌면 재등록
  const tokenSub = Notifications.addPushTokenListener(({ data }) => {
    if (authStorage.isAuthenticated()) updateFcmToken(String(data)).catch(() => {});
  });

  // 알림 탭 (앱이 켜져 있거나 백그라운드일 때)
  const responseSub = Notifications.addNotificationResponseReceivedListener((res) => {
    routeFromNotification(res.notification.request.content.data);
  });

  // 앱이 종료된 상태에서 알림 탭으로 실행된 경우
  Notifications.getLastNotificationResponseAsync().then((res) => {
    if (res) routeFromNotification(res.notification.request.content.data);
  });

  return () => {
    tokenSub.remove();
    responseSub.remove();
  };
}
