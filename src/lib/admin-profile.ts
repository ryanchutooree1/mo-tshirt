export type AdminProfile = {
  displayName: string;
  headline: string;
  location: string;
  bio: string;
  avatarDataUrl: string | null;
  avatarZoom: number;
  avatarOffsetX: number;
  avatarOffsetY: number;
};

export const ADMIN_PROFILE_LIMITS = {
  displayName: 80,
  headline: 100,
  location: 100,
  bio: 240,
  avatarDataUrl: 650_000,
} as const;

function cleanText(value: unknown, fallback: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") return fallback.slice(0, maxLength);
  const cleaned = value.trim().replace(/\s+/g, " ");
  return (allowEmpty ? cleaned : cleaned || fallback).slice(0, maxLength);
}

function cleanMultilineText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n/g, "\n").slice(0, maxLength);
}

function finiteNumber(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function clampProfileNumber(value: unknown, min: number, max: number, fallback: number) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

export function defaultAdminProfile(input: {
  displayName: string;
  isOwner: boolean;
}): AdminProfile {
  return {
    displayName: input.isOwner ? "Ryan Chutooree" : input.displayName || "Administrator",
    headline: input.isOwner ? "Founder & Administrator" : "Administrator",
    location: "Mauritius",
    bio: "",
    avatarDataUrl: null,
    avatarZoom: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
  };
}

export function normalizeAdminProfile(
  value: unknown,
  fallback: AdminProfile
): AdminProfile {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawAvatar = typeof record.avatarDataUrl === "string" ? record.avatarDataUrl : "";
  const avatarDataUrl =
    /^data:image\/(?:jpeg|png|webp);base64,/i.test(rawAvatar) &&
    rawAvatar.length <= ADMIN_PROFILE_LIMITS.avatarDataUrl
      ? rawAvatar
      : null;

  return {
    displayName: cleanText(record.displayName, fallback.displayName, ADMIN_PROFILE_LIMITS.displayName),
    headline: cleanText(record.headline, fallback.headline, ADMIN_PROFILE_LIMITS.headline, true),
    location: cleanText(record.location, fallback.location, ADMIN_PROFILE_LIMITS.location, true),
    bio: cleanMultilineText(record.bio, ADMIN_PROFILE_LIMITS.bio),
    avatarDataUrl,
    avatarZoom: clampProfileNumber(record.avatarZoom, 1, 3, fallback.avatarZoom),
    avatarOffsetX: clampProfileNumber(record.avatarOffsetX, -35, 35, fallback.avatarOffsetX),
    avatarOffsetY: clampProfileNumber(record.avatarOffsetY, -35, 35, fallback.avatarOffsetY),
  };
}
