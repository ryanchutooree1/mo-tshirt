export function isOpenClawEnabled() {
  const value = String(process.env.OPENCLAW_ENABLED || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
