import { redirect } from "next/navigation";
import { getAdminRequestSession } from "@/lib/admin-request";
import BotTestingWorkspace from "@/components/admin/BotTestingWorkspace";

export const dynamic = "force-dynamic";

export default async function BotTestingPage() {
  const session = await getAdminRequestSession();
  if (!session) redirect("/login?next=%2Fadmin%2Fbot-testing");
  if (!session.isOwner) redirect("/admin?denied=1");
  return <BotTestingWorkspace key={session.userId} accountId={session.userId} />;
}
