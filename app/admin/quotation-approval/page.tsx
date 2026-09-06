"use client";

import Link from "next/link";
import QuoteEditorPage from "@/components/admin/QuoteEditorPage";

export default function QuotationApprovalPage() {
  return <><div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>Client emails become quotes automatically when their details are complete.</span><Link className="font-semibold" href="/admin/inbox/enquiries">Email enquiries →</Link></div><QuoteEditorPage /></>;
}
