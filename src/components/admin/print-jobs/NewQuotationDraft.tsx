"use client";

import { useRef, useState } from "react";
import { collection, doc, runTransaction, serverTimestamp, type DocumentReference } from "firebase/firestore";
import { FileText, Loader2, Plus } from "lucide-react";
import { db } from "@/lib/firebase";
import { ensureAdminFirebaseSession } from "@/lib/firebase-admin-client-auth";
import styles from "./print-jobs.module.css";

/** A generic, explicit creation step. The existing document editor remains unchanged. */
export default function NewQuotationDraft({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const draftRef = useRef<DocumentReference | null>(null);
  async function create() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await ensureAdminFirebaseSession();
      const target = draftRef.current || doc(collection(db, "quotes"));
      draftRef.current = target;
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      await runTransaction(db, async (transaction) => {
        // An interrupted/lost response retries this same ID without creating a duplicate
        // or replacing any changes already made to the original draft.
        if ((await transaction.get(target)).exists()) return;
        transaction.set(target, {
          name: "Walk-in client", email: "", phone: "", message: "Created from Mo Admin",
          garments: [{ garment: "Custom item", color: "", size: "", quantity: 1 }],
          source: "Mo Admin", status: "review",
          quote: {
            documentType: "quotation", documentNumber: `Q-${target.id.slice(-8).toUpperCase()}`,
            documentDate: date, clientCompany: "Walk-in client", paymentStatus: "Quotation only",
            currency: "Rs", showLineItems: true, showTotals: true,
            lines: [{ description: "Product / Size", quantity: 1, unitPrice: "", includeInTotals: true }],
            deliveryFee: 0, discount: 0, amountReceived: 0, subtotal: 0, total: 0,
          },
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      });
      onCreated(target.id);
    } catch { setError("Could not finish opening the draft. Retry safely; the same draft is reused."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className={styles.empty} aria-label="Create a new quotation">
    <FileText size={30} /><h3>Start a new quotation</h3>
    <p>Create a blank job, then add the client, garments, artwork and pricing.<br />It stays a draft until you choose to send it.</p>
    <button className={styles.primary} onClick={() => void create()} disabled={busy}>{busy ? <Loader2 size={16} className={styles.spin} /> : <Plus size={16} />}{busy ? "Creating…" : "Create blank quotation"}</button>
    {error && <p className={styles.formError} role="alert">{error}</p>}
  </section>;
}
