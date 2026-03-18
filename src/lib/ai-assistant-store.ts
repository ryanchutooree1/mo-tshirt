import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ASSISTANT_PRODUCT_TYPES,
  assistantReadyToSubmit,
  buildAssistantTrainingState,
  createEmptyAssistantLead,
  createEmptyLearnedProductAliases,
  createEmptyLearnedProductPlaybooks,
  formatLeadSummary,
  missingAssistantFields,
  normalizeAssistantAttachment,
  normalizeAssistantLead,
  runAssistantTurn,
  type AssistantAttachment,
  type AssistantApprovedLeadSource,
  type AssistantChatResult,
  type AssistantFeedbackEntry,
  type AssistantKnowledgeSource,
  type AssistantLearnedPrintPattern,
  type AssistantLead,
  type AssistantMessageRole,
  type AssistantProductPlaybook,
  type AssistantProductType,
  type AssistantRequiredField,
  type AssistantTrainingState,
  type AssistantTrainingSnapshot,
  type AssistantTurnDebug,
} from "@/lib/ai-assistant";

const COLLECTIONS = {
  sessions: "aiAssistantSessions",
  leads: "aiAssistantLeads",
  knowledge: "aiAssistantKnowledge",
  feedback: "aiAssistantFeedback",
  modelState: "aiAssistantModelState",
} as const;

const MODEL_STATE_KEY = "local-sales-ai";

type FirestoreLike = Record<string, unknown>;

export type AssistantMessageRecord = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  attachment: AssistantAttachment | null;
  debug?: AssistantTurnDebug | null;
  createdAt: string | null;
};

export type AssistantSessionSummary = {
  sessionId: string;
  exists: boolean;
  lead: AssistantLead;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessage: string | null;
  messageCount: number;
  submittedLeadId: string | null;
  submittedAt: string | null;
  readyToSubmit: boolean;
  missingFields: AssistantRequiredField[];
};

export type AssistantSessionDetail = AssistantSessionSummary & {
  messages: AssistantMessageRecord[];
};

export type AssistantLeadRecord = {
  id: string;
  sessionId: string;
  status: string;
  lead: AssistantLead;
  summary: string;
  quoteId?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  feedbackComment: string | null;
  feedbackAt: string | null;
};

export type AssistantKnowledgeRecord = {
  id: string;
  title: string;
  content: string;
  createdAt: string | null;
};

export type AssistantOverview = {
  sessions: AssistantSessionSummary[];
  leads: AssistantLeadRecord[];
  knowledge: AssistantKnowledgeRecord[];
  training: AssistantTrainingSnapshot | null;
};

export type AssistantChatPayload = AssistantChatResult & {
  sessionId: string;
  session: AssistantSessionDetail;
  autoSubmitted?: boolean;
  quoteId?: string | null;
};

export type AssistantSubmitResult =
  | {
      ok: true;
      lead: AssistantLeadRecord;
      quoteId: string | null;
    }
  | {
      ok: false;
      error: string;
      notFound?: boolean;
      missingFields?: AssistantRequiredField[];
    };

export type AssistantFeedbackResult =
  | {
      ok: true;
      lead: AssistantLeadRecord;
      training: AssistantTrainingSnapshot;
    }
  | {
      ok: false;
      error: string;
      notFound?: boolean;
    };

export type AssistantKnowledgeResult = {
  ok: true;
  knowledge: AssistantKnowledgeRecord;
  training: AssistantTrainingSnapshot;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableString(value: unknown) {
  const trimmed = cleanString(value);
  return trimmed || null;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function timestampToIso(value: unknown, fallback?: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      const parsed = maybeTimestamp.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return new Date(maybeTimestamp.seconds * 1000).toISOString();
    }
  }
  if (fallback !== undefined) {
    return timestampToIso(fallback);
  }
  return null;
}

function mapSessionSummary(id: string, data: FirestoreLike, exists = true): AssistantSessionSummary {
  const lead = normalizeAssistantLead(data.lead);
  return {
    sessionId: id,
    exists,
    lead,
    createdAt: timestampToIso(data.createdAt, data.createdAtIso),
    updatedAt: timestampToIso(data.updatedAt, data.updatedAtIso),
    lastMessage: cleanNullableString(data.lastMessage),
    messageCount: asNumber(data.messageCount, 0),
    submittedLeadId: cleanNullableString(data.submittedLeadId),
    submittedAt: timestampToIso(data.submittedAt, data.submittedAtIso),
    readyToSubmit: assistantReadyToSubmit(lead),
    missingFields: missingAssistantFields(lead),
  };
}

function mapMessageRecord(id: string, data: FirestoreLike): AssistantMessageRecord {
  return {
    id,
    role: data.role === "user" ? "user" : "assistant",
    content: cleanString(data.content),
    attachment: normalizeAssistantAttachment(data.attachment),
    debug: data.debug && typeof data.debug === "object" ? (data.debug as AssistantTurnDebug) : null,
    createdAt: timestampToIso(data.createdAt, data.createdAtIso),
  };
}

function mapLeadRecord(id: string, data: FirestoreLike): AssistantLeadRecord {
  const lead = normalizeAssistantLead(data.lead || data);
  return {
    id,
    sessionId: cleanString(data.sessionId),
    status: cleanString(data.status) || "submitted",
    lead,
    summary: cleanString(data.summary) || formatLeadSummary(lead),
    quoteId: cleanNullableString(data.quoteId),
    createdAt: timestampToIso(data.createdAt, data.createdAtIso),
    updatedAt: timestampToIso(data.updatedAt, data.updatedAtIso),
    feedbackComment: cleanNullableString(data.feedbackComment),
    feedbackAt: timestampToIso(data.feedbackAt, data.feedbackAtIso),
  };
}

function mapKnowledgeRecord(id: string, data: FirestoreLike): AssistantKnowledgeRecord {
  return {
    id,
    title: cleanString(data.title),
    content: cleanString(data.content),
    createdAt: timestampToIso(data.createdAt, data.createdAtIso),
  };
}

function mapLearnedProductAliases(value: unknown): Record<AssistantProductType, string[]> {
  const fallback = createEmptyLearnedProductAliases();
  if (!value || typeof value !== "object") return fallback;

  const source = value as Record<string, unknown>;
  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    const aliases = Array.isArray(source[productType]) ? source[productType] : [];
    fallback[productType] = Array.from(
      new Set(
        aliases
          .map((alias) => cleanString(alias))
          .filter(Boolean)
      )
    );
  });

  return fallback;
}

function mapLearnedPrintPattern(value: unknown): AssistantLearnedPrintPattern | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const positions = Array.isArray(source.positions)
    ? source.positions.map((entry) => cleanString(entry).toLowerCase()).filter(Boolean)
    : [];
  const printSizes = Array.isArray(source.printSizes)
    ? source.printSizes.map((entry) => cleanString(entry).toLowerCase()).filter(Boolean)
    : [];

  if (!positions.length) return null;

  return {
    positions: Array.from(new Set(positions)).sort((left, right) => left.localeCompare(right)),
    printSizes: Array.from(new Set(printSizes)).sort((left, right) => left.localeCompare(right)),
    count: asNumber(source.count, 0),
  };
}

function mapLearnedProductPlaybooks(value: unknown): Record<AssistantProductType, AssistantProductPlaybook> {
  const fallback = createEmptyLearnedProductPlaybooks();
  if (!value || typeof value !== "object") return fallback;

  const source = value as Record<string, unknown>;
  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    const entry = source[productType];
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const topColor = cleanNullableString(record.topColor)?.toLowerCase() || null;
    const topDeliveryMethod = cleanString(record.topDeliveryMethod).toLowerCase();

    fallback[productType] = {
      topColor,
      topDeliveryMethod:
        topDeliveryMethod === "pickup" || topDeliveryMethod === "delivery"
          ? topDeliveryMethod
          : null,
      topPrintPattern: mapLearnedPrintPattern(record.topPrintPattern),
    };
  });

  return fallback;
}

function mapTrainingSnapshot(data: FirestoreLike | null): AssistantTrainingSnapshot | null {
  if (!data) return null;
  const topKeywords = Array.isArray(data.topKeywords)
    ? data.topKeywords
        .map((entry) => ({
          keyword:
            entry && typeof entry === "object" && "keyword" in entry
              ? cleanString((entry as Record<string, unknown>).keyword)
              : "",
          count:
            entry && typeof entry === "object" && "count" in entry
              ? asNumber((entry as Record<string, unknown>).count, 0)
              : 0,
        }))
        .filter((entry) => entry.keyword)
    : [];

  const fieldGroups = Array.isArray(data.fieldGroups)
    ? data.fieldGroups
        .map((entry) =>
          entry && typeof entry === "object"
            ? {
                field: cleanString((entry as Record<string, unknown>).field),
                examples: Array.isArray((entry as Record<string, unknown>).examples)
                  ? ((entry as Record<string, unknown>).examples as unknown[]).map((value) => cleanString(value)).filter(Boolean)
                  : [],
              }
            : null
        )
        .filter((entry) => entry && entry.field && entry.examples.length) as Array<{ field: string; examples: string[] }>
    : [];

  const learnedProductAliases = mapLearnedProductAliases(data.learnedProductAliases);
  const learnedProductPlaybooks = mapLearnedProductPlaybooks(data.learnedProductPlaybooks);
  const retrievalIndexMetadata =
    data.retrievalIndexMetadata && typeof data.retrievalIndexMetadata === "object"
      ? {
          documentCount: asNumber((data.retrievalIndexMetadata as Record<string, unknown>).documentCount, 0),
          avgTermsPerDocument: asNumber((data.retrievalIndexMetadata as Record<string, unknown>).avgTermsPerDocument, 0),
          threshold: asNumber((data.retrievalIndexMetadata as Record<string, unknown>).threshold, 0.18),
        }
      : {
          documentCount: 0,
          avgTermsPerDocument: 0,
          threshold: 0.18,
        };

  return {
    positiveKeywordCount: asNumber(data.positiveKeywordCount, topKeywords.length),
    fieldGroups,
    approvedLeadCount: asNumber(data.approvedLeadCount, 0),
    knowledgeCount: asNumber(data.knowledgeCount, 0),
    feedbackCount: asNumber(data.feedbackCount, 0),
    faqCount: asNumber(data.faqCount, 0),
    classifierSampleCount: asNumber(data.classifierSampleCount, 0),
    classifierLabelCount: asNumber(data.classifierLabelCount, 0),
    retrievalDocumentCount: asNumber(data.retrievalDocumentCount, retrievalIndexMetadata.documentCount),
    topKeywords,
    learnedProductAliases,
    learnedProductAliasCount: asNumber(
      data.learnedProductAliasCount,
      Object.values(learnedProductAliases).reduce((total, aliases) => total + aliases.length, 0)
    ),
    learnedProductPlaybooks,
    retrievalIndexMetadata,
    updatedAt: timestampToIso(data.updatedAt, data.updatedAtIso),
  };
}

function mapTrainingState(data: FirestoreLike | null): AssistantTrainingState | null {
  const snapshot = mapTrainingSnapshot(data);
  if (!snapshot) return null;
  const baseState = buildAssistantTrainingState();

  return {
    ...snapshot,
    intentModel:
      data?.intentModel && typeof data.intentModel === "object"
        ? (data.intentModel as AssistantTrainingState["intentModel"])
        : baseState.intentModel,
    retrievalIndex: baseState.retrievalIndex,
    retrievalDocuments: [],
    trainingSamples: Array.isArray(data?.trainingSamples)
      ? (data?.trainingSamples as AssistantTrainingState["trainingSamples"])
      : [],
    faqMemory: Array.isArray(data?.faqMemory) ? (data?.faqMemory as AssistantTrainingState["faqMemory"]) : [],
    aliasMap: snapshot.learnedProductAliases,
    feedbackEntries: [],
  };
}

async function getSessionUserMessages(sessionId: string, limitCount = 40) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.sessions, sessionId, "messages"), orderBy("createdAt", "asc"), limit(limitCount))
  );
  return snap.docs
    .map((item) => mapMessageRecord(item.id, item.data() as FirestoreLike))
    .filter((item) => item.role === "user" && item.content)
    .map((item) => item.content);
}

async function getSessionAssistantMessages(sessionId: string, limitCount = 40) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.sessions, sessionId, "messages"), orderBy("createdAt", "asc"), limit(limitCount))
  );
  return snap.docs
    .map((item) => mapMessageRecord(item.id, item.data() as FirestoreLike))
    .filter((item) => item.role === "assistant" && item.content)
    .map((item) => item.content);
}

async function getLeadSources(
  limitCount = 160,
  options?: { includeSessionMessages?: boolean }
): Promise<AssistantApprovedLeadSource[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.leads), orderBy("updatedAt", "desc"), limit(limitCount)));
  const leads = snap.docs.map((item) => mapLeadRecord(item.id, item.data() as FirestoreLike));

  if (!options?.includeSessionMessages) {
    return leads.map((item) => ({
      id: item.id,
      lead: item.lead,
      status: item.status,
      summary: item.summary,
      sessionId: item.sessionId,
    }));
  }

  return Promise.all(
    leads.map(async (item) => ({
      id: item.id,
      lead: item.lead,
      status: item.status,
      summary: item.summary,
      sessionId: item.sessionId,
      sessionMessages: item.sessionId ? await getSessionUserMessages(item.sessionId) : [],
      acceptedReplies: item.sessionId ? await getSessionAssistantMessages(item.sessionId) : [],
    }))
  );
}

async function getKnowledgeSources(limitCount = 120): Promise<AssistantKnowledgeSource[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.knowledge), orderBy("createdAt", "desc"), limit(limitCount))
  );
  return snap.docs.map((item) => mapKnowledgeRecord(item.id, item.data() as FirestoreLike));
}

async function getFeedbackEntries(limitCount = 200): Promise<AssistantFeedbackEntry[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.feedback), orderBy("createdAt", "desc"), limit(limitCount)));
  return snap.docs.map((item) => {
    const data = item.data() as FirestoreLike;
    return {
      id: item.id,
      leadId: cleanNullableString(data.leadId),
      sessionId: cleanNullableString(data.sessionId),
      verdict: cleanString(data.verdict).toLowerCase() === "approved" ? "approved" : "rejected",
      comment: cleanNullableString(data.comment),
      createdAt: timestampToIso(data.createdAt, data.createdAtIso),
      userMessages: Array.isArray(data.userMessages) ? data.userMessages.map((value) => cleanString(value)).filter(Boolean) : [],
      assistantReplies: Array.isArray(data.assistantReplies) ? data.assistantReplies.map((value) => cleanString(value)).filter(Boolean) : [],
      lead: data.lead ? normalizeAssistantLead(data.lead) : null,
    };
  });
}

function buildLeadDocument(sessionId: string, lead: AssistantLead, nowIso: string) {
  return {
    sessionId,
    status: "submitted",
    lead,
    summary: formatLeadSummary(lead),
    clientName: lead.clientName,
    companyName: lead.companyName,
    phone: lead.phone,
    email: lead.email,
    productType: lead.productType,
    quantity: lead.quantity,
    color: lead.color,
    sizes: lead.sizes,
    printPositions: lead.printPositions,
    printSizes: lead.printSizes,
    printType: lead.printType,
    logoReady: lead.logoReady,
    logoAttachment: lead.logoAttachment,
    deliveryMethod: lead.deliveryMethod,
    deadline: lead.deadline,
    notes: lead.notes,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  };
}

function formatAssistantProduct(productType: AssistantLead["productType"]) {
  if (productType === "t-shirt") return "T-Shirt";
  if (productType === "polo") return "Polo Shirt";
  if (productType === "hoodie") return "Hoodie";
  if (productType === "cap") return "Cap";
  return "Custom item";
}

function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, char: string) => char.toUpperCase())
    .trim();
}

function getAssistantLeadQuantity(lead: AssistantLead) {
  if (typeof lead.quantity === "number" && Number.isFinite(lead.quantity) && lead.quantity > 0) {
    return lead.quantity;
  }
  const fromBreakdown = lead.sizeBreakdown.reduce((total, line) => total + (line.quantity || 0), 0);
  return fromBreakdown > 0 ? fromBreakdown : 1;
}

function buildQuoteMessageFromAssistantLead(lead: AssistantLead) {
  const details = [
    `Captured via Sales AI.`,
    lead.companyName ? `Company: ${lead.companyName}` : "",
    `Product: ${formatAssistantProduct(lead.productType)}`,
    `Quantity: ${getAssistantLeadQuantity(lead)}`,
    lead.color ? `Color: ${titleCase(lead.color)}` : "",
    lead.printPositions.length ? `Print positions: ${lead.printPositions.join(", ")}` : "",
    lead.printSizes.length ? `Print sizes: ${lead.printSizes.join(", ")}` : "",
    lead.printType ? `Print type: ${titleCase(lead.printType)}` : "",
    lead.logoPending && !lead.logoAttachment ? "Artwork file pending upload." : "",
    lead.deadline ? `Deadline: ${lead.deadline}` : "",
    lead.deliveryMethod ? `Delivery: ${titleCase(lead.deliveryMethod)}` : "",
  ].filter(Boolean);

  if (lead.notes?.trim()) {
    details.push(`Client notes: ${lead.notes.trim()}`);
  }

  return details.join("\n");
}

function buildQuotePayloadFromAssistantLead(
  sessionId: string,
  leadId: string,
  lead: AssistantLead,
  nowIso: string
) {
  const garments = lead.sizeBreakdown.length
    ? lead.sizeBreakdown.map((line) => ({
        garment: formatAssistantProduct(line.productType || lead.productType),
        size: line.size,
        quantity: line.quantity,
      }))
    : [
        {
          garment: formatAssistantProduct(lead.productType),
          size: lead.sizes[0] || "",
          quantity: getAssistantLeadQuantity(lead),
        },
      ];

  const printSummary = [
    lead.printPositions.length ? lead.printPositions.join(", ") : "",
    lead.printSizes.length ? `Sizes: ${lead.printSizes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    name: lead.clientName || "",
    email: lead.email || "",
    phone: lead.phone || "",
    message: buildQuoteMessageFromAssistantLead(lead),
    garments,
    printMethod: printSummary,
    quantity: getAssistantLeadQuantity(lead),
    deadline: lead.deadline || "",
    notes: lead.notes || "",
    source: "Sales AI",
    delivery: lead.deliveryMethod ? titleCase(lead.deliveryMethod) : "",
    attachments: lead.logoAttachment?.url
      ? [
          {
            label: "Logo file",
            filename: lead.logoAttachment.name,
            contentType: lead.logoAttachment.contentType || undefined,
            size: lead.logoAttachment.size,
            url: lead.logoAttachment.url,
          },
        ]
      : [],
    designBrief: {
      product: formatAssistantProduct(lead.productType),
      color: titleCase(lead.color),
      printMethod: printSummary,
      selectedSizes: lead.sizeBreakdown.map((line) => ({
        size: line.size,
        quantity: line.quantity,
      })),
      totalQty: getAssistantLeadQuantity(lead),
      delivery: lead.deliveryMethod ? titleCase(lead.deliveryMethod) : "",
      deadline: lead.deadline || "",
      clientNotes: lead.notes || "",
    },
    status: "new",
    aiAssistantLeadId: leadId,
    aiAssistantSessionId: sessionId,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  };
}

async function getTrainingSnapshotInternal() {
  const snap = await getDoc(doc(db, COLLECTIONS.modelState, MODEL_STATE_KEY));
  if (!snap.exists()) return null;
  return mapTrainingSnapshot(snap.data() as FirestoreLike);
}

async function getTrainingStateInternal() {
  const snap = await getDoc(doc(db, COLLECTIONS.modelState, MODEL_STATE_KEY));
  if (!snap.exists()) return null;
  return mapTrainingState(snap.data() as FirestoreLike);
}

export async function getAssistantOverview(): Promise<AssistantOverview> {
  let training = await getTrainingSnapshotInternal();
  if (!training) {
    training = await retrainAssistantModel();
  }

  const [sessionsSnap, leadsSnap, knowledgeSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.sessions), orderBy("updatedAt", "desc"), limit(8))),
    getDocs(query(collection(db, COLLECTIONS.leads), orderBy("updatedAt", "desc"), limit(10))),
    getDocs(query(collection(db, COLLECTIONS.knowledge), orderBy("createdAt", "desc"), limit(8))),
  ]);

  return {
    sessions: sessionsSnap.docs.map((item) => mapSessionSummary(item.id, item.data() as FirestoreLike)),
    leads: leadsSnap.docs.map((item) => mapLeadRecord(item.id, item.data() as FirestoreLike)),
    knowledge: knowledgeSnap.docs.map((item) => mapKnowledgeRecord(item.id, item.data() as FirestoreLike)),
    training,
  };
}

export async function getAssistantSession(sessionId: string): Promise<AssistantSessionDetail> {
  const cleanedSessionId = cleanString(sessionId);
  const sessionRef = doc(db, COLLECTIONS.sessions, cleanedSessionId);
  const [sessionSnap, messagesSnap] = await Promise.all([
    getDoc(sessionRef),
    getDocs(
      query(collection(db, COLLECTIONS.sessions, cleanedSessionId, "messages"), orderBy("createdAt", "asc"), limit(200))
    ),
  ]);

  const summary = sessionSnap.exists()
    ? mapSessionSummary(cleanedSessionId, sessionSnap.data() as FirestoreLike, true)
    : {
        sessionId: cleanedSessionId,
        exists: false,
        lead: createEmptyAssistantLead(),
        createdAt: null,
        updatedAt: null,
        lastMessage: null,
        messageCount: 0,
        submittedLeadId: null,
        submittedAt: null,
        readyToSubmit: false,
        missingFields: missingAssistantFields(createEmptyAssistantLead()),
      };

  return {
    ...summary,
    messages: messagesSnap.docs.map((item) => mapMessageRecord(item.id, item.data() as FirestoreLike)),
  };
}

export async function runAssistantChat(
  sessionId: string,
  message: string,
  options?: { attachment?: AssistantAttachment | null }
): Promise<AssistantChatPayload> {
  const cleanedSessionId = cleanString(sessionId);
  const cleanedMessage = cleanString(message);
  const attachment = normalizeAssistantAttachment(options?.attachment);
  const effectiveMessage = cleanedMessage || (attachment ? `Uploaded logo file: ${attachment.name}` : "");
  const sessionRef = doc(db, COLLECTIONS.sessions, cleanedSessionId);
  const sessionSnap = await getDoc(sessionRef);
  const currentLead = sessionSnap.exists()
    ? normalizeAssistantLead((sessionSnap.data() as FirestoreLike).lead)
    : createEmptyAssistantLead();
  const existingSessionData = sessionSnap.exists() ? (sessionSnap.data() as FirestoreLike) : null;
  const existingLeadId = cleanNullableString(existingSessionData?.submittedLeadId);
  const existingQuoteId = cleanNullableString(existingSessionData?.submittedQuoteId);

  let trainingState = await getTrainingStateInternal();
  if (!trainingState) {
    trainingState = await retrainAssistantModelState();
  }

  const [leadSources, knowledgeItems] = await Promise.all([
    getLeadSources(),
    getKnowledgeSources(),
  ]);
  const feedbackEntries = await getFeedbackEntries();

  const result = runAssistantTurn({
    lead: currentLead,
    message: effectiveMessage,
    attachment,
    approvedLeads: leadSources,
    knowledgeItems,
    feedbackEntries,
    trainingState,
  });
  let assistantReply = result.reply;

  const nowIso = new Date().toISOString();

  await Promise.all([
    addDoc(collection(db, COLLECTIONS.sessions, cleanedSessionId, "messages"), {
      role: "user",
      content: effectiveMessage,
      attachment,
      createdAt: serverTimestamp(),
      createdAtIso: nowIso,
    }),
    addDoc(collection(db, COLLECTIONS.sessions, cleanedSessionId, "messages"), {
      role: "assistant",
      content: assistantReply,
      debug: result.debug,
      createdAt: serverTimestamp(),
      createdAtIso: nowIso,
    }),
    setDoc(
      sessionRef,
      {
        sessionId: cleanedSessionId,
        lead: result.lead,
        lastMessage: assistantReply,
        lastDebug: result.debug,
        messageCount: sessionSnap.exists() ? increment(2) : 2,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
        ...(sessionSnap.exists()
          ? {}
          : {
              createdAt: serverTimestamp(),
              createdAtIso: nowIso,
            }),
      },
      { merge: true }
    ),
  ]);

  let autoSubmitted = false;
  let quoteId: string | null = null;
  if (result.readyToSubmit && (!existingLeadId || !existingQuoteId)) {
    const submission = await submitAssistantLeadFromSession(cleanedSessionId);
    if (submission.ok) {
      autoSubmitted = true;
      quoteId = submission.quoteId;
      const intro = result.lead.logoAttachment
        ? "Great. I have the main details and the logo file."
        : "Great. I have the main details.";
      const contact = result.lead.phone ? ` We will reply on ${result.lead.phone}.` : "";
      const submitted = quoteId
        ? ` Your request has been sent to Quotation Approval as request ${quoteId}.`
        : " Your request has been sent to Quotation Approval.";
      assistantReply = `${intro}${contact}${submitted}`;

      const messagesSnap = await getDocs(
        query(collection(db, COLLECTIONS.sessions, cleanedSessionId, "messages"), orderBy("createdAt", "desc"), limit(2))
      );
      const latestAssistantMessage = messagesSnap.docs.find((item) => (item.data() as FirestoreLike).role === "assistant");
      if (latestAssistantMessage) {
        await updateDoc(latestAssistantMessage.ref, {
          content: assistantReply,
        });
      }

      await setDoc(
        sessionRef,
        {
          lastMessage: assistantReply,
          updatedAt: serverTimestamp(),
          updatedAtIso: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  }

  const session = await getAssistantSession(cleanedSessionId);
  return {
    sessionId: cleanedSessionId,
    session,
    ...result,
    reply: assistantReply,
    autoSubmitted,
    quoteId,
  };
}

export async function submitAssistantLeadFromSession(sessionId: string): Promise<AssistantSubmitResult> {
  const cleanedSessionId = cleanString(sessionId);
  const sessionRef = doc(db, COLLECTIONS.sessions, cleanedSessionId);
  const sessionSnap = await getDoc(sessionRef);
  const session = await getAssistantSession(cleanedSessionId);
  if (!session.exists) {
    return {
      ok: false,
      error: "Session not found.",
      notFound: true,
    };
  }

  if (!session.readyToSubmit) {
    return {
      ok: false,
      error: "Lead is incomplete.",
      missingFields: session.missingFields,
    };
  }

  const sessionData = sessionSnap.exists() ? (sessionSnap.data() as FirestoreLike) : null;
  const existingLeadId = cleanNullableString(sessionData?.submittedLeadId);
  const existingQuoteId = cleanNullableString(sessionData?.submittedQuoteId);

  if (existingLeadId) {
    const existingLeadSnap = await getDoc(doc(db, COLLECTIONS.leads, existingLeadId));
    if (existingLeadSnap.exists()) {
      let quoteId = existingQuoteId;
      if (!quoteId) {
        const existingLead = mapLeadRecord(existingLeadSnap.id, existingLeadSnap.data() as FirestoreLike);
        const backfillQuoteRef = await addDoc(
          collection(db, "quotes"),
          buildQuotePayloadFromAssistantLead(cleanedSessionId, existingLead.id, existingLead.lead, new Date().toISOString())
        );
        quoteId = backfillQuoteRef.id;
        await Promise.all([
          updateDoc(doc(db, COLLECTIONS.leads, existingLead.id), {
            quoteId,
            updatedAt: serverTimestamp(),
            updatedAtIso: new Date().toISOString(),
          }),
          setDoc(
            sessionRef,
            {
              submittedQuoteId: quoteId,
              updatedAt: serverTimestamp(),
              updatedAtIso: new Date().toISOString(),
            },
            { merge: true }
          ),
        ]);
      }
      return {
        ok: true,
        lead: mapLeadRecord(existingLeadSnap.id, { ...(existingLeadSnap.data() as FirestoreLike), quoteId }),
        quoteId,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const leadPayload = buildLeadDocument(session.sessionId, session.lead, nowIso);
  const ref = await addDoc(collection(db, COLLECTIONS.leads), leadPayload);
  const quoteRef = await addDoc(
    collection(db, "quotes"),
    buildQuotePayloadFromAssistantLead(cleanedSessionId, ref.id, session.lead, nowIso)
  );

  await Promise.all([
    updateDoc(doc(db, COLLECTIONS.leads, ref.id), {
      quoteId: quoteRef.id,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    }),
    setDoc(
      sessionRef,
      {
        submittedLeadId: ref.id,
        submittedQuoteId: quoteRef.id,
        submittedAt: serverTimestamp(),
        submittedAtIso: nowIso,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
      },
      { merge: true }
    ),
  ]);

  return {
    ok: true,
    lead: mapLeadRecord(ref.id, { ...leadPayload, quoteId: quoteRef.id }),
    quoteId: quoteRef.id,
  };
}

export async function saveAssistantFeedback(
  leadId: string,
  verdict: string,
  comment?: string
): Promise<AssistantFeedbackResult> {
  const normalizedVerdict = cleanString(verdict).toLowerCase();
  if (normalizedVerdict !== "approved" && normalizedVerdict !== "rejected") {
    return {
      ok: false,
      error: "Verdict must be approved or rejected.",
    };
  }

  const leadRef = doc(db, COLLECTIONS.leads, cleanString(leadId));
  const leadSnap = await getDoc(leadRef);
  if (!leadSnap.exists()) {
    return {
      ok: false,
      error: "Lead not found.",
      notFound: true,
    };
  }

  const nowIso = new Date().toISOString();
  const currentLead = mapLeadRecord(leadSnap.id, leadSnap.data() as FirestoreLike);
  const [userMessages, assistantReplies] = currentLead.sessionId
    ? await Promise.all([
        getSessionUserMessages(currentLead.sessionId),
        getSessionAssistantMessages(currentLead.sessionId),
      ])
    : [[], []];

  await updateDoc(leadRef, {
    status: normalizedVerdict,
    feedbackComment: cleanString(comment) || null,
    feedbackAt: serverTimestamp(),
    feedbackAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  });

  await addDoc(collection(db, COLLECTIONS.feedback), {
    leadId: currentLead.id,
    sessionId: currentLead.sessionId || null,
    verdict: normalizedVerdict,
    comment: cleanString(comment) || null,
    lead: currentLead.lead,
    userMessages,
    assistantReplies,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  });

  const updatedSnap = await getDoc(leadRef);
  const training = await retrainAssistantModel();

  return {
    ok: true,
    lead: mapLeadRecord(updatedSnap.id, updatedSnap.data() as FirestoreLike),
    training,
  };
}

export async function saveAssistantKnowledge(title: string, content: string): Promise<AssistantKnowledgeResult> {
  const nowIso = new Date().toISOString();
  const payload = {
    title: cleanString(title),
    content: cleanString(content),
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  };
  const ref = await addDoc(collection(db, COLLECTIONS.knowledge), payload);
  const training = await retrainAssistantModel();

  return {
    ok: true,
    knowledge: mapKnowledgeRecord(ref.id, payload),
    training,
  };
}

export async function retrainAssistantModel(): Promise<AssistantTrainingSnapshot> {
  const [leadSources, knowledgeItems, feedbackEntries] = await Promise.all([
    getLeadSources(250, { includeSessionMessages: true }),
    getKnowledgeSources(250),
    getFeedbackEntries(250),
  ]);

  const nowIso = new Date().toISOString();
  const trainingState = buildAssistantTrainingState(leadSources, knowledgeItems, feedbackEntries, nowIso);

  await persistTrainingState(trainingState, nowIso);

  return {
    ...trainingState,
    updatedAt: nowIso,
  };
}

async function persistTrainingState(trainingState: AssistantTrainingState, nowIso: string) {
  await setDoc(
    doc(db, COLLECTIONS.modelState, MODEL_STATE_KEY),
    {
      key: MODEL_STATE_KEY,
      intentModel: trainingState.intentModel,
      positiveKeywordCount: trainingState.positiveKeywordCount,
      fieldGroups: trainingState.fieldGroups,
      approvedLeadCount: trainingState.approvedLeadCount,
      knowledgeCount: trainingState.knowledgeCount,
      feedbackCount: trainingState.feedbackCount,
      faqCount: trainingState.faqCount,
      classifierSampleCount: trainingState.classifierSampleCount,
      classifierLabelCount: trainingState.classifierLabelCount,
      retrievalDocumentCount: trainingState.retrievalDocumentCount,
      topKeywords: trainingState.topKeywords,
      trainingSamples: trainingState.trainingSamples,
      faqMemory: trainingState.faqMemory,
      learnedProductAliases: trainingState.learnedProductAliases,
      learnedProductAliasCount: trainingState.learnedProductAliasCount,
      learnedProductPlaybooks: trainingState.learnedProductPlaybooks,
      retrievalIndexMetadata: trainingState.retrievalIndexMetadata,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true }
  );
}

async function retrainAssistantModelState(): Promise<AssistantTrainingState> {
  const [leadSources, knowledgeItems, feedbackEntries] = await Promise.all([
    getLeadSources(250, { includeSessionMessages: true }),
    getKnowledgeSources(250),
    getFeedbackEntries(250),
  ]);

  const nowIso = new Date().toISOString();
  const trainingState = buildAssistantTrainingState(leadSources, knowledgeItems, feedbackEntries, nowIso);
  await persistTrainingState(trainingState, nowIso);
  return {
    ...trainingState,
    updatedAt: nowIso,
  };
}
