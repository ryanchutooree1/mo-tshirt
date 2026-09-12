import { getAdminRequestSession } from "@/lib/admin-request";
import WhatsAppInsightsPage from "@/components/admin/WhatsAppInsightsPage";

export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) return <main className="p-8"><h1 className="text-2xl font-semibold">WhatsApp insights</h1><p className="mt-3">This dashboard is available to the website owner only.</p></main>;
  return <WhatsAppInsightsPage />;
}
