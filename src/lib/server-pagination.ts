export type TimelineCursor = {
  timestamp: string;
  id: string;
};

export function parsePageSize(
  value: string | null,
  fallback = 20,
  maximum = 50
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function encodeTimelineCursor(cursor: TimelineCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTimelineCursor(value: string | null) {
  if (!value || value.length > 500) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<TimelineCursor>;
    const timestamp =
      typeof parsed.timestamp === "string" ? parsed.timestamp.trim() : "";
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const date = new Date(timestamp);

    if (
      !timestamp ||
      timestamp.length > 80 ||
      !id ||
      id.length > 180 ||
      Number.isNaN(date.getTime())
    ) {
      return null;
    }

    return { timestamp, id } satisfies TimelineCursor;
  } catch {
    return null;
  }
}
