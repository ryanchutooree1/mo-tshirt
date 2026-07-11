import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import TanviDeskPage from "@/components/admin/TanviDeskPage";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import {
  getPrintPartnerById,
  getProductionManager,
} from "@/lib/partner-registry";
import { isPrintPartnerId } from "@/lib/partners";

export default async function ProductionWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>;
}) {
  const cookieStore = await cookies();
  const [adminSession, partnerSession, manager, params] = await Promise.all([
    readAdminSession(cookieStore),
    readPartnerSession(cookieStore),
    getProductionManager(),
    searchParams,
  ]);

  if (partnerSession) {
    const partner = await getPrintPartnerById(partnerSession.partnerId);
    if (!partner) redirect("/login");
    return (
      <PartnerProductionPage
        partnerId={partner.id}
        initialPartner={partner}
        managerName={manager.name}
      />
    );
  }

  const requestedPartnerId = isPrintPartnerId(params.partner) ? params.partner : null;
  if (adminSession?.isOwner && requestedPartnerId) {
    const partner = await getPrintPartnerById(requestedPartnerId);
    if (partner) {
      return (
        <PartnerProductionPage
          partnerId={partner.id}
          initialPartner={partner}
          managerName={manager.name}
        />
      );
    }
  }

  if (
    adminSession &&
    (adminSession.isOwner || adminSession.allowedPages.includes("/admin/tanvi"))
  ) {
    return <TanviDeskPage />;
  }

  if (requestedPartnerId) {
    const partner = await getPrintPartnerById(requestedPartnerId);
    if (partner) {
      return (
        <PartnerProductionPage
          partnerId={partner.id}
          initialPartner={partner}
          managerName={manager.name}
        />
      );
    }
  }

  redirect("/login?next=%2Fadmin%2Fworkspace");
}
