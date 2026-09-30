import { router } from "expo-router";
import { authStorage } from "../lib/auth-storage";
import { getApiBaseUrl } from "../lib/config";
import { queryClient } from "../lib/query-client";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  token?: string;
  skipAuth?: boolean;
  /** ms, 기본 15초 */
  timeoutMs?: number;
}

interface InternalOptions extends RequestOptions {
  body?: BodyInit | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function authHeaders(options: RequestOptions = {}): Record<string, string> {
  if (options.skipAuth) return {};
  const token = options.token ?? authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(): void {
  authStorage.clear();
  queryClient.clear();
  try {
    router.replace("/login");
  } catch {
    /* 라우터 준비 전 */
  }
}

async function request<T>(path: string, options: InternalOptions = {}): Promise<T> {
  const { token: _t, skipAuth: _s, headers: _h, body, timeoutMs = 15_000, ...rest } = options;
  const hasJsonBody = typeof body === "string" && body.length > 0;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
    ...authHeaders(options),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...rest,
      body,
      headers,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      `서버에 연결할 수 없습니다 (${getApiBaseUrl()}). 서버 주소와 와이파이를 확인해 주세요.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    if (!options.skipAuth) handleUnauthorized();
    throw new ApiError(401, "Unauthorized (401)");
  }

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `API ${res.status}: ${message || res.statusText}`);
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
      body: body === undefined ? null : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: body === undefined ? null : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body === undefined ? null : JSON.stringify(body),
    }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
