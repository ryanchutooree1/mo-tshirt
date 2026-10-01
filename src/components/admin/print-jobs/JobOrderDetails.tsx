import type { PrintJob, PrintJobProduct } from "@/lib/print-job-workflow";
import styles from "./job-order-details.module.css";

const missing = "Not provided";
const present = (value: string | null | undefined) => value?.trim() || missing;
const money = (value: number | null, currency: string) => value === null ? missing : `${currency || "Rs"} ${new Intl.NumberFormat("en-MU", { maximumFractionDigits: 2 }).format(value)}`;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const compact = (values: string[], limit: number) => [...values.slice(0, limit), ...(values.length > limit ? [`+${values.length - limit} more`] : [])].join(", ");
const fallbackProducts = (item: PrintJob): PrintJobProduct[] => item.lines.map(row => ({ ...row, printMethod: "", printPlacement: "", printDimensions: "" }));

/** Concise, factual row content. Full values stay available in the detail view. */
export function JobListSummary({ item }: { item: PrintJob }) {
  const rows = item.details?.products || fallbackProducts(item);
  const names = unique(rows.map(row => row.description));
  const colors = unique(rows.map(row => row.color));
  const sizes = unique(rows.filter(row => row.size).map(row => `${row.size}${row.quantity !== null ? ` × ${row.quantity}` : ""}`));
  const quantity = item.details?.garmentQuantity ?? null;
  const title = compact(names, 2) || item.garmentSummary || "Product not provided";
  return <span className={styles.listSummary}>
    <strong>{title}</strong>
    <span className={styles.listFacts}>{quantity !== null ? <span>{quantity} pieces</span> : null}{colors.length ? <span>{compact(colors, 3)}</span> : null}{sizes.length ? <span>{compact(sizes, 4)}</span> : null}</span>
    {item.details?.printMethod ? <span className={styles.listMethod}>{item.details.printMethod}</span> : null}
  </span>;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt>{label}</dt><dd>{present(value)}</dd></div>;
}

export default function JobOrderDetails({ item }: { item: PrintJob }) {
  const details = item.details;
  const customer = details?.customer || { name: item.name, company: "", phone: item.phone, email: item.email, address: item.address };
  const delivery = details?.delivery || { method: item.delivery, recipient: "", phone: "", address: item.address, postCode: "", deadline: item.deadline };
  const products = details?.products || fallbackProducts(item);
  const pricing = details?.pricingLines || item.lines.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unitPrice, lineTotal: row.unitPrice !== null ? row.quantity * row.unitPrice : null, included: true }));
  const pricingCurrency = details?.pricingCurrency || item.currency;
  const quantity = details?.garmentQuantity ?? null;
  const notes = details?.notes || (item.message ? [{ label: "Customer message", text: item.message }] : []);
  const attachments: NonNullable<PrintJob["details"]>["attachments"] = details?.attachments || item.artwork.map(file => ({ ...file, originalName: "", originalUrl: "", description: "" }));
  return <section className={styles.details} aria-label="Job order details">
    <div className={styles.heading}><div><span>ORDER INFORMATION</span><h3>Customer, products & print details</h3></div><span>{item.reference}</span></div>
    <div className={styles.contactGrid}>
      <section className={styles.card} aria-label="Customer details"><h4>Customer</h4><dl className={styles.facts}>
        <Fact label="Name" value={customer.name} /><Fact label="Company" value={customer.company} /><Fact label="Email" value={customer.email} /><Fact label="Phone / WhatsApp" value={customer.phone} /><Fact label="Address" value={customer.address} />
      </dl></section>
      <section className={styles.card} aria-label="Delivery details"><h4>Collection / delivery</h4><dl className={styles.facts}>
        <Fact label="Method" value={delivery.method} /><Fact label="Recipient" value={delivery.recipient} /><Fact label="Delivery phone" value={delivery.phone} /><Fact label="Delivery address" value={delivery.address} /><Fact label="Postcode" value={delivery.postCode} /><Fact label="Required date" value={delivery.deadline} />
      </dl></section>
    </div>
    <section className={styles.card} aria-label="Products and size quantities"><div className={styles.sectionHeading}><h4>Products & size quantities</h4><span>{quantity !== null ? `${quantity} pieces recorded` : "Total garment quantity not provided"}</span></div>
      {products.length ? <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Recorded product, colour, size and quantity</caption><thead><tr><th scope="col">Product</th><th scope="col">Colour</th><th scope="col">Size</th><th scope="col" className={styles.numeric}>Qty</th></tr></thead><tbody>{products.map((row, index) => <tr key={index}><td><strong>{present(row.description)}</strong>{row.printMethod || row.printPlacement || row.printDimensions ? <small>{[row.printMethod, row.printPlacement, row.printDimensions].filter(Boolean).join(" · ")}</small> : null}</td><td>{present(row.color)}</td><td>{present(row.size)}</td><td className={styles.numeric}>{row.quantity ?? missing}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>{missing}</p>}
      <dl className={styles.printFacts}><Fact label="Print method" value={details?.printMethod} /><Fact label="Print position" value={details?.printPlacement} /><Fact label="Print dimensions" value={details?.printDimensions} /></dl>
      {details?.artworkRequests.length ? <div className={styles.artworkRequests}>{details.artworkRequests.map((request, index) => <div key={index}><strong>{request.label}</strong><span>{[request.product, request.color, request.size, request.quantity !== null ? `Qty ${request.quantity}` : ""].filter(Boolean).join(" · ") || missing}</span><dl className={styles.printFacts}><Fact label="Position" value={request.placement} /><Fact label="Dimensions" value={request.dimensions} /><Fact label="Instructions" value={request.instructions} /></dl></div>)}</div> : null}
    </section>
    <section className={styles.card} aria-label="Recorded line pricing"><div className={styles.sectionHeading}><h4>Line pricing</h4><span>{details?.pricingSource ? `${details.pricingSource} figures` : "Recorded figures"}</span></div>
      {pricing.length ? <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Recorded line quantities, unit prices and line totals</caption><thead><tr><th scope="col">Description</th><th scope="col" className={styles.numeric}>Qty</th><th scope="col" className={styles.numeric}>Unit price</th><th scope="col" className={styles.numeric}>Line total</th></tr></thead><tbody>{pricing.map((row, index) => <tr key={index}><td><strong>{present(row.description)}</strong>{!row.included ? <small>Excluded from document total</small> : null}</td><td className={styles.numeric}>{row.quantity ?? missing}</td><td className={styles.numeric}>{money(row.unitPrice, pricingCurrency)}</td><td className={styles.numeric}>{money(row.lineTotal, pricingCurrency)}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>{missing}</p>}
      <dl className={styles.totals}>{details?.deliveryFee !== null && details?.deliveryFee !== undefined ? <Fact label="Delivery fee" value={money(details.deliveryFee, pricingCurrency)} /> : null}{details?.discount !== null && details?.discount !== undefined ? <Fact label="Discount" value={money(details.discount, pricingCurrency)} /> : null}<Fact label="Recorded total" value={money(item.total, item.currency)} /></dl>
    </section>
    <div className={styles.contactGrid}>
      <section className={styles.card} aria-label="Notes and instructions"><h4>Notes & instructions</h4>{notes.length ? <div className={styles.notes}>{notes.map((note, index) => <div key={index}><h5>{note.label}</h5><p>{note.text}</p></div>)}</div> : <p className={styles.empty}>{missing}</p>}</section>
      <section className={styles.card} aria-label="Attachments"><div className={styles.sectionHeading}><h4>Attachments</h4><span>{attachments.length} recorded</span></div>{attachments.length ? <ul className={styles.attachments}>{attachments.map((file, index) => <li key={index}>{file.url || file.originalUrl ? <a href={file.url || file.originalUrl} target="_blank" rel="noopener noreferrer">{file.name}<span aria-hidden="true">↗</span></a> : <strong>{file.name}</strong>}{file.description ? <p>{file.description}</p> : null}{file.originalUrl && file.originalUrl !== file.url ? <a className={styles.original} href={file.originalUrl} target="_blank" rel="noopener noreferrer">{file.originalProvenance === "client-upload" ? "Original upload" : "Saved source"}: {file.originalName || file.name}<span aria-hidden="true">↗</span></a> : null}{!file.url && !file.originalUrl ? <small>File link not provided</small> : null}</li>)}</ul> : <p className={styles.empty}>{missing}</p>}</section>
    </div>
  </section>;
}
