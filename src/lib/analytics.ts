"use client";

type AnalyticsPrimitive = string | number | boolean;

type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;

const TRACKING_ENDPOINT = "/api/analytics/track";
const TRACKING_SESSION_KEY = "website-tracking-session-id";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function sanitizeParams(params: AnalyticsParams = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function getTrackingSessionId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.sessionStorage.getItem(TRACKING_SESSION_KEY);
    if (existing) return existing;

    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(TRACKING_SESSION_KEY, created);
    return created;
  } catch {
    return "";
  }
}

function sendToFirstParty(name: string, params: AnalyticsParams = {}) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    name,
    params: sanitizeParams(params),
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || "",
    sessionId: getTrackingSessionId(),
    clientTimestamp: new Date().toISOString(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(TRACKING_ENDPOINT, blob)) {
        return;
      }
    }
  } catch {}

  void fetch(TRACKING_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (typeof window === "undefined") return;

  const cleanParams = sanitizeParams(params);
  sendToFirstParty(name, cleanParams);
  window.gtag?.("event", name, cleanParams);
}

export function trackPageView(path: string) {
  if (typeof window === "undefined") return;

  const pagePath = path || window.location.pathname;

  trackEvent("page_view", {
    page_location: `${window.location.origin}${pagePath}`,
    page_path: pagePath,
    page_title: document.title,
  });
}

export function trackWhatsAppClick(params: AnalyticsParams = {}) {
  trackEvent("whatsapp_click", params);
}

export function trackQuoteSubmit(params: AnalyticsParams = {}) {
  trackEvent("generate_lead", params);
}

export function trackServicePageView(params: AnalyticsParams = {}) {
  trackEvent("service_page_view", params);
}

export function trackShopOrderSubmit(params: AnalyticsParams = {}) {
  trackEvent("shop_order_submit", params);
}
