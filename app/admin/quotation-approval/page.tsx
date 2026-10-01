import PrintJobWorkspace from "@/components/admin/print-jobs/PrintJobWorkspace";
export default async function QuotationApprovalPage({ searchParams }: { searchParams: Promise<{ quoteId?: string; setup?: string }> }) {
  const { quoteId, setup } = await searchParams;
  return <PrintJobWorkspace requestedQuoteId={typeof quoteId === "string" ? quoteId : undefined} openSetup={setup === "handoff"} />;
}
