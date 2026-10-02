"use client";

import { useEffect, useRef, useState } from "react";
import { getMissingDetails, type EmailIntake, type IntakeItem } from "@/lib/email-intake-model";
import type { EmailQuoteDraft } from "@/lib/email-quote";
import { enquiryProductionBlockers } from "@/lib/email-enquiry-production";

const fields: [keyof Omit<EmailQuoteDraft, "lines" | "notes">, string][] = [["name", "Client name"], ["email", "Client email"], ["phone", "Phone / WhatsApp"], ["company", "Company"], ["address", "Delivery address"], ["brn", "BRN"], ["vat", "VAT number"], ["deadline", "Required date"], ["printMethod", "Overall printing method"], ["delivery", "Delivery / collection"]];
const productFields: [Exclude<keyof IntakeItem, "quantity">, string][] = [["product", "Product"], ["colour", "Colour"], ["sizes", "Size (one size per row)"], ["printMethod", "Printing method, or plain garments"], ["placement", "Print placement / dimensions"], ["artwork", "Artwork file or design instructions"]];
const blankItem = (): IntakeItem => ({ product: "", quantity: "", colour: "", sizes: "", printMethod: "", placement: "", artwork: "" });

export default function WorkspaceEnquiryEditor({ intake, onUpdated, onDirtyChange, onOpenQuote }: { intake: EmailIntake; onUpdated: () => Promise<void>; onDirtyChange?: (dirty: boolean) => void; onOpenQuote?: (id: string) => void }) {
  const [draft, setDraft] = useState(intake.draft);
  const [items, setItems] = useState(intake.items);
  const [baseline, setBaseline] = useState(JSON.stringify({ draft: intake.draft, items: intake.items }));
  const [revision, setRevision] = useState({ version: intake.version, updatedAtIso: intake.updatedAtIso });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  const incomingRevision = useRef(`${intake.version}:${intake.updatedAtIso}`);
  const dirty = JSON.stringify({ draft, items }) !== baseline;
  const missing = getMissingDetails(draft, items, intake.language);
  const productionBlockers = enquiryProductionBlockers(items);
  useEffect(() => { onDirtyChange?.(dirty || busy); }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    const nextRevision = `${intake.version}:${intake.updatedAtIso}`;
    if (dirty || busy || incomingRevision.current === nextRevision) return;
    incomingRevision.current = nextRevision;
    // A just-saved response may arrive before the refreshed queue. Never replace
    // the confirmed corrections with an older cached list snapshot.
    if (Date.parse(intake.updatedAtIso) < Date.parse(revision.updatedAtIso)) return;
    setDraft(intake.draft); setItems(intake.items);
    setBaseline(JSON.stringify({ draft: intake.draft, items: intake.items }));
    setRevision({ version: intake.version, updatedAtIso: intake.updatedAtIso });
  }, [intake, dirty, busy, revision.updatedAtIso]);
  async function save(action: "save" | "promote") {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/print-jobs/intakes/${encodeURIComponent(intake.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...revision, draft, items }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this enquiry.");
      if (body.quoteId) { onDirtyChange?.(false); onOpenQuote?.(body.quoteId); await onUpdated(); return; }
      const saved = body.intake as EmailIntake;
      setDraft(saved.draft); setItems(saved.items); setBaseline(JSON.stringify({ draft: saved.draft, items: saved.items }));
      setRevision({ version: saved.version, updatedAtIso: saved.updatedAtIso });
      setNotice("Enquiry details saved. No message was sent.");
      await onUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this enquiry. Reload before trying again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <form aria-label="Correct saved enquiry" className="my-6 space-y-5" onSubmit={event => { event.preventDefault(); void save("save"); }}>
    <div><h3 className="font-semibold">Confirm the enquiry details</h3><p className="mt-2 text-sm opacity-70">Correct the saved request below. Save incomplete details for later, or create the quotation once all required information is recorded. Use a separate product row for each colour and size, with its exact quantity.</p></div>
    <fieldset disabled={busy} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="text-xs">{label}<input className={input} type={key === "email" ? "email" : "text"} maxLength={key === "address" ? 2000 : 500} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}</div>
      {items.map((item, index) => <section key={index} aria-label={`Enquiry product ${index + 1}`} className="rounded-xl border border-slate-300/40 p-4"><div className="mb-3 flex justify-between gap-3"><h4 className="text-sm font-semibold">Product {index + 1}</h4><button type="button" onClick={() => setItems(items.filter((_, position) => position !== index))} className="text-xs underline">Remove product</button></div><div className="grid gap-3 sm:grid-cols-2">{productFields.map(([key, label]) => <label key={key} className="text-xs">{label}<input className={input} maxLength={1000} value={item[key]} onChange={event => setItems(items.map((current, position) => position === index ? { ...current, [key]: event.target.value } : current))} /></label>)}<label className="text-xs">Quantity<input aria-label={`Quantity for product ${index + 1}`} className={input} type="number" min={1} max={100000} step={1} value={item.quantity} onChange={event => setItems(items.map((current, position) => position === index ? { ...current, quantity: event.target.value ? Number(event.target.value) : "" } : current))} /></label></div></section>)}
      <button type="button" disabled={items.length >= 50} className="rounded-lg border px-3 py-2 text-sm" onClick={() => setItems([...items, blankItem()])}>Add product</button>
      <label className="block text-xs">Enquiry notes<textarea className={`${input} min-h-28`} maxLength={40000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      {missing.length > 0 && <p className="text-sm" role="status">Still needed: {missing.map(detail => detail.label).join(", ")}</p>}
      {productionBlockers.map(blocker => <p key={blocker} className="text-sm" role="status">{blocker}</p>)}
      <div className="flex flex-wrap gap-3"><button type="submit" className="rounded-xl border px-4 py-3 text-sm font-semibold" disabled={!dirty || busy}>{busy ? "Saving…" : "Save enquiry details"}</button><button type="button" className="rounded-xl bg-[#ff6600] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || missing.length > 0 || productionBlockers.length > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)} onClick={() => void save("promote")}>Create quotation</button></div>
    </fieldset>
    <p className="text-xs opacity-70">No client message is sent. Prices and payment verification are handled in the quotation.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  </form>;
}
