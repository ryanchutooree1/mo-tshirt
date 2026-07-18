"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CheckCircle2, FileImage, LoaderCircle, MessageSquareText, XCircle } from "lucide-react";
import type { QuoteResponseAction } from "@/lib/quote-response-links";

type QuoteSummary = {
  clientName: string;
  documentNumber: string;
  currency: string;
  total: number | null;
  amountReceived: number;
  currentDecision: string;
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
          <div className="flex items-center gap-3">
            <Image src="/icon.png" alt="MO T-SHIRT" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
            <div><p className="text-sm font-bold tracking-wide">MO T-SHIRT</p><p className="text-xs text-black/55">Quotation response</p></div>
          </div>
        </header>

        <section className="px-6 py-8 sm:px-9">
          <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${actionCopy.tone}`}><Icon className="h-6 w-6" /></div>
          <p className="mb-1 text-sm text-black/55">Hello {quote.clientName || "there"}</p>
          <h1 className="text-3xl font-bold tracking-tight">{actionCopy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-black/60">{actionCopy.description}</p>

          <div className="my-7 grid grid-cols-2 gap-3 rounded-2xl bg-[#f7f7f5] p-4 text-sm">
            <div><p className="text-black/45">Quotation</p><p className="mt-1 font-semibold">{quote.documentNumber || quoteId.slice(-8).toUpperCase()}</p></div>
            <div><p className="text-black/45">{action === "accept" ? "Balance to pay" : "Total"}</p><p className="mt-1 font-semibold">{balance === null ? "See attached PDF" : `${quote.currency} ${balance.toLocaleString("en-MU", { minimumFractionDigits: 2 })}`}</p></div>
          </div>

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Response received</p><p className="mt-1 text-sm leading-6">{success}</p></div></div>
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
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3.5 text-sm font-bold text-white transition hover:bg-black/85 disabled:cursor-wait disabled:opacity-55">
                {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {submitting ? "Submitting…" : action === "accept" ? "Accept and send payment proof" : action === "changes" ? "Send change request" : "Reject quotation"}
              </button>
              {action === "accept" && <p className="text-center text-xs leading-5 text-black/45">Submit your screenshot only. MO T-SHIRT will check the payment details in the admin system.</p>}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function CenteredMessage({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f3ef] px-5"><div className="max-w-md rounded-3xl bg-white p-9 text-center shadow-xl"><div className="mb-4 flex justify-center">{icon}</div><p className="text-sm leading-6 text-black/65">{text}</p></div></main>;
}
