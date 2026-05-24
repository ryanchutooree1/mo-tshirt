import { notFound } from "next/navigation";
import PartnerProductionPage from "@/components/admin/PartnerProductionPage";
import { getPrintPartnerById } from "@/lib/partner-registry";
import { isPrintPartnerId } from "@/lib/partners";

export default async function DynamicPartnerDeskPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  if (!isPrintPartnerId(partnerId)) notFound();

  const partner = await getPrintPartnerById(partnerId);
  if (!partner) notFound();

  return <PartnerProductionPage partnerId={partner.id} initialPartner={partner} />;
}
