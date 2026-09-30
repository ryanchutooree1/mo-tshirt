import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LegacyExecutionWorkspace from "@/components/admin/aura/LegacyExecutionWorkspace";

export default function SavedWorkPage() {
  return (
    <>
      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <Link
          href="/admin/x5-execution"
          className="inline-flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft size={16} /> Back to Aura Farming
        </Link>
        <p className="mt-2 text-sm">
          Your earlier Execution projects and Freedom Plan are preserved here.
          This workspace keeps its original storage and workflow.
        </p>
      </div>
      <LegacyExecutionWorkspace />
    </>
  );
}
