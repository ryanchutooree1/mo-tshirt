"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, runTransaction, serverTimestamp, type DocumentReference } from "firebase/firestore";
import { CalendarDays, Check, ChevronDown, FilePlus2, Layers3, Loader2, MessageCircle, Package, Palette, Save, UserRound, UsersRound } from "lucide-react";
import { db } from "@/lib/firebase";
import { ensureAdminFirebaseSession } from "@/lib/firebase-admin-client-auth";
import { normalizeWhatsAppPhone } from "@/lib/quotation-whatsapp";
import styles from "./print-jobs.module.css";

type CustomerType = "normal" | "bulk";
type Product = "T-Shirt" | "Polo";
type CreationIntent = "draft" | "send";
type SizeQuantity = { size: string; quantity: number };

const PRODUCT_PRICES: Record<Product, number> = { "T-Shirt": 150, Polo: 450 };
const FALLBACK_COLOURS = ["Black", "White", "Navy", "Royal blue", "Red", "Grey", "Burgundy", "Green", "Pink", "Purple", "Yellow", "Orange", "Brown", "Beige", "Cream", "Other"];
const SAVED_DRAFT_CONFLICT = "This quotation was already saved with the previous details. Refresh the job list before starting another quotation.";

const mauritiusDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+04:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseSizeQuantities(value: string): SizeQuantity[] {
  const entries = value.split(/[\n,;]+/).map(entry => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error("Add at least one size and quantity, for example S: 2, M: 5.");
  const combined = new Map<string, number>();
  for (const entry of entries) {
    const match = entry.match(/^([a-z0-9-]{1,12})\s*(?::|x|×)\s*(\d{1,4})$/i);
    if (!match || Number(match[2]) < 1) throw new Error(`Check “${entry}”. Use a format like S: 2, M: 5.`);
    const size = match[1].toUpperCase();
    combined.set(size, (combined.get(size) || 0) + Number(match[2]));
  }
  return [...combined].map(([size, quantity]) => ({ size, quantity }));
}

export default function NewQuotationDraft({ onCreated }: { onCreated: (id: string, intent: CreationIntent) => void }) {
  const [customerType, setCustomerType] = useState<CustomerType>("normal");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [product, setProduct] = useState<Product>("T-Shirt");
  const [colour, setColour] = useState("Black");
  const [colourOptions, setColourOptions] = useState(FALLBACK_COLOURS);
  const [sizes, setSizes] = useState("");
  const [unitPrice, setUnitPrice] = useState(String(PRODUCT_PRICES["T-Shirt"]));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<CreationIntent | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const busyRef = useRef(false);
  const draftRef = useRef<DocumentReference | null>(null);
  const draftFingerprintRef = useRef("");

  const parsedSizes = useMemo(() => {
    try { return parseSizeQuantities(sizes); } catch { return []; }
  }, [sizes]);
  const quantity = parsedSizes.reduce((sum, entry) => sum + entry.quantity, 0);
  const price = Number(unitPrice);
  const total = Number.isFinite(price) && price > 0 ? quantity * price : 0;

  useEffect(() => {
    let active = true;
    void fetch("/api/quote-options")
      .then(async response => response.ok ? response.json() : Promise.reject(new Error("Could not load colours.")))
      .then(body => {
        if (!active || !Array.isArray(body.colors)) return;
        const unique = new Map<string, string>();
        [...body.colors, ...FALLBACK_COLOURS].forEach(entry => {
          const label = String(entry || "").trim();
          const key = label.toLocaleLowerCase();
          if (label && !unique.has(key)) unique.set(key, label);
        });
        setColourOptions([...unique.values()]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function resetForm() {
    setPhone(""); setCustomerName(""); setProduct("T-Shirt"); setColour("Black"); setSizes("");
    setUnitPrice(String(PRODUCT_PRICES["T-Shirt"])); setDeliveryDate(""); setNotes(""); setCustomerType("normal");
    draftRef.current = null; draftFingerprintRef.current = "";
  }

  async function create(intent: CreationIntent) {
    if (busyRef.current) return;
    setError(""); setSuccess(""); setWhatsappUrl("");
    let requestedSizes: SizeQuantity[];
    try { requestedSizes = parseSizeQuantities(sizes); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Check the sizes and quantities."); return; }
    const approvedPrice = Number(unitPrice);
    if (!Number.isFinite(approvedPrice) || approvedPrice <= 0) { setError("Enter the approved unit price in Rs."); return; }
    if (intent === "send" && !normalizeWhatsAppPhone(phone)) { setError("Enter a valid client WhatsApp number before sending."); return; }

    const popup = intent === "send" ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    busyRef.current = true; setBusy(intent);
    try {
      await ensureAdminFirebaseSession();
      const target = draftRef.current || doc(collection(db, "quotes"));
      draftRef.current = target;
      const date = mauritiusDate();
      const name = customerName.trim() || "Customer";
      const requestFingerprint = JSON.stringify({ customerType, phone: phone.trim(), name, product, colour, requestedSizes, approvedPrice, deliveryDate, notes: notes.trim() });
      const lines = requestedSizes.map(entry => ({
        description: [`Plain ${product === "Polo" ? "polo shirt" : "T-shirt"}`, colour, entry.size].filter(Boolean).join(" — "),
        quantity: entry.quantity,
        unitPrice: approvedPrice,
        includeInTotals: true,
        priceSource: "manual",
        priceSetByName: customerType === "bulk" ? "Approved bulk price" : "Tanvi quick quotation",
      }));
      const garments = requestedSizes.map(entry => ({ garment: product, color: colour, size: entry.size, quantity: entry.quantity }));
      const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      await runTransaction(db, async transaction => {
        // A lost response retries this stable ID and never creates a duplicate.
        if ((await transaction.get(target)).exists()) {
          if (draftFingerprintRef.current !== requestFingerprint) throw new Error(SAVED_DRAFT_CONFLICT);
          return;
        }
        draftFingerprintRef.current = requestFingerprint;
        transaction.set(target, {
          name, email: "", phone: phone.trim(), message: notes.trim() || "Plain garment quotation created from Tanvi’s quick form.",
          garments, quantity: garments.reduce((sum, garment) => sum + garment.quantity, 0),
          printMethod: "No customization", source: "Mo Admin", status: "review",
          delivery: deliveryDate ? `Required by ${deliveryDate}` : "", deadline: deliveryDate,
          plainQuotation: { customerType, approvedUnitPrice: approvedPrice },
          quote: {
            documentType: "quotation", documentNumber: `Q-${target.id.slice(-8).toUpperCase()}`,
            documentDate: date, validUntil: addDays(date, 7), clientCompany: name, paymentStatus: "Quotation only",
            preparedBy: "Mo T-Shirt Team", currency: "Rs", showLineItems: true, showTotals: true,
            lines, deliveryFee: 0, discount: 0, amountReceived: 0, subtotal, total: subtotal,
            notes: notes.trim(),
          },
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      });

      if (intent === "send") {
        const response = await fetch("/api/admin/quotes/whatsapp", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: target.id }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "The quotation was saved, but WhatsApp could not be prepared.");
        const url = new URL(body.whatsappUrl);
        if (url.origin !== "https://wa.me") throw new Error("The quotation was saved, but the WhatsApp link was invalid.");
        if (popup && !popup.closed) popup.location.href = url.toString();
        else setWhatsappUrl(url.toString());
        onCreated(target.id, intent);
        setSuccess("Quotation created. WhatsApp is ready—press Send in WhatsApp to deliver it.");
      } else {
        popup?.close();
        onCreated(target.id, intent);
        setSuccess("Quotation saved as a draft.");
      }
      resetForm();
    } catch (reason) {
      popup?.close();
      const message = reason instanceof Error ? reason.message : "Could not create the quotation.";
      setError(message === SAVED_DRAFT_CONFLICT ? message : `${message} Retry safely; the same quotation is reused.`);
    } finally {
      busyRef.current = false; setBusy(null);
    }
  }

  return <section className={styles.quickQuote} aria-labelledby="new-plain-quotation">
    <div className={styles.quickQuoteTitle}><FilePlus2 size={25} /><div><h2 id="new-plain-quotation">New plain quotation</h2><p>Complete the essentials once. The quotation is saved in Rs.</p></div></div>

    <div className={styles.customerType} role="radiogroup" aria-label="Customer type">
      <button type="button" role="radio" aria-checked={customerType === "normal"} data-active={customerType === "normal"} onClick={() => { setCustomerType("normal"); if (!unitPrice || unitPrice === String(PRODUCT_PRICES[product])) setUnitPrice(String(PRODUCT_PRICES[product])); }}><UserRound size={18} />Normal customer</button>
      <button type="button" role="radio" aria-checked={customerType === "bulk"} data-active={customerType === "bulk"} onClick={() => { setCustomerType("bulk"); setUnitPrice(""); }}><UsersRound size={18} />Bulk buyer</button>
      <p>{customerType === "bulk" ? "Enter the price approved for this bulk buyer." : `Suggested plain price starts at Rs ${PRODUCT_PRICES[product]}. You can change it.`}</p>
    </div>

    <div className={styles.quickQuoteGrid}>
      <label className={styles.quickField}><span>Phone / WhatsApp</span><span className={styles.inputShell}><MessageCircle size={17} /><input value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="e.g. 5 7XX XXXX" /></span></label>
      <label className={styles.quickField}><span>Customer name <small>(optional)</small></span><span className={styles.inputShell}><UserRound size={17} /><input value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" placeholder="Leave blank if unknown" /></span><small>The quotation will use “Customer” when left blank.</small></label>
      <label className={styles.quickField}><span>Product</span><span className={styles.inputShell}><Package size={17} /><select value={product} onChange={event => { const next = event.target.value as Product; setProduct(next); setUnitPrice(customerType === "bulk" ? "" : String(PRODUCT_PRICES[next])); }}><option value="T-Shirt">T-Shirt</option><option value="Polo">Polo shirt</option></select><ChevronDown size={16} /></span></label>
      <label className={styles.quickField}><span>Colour <small>(optional)</small></span><span className={styles.inputShell}><Palette size={17} /><select value={colour} onChange={event => setColour(event.target.value)}><option value="">No colour — price only</option>{colourOptions.map(option => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={16} /></span></label>
      <label className={`${styles.quickField} ${styles.sizesField}`}><span>Sizes & quantities</span><span className={styles.inputShell}><Layers3 size={17} /><input value={sizes} onChange={event => setSizes(event.target.value)} placeholder="e.g. S: 2, M: 5, L: 3" /></span></label>
      <label className={styles.quickField}><span>Approved unit price</span><span className={styles.currencyInput}><b>Rs</b><input value={unitPrice} onChange={event => setUnitPrice(event.target.value)} inputMode="decimal" aria-label="Approved unit price in Rs" /></span></label>
      <label className={styles.quickField}><span>Required date <small>(optional)</small></span><span className={styles.inputShell}><CalendarDays size={17} /><input type="date" min={mauritiusDate()} value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></span></label>
      <div className={styles.quickTotal}><span>Total</span><strong>Rs {new Intl.NumberFormat("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)}</strong><small>{quantity ? `${quantity} piece${quantity === 1 ? "" : "s"}` : "Add sizes to calculate"}</small></div>
    </div>

    <details className={styles.quickNotes}><summary>+ Add notes <small>(optional)</small></summary><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Anything the client or team should know" /></details>
    {error && <p className={styles.formError} role="alert">{error}</p>}
    {success && <p className={styles.formSuccess} role="status"><Check size={16} />{success}</p>}
    {whatsappUrl && <a className={styles.whatsappFallback} href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Open WhatsApp message</a>}
    <div className={styles.quoteFormActions}><button type="button" className={styles.secondary} onClick={() => void create("draft")} disabled={Boolean(busy)}>{busy === "draft" ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}{busy === "draft" ? "Saving…" : "Save draft"}</button><button type="button" className={styles.primary} onClick={() => void create("send")} disabled={Boolean(busy)}>{busy === "send" ? <Loader2 size={17} className={styles.spin} /> : <MessageCircle size={17} />}{busy === "send" ? "Preparing…" : "Create & send"}</button></div>
  </section>;
}
