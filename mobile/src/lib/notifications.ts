// FCM 기기 토큰 등록 + 알림 수신/탭 처리
// 백엔드는 Firebase Admin으로 직접 발송하므로 Expo Push Token이 아니라
// getDevicePushTokenAsync()의 FCM 기기 토큰을 PATCH /api/users/fcm-token 으로 등록한다.
//
// 서버 data 계약 (원본 백엔드 docs/handoff/API_CONTRACT.md §5)
//   {"notificationId":"77","type":"UPLOAD"|"OPENING","businessDate":"2026-10-08","route":"closing"}
// 서버는 최소 한 번 전달이라 같은 notificationId가 여러 번 올 수 있음 → 앱에서 중복 방어.

import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { updateFcmToken } from "../api/users";
import type { PushData } from "../types/notification";
import { authStorage } from "./auth-storage";
import { storage } from "./storage";

const CHANNEL_ID = "default";
const SEEN_LIMIT = 100;

// ── 중복 방어: 처리한 notificationId 기록 ─────────────────────────────
// received: 포그라운드에서 이미 배너를 띄운 ID / opened: 이미 탭해서 화면 이동한 ID
type Seen = { received: string[]; opened: string[] };

function readSeen(): Seen {
  try {
    const raw = storage.get("handled_notification_ids");
    const v = raw ? (JSON.parse(raw) as Partial<Seen>) : {};
    return { received: v.received ?? [], opened: v.opened ?? [] };
  } catch {
    return { received: [], opened: [] };
  }
}

/** 처음 보는 ID면 기록하고 true, 이미 처리했으면 false */
function markOnce(kind: keyof Seen, id: string | undefined): boolean {
  if (!id) return true; // ID 없는 알림(콘솔 테스트 메시지 등)은 항상 처리
  const seen = readSeen();
  if (seen[kind].includes(id)) return false;
  seen[kind] = [...seen[kind], id].slice(-SEEN_LIMIT);
  storage.set("handled_notification_ids", JSON.stringify(seen));
  return true;
}

function pushData(n: Notifications.Notification): PushData {
  return (n.request.content.data ?? {}) as PushData;
}

// 앱이 켜져 있을 때(포그라운드) 표시 여부 — 같은 notificationId 재수신이면 숨김
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = markOnce("received", pushData(n).notificationId);
    return {
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      shouldSetBadge: false,
    };
  },
});

// ── 토큰 등록 ─────────────────────────────────────────────────────────
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

// ── 탭 → 화면 이동 ────────────────────────────────────────────────────
function openFromNotification(data: PushData) {
  if (!markOnce("opened", data.notificationId)) return; // 같은 알림 두 번 이동 방지
  if (!authStorage.isAuthenticated()) {
    router.push("/login");
    return;
  }
  if (data.notificationId && (data.route === "closing" || data.type)) {
    // 알림 상세(발송 당시 판단 스냅샷) → 지금 기준 판단은 상세에서 발주 화면으로
    router.push(`/notification/${data.notificationId}`);
    return;
  }
  // notificationId 없는 알림(콘솔 테스트 등)은 발주 탭으로
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
    openFromNotification(pushData(res.notification));
  });

  // 앱이 종료된 상태에서 알림 탭으로 실행된 경우
  Notifications.getLastNotificationResponseAsync().then((res) => {
    if (res) openFromNotification(pushData(res.notification));
  });

  return () => {
    tokenSub.remove();
    responseSub.remove();
  };
}
