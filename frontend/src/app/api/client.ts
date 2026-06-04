import { authStorage } from "../lib/auth-storage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** 명시 토큰. 없으면 authStorage의 accessToken 자동 사용 */
  token?: string;
  /** 인증 헤더 강제 비활성화 (예: 로그인/회원가입) */
  skipAuth?: boolean;
}

interface InternalOptions extends RequestOptions {
  body?: BodyInit | null;
}

function buildHeaders(options: RequestOptions, hasJsonBody: boolean): HeadersInit {
  const headers = new Headers(options.headers ?? {});

  if (hasJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth) {
    const token = options.token ?? authStorage.getAccessToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return headers;
}

function handleUnauthorized(): void {
  authStorage.clear();
  if (typeof window === "undefined") return;
  // 이미 로그인 화면이면 무한 리다이렉트 방지
  if (window.location.pathname === "/") return;
  window.location.href = "/";
}

async function request<T>(
  path: string,
  options: InternalOptions = {},
): Promise<T> {
  const { token: _token, skipAuth: _skipAuth, headers: _headers, body, ...rest } = options;
  const hasJsonBody = typeof body === "string" && body.length > 0;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    body,
    headers: buildHeaders(options, hasJsonBody),
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized (401)");
  }

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${message || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : null,
    }),

  put: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : null,
    }),

  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

/**
 * Excel 등 바이너리 파일 다운로드용. JSON wrap 없이 raw Blob 반환.
 */
export async function fetchBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: buildHeaders(options, false),
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized (401)");
  }
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.blob();
}

/**
 * Blob을 받아 브라우저에서 파일 다운로드 트리거.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
