import AdminWorkbench from "@/components/admin/workbench/AdminWorkbench";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";

export default async function AdminPage() {
  const session = await getAdminRequestSession();
  return <AdminWorkbench name={session?.displayName || "there"} canCreateSale={Boolean(session && hasAdminPageAccess(session.allowedPages, "/admin/pos", session))} />;
}
