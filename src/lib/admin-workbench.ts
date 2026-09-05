export type WorkStage = "requests" | "waiting" | "production" | "ready" | "done";
export type WorkSource = { id: string; data: Record<string, unknown> };
export type WorkLine = { description: string; color: string; size: string; quantity: number; unitPrice: number | null };
export type WorkItem = {
  key: string; quoteId: string | null; orderId: string | null; name: string;
  reference: string; stage: WorkStage; status: string; action: string; reason: string;
  attention: boolean; overdue: boolean; urgent: boolean; deadline: string; createdAt: number;
  email: string; phone: string; delivery: string; address: string; message: string;
  total: number | null; quantity: number; payment: string; lines: WorkLine[];
  artwork: { name: string; url: string }[]; automaticPrice: boolean;
};
export const WORK_STAGES: { id: WorkStage; label: string; detail: string }[] = [
  { id: "requests", label: "To quote", detail: "New requests & changes" },
  { id: "waiting", label: "Waiting", detail: "Client reply or payment" },
  { id: "production", label: "In production", detail: "Approved work & printing" },
  { id: "ready", label: "To deliver", detail: "Ready for the customer" },
  { id: "done", label: "Closed", detail: "Delivered or cancelled" },
];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const num = (v: unknown): number | null => v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
function millis(v: unknown): number {
  const timestamp = obj(v);
  if (typeof timestamp.toMillis === "function") return (timestamp.toMillis as () => number).call(v);
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  const date = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(str(v));
  return Number.isFinite(date) ? date : 0;
}
function safeUrl(v: unknown): string {
  const value = str(v);
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { return new URL(value).protocol === "https:" ? value : ""; } catch { return ""; }
}
function dateKey(now: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function mapLines(raw: unknown): WorkLine[] {
  return Array.isArray(raw) ? raw.map((v) => { const line = obj(v); return {
    description: str(line.description) || str(line.product) || str(line.productName) || str(line.garment) || "Custom garment",
    color: str(line.color) || str(line.colour), size: str(line.size),
    quantity: Math.max(0, num(line.quantity) || 0), unitPrice: num(line.unitPrice) ?? (num(line.price) !== null && (num(line.quantity) || 0) > 0 ? Number(line.price) / Number(line.quantity) : null),
  }; }) : [];
}
export function buildWorkItems(quotes: WorkSource[], orders: WorkSource[], now = Date.now()): WorkItem[] {
  const quoteMap = new Map(quotes.map((q) => [q.id, q]));
  const orderByQuote = new Map<string, WorkSource>();
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  orders.forEach((order) => { const id = str(order.data.quoteId); if (id && !orderByQuote.has(id)) orderByQuote.set(id, order); });
  const linked = new Set<string>();
  const pairs: { quote?: WorkSource; order?: WorkSource }[] = quotes.map((quote) => {
    const order = orderMap.get(str(quote.data.orderTransactionId)) || orderByQuote.get(quote.id);
    if (order) linked.add(order.id);
    return { quote, order };
  });
  orders.filter((o) => !linked.has(o.id)).forEach((order) => pairs.push({ order, quote: quoteMap.get(str(order.data.quoteId)) }));
  const today = dateKey(now);
  return pairs.map(({ quote, order }) => {
    const q = quote?.data || {}, o = order?.data || {}, draft = obj(q.quote), profile = obj(o.documentProfile), partner = obj(q.partner);
    const status = str(o.status) || str(q.status) || "new";
    const lower = status.toLowerCase();
    const decision = str(q.clientDecision);
    const rawPayment = str(o.paymentMethod) || str(draft.paymentStatus);
    const payment = !rawPayment || rawPayment === "Select Payment Status" ? "Not recorded" : rawPayment;
    let stage: WorkStage = "requests", action = "Review quote", reason = "Request ready to review", attention = true;
    if (order) {
      stage = "production"; action = "Open job"; reason = "Check artwork and production progress";
      if (lower === "completed") { stage = "ready"; action = "Arrange delivery"; reason = "Printing complete. Arrange collection or delivery"; }
      else if (["delivered", "cancelled"].includes(lower)) { stage = "done"; action = "View order"; reason = lower === "cancelled" ? "Order cancelled" : "Delivered to the customer"; attention = false; }
      else if (lower === "urgent") { action = "Review urgent job"; reason = "This job is marked urgent"; }
      else if (lower === "in process") { attention = false; reason = "Printing is in progress"; }
    } else if (decision === "rejected") {
      stage = "done"; action = "View quote"; reason = "Client declined the quote"; attention = false;
    } else if (decision === "changes_requested") {
      reason = str(q.clientDecisionComment) || "Client requested a change"; action = "Review changes";
    } else if (decision === "accepted") {
      stage = "waiting"; action = "Review payment"; reason = "Client accepted. Check payment and prepare the job";
      if (str(obj(q.paymentEvidence).verificationStatus) === "confirmed") {
        stage = "production"; action = "Prepare job"; reason = "Payment confirmed. Ready for production handover";
      }
    } else if (status === "sent") {
      stage = "waiting"; action = "View follow-up"; reason = "Quote sent. Waiting for the client"; attention = false;
      const sentAt = millis(q.sentAt);
      if (sentAt && now - sentAt >= 3 * 86400000) { attention = true; reason = "No recorded reply for 3 days"; }
    } else if (status === "approved") { action = "Review & send"; reason = "Quote prepared. Ready for your final review"; }
    if (!order && ["completed", "will_post_tomorrow", "ryan_to_collect"].includes(str(partner.productionStatus)) && decision === "accepted") {
      stage = "ready"; action = "Review handover"; reason = "Production partner marked this job ready";
    }
    const rawDeadline = str(q.deadline) || str(o.deadline);
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(rawDeadline) ? rawDeadline : "";
    const overdue = stage !== "done" && Boolean(deadline && deadline < today);
    if (overdue) { attention = true; reason = `Past the requested date · ${rawDeadline}`; }
    const lineSource = [o.products, draft.lines, q.garments].find((source) => Array.isArray(source) && source.length);
    const lines = mapLines(lineSource);
    const orderLineTotal = order && lines.length && lines.every((line) => line.unitPrice !== null)
      ? lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice || 0), 0) : null;
    const storedTotal = num(o.amount) ?? (order ? orderLineTotal : num(draft.total));
    const total = !order && storedTotal === 0 && ["new", "review"].includes(status) && !decision ? null : storedTotal;
    const rawArtwork = Array.isArray(q.attachments) ? q.attachments : q.attachment ? [q.attachment] : [];
    const artwork = rawArtwork.map((v) => { const file = obj(v); return { name: str(file.filename) || str(file.name) || "Artwork", url: safeUrl(file.url) || safeUrl(file.originalUrl) }; }).filter((v) => v.url);
    return {
      key: order ? `order:${order.id}` : `quote:${quote!.id}`, quoteId: quote?.id || null, orderId: order?.id || null,
      name: str(o.customerName) || str(profile.clientName) || str(q.name) || "Unnamed customer",
      reference: str(o.invoiceNumber) || str(draft.documentNumber) || (order?.id || quote!.id).slice(-6).toUpperCase(),
      stage, status, action, reason, attention, overdue, urgent: lower === "urgent", deadline: rawDeadline, createdAt: Math.max(millis(q.createdAt), millis(o.transactionDate)),
      email: str(o.email) || str(q.email), phone: str(o.phoneNumber) || str(q.phone),
      delivery: str(o.deliveryMethod) || str(q.delivery), address: str(o.address) || str(q.deliveryAddress) || str(draft.clientAddress),
      message: str(q.message) || str(q.notes), total,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0) || num(q.quantity) || 0,
      payment, lines, artwork, automaticPrice: str(obj(q.automaticPricing).source) !== "" || num(obj(q.automaticPricing).pricedLineCount) !== null,
    };
  }).sort((a,b) => Number(b.urgent)-Number(a.urgent) || Number(b.overdue)-Number(a.overdue) || Number(b.attention)-Number(a.attention) || b.createdAt-a.createdAt);
}
