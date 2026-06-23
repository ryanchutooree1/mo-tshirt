import type { AdminPagePath } from "@/lib/admin-access";

export const PRODUCTION_MANAGER_PATH = "/admin/tanvi" satisfies AdminPagePath;
export const PRODUCTION_MANAGER_ALLOWED_PAGES: AdminPagePath[] = [
  PRODUCTION_MANAGER_PATH,
  "/admin/quotation-approval",
];

function getProductionManagerPassword() {
  return process.env.PRODUCTION_MANAGER_PASSWORD?.trim() || "";
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export function verifyProductionManagerPassword(password: string) {
  const expected = getProductionManagerPassword();
  if (!expected || !password) return false;
  return constantTimeEqual(password, expected);
}
