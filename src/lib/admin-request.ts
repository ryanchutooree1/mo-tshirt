import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/admin-auth";

export async function isAdminRequest() {
  return hasAdminSession(await cookies());
}
