"use client";

import { isLocalTrackingHost } from "@/lib/tracking-insights";

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

export function getTrackingSessionId() {
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

  if (isLocalTrackingHost(window.location.hostname) || window.location.pathname.startsWith("/admin") || window.location.pathname === "/login") return;
  const cleanParams = sanitizeParams({ ...getTrafficAttribution(), ...params });
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

export function getTrafficAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem("website-tracking-attribution");
    if (saved) return JSON.parse(saved);
    const query = new URLSearchParams(window.location.search);
    let referrer = "";
    try { referrer = new URL(document.referrer).hostname; } catch {}
    const attribution = {
      traffic_source: (query.get("utm_source") || (referrer && referrer !== location.hostname ? referrer : "Direct")).slice(0, 120),
      traffic_medium: (query.get("utm_medium") || "").slice(0, 120),
      traffic_campaign: (query.get("utm_campaign") || "").slice(0, 120),
    };
    sessionStorage.setItem("website-tracking-attribution", JSON.stringify(attribution));
    return attribution;
  } catch { return { traffic_source: "Unknown" }; }
}

export function trackProductInterest(productId: string, productName: string) {
  try {
    const key = `product-interest:${productId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {}
  trackEvent('product_interest', { product_id: productId, product_name: productName });
}
