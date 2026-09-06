"use client";
import Link from "next/link";
import { useState } from "react";
import { FilePlus2, Loader2, Plus, Trash2 } from "lucide-react";
import type { EmailQuoteDraft } from "@/lib/email-quote";

const fields: [keyof Omit<EmailQuoteDraft, "lines" | "notes">, string][] = [["name", "Client name"], ["email", "Client email"], ["phone", "Phone / WhatsApp"], ["company", "Company"], ["address", "Address"], ["brn", "BRN"], ["vat", "VAT number"], ["deadline", "Required date"], ["printMethod", "Printing method"], ["delivery", "Delivery / collection"]];
export default function EmailQuoteImport({ messageId }: { messageId: string }) {
  const [draft, setDraft] = useState<EmailQuoteDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  async function request(action: "preview" | "create") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/inbox/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: messageId, action, ...(action === "create" ? { draft } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import email.");
      if (data.quoteId) { setQuoteId(data.quoteId); setDraft(null); }
      else { setDraft(data.draft); setAttachments(data.attachmentNames || []); }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not import email."); }
    finally { setBusy(false); }
  }
  const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 disabled:opacity-50";
  const input = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";
  return <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
    {quoteId ? <div><p className="mb-2 text-sm">This email conversation is in Quotes & invoices.</p><Link className={button} href={`/admin/quotation-approval?quoteId=${encodeURIComponent(quoteId)}`}>Open quote draft</Link></div> : <>
      <button className={button} disabled={busy} onClick={() => request("preview")}>{busy ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />} {busy ? "Preparing…" : "Create quote from email"}</button>
      <p className="mt-2 text-xs text-gray-600">Extract the enquiry into an editable draft. Review details before saving; nothing is sent to the client.</p>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {draft && <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); request("create"); }}>
      <h3 className="font-semibold">Review email enquiry</h3>
      <p className="text-xs text-gray-600">Only clearly stated details are filled in. Unstructured information stays in the original enquiry below. Confirm product lines and quantities; prices are left blank.</p>
      <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label className="block text-xs text-gray-600" key={key}>{label}<input className={`${input} mt-1`} type={key === "email" ? "email" : "text"} required={key === "name" || key === "email"} maxLength={key === "address" ? 2000 : 500} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}</div>
      <div className="space-y-2"><h4 className="text-sm font-medium">Products, colours, sizes and printing</h4>{draft.lines.map((line, index) => <div key={index} className="flex items-start gap-2"><textarea aria-label={`Product details ${index + 1}`} className={`${input} min-h-20 flex-1`} maxLength={1000} value={line.description} required onChange={event => setDraft({ ...draft, lines: draft.lines.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /><input aria-label={`Quantity ${index + 1}`} className={`${input} max-w-20`} type="number" min={1} max={100000} step={1} placeholder="Qty" value={line.quantity} onChange={event => setDraft({ ...draft, lines: draft.lines.map((item, i) => i === index ? { ...item, quantity: event.target.value ? Number(event.target.value) : "" } : item) })} /><button className={button} aria-label={`Remove product ${index + 1}`} type="button" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>)}<button type="button" className={button} disabled={draft.lines.length >= 50} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { description: "", quantity: "" }] })}><Plus size={14} /> Add product</button></div>
      <label className="block text-sm">Enquiry details / notes<textarea className={`${input} mt-1 min-h-52`} maxLength={40000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      {attachments.length > 0 && <p className="break-words text-xs text-amber-800">Email attachments: {attachments.join(", ")}. Their names are retained, but file contents are not extracted or copied. Add the relevant artwork/files in the quote editor.</p>}
      <div className="flex flex-wrap gap-2"><button className={button} type="submit" disabled={busy || !draft.lines.length}>{busy ? "Saving…" : "Save to Quotes & invoices"}</button><button className={button} type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
  </div>;
}
