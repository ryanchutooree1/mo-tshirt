import { notFound, redirect } from "next/navigation";
import { isPrintPartnerId } from "@/lib/partners";

export default async function DynamicPartnerDeskPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  if (!isPrintPartnerId(partnerId)) notFound();

  redirect(`/admin/workspace?partner=${encodeURIComponent(partnerId)}`);
}
