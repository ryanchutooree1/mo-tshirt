export type CoupleShiftKey = "first" | "second" | "third" | "m" | "rest";

export const COUPLE_SHIFT_PATTERN: CoupleShiftKey[] = [
  "first",
  "third",
  "m",
  "second",
  "first",
  "third",
  "second",
  "rest",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyToUtcTime(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getCoupleRotationShift(
  dateKey: string,
  rotationStartDate: string
): CoupleShiftKey {
  const diff = Math.floor(
    (dateKeyToUtcTime(dateKey) - dateKeyToUtcTime(rotationStartDate)) / DAY_MS
  );
  const index =
    ((diff % COUPLE_SHIFT_PATTERN.length) + COUPLE_SHIFT_PATTERN.length) %
    COUPLE_SHIFT_PATTERN.length;
  return COUPLE_SHIFT_PATTERN[index];
}
