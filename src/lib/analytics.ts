"use client";

type AnalyticsPrimitive = string | number | boolean;

type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;

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

function canTrack() {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (!canTrack()) return;
  window.gtag?.("event", name, sanitizeParams(params));
}

export function trackPageView(path: string) {
  if (!canTrack() || typeof window === "undefined") return;

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
