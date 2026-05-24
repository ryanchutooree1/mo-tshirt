import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import { getPrintPartnerById } from "@/lib/partner-registry";

export default async function ShabbanazListPage() {
  const partner = await getPrintPartnerById("shabanaz");
  return <PartnerProductionPage partnerId="shabanaz" initialPartner={partner} />;
}
