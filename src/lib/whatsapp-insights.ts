import type { ArchiveMessage, WhatsAppArchive } from "./whatsapp-archive";

export const INSIGHTS_VERSION = "2026-09-12.1";
export const PRODUCT_RULES = [
  { id: "tshirts", label: "T-shirts", pattern: /\b(?:t[ -]*shirts?|tee[ -]*shirts?|thshirts?)\b/ },
  { id: "polos", label: "Polo shirts", pattern: /\bpolo(?:[ -]*shirts?)?s?\b/ },
  { id: "caps", label: "Caps", pattern: /\b(?:caps?|casquettes?|kasket\w*)\b/ },
  { id: "hoodies", label: "Hoodies", pattern: /\b(?:hoodies?|sweatshirts?)\b/ },
  { id: "mugs", label: "Mugs", pattern: /\b(?:mugs?|tasses?)\b/ },
  { id: "bags", label: "Bags", pattern: /\b(?:tote[ -]*bags?|bags?|sacs?)\b/ },
] as const;
const TOPIC_RULES = [
  { id: "price", label: "Price / quote", pattern: /\b(?:price|pricing|prix|tarif|combien|how much|cost|coute|cout|devis|quote|quotation|cotation)\b/ },
  { id: "delivery", label: "Delivery / collection", pattern: /\b(?:deliver\w*|livraison|livresion|posting|postage|postal|post office|pickup|pick up|collect\w*|recuper\w*)\b/ },
  { id: "deadline", label: "Timing / urgency", pattern: /\b(?:urgent|asap|demain|tomorrow|tommorow|before|au plus tard|how long|lead[ -]?time|delai)\b|\b(?:by|for|pour|avant) (?:this |next |ce |le )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/ },
  { id: "sizes", label: "Sizes / fit", pattern: /\b(?:sizes?|tailles?|oversiz\w*|unisex|coupe|fit|4xl|3xl|2xl)\b/ },
  { id: "embroidery", label: "Embroidery", pattern: /\b(?:embroider\w*|brod\w*)\b/ },
  { id: "sublimation", label: "Sublimation", pattern: /\bsublimat\w*\b/ },
  { id: "plain", label: "Plain / blank garments", pattern: /\b(?:plain|blank|sans impression|sans logo|without printing)\b/ },
  { id: "bulk", label: "Bulk / wholesale", pattern: /\b(?:bulk|wholesale|en gros|batch|staff|uniform\w*)\b/ },
] as const;
const DOMAIN = /\b(?:shirts?|t[ -]*shirts?|tee[ -]*shirts?|polos?|poloshirts?|print\w*|imprim\w*|impression|custom\w*|personnalis\w*|personalis\w*|caps?|casquettes?|kasket\w*|hoodies?|mugs?|tasses?|tote|broderie|embroidery|sublimation|apparel|textiles?|clothing|garments?|uniform\w*|logo|order|commande)\b/;
const REQUEST = /\b(?:need|want|would like|looking|interested|interes\w*|souhait\w*|voudrai\w*|bizin|biso?in|mo.*fer|do you|do u|can you|can u|could you|can i|could i|pouvez|est ce|eski|how much|price|prix|tarif|combien|quote|quotation|cotation|devis|order|commande|commander|please|svp)\b/;
const SUPPLIER = /\b(?:we supply|we are (?:a |the )?manufacturer|we are (?:a |the )?supplier|i am (?:a |an )?manufacturer|i'm (?:a |an )?(?:vector artist|graphic designer)|recruitment (?:consultant|consultancy)|manpower|seo services|digital marketing services|we specialize in providing)\b/;
const CHASING = /no (?:response|reply|confirmation)|not (?:received|getting|heard).{0,30}(?:reply|response|confirmation)|still (?:waiting|awaiting)|can i get (?:an? )?response|can somebody get back|reply is too late|reply.{0,10}too late|atann.{0,30}repons|pann gagn okenn|pas (?:eu|recu).{0,20}reponse|please reply back|not doing well|since last time.{0,30}sent/;
const CANCELLATION = /(?:will not|won't|wont).{0,15}(?:proceed|go(?:ing)? ahead)|(?:found|got).{0,25}(?:someone|another|alternative)|trouve.{0,25}(?:solution|alternative|autre)|\b(?:cancel(?:led|lation)?|refund|rembours\w*)\b/;
const PRICE_CONCERN = /too expensive|trop cher|out of.{0,10}budget|hors budget/;
const WEBSITE_ISSUE = /(?:website|site|checkout|on your page|online)/;
const WEBSITE_PROBLEM = /(?:not working|doesn.t work|problem|issue|can.t see|cant see|cannot|only one|could be choosen|small.{0,20}medium|pann gagn okenn|aucune confirmation|no confirmation)/;
const PAYMENT = /\b(?:i|we).{0,20}(?:have paid|already paid|just paid|transferred)|\b(?:payment|deposit).{0,15}(?:sent|done|made)|virement.{0,20}effectue|deja paye|monn.{0,10}pay|mo finn.{0,10}pay/;
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{Diacritic}/gu, "")
  .replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, "-").toLowerCase();
const body = (message: ArchiveMessage) => normalize(`${message.text || ""} ${message.caption || ""}`.trim());
const localDay = (value: string) => new Date(Date.parse(value) + 4 * 3600000).toISOString().slice(0, 10);
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null; };
const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;

export type InsightsFilter = { start?: string; end?: string; product?: string };
export type EnquiryCohort = {
  conversationId: string; firstRequestAt: string; requestMessageId: string;
  products: string[]; topics: string[]; incomingCount: number; responseHours: number | null;
  responseBucket: "Non-template reply" | "Template only" | "No reply recorded";
  oldEnoughFor24h: boolean; within24h: boolean; chasing: boolean; cancellation: boolean;
  priceConcern: boolean; websiteIssue: boolean; paymentMention: boolean;
  signalIds: Record<string, string[]>;
};

export function buildWhatsAppInsights(archive: WhatsAppArchive, filters: InsightsFilter = {}) {
  const sourceEnd = localDay(archive.manifest.exportedAt);
  const start = filters.start || `${sourceEnd.slice(0, 4)}-01-01`;
  const end = filters.end || sourceEnd;
  const product = filters.product || "all";
  const asOf = Date.parse(archive.manifest.exportedAt);
  const groups = new Map<string, ArchiveMessage[]>();
  const templateUses = new Map<string, Set<string>>();
  for (const message of archive.messages) {
    if (!message.sentAt) continue;
    const list = groups.get(message.chatId) || []; list.push(message); groups.set(message.chatId, list);
    const text = body(message);
    if (message.direction === "outgoing" && text.length >= 120) {
      const uses = templateUses.get(text) || new Set<string>(); uses.add(message.chatId); templateUses.set(text, uses);
    }
  }
  for (const rows of groups.values()) rows.sort((a, b) => Date.parse(a.sentAt!) - Date.parse(b.sentAt!) || Number(a.id) - Number(b.id));
  const isTemplate = (message: ArchiveMessage) => (templateUses.get(body(message))?.size || 0) >= 3;
  const excluded = new Map((archive.analysisReview?.excludedConversations || []).map(row => [row.id, row.reason]));
  const cohorts: EnquiryCohort[] = [];
  const monthly = new Map<string, Set<string>>();
  const exclusions = { personalOrInternal: 0, automatedOrBroadcast: 0, supplierOrRecruitment: 0, noEnquirySignal: 0, outsidePeriod: 0, productFilter: 0 };
  let includedMessages = 0;
  for (const chat of archive.chats) {
    if (excluded.has(chat.id)) { exclusions.personalOrInternal++; continue; }
    const name = normalize(chat.name).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
    if (["whatsapp", "facebook", "instagram", "ada otp"].includes(name) || chat.jid?.endsWith("@broadcast")) {
      exclusions.automatedOrBroadcast++; continue;
    }
    const all = groups.get(chat.id) || [];
    const incomingAll = all.filter(message => message.direction === "incoming" && body(message));
    const supplierMessages = incomingAll.filter(message => SUPPLIER.test(body(message)));
    const validIncoming = incomingAll.filter(message => !SUPPLIER.test(body(message)));
    const hasContext = all.some(message => DOMAIN.test(body(message)));
    const isEnquiry = (message: ArchiveMessage) => hasContext && (REQUEST.test(body(message)) ||
      (DOMAIN.test(body(message)) && !/https?:|\.jpg$|\.pdf$/.test(body(message))));
    const allRequests = validIncoming.filter(isEnquiry);
    if (!allRequests.length) {
      if (supplierMessages.length) exclusions.supplierOrRecruitment++;
      else exclusions.noEnquirySignal++;
      continue;
    }
    const incoming = validIncoming.filter(message => localDay(message.sentAt!) >= start && localDay(message.sentAt!) <= end);
    const requests = incoming.filter(isEnquiry);
    if (!requests.length) { exclusions.outsidePeriod++; continue; }
    const combined = incoming.map(body).join("\n");
    const products = PRODUCT_RULES.filter(rule => rule.pattern.test(combined)).map(rule => rule.id);
    if (product !== "all" && !products.includes(product as typeof products[number])) { exclusions.productFilter++; continue; }
    const first = requests[0];
    const after = all.filter(message => message.direction === "outgoing" &&
      Date.parse(message.sentAt!) >= Date.parse(first.sentAt!) && Date.parse(message.sentAt!) <= asOf &&
      (Boolean(body(message)) || Boolean(message.mediaMime)));
    const response = after.find(message => !isTemplate(message));
    const hours = response ? (Date.parse(response.sentAt!) - Date.parse(first.sentAt!)) / 3600000 : null;
    const signalIds: Record<string, string[]> = {};
    const signal = (id: string, predicate: (text: string) => boolean) => {
      signalIds[id] = incoming.filter(message => predicate(body(message))).map(message => message.id);
      return signalIds[id].length > 0;
    };
    const row: EnquiryCohort = {
      conversationId: chat.id, firstRequestAt: first.sentAt!, requestMessageId: first.id,
      products, topics: TOPIC_RULES.filter(rule => rule.pattern.test(combined)).map(rule => rule.id),
      incomingCount: incoming.length, responseHours: hours,
      responseBucket: response ? "Non-template reply" : after.length ? "Template only" : "No reply recorded",
      oldEnoughFor24h: asOf - Date.parse(first.sentAt!) >= 24 * 3600000,
      within24h: hours !== null && hours <= 24,
      chasing: signal("chasing", text => CHASING.test(text)),
      cancellation: signal("cancellation", text => CANCELLATION.test(text)),
      priceConcern: signal("priceConcern", text => PRICE_CONCERN.test(text)),
      websiteIssue: signal("websiteIssue", text => WEBSITE_ISSUE.test(text) && WEBSITE_PROBLEM.test(text)),
      paymentMention: signal("paymentMention", text => PAYMENT.test(text)), signalIds,
    };
    cohorts.push(row); includedMessages += incoming.length;
    for (const request of requests) {
      const month = localDay(request.sentAt!).slice(0, 7);
      const ids = monthly.get(month) || new Set(); ids.add(chat.id); monthly.set(month, ids);
    }
  }
  const count = cohorts.length;
  const replied = cohorts.filter(row => row.responseHours !== null);
  const mature = cohorts.filter(row => row.oldEnoughFor24h);
  const within24h = mature.filter(row => row.within24h).length;
  const products = PRODUCT_RULES.map(rule => ({ id: rule.id, label: rule.label,
    count: cohorts.filter(row => row.products.includes(rule.id)).length })).sort((a, b) => b.count - a.count);
  const topics = TOPIC_RULES.map(rule => ({ id: rule.id, label: rule.label,
    count: cohorts.filter(row => row.topics.includes(rule.id)).length })).sort((a, b) => b.count - a.count);
  const responseBuckets = ["Non-template reply", "Template only", "No reply recorded"].map(label => ({ label,
    count: cohorts.filter(row => row.responseBucket === label).length }));
  const latency = [
    { label: "Under 1 hour", count: replied.filter(row => row.responseHours! < 1).length },
    { label: "1–24 hours", count: replied.filter(row => row.responseHours! >= 1 && row.responseHours! <= 24).length },
    { label: "1–3 days", count: replied.filter(row => row.responseHours! > 24 && row.responseHours! <= 72).length },
    { label: "Over 3 days", count: replied.filter(row => row.responseHours! > 72).length },
  ];
  const friction = [
    { id: "chasing", label: "Chasing a response", count: cohorts.filter(row => row.chasing).length },
    { id: "cancellation", label: "Cancel / refund / switch", count: cohorts.filter(row => row.cancellation).length },
    { id: "websiteIssue", label: "Website ordering issue", count: cohorts.filter(row => row.websiteIssue).length },
    { id: "priceConcern", label: "Price too high", count: cohorts.filter(row => row.priceConcern).length },
  ];
  const hourBuckets = Array.from({ length: 6 }, (_, index) => ({
    label: `${String(index * 4).padStart(2, "0")}–${String(index * 4 + 3).padStart(2, "0")}:59`,
    count: cohorts.filter(row => Math.floor(new Date(Date.parse(row.firstRequestAt) + 4 * 3600000).getUTCHours() / 4) === index).length,
  }));
  const monthRows = [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([month, ids]) => ({ month, count: ids.size }));
  const pressure = cohorts.filter(row => row.oldEnoughFor24h && !row.within24h).length;
  const topProduct = products.find(row => row.count > 0);
  const price = topics.find(row => row.id === "price")!.count;
  const deadline = topics.find(row => row.id === "deadline")!.count;
  const insights: { title: string; evidence: string; decision: string; caution?: string }[] = [];
  if (pressure) insights.push({ title: "Review the response process", evidence: `${pressure} of ${mature.length} mature enquiry conversations have no non-template reply within 24 hours in this snapshot.`,
    decision: "Assign a daily follow-up owner and track the time to a tailored reply.",
    caution: "Calls, email replies and phone-only history are not counted. This does not prove the enquiries were ignored." });
  if (price) insights.push({ title: "Make pricing and quotes easier to get", evidence: `${price} of ${count} enquiry conversations mention price or a quote.`,
    decision: "Test a clear quote form covering garment, quantity, print area, sizes and delivery, with visible starting prices." });
  if (deadline) insights.push({ title: "Confirm deadlines at intake", evidence: `${deadline} of ${count} enquiry conversations mention timing or urgency.`,
    decision: "Show available turnaround times before accepting an order and ask for the required delivery date." });
  if (topProduct) insights.push({ title: `Prioritise the ${topProduct.label.toLowerCase()} offer`, evidence: `${topProduct.count} of ${count} enquiry conversations mention ${topProduct.label.toLowerCase()}; this is the most-mentioned tracked product.`,
    decision: "Use the demand mix to prioritise product information and samples; confirm margins and completed orders before changing stock.",
    caution: "Mentions can include products customers ask whether you offer. They do not establish sales or profitability." });
  if (friction.find(row => row.id === "websiteIssue")!.count) insights.push({ title: "Check the website order journey", evidence: `${friction.find(row => row.id === "websiteIssue")!.count} enquiry conversations contain a website ordering problem signal.`,
    decision: "Check size and quantity selection, quote visibility and order confirmations. Reconcile these reports with actual website orders." });
  return {
    version: INSIGHTS_VERSION, filters: { start, end, product }, asOf: archive.manifest.exportedAt,
    source: { source: archive.manifest.source, sourceMessages: archive.messages.length, sourceConversations: archive.chats.length,
      sourceContacts: archive.contacts.length, firstMessageAt: archive.manifest.firstMessageAt, lastMessageAt: archive.manifest.lastMessageAt,
      localFiles: archive.files.length, mediaOriginals: archive.manifest.quality.messagesWithLocalFile, exclusions,
      manuallyReviewedExclusions: excluded.size, limitations: archive.manifest.limitations },
    kpis: { enquiries: count, incomingMessages: includedMessages, replied: replied.length,
      medianReplyHours: median(replied.map(row => row.responseHours!)), matureEnquiries: mature.length,
      repliedWithin24h: within24h, replyWithin24hRate: rate(within24h, mature.length),
      beyond24h: pressure, noNonTemplateReply: count - replied.length,
      cancellationSignals: cohorts.filter(row => row.cancellation).length,
      paymentMentions: cohorts.filter(row => row.paymentMention).length },
    products, topics, responseBuckets, latency, friction, hourBuckets, months: monthRows, insights,
    methodology: [
      "Unit: distinct WhatsApp conversations with an incoming garment/printing/order request signal in the selected period. These are provisional enquiry classifications, not verified customers or orders.",
      "Personal/internal conversations reviewed during extraction, official automated accounts, broadcasts, and supplier/recruitment pitches are excluded. Keyword rules can miss or misclassify messages, particularly Creole and image/audio-only enquiries.",
      "Products and topics use incoming text and captions only. A conversation may appear in several categories; shares do not sum to 100%. Outgoing price lists do not count as customer demand.",
      "Reply time starts at the first qualifying incoming request in the selected period and ends at the next recorded non-template outgoing text/media message, observed through the extraction time. A message repeated across at least three conversations and at least 120 characters is treated as a template; this does not determine whether it was sent automatically.",
      "The 24-hour metric includes only conversations with at least 24 hours of observation. It uses calendar hours, including nights and weekends. Calls, email responses and missing phone history are outside this metric.",
      "Monthly bars count distinct conversations with a request in each month; a returning conversation may appear in multiple months. Missing periods mean no matching records in the snapshot, not proof of zero demand. The latest month is partial.",
      "Friction and payment counts are text signals, not verified losses or revenue. A cancellation/refund/switch mention does not prove its cause or final outcome. No revenue, margin or conversion rate is calculated from these chats.",
    ],
    cohorts,
  };
}
export type WhatsAppInsights = ReturnType<typeof buildWhatsAppInsights>;
