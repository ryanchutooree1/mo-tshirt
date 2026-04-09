import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://openapi.tuyaeu.com";
const TOKEN_REFRESH_WINDOW_MS = 60_000;

type SigningMode = "token" | "business";
type TuyaMethod = "GET" | "POST" | "PUT" | "DELETE";
type TuyaValue = boolean | number | string | null;

type TuyaEnvelope<T> = {
  success?: boolean;
  code?: string | number;
  msg?: string;
  result?: T;
  t?: number;
  tid?: string;
};

export type TuyaDeviceStatus = {
  code: string;
  value: TuyaValue;
  [key: string]: unknown;
};

export type TuyaDeviceSummary = {
  id: string;
  name: string;
  online: boolean | null;
  raw?: Record<string, unknown>;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type RequestOptions = {
  method: TuyaMethod;
  path: string;
  mode: SigningMode;
  accessToken?: string;
  body?: unknown;
};

let tokenCache: TokenCache | null = null;

function getBaseUrl() {
  return String(process.env.TUYA_BASE_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
}

function getClientId() {
  return String(process.env.TUYA_CLIENT_ID || process.env.TUYA_ACCESS_ID || "").trim();
}

function getClientSecret() {
  return String(process.env.TUYA_CLIENT_SECRET || process.env.TUYA_ACCESS_SECRET || "").trim();
}

function hasNonEmpty(value: string) {
  return value.length > 0;
}

function ensureKeys() {
  if (!hasTuyaKeys()) {
    throw new Error("Tuya keys missing. Set TUYA_CLIENT_ID and TUYA_CLIENT_SECRET.");
  }
}

function sha256Hex(content: string) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function hmacSha256Upper(input: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(input, "utf8")
    .digest("hex")
    .toUpperCase();
}

function toCanonicalPath(path: string) {
  const parsed = new URL(path, "https://tuya.local");
  const pathname = parsed.pathname;

  const sorted = Array.from(parsed.searchParams.entries()).sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });

  if (sorted.length === 0) {
    return pathname;
  }

  const query = sorted
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return `${pathname}?${query}`;
}

function toBodyString(body: unknown) {
  if (body === undefined || body === null) return "";
  return JSON.stringify(body);
}

function toSignString(method: TuyaMethod, bodyString: string, canonicalPath: string) {
  const bodyHash = sha256Hex(bodyString);
  return `${method}\n${bodyHash}\n\n${canonicalPath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(envelope: TuyaEnvelope<unknown> | null | undefined, fallback: string) {
  const code = envelope?.code !== undefined ? String(envelope.code) : "";
  const msg = typeof envelope?.msg === "string" ? envelope.msg : "";
  if (code || msg) {
    return [code, msg].filter(Boolean).join(": ");
  }
  return fallback;
}

function normalizeStatusArray(payload: unknown): TuyaDeviceStatus[] {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.status)
      ? payload.status
      : [];

  return source
    .filter((item) => isRecord(item) && typeof item.code === "string")
    .map((item) => ({
      ...item,
      code: String(item.code),
      value: (item.value as TuyaValue) ?? null,
    }));
}

function normalizeDevice(raw: unknown): TuyaDeviceSummary | null {
  if (!isRecord(raw)) return null;

  const id = String(raw.id ?? raw.device_id ?? raw.uuid ?? "").trim();
  if (!id) return null;

  const nameCandidate = raw.name ?? raw.custom_name ?? raw.product_name;
  const name = typeof nameCandidate === "string" && nameCandidate.trim()
    ? nameCandidate.trim()
    : `Device ${id.slice(-6)}`;

  let online: boolean | null = null;
  if (typeof raw.online === "boolean") online = raw.online;
  if (online === null && typeof raw.is_online === "boolean") online = raw.is_online;

  return { id, name, online, raw };
}

function extractDeviceList(result: unknown): TuyaDeviceSummary[] {
  const listCandidates: unknown[] = [];

  if (Array.isArray(result)) {
    listCandidates.push(...result);
  }

  if (isRecord(result)) {
    if (Array.isArray(result.list)) listCandidates.push(...result.list);
    if (Array.isArray(result.devices)) listCandidates.push(...result.devices);
    if (Array.isArray(result.rows)) listCandidates.push(...result.rows);
    if (Array.isArray(result.data)) listCandidates.push(...result.data);
  }

  const mapped = listCandidates
    .map((item) => normalizeDevice(item))
    .filter((item): item is TuyaDeviceSummary => Boolean(item));

  const deduped = new Map<string, TuyaDeviceSummary>();
  mapped.forEach((device) => {
    if (!deduped.has(device.id)) {
      deduped.set(device.id, device);
    }
  });

  return Array.from(deduped.values());
}

async function signedRequest<T>(options: RequestOptions): Promise<TuyaEnvelope<T>> {
  ensureKeys();

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const baseUrl = getBaseUrl();
  const canonicalPath = toCanonicalPath(options.path);
  const url = `${baseUrl}${canonicalPath}`;
  const bodyString = toBodyString(options.body);
  const stringToSign = toSignString(options.method, bodyString, canonicalPath);

  const timestamp = `${Date.now()}`;
  const nonce = crypto.randomUUID();

  const signPayload = options.mode === "business"
    ? `${clientId}${options.accessToken || ""}${timestamp}${nonce}${stringToSign}`
    : `${clientId}${timestamp}${nonce}${stringToSign}`;

  const sign = hmacSha256Upper(signPayload, clientSecret);

  const headers: Record<string, string> = {
    client_id: clientId,
    t: timestamp,
    sign_method: "HMAC-SHA256",
    sign,
    nonce,
  };

  if (options.mode === "business") {
    headers.access_token = options.accessToken || "";
  }

  if (bodyString) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: bodyString || undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown = null;

  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Tuya API returned non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const envelope = parsed as TuyaEnvelope<T>;
    throw new Error(toErrorMessage(envelope, `Tuya HTTP ${response.status}`));
  }

  return (parsed as TuyaEnvelope<T>) || {};
}

export function hasTuyaKeys() {
  return hasNonEmpty(getClientId()) && hasNonEmpty(getClientSecret());
}

export function getMissingTuyaEnvVars() {
  const missing: string[] = [];
  if (!hasNonEmpty(getClientId())) {
    missing.push("TUYA_CLIENT_ID (or TUYA_ACCESS_ID)");
  }
  if (!hasNonEmpty(getClientSecret())) {
    missing.push("TUYA_CLIENT_SECRET (or TUYA_ACCESS_SECRET)");
  }
  return missing;
}

export function getTuyaBaseUrl() {
  return getBaseUrl();
}

export function getTuyaProjectCode() {
  return String(process.env.TUYA_PROJECT_CODE || "").trim();
}

export function getConfiguredDeviceIds() {
  const raw = String(process.env.TUYA_DEVICE_IDS || "");
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function getAccessToken(forceRefresh = false) {
  ensureKeys();

  const now = Date.now();
  if (!forceRefresh && tokenCache && now < tokenCache.expiresAt - TOKEN_REFRESH_WINDOW_MS) {
    return tokenCache.accessToken;
  }

  const envelope = await signedRequest<{ access_token?: string; expire_time?: number; expires_in?: number }>({
    method: "GET",
    path: "/v1.0/token?grant_type=1",
    mode: "token",
  });

  if (!envelope.success || !envelope.result?.access_token) {
    throw new Error(toErrorMessage(envelope, "Failed to obtain Tuya access token."));
  }

  const expiresInSec = Number(envelope.result.expire_time || envelope.result.expires_in || 3600);
  tokenCache = {
    accessToken: envelope.result.access_token,
    expiresAt: Date.now() + Math.max(30, expiresInSec) * 1000,
  };

  return tokenCache.accessToken;
}

export async function tuyaBusinessRequest<T>(method: TuyaMethod, path: string, body?: unknown) {
  const token = await getAccessToken();

  let envelope = await signedRequest<T>({
    method,
    path,
    body,
    mode: "business",
    accessToken: token,
  });

  const code = String(envelope.code ?? "");
  const shouldRetry = !envelope.success && (code === "1010" || code === "1011");

  if (shouldRetry) {
    const refreshed = await getAccessToken(true);
    envelope = await signedRequest<T>({
      method,
      path,
      body,
      mode: "business",
      accessToken: refreshed,
    });
  }

  return envelope;
}

export async function listDevicesFromCloud() {
  const paths = [
    "/v1.0/devices?page_no=1&page_size=100",
    "/v1.0/devices",
    "/v1.0/iot-01/associated-users/devices?last_row_key=",
  ];

  const errors: string[] = [];

  for (const path of paths) {
    try {
      const envelope = await tuyaBusinessRequest<unknown>("GET", path);
      if (!envelope.success) {
        errors.push(toErrorMessage(envelope, `Failed to list devices via ${path}`));
        continue;
      }

      const devices = extractDeviceList(envelope.result);
      if (devices.length > 0 || path === paths[paths.length - 1]) {
        return devices;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown list devices error");
    }
  }

  throw new Error(errors.join(" | ") || "Unable to list Tuya devices from cloud API.");
}

export async function getDeviceDetail(deviceId: string) {
  const envelope = await tuyaBusinessRequest<Record<string, unknown>>("GET", `/v1.0/devices/${encodeURIComponent(deviceId)}`);
  if (!envelope.success) {
    throw new Error(toErrorMessage(envelope, `Failed to load device ${deviceId}.`));
  }
  return envelope.result || null;
}

export async function getDeviceStatus(deviceId: string) {
  const envelope = await tuyaBusinessRequest<unknown>("GET", `/v1.0/devices/${encodeURIComponent(deviceId)}/status`);
  if (!envelope.success) {
    throw new Error(toErrorMessage(envelope, `Failed to load status for ${deviceId}.`));
  }
  return normalizeStatusArray(envelope.result);
}

export async function sendDeviceCommand(
  deviceId: string,
  code: string,
  value: boolean | number | string
) {
  const payload = {
    commands: [{ code, value }],
  };

  const envelope = await tuyaBusinessRequest<Record<string, unknown>>(
    "POST",
    `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`,
    payload
  );

  if (!envelope.success) {
    throw new Error(toErrorMessage(envelope, `Failed to send command to ${deviceId}.`));
  }

  return envelope;
}
