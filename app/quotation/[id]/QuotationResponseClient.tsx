"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ChevronDown, FileImage, FileText, History, LoaderCircle, MessageSquareText, X, XCircle } from "lucide-react";
import type { QuoteResponseAction } from "@/lib/quote-response-links";

type QuoteResponseHistoryEntry = {
  id: string;
  action: QuoteResponseAction;
  comment: string;
  submittedAtIso: string;
  paymentEvidence?: {
    url: string;
    filename: string;
    contentType?: string;
  };
};

type AttachmentPreview = {
  url: string;
  filename: string;
  kind: "image" | "pdf";
};

type QuoteSummary = {
  clientName: string;
  documentNumber: string;
  currency: string;
  total: number | null;
  amountReceived: number;
  currentDecision: string;
  responseHistory: QuoteResponseHistoryEntry[];
  quotationDocument?: {
    url: string;
    filename: string;
    contentType: string;
  };
};

type Props = {
  quoteId: string;
  action: QuoteResponseAction | "";
  expires: string;
  token: string;
};

const ACTION_COPY = {
  accept: {
    title: "Accept quotation",
    description: "Upload your payment screenshot to confirm your order.",
    icon: CheckCircle2,
    tone: "text-emerald-700 bg-emerald-50",
  },
  changes: {
    title: "Request changes",
    description: "Tell us what you would like us to update in the quotation.",
    icon: MessageSquareText,
    tone: "text-amber-700 bg-amber-50",
  },
  reject: {
    title: "Reject quotation",
    description: "Please share a short reason so we can improve our offer.",
    icon: XCircle,
    tone: "text-red-700 bg-red-50",
  },
} as const;

export default function QuotationResponseClient({ quoteId, action, expires, token }: Props) {
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const actionCopy = action ? ACTION_COPY[action] : null;

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ action, expires, token });
    return `/api/quotes/${encodeURIComponent(quoteId)}/respond?${params}`;
  }, [action, expires, quoteId, token]);

  useEffect(() => {
    let active = true;
    fetch(apiUrl, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load this quotation.");
        if (active) setQuote(body.quote);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load this quotation."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [apiUrl]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const form = new FormData(event.currentTarget);
      form.set("action", action);
      form.set("expires", expires);
      form.set("token", token);

      if (action === "accept") {
        const file = form.get("paymentScreenshot");
        if (!(file instanceof File) || !file.size) throw new Error("Please select your payment screenshot.");
      }

      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/respond`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save your response.");
      if (body.quote) setQuote(body.quote);
      setSuccess(body.message || (action === "changes" ? "Your change request was sent." : "Your response was saved."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your response.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage icon={<LoaderCircle className="h-7 w-7 animate-spin" />} text="Loading quotation…" />;
  if (error && !quote) return <CenteredMessage icon={<XCircle className="h-8 w-8 text-red-600" />} text={error} />;
  if (!quote || !actionCopy) return <CenteredMessage icon={<XCircle className="h-8 w-8 text-red-600" />} text="This quotation link is invalid." />;

  const Icon = actionCopy.icon;
  const balance = quote.total === null ? null : Math.max(0, quote.total - quote.amountReceived);

  return (
    <main className="min-h-screen bg-[#f5f3ef] px-4 py-10 text-[#171717] sm:py-16">
      <div className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-[0_20px_70px_rgba(40,30,15,0.12)]">
        <header className="border-b border-black/8 px-6 py-5 sm:px-9">
          <div>
            <Image
              src="/logo_transparent.webp"
              alt="MO T-SHIRT Business Printing"
              width={230}
              height={78}
              priority
              className="h-12 w-auto sm:h-14"
            />
            <p className="mt-1 text-xs font-medium text-black/55">Quotation response</p>
          </div>
        </header>

        <section className="px-6 py-8 sm:px-9">
          <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${actionCopy.tone}`}><Icon className="h-6 w-6" /></div>
          <p className="mb-1 text-sm text-black/55">Hello {quote.clientName || "there"}</p>
          <h1 className="text-3xl font-bold tracking-tight">{actionCopy.title}</h1>

          <div className="my-7 grid grid-cols-2 gap-3 rounded-2xl bg-[#f7f7f5] p-4 text-sm">
            <div><p className="text-black/45">Quotation</p><p className="mt-1 font-semibold">{quote.documentNumber || quoteId.slice(-8).toUpperCase()}</p></div>
            <div><p className="text-black/45">{action === "accept" ? "Balance to pay" : "Total"}</p><p className="mt-1 font-semibold">{balance === null ? "See attached PDF" : `${quote.currency} ${balance.toLocaleString("en-MU", { minimumFractionDigits: 2 })}`}</p></div>
          </div>

          {quote.quotationDocument?.url ? (
            <section className="mb-7 overflow-hidden rounded-2xl border border-black/10 bg-[#f7f7f5]">
              <button
                type="button"
                onClick={() => setQuotationOpen((open) => !open)}
                aria-expanded={quotationOpen}
                aria-controls="quotation-pdf-preview"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-black/10"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">Quotation PDF · {quote.quotationDocument.filename}</span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm" aria-hidden="true">
                  <ChevronDown className={`h-4 w-4 transition-transform ${quotationOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {quotationOpen ? (
                <iframe
                  id="quotation-pdf-preview"
                  src={quote.quotationDocument.url}
                  title={`Quotation PDF ${quote.quotationDocument.filename}`}
                  className="h-[520px] w-full border-0 border-t border-black/10 bg-white"
                />
              ) : null}
            </section>
          ) : null}

          {quote.responseHistory.length ? (
            <section className="mb-7 rounded-2xl border border-black/10 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-black/45" />
                <h2 className="text-sm font-bold">Previous responses and uploads</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-black/50">
                All three quotation links share this history. Your newest response becomes the current one without deleting earlier actions.
              </p>
              <div className="mt-4 space-y-3">
                {[...quote.responseHistory].reverse().map((entry, index) => {
                  const entryCopy = ACTION_COPY[entry.action];
                  const EntryIcon = entryCopy.icon;
                  return (
                    <div key={entry.id || `${entry.action}-${entry.submittedAtIso}-${index}`} className="rounded-xl bg-[#f7f7f5] p-3.5">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${entryCopy.tone}`}>
                          <EntryIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <p className="text-sm font-semibold">{entryCopy.title}</p>
                            <p className="text-[11px] text-black/45">
                              {formatResponseDate(entry.submittedAtIso)}
                            </p>
                          </div>
                          {entry.comment ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/60">{entry.comment}</p> : null}
                          {entry.paymentEvidence?.url ? (
                            <button
                              type="button"
                              onClick={() => setAttachmentPreview({
                                url: entry.paymentEvidence!.url,
                                filename: entry.paymentEvidence!.filename || "Payment screenshot",
                                kind: "image",
                              })}
                              className="mt-3 block w-full overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:border-black/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
                            >
                              <span className="relative block h-72 w-full bg-[#efefec]">
                                <Image
                                  src={entry.paymentEvidence.url}
                                  alt={entry.paymentEvidence.filename || "Payment screenshot"}
                                  fill
                                  unoptimized
                                  sizes="(max-width: 640px) calc(100vw - 112px), 440px"
                                  className="object-contain"
                                />
                              </span>
                              <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-black">
                                <FileImage className="h-3.5 w-3.5" />
                                {entry.paymentEvidence.filename || "Payment screenshot"} · Tap to enlarge
                              </span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <p className="mb-5 text-sm leading-6 text-black/60">{actionCopy.description}</p>

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Response received</p><p className="mt-1 text-sm leading-6">{success}</p></div></div>
              <button type="button" onClick={() => setSuccess("")} className="mt-4 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100">
                Submit another {action === "accept" ? "payment screenshot" : "response"}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {action === "accept" ? (
                <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-black/15 p-6 text-center transition hover:border-black/35">
                  <FileImage className="mx-auto h-8 w-8 text-black/45" />
                  <span className="mt-3 block text-sm font-semibold">Upload payment screenshot</span>
                  <span className="mt-1 block text-xs text-black/45">JPG, PNG or WebP · maximum 8 MB</span>
                  <input name="paymentScreenshot" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-4 block w-full text-xs" />
                </label>
              ) : (
                <label className="block text-sm font-semibold">
                  {action === "changes" ? "What should we change?" : "Reason for rejection"}
                  <textarea name="comment" required rows={5} maxLength={4000} className="mt-2 w-full resize-y rounded-xl border border-black/15 px-4 py-3 font-normal outline-none focus:border-black/45" placeholder={action === "changes" ? "Example: Please change the quantity to 50…" : "Please share a short reason…"} />
                </label>
              )}

              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-wait disabled:opacity-55 ${
                  action === "reject"
                    ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-200"
                    : "bg-black hover:bg-black/85 focus-visible:ring-black/20"
                }`}
              >
                {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {submitting ? "Submitting…" : action === "accept" ? "Accept and send payment proof" : action === "changes" ? "Send change request" : "Reject quotation"}
              </button>
              {action === "accept" && <p className="text-center text-xs leading-5 text-black/45">Submit your screenshot only. MO T-SHIRT will check the payment details in the admin system.</p>}
            </form>
          )}
        </section>
      </div>
      {attachmentPreview ? (
        <AttachmentPreviewDialog
          attachment={attachmentPreview}
          onClose={() => setAttachmentPreview(null)}
        />
      ) : null}
    </main>
  );
}

function AttachmentPreviewDialog({
  attachment,
  onClose,
}: {
  attachment: AttachmentPreview;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Preview ${attachment.filename}`}>
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close attachment preview" />
      <div className="relative flex h-[min(90vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-3 sm:px-5">
          <p className="min-w-0 truncate text-sm font-bold">{attachment.filename}</p>
          <button type="button" onClick={onClose} autoFocus className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-black/75" aria-label="Close preview">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#efefec]">
          {attachment.kind === "pdf" ? (
            <iframe src={attachment.url} title={attachment.filename} className="h-full w-full border-0" />
          ) : (
            <Image src={attachment.url} alt={attachment.filename} fill unoptimized sizes="100vw" className="object-contain p-2 sm:p-4" />
          )}
        </div>
      </div>
    </div>
  );
}

function formatResponseDate(value: string) {
  if (!value) return "Previous response";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previous response";
  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CenteredMessage({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f3ef] px-5"><div className="max-w-md rounded-3xl bg-white p-9 text-center shadow-xl"><div className="mb-4 flex justify-center">{icon}</div><p className="text-sm leading-6 text-black/65">{text}</p></div></main>;
}
