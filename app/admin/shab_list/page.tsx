import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import {
  getPrintPartnerById,
  getProductionManager,
} from "@/lib/partner-registry";

export default async function ShabbanazListPage() {
  const [partner, manager] = await Promise.all([
    getPrintPartnerById("shabanaz"),
    getProductionManager(),
  ]);
  return (
    <PartnerProductionPage
      partnerId="shabanaz"
      initialPartner={partner}
      managerName={manager.name}
    />
  );
}
