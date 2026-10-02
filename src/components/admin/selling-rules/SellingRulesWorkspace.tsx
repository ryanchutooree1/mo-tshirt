"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Clock3, Copy, CreditCard, Pencil, RefreshCw, Ruler, ShieldCheck, Shirt, Truck, X } from "lucide-react";
import {
  SELLING_RULE_OFFERS,
  calculateSellingRulesQuote,
  validateSellingRulesConfig,
  type SellingRuleOfferId,
  type SellingRuleDeliveryOptionId,
  type SellingRulesConfig,
} from "@/lib/selling-rules";
import styles from "./selling-rules.module.css";

type Snapshot = {
  config: SellingRulesConfig;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  canEdit: boolean;
  viewerId: string;
  history: { revision: number; updatedAt: string; updatedBy: string }[];
};
type Section = "prices" | "printing" | "payment" | "exceptions";
type Rules = SellingRulesConfig["rules"];
type RecoverableEdit = { config: SellingRulesConfig; revision: number; section: Section };
// Tab-memory only: recover SPA Back/Forward interruptions without storing commercial
// drafts on disk or leaking one signed-in owner’s changes into another session.
const recoverableEdits = new Map<string, RecoverableEdit>();
const POLICY_FIELDS = [
  ["bulkPolicy", "Bulk orders", "Who approves a reduced price, and how is it recorded?"],
  ["minimumQuantityPolicy", "Minimum order", "Leave blank until the minimum quantity is confirmed"],
  ["designChargesPolicy", "Design & artwork charges", "What artwork work is included or charged separately?"],
  ["vatPolicy", "VAT / tax", "Confirm how tax is included or added"],
  ["rushPolicy", "Rush orders", "Confirm availability and any fee before promising"],
  ["cancellationRefundPolicy", "Changes, cancellations & refunds", "Only enter an owner-approved policy"],
  ["stockOtherProductsPolicy", "Stock & other products", "Confirm garment availability and any quote-only products"],
  ["exceptionsPolicy", "Price exceptions", "Who approves exceptions, and what must be recorded?"],
] as const;

function money(value: number | null | undefined) {
  return value == null ? "—" : `Rs ${value.toLocaleString("en-MU", { maximumFractionDigits: 2 })}`;
}
function dimension(value: Rules["smallPrint"]) {
  return value.widthCm && value.heightCm ? `${value.widthCm} × ${value.heightCm} cm` : null;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
async function request(options?: RequestInit): Promise<Snapshot> {
  const response = await fetch("/api/admin/quotes/selling-rules", { ...options, cache: "no-store", signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({ error: "Could not read the server response. Please retry." }));
  if (!response.ok) throw Object.assign(new Error(body.error || "Could not load selling rules."), { status: response.status });
  return { ...body, config: validateSellingRulesConfig(body.config) };
}
function Badge({ children, pending = false }: { children: ReactNode; pending?: boolean }) {
  return <span className={pending ? styles.pending : styles.badge}>{children}</span>;
}
function Rule({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string | null; detail: string }) {
  return <article className={styles.rule}><span className={styles.ruleIcon}>{icon}</span><div><h3>{title}</h3>{value ? <strong>{value}</strong> : <Badge pending>Needs confirmation</Badge>}<p>{detail}</p></div></article>;
}

export default function SellingRulesWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [offerId, setOfferId] = useState<SellingRuleOfferId>("tee_small_front");
  const [quantity, setQuantity] = useState("1");
  const [deliveryId, setDeliveryId] = useState<SellingRuleDeliveryOptionId | "">("");
  const [section, setSection] = useState<Section | null>(null);
  const [draft, setDraft] = useState<SellingRulesConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<RecoverableEdit | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const loadSequence = useRef(0);
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved.config);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setLoadError("");
    try {
      const next = await request();
      if (sequence === loadSequence.current) {
        for (const viewerId of recoverableEdits.keys()) if (viewerId !== next.viewerId) recoverableEdits.delete(viewerId);
        setSaved(next);
        setRecovery(!embedded && next.canEdit ? recoverableEdits.get(next.viewerId) ?? null : null);
      }
    } catch (error) {
      if (sequence === loadSequence.current) { setSaved(null); setLoadError(errorMessage(error)); }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [embedded]);
  const invalidateLoads = useCallback(() => { loadSequence.current++; }, []);
  useEffect(() => { void load(); return invalidateLoads; }, [load, invalidateLoads]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !section && !savingRef.current) void load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load, section]);
  useEffect(() => {
    if (section) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [section]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!embedded && saved?.canEdit && saved.viewerId && draft && section && editRevision !== null) {
      if (dirty) recoverableEdits.set(saved.viewerId, { config: structuredClone(draft), revision: editRevision, section });
      else recoverableEdits.delete(saved.viewerId);
    }
  }, [draft, section, editRevision, dirty, saved, embedded]);
  function clearRecovery(expected?: { config: SellingRulesConfig; revision: number }) {
    if (saved?.viewerId) {
      const current = recoverableEdits.get(saved.viewerId);
      if (!expected || (current?.revision === expected.revision && JSON.stringify(current.config) === JSON.stringify(expected.config))) recoverableEdits.delete(saved.viewerId);
    }
    setRecovery(null);
  }
  function recover() {
    if (!recovery || !saved?.canEdit) return;
    setDraft(structuredClone(recovery.config)); setEditRevision(recovery.revision); setSection(recovery.section);
    const stale = recovery.revision !== saved.revision;
    setConflict(stale); setSaveError(stale ? "The saved rules changed while you were away. Your previous edits are shown for reference; load the latest rules before making a new change." : "");
    setRecovery(null);
  }
  function edit(next: Section) {
    if (!saved?.canEdit || embedded) return;
    if (recovery) { recover(); return; }
    setEditRevision(saved.revision);
    setDraft(structuredClone(saved.config)); setSaveError(""); setConflict(false); setSection(next);
  }
  function closeEditor() {
    if (savingRef.current) return;
    if (dirty && !window.confirm("Discard these unsaved rule changes?")) return;
    clearRecovery(); setEditRevision(null);
    setSection(null); setDraft(null); setSaveError(""); setConflict(false);
  }
  function updateRule<K extends keyof Rules>(key: K, value: Rules[K]) {
    setDraft(current => current ? { ...current, rules: { ...current.rules, [key]: value } } : null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !saved || editRevision === null || savingRef.current || conflict) return;
    savingRef.current = true; setSaving(true); setSaveError("");
    try {
      const config = validateSellingRulesConfig(draft);
      const next = await request({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config, revision: editRevision }) });
      clearRecovery({ config: draft, revision: editRevision }); setEditRevision(null);
      setSaved(next); setSection(null); setDraft(null); setNotice(`Selling rules saved · version ${next.revision}`);
    } catch (error) {
      setSaveError(errorMessage(error));
      const status = (error as { status?: number }).status;
      if (status === 409) setConflict(true);
      if (status === 401 || status === 403) { setSaved(null); setSection(null); setDraft(null); setLoadError(errorMessage(error)); }
    } finally { savingRef.current = false; setSaving(false); }
  }
  async function reloadConflict() {
    if (!window.confirm("Discard your unsaved changes and load the latest saved rules?")) return;
    clearRecovery(); setEditRevision(null);
    setSection(null); setDraft(null); setConflict(false); await load();
  }
  const config = saved?.config;
  const rules = config?.rules;
  const selected = SELLING_RULE_OFFERS.find(offer => offer.id === offerId)!;
  const parsedQuantity = Number(quantity);
  const validQuantity = quantity.trim() !== "" && Number.isSafeInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 1_000_000;
  const selectedDelivery = rules?.deliveryOptions.find(option => option.id === deliveryId);
  const estimate = config && validQuantity ? calculateSellingRulesQuote(config, offerId, parsedQuantity, selectedDelivery?.id) : null;
  const canEdit = saved?.canEdit && !embedded;
  const printingMethod = rules ? selected.garment === "polo" ? rules.poloMethod === "vinyl" ? "Vinyl printing" : null : ({ unknown: null, vinyl: "Vinyl printing", dtf: "DTF printing", either: "Vinyl or DTF · confirm per design" }[rules.tshirtMethod]) : null;
  const included = rules?.inclusions === "garment_and_print" ? "Garment + printing" : rules?.inclusions === "print_only" ? "Printing only" : null;
  const bulkReview = !!rules?.bulkReviewMinimum && validQuantity && parsedQuantity >= rules.bulkReviewMinimum;
  async function copyEstimate() {
    if (!estimate || !saved) return;
    const lines = ["INTERNAL ESTIMATE · needs final review", `${selected.label} · ${parsedQuantity} × ${money(estimate.unitPriceMUR)}`, `Item estimate: ${money(estimate.subtotalMUR)}`, `Includes: ${included || "Needs confirmation"}`, `Method: ${printingMethod || "Needs confirmation"}`, `Advance on item estimate: ${money(estimate.depositMUR)}`, `Delivery: ${selectedDelivery ? `${selectedDelivery.label} · ${money(selectedDelivery.priceMUR)}` : "Needs confirmation"}`, `Items + selected delivery: ${money(estimate.subtotalWithDeliveryMUR)}`, "Delivery and any applicable extras/tax must be confirmed before quoting.", ...(bulkReview ? ["Bulk price needs owner review; no discount applied."] : []), "Confirm stock, artwork, placement and production deadline before promising.", `Selling rules version ${saved.revision}`];
    try { await navigator.clipboard.writeText(lines.join("\n")); setNotice("Internal estimate copied. Review it before using it in a quote."); }
    catch { setNotice("Could not copy. You can read the estimate below."); }
  }

  return <div className={`${styles.workspace} ${embedded ? styles.embedded : ""}`}>
    <header className={styles.header}>
      <div>{!embedded && <Link href="/admin/quotation-approval" className={styles.back}><ArrowLeft size={15} /> Quotes & invoices</Link>}<div className={styles.eyebrow}>MO T-SHIRT · team reference</div><h1>Selling rules</h1><p>One clear price. The right details. No surprises.</p></div>
      <div className={styles.headerActions}>{embedded && saved?.canEdit && <Link href="/admin/quotation-approval/selling-rules" className={styles.textButton}>Manage rules</Link>}{saved && <Badge>Version {saved.revision}</Badge>}<button type="button" onClick={() => void load()} disabled={loading || !!section} className={styles.iconButton} aria-label="Refresh selling rules"><RefreshCw size={18} /></button></div>
    </header>
    {notice && <div className={styles.notice} role="status"><Check size={17} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={16}/></button></div>}
    {loading ? <div className={styles.empty} role="status">Loading the latest selling rules…</div> : loadError ? <div className={styles.error} role="alert"><h2>Selling rules couldn’t be loaded</h2><p>{loadError}</p><button type="button" className={styles.primary} onClick={() => void load()}>Try again</button></div> : config && rules ? <>
      {recovery && <div className={styles.setup} role="status"><div><strong>Your unsaved edits are still here</strong><p>Recover the changes from your last visit, or discard them and use the saved rules.</p></div><button type="button" className={styles.primary} onClick={recover}>Recover edits</button><button type="button" className={styles.textButton} onClick={() => { if (window.confirm("Discard the unsaved rule changes from your last visit?")) clearRecovery(); }}>Discard edits</button></div>}
      {saved?.revision === 0 && <div className={styles.setup}><ShieldCheck size={20}/><div><strong>Ready for your approved rules</strong><p>{canEdit ? "Add the agreed prices and confirmed details. Anything left blank stays clearly marked for confirmation." : "The owner hasn’t saved selling rules yet. Ask for the approved prices before quoting."}</p></div>{canEdit && <button className={styles.primary} onClick={() => edit("prices")}>Set prices</button>}</div>}
      <section aria-labelledby="selling-price-heading">
        <div className={styles.sectionHeading}><div><h2 id="selling-price-heading">Choose your print</h2><p>{included || "Price inclusions need confirmation"} · per item · MUR</p></div>{canEdit && <button className={styles.textButton} onClick={() => edit("prices")}><Pencil size={15}/> Edit prices</button>}</div>
        <div className={styles.priceGrid}>{SELLING_RULE_OFFERS.map(offer => <button key={offer.id} type="button" aria-pressed={offerId === offer.id} onClick={() => { setOfferId(offer.id); setNotice(""); }} className={`${styles.priceCard} ${offerId === offer.id ? styles.selected : ""}`}>
          <span className={styles.cardTop}><span>{offer.garment === "polo" ? "Polo shirt" : "T-shirt"}</span><Shirt size={22}/></span>
          <span className={styles.placement}>{offer.placement}</span>
          <strong className={styles.price}>{money(config.offers[offer.id].priceMUR)}</strong>
          <span className={styles.priceFoot}>{config.offers[offer.id].priceMUR === null ? "Needs confirmation" : "per item"}<span className={styles.radio}>{offerId === offer.id && <Check size={12}/>}</span></span>
        </button>)}</div>
      </section>
      <div className={styles.mainGrid}>
        <section className={styles.calculator} aria-labelledby="quick-estimate-heading">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Quick calculation</span><h2 id="quick-estimate-heading">{selected.garment === "polo" ? "Polo shirt" : "T-shirt"}</h2><p>{selected.placement}</p></div><Badge pending>Indicative</Badge></div>
          <label className={styles.quantityLabel} htmlFor="selling-quantity">How many items?</label>
          <div className={styles.quantityRow}><button type="button" aria-label="Decrease quantity" disabled={!validQuantity || parsedQuantity <= 1} onClick={() => setQuantity(String(parsedQuantity - 1))}>−</button><input id="selling-quantity" type="number" min="1" max="1000000" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} aria-describedby={!validQuantity ? "selling-quantity-error" : undefined}/><button type="button" aria-label="Increase quantity" disabled={!validQuantity || parsedQuantity >= 1_000_000} onClick={() => setQuantity(String(parsedQuantity + 1))}>+</button><span>× {money(config.offers[offerId].priceMUR)}</span></div>
          {!validQuantity && <p className={styles.fieldError} id="selling-quantity-error">Enter a whole number from 1 to 1,000,000.</p>}
          <div className={styles.estimateAmount}><span>Item estimate</span><strong aria-live="polite">{money(estimate?.subtotalMUR)}</strong><small>{included || "Inclusions need confirmation"}</small></div>
          <div className={styles.calculationLine}><span>{rules.depositPercent ? `${rules.depositPercent}% advance on items` : "Advance amount"}</span><strong>{money(estimate?.depositMUR)}</strong></div>
          <div className={styles.calculationLine}><span>Remaining item balance</span><strong>{money(estimate?.balanceMUR)}</strong></div>
          <div className={styles.deliveryNote}><Truck size={18}/><span>{rules.delivery === "customer_paid" ? "Delivery is extra and paid by the customer." : "Delivery terms need confirmation."}</span></div>
          {rules.deliveryOptions.length > 0 && <div className={styles.deliverySelector}><label className={styles.field}><span>Delivery / collection</span><select value={selectedDelivery?.id ?? ""} onChange={event => setDeliveryId(event.target.value as SellingRuleDeliveryOptionId | "")}><option value="">Choose an approved option</option>{rules.deliveryOptions.map(option => <option key={option.id} value={option.id}>{option.label} · {money(option.priceMUR)}</option>)}</select></label>{selectedDelivery && <p className={styles.finePrint}>{selectedDelivery.description}</p>}<div className={styles.calculationLine}><span>Items + selected delivery</span><strong>{money(estimate?.subtotalWithDeliveryMUR)}</strong></div><p className={styles.finePrint}>One delivery charge per order. Other delivery arrangements need an agreed fee.</p></div>}
          {bulkReview && <div className={styles.warning}><strong>Bulk price review</strong><p>This quantity may qualify for a reduced price. Get owner approval; no automatic discount is applied.</p></div>}
          <p className={styles.finePrint}>This is an internal estimate. Confirm delivery, tax, any extras and the final price before sending a quotation.</p>
          <button type="button" className={styles.primary} onClick={() => void copyEstimate()} disabled={!estimate || estimate.subtotalMUR === null}><Copy size={16}/> Copy internal estimate</button>
          <p className={styles.quiet}>Existing quotations keep their agreed prices.</p>
        </section>
        <section className={styles.rulesPanel} aria-labelledby="before-promising-heading">
          <div className={styles.sectionHeading}><div><h2 id="before-promising-heading">Before you promise</h2><p>Check these details with each customer</p></div>{canEdit && <button className={styles.textButton} onClick={() => edit("printing")}><Pencil size={15}/> Edit</button>}</div>
          <div className={styles.rulesGrid}>
            <Rule icon={<Shirt size={20}/>} title="Print method" value={printingMethod} detail={selected.garment === "polo" ? "Confirm artwork and placement for this polo." : "Do not assume a print method from the design alone."}/>
            <Rule icon={<Ruler size={20}/>} title="Print size" value={selected.garment === "polo" ? null : selected.printSizes.every(size => dimension(rules[size === "small" ? "smallPrint" : "largePrint"])) ? selected.printSizes.map(size => `${size === "small" ? "Small" : "Large"}: ${dimension(rules[size === "small" ? "smallPrint" : "largePrint"])}`).join(" · ") : null} detail={selected.garment === "polo" ? "Confirm the exact dimensions for front and back." : "Approve exact placement and the final artwork before printing."}/>
            <Rule icon={<Clock3 size={20}/>} title="Ready date" value={rules.turnaroundWorkingDays ? `${rules.turnaroundWorkingDays.min}–${rules.turnaroundWorkingDays.max} working days` : null} detail="Check stock and production availability. Confirm the customer’s deadline before promising a date."/>
            <Rule icon={<CreditCard size={20}/>} title="Payment before printing" value={rules.depositPercent ? rules.depositPercent === 50 ? "50% advance or full payment" : "Full payment" : null} detail="Verify the payment received before releasing the job to print."/>
          </div>
          {canEdit && <button type="button" className={styles.textButton} onClick={() => edit("payment")}>Payment & delivery settings <ChevronDown size={15}/></button>}
          <div className={styles.checklist}><strong>A simple order check</strong><ol><li><span>1</span>Confirm garment, colour, sizes and quantities</li><li><span>2</span>Agree the design, print size and placement</li><li><span>3</span>Approve the final quote and achievable deadline</li><li><span>4</span>Verify the required payment before printing</li></ol></div>
        </section>
      </div>
      <section className={styles.policyPanel}>
        <div className={styles.sectionHeading}><div><h2>Exceptions & details</h2><p>Anything unconfirmed needs owner review</p></div>{canEdit && <button className={styles.textButton} onClick={() => edit("exceptions")}><Pencil size={15}/> Edit details</button>}</div>
        <div className={styles.policyGrid}>{POLICY_FIELDS.map(([key, label]) => <details key={key}><summary><span>{label}</span>{rules[key] ? <Check size={15}/> : <span className={styles.needs}>Confirm</span>}<ChevronDown size={16}/></summary><p>{rules[key] || "No approved rule saved. Ask the owner before making a commitment."}</p>{key === "bulkPolicy" && rules.bulkReviewMinimum && <p>Price review from {rules.bulkReviewMinimum} items. The standard price remains until an exception is approved.</p>}</details>)}</div>
      </section>
      <footer className={styles.footer}><span><ShieldCheck size={15}/> Internal reference · owner-managed</span>{saved?.updatedAt && <span>Updated {new Date(saved.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{saved.updatedBy ? ` by ${saved.updatedBy}` : ""}</span>}</footer>
    </> : null}
    <dialog ref={dialog} className={styles.editor} aria-labelledby="selling-editor-title" onCancel={event => { event.preventDefault(); closeEditor(); }}>
      {section && draft && <form onSubmit={save}>
        <header><div><span className={styles.eyebrow}>Owner settings</span><h2 id="selling-editor-title">{{ prices: "Prices & inclusions", printing: "Print & timing details", payment: "Payment & delivery", exceptions: "Exceptions & details" }[section]}</h2></div><button type="button" className={styles.iconButton} aria-label="Close rule editor" disabled={saving} onClick={closeEditor}><X size={20}/></button></header>
        <fieldset className={styles.editorBody} disabled={saving}><p className={styles.editHelp}>Save only confirmed rules. Leave unknown details blank; your team will see “Needs confirmation”.</p>
          {section === "prices" && <>
            {SELLING_RULE_OFFERS.map(offer => <label key={offer.id} className={styles.field}><span>{offer.label}</span><div className={styles.currencyInput}><span>Rs</span><input aria-label={`${offer.label} price`} type="number" min="0.01" max="1000000" step="0.01" placeholder="Not confirmed" value={draft.offers[offer.id].priceMUR ?? ""} onChange={event => setDraft({ ...draft, offers: { ...draft.offers, [offer.id]: { priceMUR: event.target.value === "" ? null : Number(event.target.value) } } })}/></div></label>)}
            <label className={styles.field}><span>What does each price include?</span><select value={draft.rules.inclusions ?? ""} onChange={event => updateRule("inclusions", (event.target.value || null) as Rules["inclusions"])}><option value="">Needs confirmation</option><option value="garment_and_print">Garment + printing</option><option value="print_only">Printing only</option></select></label>
          </>}
          {section === "printing" && <>
            <label className={styles.field}><span>T-shirt print method</span><select value={draft.rules.tshirtMethod} onChange={event => updateRule("tshirtMethod", event.target.value as Rules["tshirtMethod"])}><option value="unknown">Needs confirmation</option><option value="vinyl">Vinyl</option><option value="dtf">DTF</option><option value="either">Vinyl or DTF, confirmed per design</option></select></label>
            <label className={styles.field}><span>Polo print method</span><select value={draft.rules.poloMethod ?? ""} onChange={event => updateRule("poloMethod", (event.target.value || null) as Rules["poloMethod"])}><option value="">Needs confirmation</option><option value="vinyl">Vinyl</option></select></label>
            {(["smallPrint", "largePrint"] as const).map(key => <fieldset key={key} className={styles.dimensions}><legend>{key === "smallPrint" ? "Small" : "Large"} print dimensions (cm)</legend><label>Width<input type="number" aria-label={`${key === "smallPrint" ? "Small" : "Large"} print width`} min="0.1" max="200" step="0.1" placeholder="Unknown" value={draft.rules[key].widthCm ?? ""} onChange={event => updateRule(key, { ...draft.rules[key], widthCm: event.target.value === "" ? null : Number(event.target.value) })}/></label><span>×</span><label>Height<input type="number" aria-label={`${key === "smallPrint" ? "Small" : "Large"} print height`} min="0.1" max="200" step="0.1" placeholder="Unknown" value={draft.rules[key].heightCm ?? ""} onChange={event => updateRule(key, { ...draft.rules[key], heightCm: event.target.value === "" ? null : Number(event.target.value) })}/></label></fieldset>)}
            <fieldset className={styles.dimensions}><legend>Normal turnaround (working days)</legend><label>From<input type="number" min="1" max="365" placeholder="Unknown" value={draft.rules.turnaroundWorkingDays?.min ?? ""} onChange={event => updateRule("turnaroundWorkingDays", event.target.value === "" ? null : { min: Number(event.target.value), max: draft.rules.turnaroundWorkingDays?.max ?? Number(event.target.value) })}/></label><span>to</span><label>To<input type="number" min="1" max="365" placeholder="Unknown" value={draft.rules.turnaroundWorkingDays?.max ?? ""} onChange={event => updateRule("turnaroundWorkingDays", event.target.value === "" ? null : { min: draft.rules.turnaroundWorkingDays?.min ?? Number(event.target.value), max: Number(event.target.value) })}/></label></fieldset><p className={styles.finePrint}>After artwork approval and verified payment. Confirm a job-specific deadline with production.</p>
          </>}
          {section === "payment" && <>
            <label className={styles.field}><span>Required before printing</span><select value={draft.rules.depositPercent ?? ""} onChange={event => updateRule("depositPercent", event.target.value ? Number(event.target.value) as 50 | 100 : null)}><option value="">Needs confirmation</option><option value="50">50% advance, or full payment</option><option value="100">Full payment</option></select></label>
            <label className={styles.field}><span>Delivery cost</span><select value={draft.rules.delivery ?? ""} onChange={event => updateRule("delivery", (event.target.value || null) as Rules["delivery"])}><option value="">Needs confirmation</option><option value="customer_paid">Customer pays separately</option></select></label>
            <p className={styles.finePrint}>Postal rates are shown only once their service conditions are confirmed.</p>
            {(["pickup", "post_standard", "post_express"] as const).map(id => {
              const option = draft.rules.deliveryOptions.find(item => item.id === id);
              const update = (key: "label" | "description" | "priceMUR", value: string | number) => {
                const next = { id, label: option?.label ?? (id === "pickup" ? "Collection" : id === "post_standard" ? "Standard post" : "Express post"), priceMUR: option?.priceMUR ?? 0, description: option?.description ?? "", [key]: value };
                updateRule("deliveryOptions", [...draft.rules.deliveryOptions.filter(item => item.id !== id), next]);
              };
              return <fieldset key={id} className={styles.deliveryFields}><legend>{id === "pickup" ? "Collection option" : id === "post_standard" ? "Postal option 1" : "Postal option 2"}</legend><label className={styles.field}><span>Service label</span><input value={option?.label ?? ""} placeholder="Leave blank if unconfirmed" maxLength={100} onChange={event => update("label", event.target.value)}/></label><label className={styles.field}><span>Rate (Rs)</span><input type="number" min={id === "pickup" ? "0" : "0.01"} max="1000000" step="0.01" value={option?.priceMUR ?? ""} onChange={event => update("priceMUR", Number(event.target.value))}/></label><label className={styles.field}><span>When this rate applies</span><input value={option?.description ?? ""} placeholder="Verified service, weight or destination conditions" maxLength={500} onChange={event => update("description", event.target.value)}/></label>{option && <button type="button" className={styles.textButton} onClick={() => updateRule("deliveryOptions", draft.rules.deliveryOptions.filter(item => item.id !== id))}>Leave this option unconfirmed</button>}</fieldset>;
            })}
          </>}
          {section === "exceptions" && <><label className={styles.field}><span>Bulk price review starts at (items)</span><input type="number" min="1" max="1000000" step="1" placeholder="Needs confirmation" value={draft.rules.bulkReviewMinimum ?? ""} onChange={event => updateRule("bulkReviewMinimum", event.target.value === "" ? null : Number(event.target.value))}/><small>This flags owner review; it does not apply a discount.</small></label>{POLICY_FIELDS.map(([key, label, placeholder]) => <label key={key} className={styles.field}><span>{label}</span><textarea rows={2} maxLength={2000} placeholder={placeholder} value={draft.rules[key] ?? ""} onChange={event => updateRule(key, event.target.value || null)}/></label>)}</>}
          {saveError && <div className={styles.error} role="alert">{saveError}{conflict && <button type="button" className={styles.textButton} onClick={() => void reloadConflict()}>Load latest saved rules</button>}</div>}
        </fieldset><footer><span>{dirty ? "Unsaved changes" : "Only confirmed details"}</span><button type="button" className={styles.secondary} disabled={saving} onClick={closeEditor}>Cancel</button><button className={styles.primary} type="submit" disabled={saving || conflict || !dirty}>{saving ? "Saving…" : "Save rules"}</button></footer>
      </form>}
    </dialog>
  </div>;
}
