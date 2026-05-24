import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import {
  getPrintPartnerById,
  getProductionManager,
} from "@/lib/partner-registry";

export default async function YanListPage() {
  const [partner, manager] = await Promise.all([
    getPrintPartnerById("yan"),
    getProductionManager(),
  ]);
  return (
    <PartnerProductionPage
      partnerId="yan"
      initialPartner={partner}
      managerName={manager.name}
    />
  );
}
