type QuoteActivityRecord = {
  status?: string;
  sentAt?: Date | null;
  clientDecision?: "accepted" | "changes_requested" | "rejected";
  paymentEvidence?: {
    url?: string;
    verificationStatus?: "pending_manual_confirmation" | "confirmed";
  };
  tanviStepChecks?: Record<string, boolean>;
  source?: string;
};

type ActivityItem = {
  label: string;
  tone: string;
};

const ACTIVITY_TONES = {
  email: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  attention: "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  manual: "border-violet-200 bg-violet-50 text-violet-700",
  tanvi: "border-cyan-200 bg-cyan-50 text-cyan-700",
} as const;

function getActivityItems(quote: QuoteActivityRecord) {
  const items: ActivityItem[] = [];

  if (quote.sentAt) {
    items.push({ label: "Email sent", tone: ACTIVITY_TONES.email });
  } else if (quote.status === "sent") {
    items.push({ label: "Admin · marked sent", tone: ACTIVITY_TONES.manual });
  }

  if (quote.clientDecision === "accepted") {
    items.push({ label: "Accepted by email", tone: ACTIVITY_TONES.accepted });
  } else if (quote.clientDecision === "changes_requested") {
    items.push({ label: "Changes requested by email", tone: ACTIVITY_TONES.attention });
  } else if (quote.clientDecision === "rejected") {
    items.push({ label: "Rejected by email", tone: ACTIVITY_TONES.rejected });
  } else if (quote.status === "approved") {
    items.push({ label: "Admin · approved manually", tone: ACTIVITY_TONES.manual });
  }

  if (quote.paymentEvidence?.url) {
    items.push({
      label: quote.paymentEvidence.verificationStatus === "confirmed"
        ? "Payment confirmed"
        : "Screenshot uploaded",
      tone: quote.paymentEvidence.verificationStatus === "confirmed"
        ? ACTIVITY_TONES.accepted
        : ACTIVITY_TONES.email,
    });
  }

  const tanviSteps = Object.values(quote.tanviStepChecks || {}).filter(Boolean).length;
  if (tanviSteps > 0) {
    items.push({
      label: `Tanvi · ${tanviSteps} step${tanviSteps === 1 ? "" : "s"}`,
      tone: ACTIVITY_TONES.tanvi,
    });
  } else if (quote.source === "Mo Admin" && !quote.sentAt && quote.status !== "approved" && quote.status !== "sent") {
    items.push({ label: "Admin · created manually", tone: ACTIVITY_TONES.manual });
  }

  return items;
}

export default function QuoteActivityStatus({ quote }: { quote: QuoteActivityRecord }) {
  const items = getActivityItems(quote);
  if (!items.length) {
    return (
      <div className="mt-2 flex">
        <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-semibold leading-none text-slate-500">
          Waiting for admin review
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quotation activity status">
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-semibold leading-none ${item.tone}`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
