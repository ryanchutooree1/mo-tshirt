"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, FileText, Pencil, Printer, Trash2, Truck } from "lucide-react";
import styles from "./workbench.module.css";

type Product = { product: string; color?: string; size?: string; quantity: number; unitPrice?: number; price?: number };
type Props = {
  name: string; reference: string; total: string; products: Product[]; status: string; payment: string;
  phone?: string; email?: string; address?: string; documentLabel: string;
  onAdvance: () => Promise<void>; onEditLine: (index: number) => void;
  onDocument: (type: "quotation" | "invoice" | "partial_receipt" | "receipt") => void;
  onPreview: () => void; onStatus: (status: string) => Promise<void>; onPayment: (payment: string) => Promise<void>; onDelete: () => void;
};
const money = (value: number) => `Rs ${value.toLocaleString("en-MU", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
export default function FocusedOrderCard(props: Props) {
  const [busy, setBusy] = useState(false);
  const closed = props.status === "Delivered" || props.status === "Cancelled";
  const nextLabel = props.status === "Completed" ? "Mark as delivered" : props.status === "In Process" ? "Complete printing" : "Start production";
  const nextDescription = props.status === "Completed" ? "Confirm when the customer has received this order." : props.status === "In Process" ? "Finish printing and update the garment stock." : "Start printing when artwork and payment arrangements are confirmed.";
  const action = async (task: () => Promise<void>) => { setBusy(true); try { await task(); } finally { setBusy(false); } };
  return <article className={styles.orderCard}>
    <header className={styles.orderHeader}><div><p className={styles.eyebrow}>{props.reference}</p><h2>{props.name}</h2><p>{props.products.reduce((total, product) => total + product.quantity, 0)} pieces <span>·</span> {props.status}</p></div><div><strong>{props.total}</strong><span>{props.payment === "Select Payment Status" || !props.payment ? "Payment not recorded" : props.payment}</span></div></header>
    <div className={styles.orderColumns}>
      <div><section className={styles.orderSection}><h3><Printer size={18} /> Garments to print</h3><div className={styles.orderTable}><table><thead><tr><th>Garment</th><th>Qty</th><th>Unit price</th><th /></tr></thead><tbody>{props.products.map((product,index) => <tr key={index}><td><strong>{product.product}</strong><span>{[product.color,product.size].filter(Boolean).join(" / ")}</span></td><td>{product.quantity}</td><td>{money(product.unitPrice ?? (product.quantity ? (product.price || 0)/product.quantity : 0))}</td><td><button aria-label={`Edit ${product.product}`} onClick={() => props.onEditLine(index)}><Pencil size={15} /> Edit</button></td></tr>)}</tbody></table>{!props.products.length && <p>No garments recorded yet. Add them in the document editor.</p>}</div></section>
      <section className={styles.orderSection}><h3><Truck size={18} /> Customer & delivery</h3><dl className={styles.orderContacts}><div><dt>Phone</dt><dd>{props.phone || "Not recorded"}</dd></div><div><dt>Email</dt><dd>{props.email || "Not recorded"}</dd></div><div><dt>Address</dt><dd>{props.address || "Confirm collection or delivery with the customer."}</dd></div></dl></section></div>
      <div><section className={styles.orderNext}><p className={styles.eyebrow}>{closed ? "ORDER STATUS" : "NEXT ACTION"}</p><h3>{closed ? props.status === "Delivered" ? "With the customer." : "Order cancelled." : nextLabel}</h3><p>{closed ? "The order and documents remain available here." : nextDescription}</p><div className={styles.orderProgress}>{["Pending","In Process","Completed","Delivered"].map((stage,index) => { const current = ["Pending","In Process","Completed","Delivered"].indexOf(props.status); return <span title={stage} key={stage} data-complete={index <= current} />; })}</div>{!closed && <button className={styles.primary} disabled={busy} onClick={() => void action(props.onAdvance)}>{busy ? "Updating…" : nextLabel}<ArrowRight size={17} /></button>}</section>
      <section className={styles.orderSection}><h3><FileText size={18} /> Documents</h3><p className={styles.orderHint}>Customer details and garment prices are filled in for you.</p><button className={styles.secondary} onClick={props.onPreview}><FileText size={16} /> Preview current document</button><div className={styles.documentButtons}>{([['quotation','Quote'],['invoice','Invoice'],['partial_receipt','Part receipt'],['receipt','Receipt']] as const).map(([type,label]) => <button key={type} onClick={() => props.onDocument(type)}>{label}<ArrowRight size={13} /></button>)}</div></section></div>
    </div>
    <details className={styles.orderMore}><summary>Payment, status & other controls</summary><div className={styles.orderControls}><label>Payment<select value={props.payment || "Select Payment Status"} disabled={busy} onChange={(event) => void action(() => props.onPayment(event.target.value))}>{["Select Payment Status","Full Payment","Part Payment","Unpaid"].map((value) => <option value={value} key={value}>{value === "Select Payment Status" ? "Not recorded" : value}</option>)}</select></label><label>Order status<select value={props.status} disabled={busy} onChange={(event) => void action(() => props.onStatus(event.target.value))}>{["Pending","In Process","Urgent","Completed","Delivered","Cancelled"].map((value) => <option key={value}>{value}</option>)}</select></label><button className={styles.deleteOrder} onClick={props.onDelete}><Trash2 size={15} /> Delete order</button></div><p className={styles.orderHint}><CheckCircle2 size={14} /> Changes are saved when you select a value.</p></details>
  </article>;
}
