import { cookies } from "next/headers";
import { readAdminSession } from "@/lib/admin-auth";
import {
  hasAdminApiAccess,
  hasAdminPageAccess,
} from "@/lib/admin-access";

export async function getAdminRequestSession() {
  return readAdminSession(await cookies());
}

export async function isAdminRequest(pathname?: string) {
  const session = await getAdminRequestSession();
  if (!session) return false;
  if (!pathname) return true;

  if (pathname.startsWith("/api/")) {
    return hasAdminApiAccess(session.allowedPages, pathname, {
      isOwner: session.isOwner,
    });
  }

  return hasAdminPageAccess(session.allowedPages, pathname, {
    isOwner: session.isOwner,
  });
}
