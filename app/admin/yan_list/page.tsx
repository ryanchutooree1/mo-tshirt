import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import { getPrintPartnerById } from "@/lib/partner-registry";

export default async function YanListPage() {
  const partner = await getPrintPartnerById("yan");
  return <PartnerProductionPage partnerId="yan" initialPartner={partner} />;
}
