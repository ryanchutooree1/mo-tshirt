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
  formatLeadSummary,
  missingAssistantFields,
  normalizeAssistantAttachment,
  normalizeAssistantLead,
  runAssistantTurn,
  type AssistantAttachment,
  type AssistantApprovedLeadSource,
  type AssistantChatResult,
  type AssistantKnowledgeSource,
  type AssistantLead,
  type AssistantMessageRole,
  type AssistantProductType,
  type AssistantRequiredField,
  type AssistantTrainingState,
  type AssistantTrainingSnapshot,
} from "@/lib/ai-assistant";

const COLLECTIONS = {
  sessions: "aiAssistantSessions",
  leads: "aiAssistantLeads",
  knowledge: "aiAssistantKnowledge",
  modelState: "aiAssistantModelState",
} as const;

const MODEL_STATE_KEY = "local-sales-ai";

type FirestoreLike = Record<string, unknown>;

export type AssistantMessageRecord = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  attachment: AssistantAttachment | null;
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
};

export type AssistantSubmitResult =
  | {
      ok: true;
      lead: AssistantLeadRecord;
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
    ? data.fieldGroups.map((value) => cleanString(value)).filter(Boolean)
    : [];

  const positiveKeywords =
    data.positiveKeywords && typeof data.positiveKeywords === "object"
      ? (data.positiveKeywords as Record<string, unknown>)
      : null;
  const learnedProductAliases = mapLearnedProductAliases(data.learnedProductAliases);

  return {
    positiveKeywordCount: asNumber(
      data.positiveKeywordCount,
      positiveKeywords ? Object.keys(positiveKeywords).length : 0
    ),
    fieldGroups,
    approvedLeadCount: asNumber(data.approvedLeadCount, 0),
    knowledgeCount: asNumber(data.knowledgeCount, 0),
    topKeywords,
    learnedProductAliases,
    learnedProductAliasCount: asNumber(
      data.learnedProductAliasCount,
      Object.values(learnedProductAliases).reduce((total, aliases) => total + aliases.length, 0)
    ),
    updatedAt: timestampToIso(data.updatedAt, data.updatedAtIso),
  };
}

function mapTrainingState(data: FirestoreLike | null): AssistantTrainingState | null {
  const snapshot = mapTrainingSnapshot(data);
  if (!snapshot) return null;

  return {
    ...snapshot,
    positiveKeywords:
      data?.positiveKeywords && typeof data.positiveKeywords === "object"
        ? Object.fromEntries(
            Object.entries(data.positiveKeywords as Record<string, unknown>).map(([key, value]) => [
              key,
              asNumber(value, 0),
            ])
          )
        : {},
    fieldKeywordCounts:
      data?.fieldKeywordCounts && typeof data.fieldKeywordCounts === "object"
        ? Object.fromEntries(
            Object.entries(data.fieldKeywordCounts as Record<string, unknown>).map(([field, counts]) => [
              field,
              counts && typeof counts === "object"
                ? Object.fromEntries(
                    Object.entries(counts as Record<string, unknown>).map(([keyword, value]) => [
                      keyword,
                      asNumber(value, 0),
                    ])
                  )
                : {},
            ])
          )
        : {},
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

async function getApprovedLeadSources(
  limitCount = 120,
  options?: { includeSessionMessages?: boolean }
): Promise<AssistantApprovedLeadSource[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.leads), orderBy("updatedAt", "desc"), limit(limitCount)));
  const approved = snap.docs
    .map((item) => mapLeadRecord(item.id, item.data() as FirestoreLike))
    .filter((item) => item.status === "approved");

  if (!options?.includeSessionMessages) {
    return approved.map((item) => ({ lead: item.lead, status: item.status }));
  }

  return Promise.all(
    approved.map(async (item) => ({
      lead: item.lead,
      status: item.status,
      sessionMessages: item.sessionId ? await getSessionUserMessages(item.sessionId) : [],
    }))
  );
}

async function getKnowledgeSources(limitCount = 120): Promise<AssistantKnowledgeSource[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.knowledge), orderBy("createdAt", "desc"), limit(limitCount))
  );
  return snap.docs.map((item) => mapKnowledgeRecord(item.id, item.data() as FirestoreLike));
}

function buildLeadDocument(sessionId: string, lead: AssistantLead, nowIso: string) {
  return {
    sessionId,
    status: "submitted",
    lead,
    summary: formatLeadSummary(lead),
    clientName: lead.clientName,
    phone: lead.phone,
    email: lead.email,
    productType: lead.productType,
    quantity: lead.quantity,
    color: lead.color,
    sizes: lead.sizes,
    printPositions: lead.printPositions,
    printSizes: lead.printSizes,
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

  let trainingState = await getTrainingStateInternal();
  if (!trainingState) {
    trainingState = await retrainAssistantModelState();
  }

  const [approvedLeads, knowledgeItems] = await Promise.all([
    getApprovedLeadSources(),
    getKnowledgeSources(),
  ]);

  const result = runAssistantTurn({
    lead: currentLead,
    message: effectiveMessage,
    attachment,
    approvedLeads,
    knowledgeItems,
    trainingState,
  });

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
      content: result.reply,
      createdAt: serverTimestamp(),
      createdAtIso: nowIso,
    }),
    setDoc(
      sessionRef,
      {
        sessionId: cleanedSessionId,
        lead: result.lead,
        lastMessage: result.reply,
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

  const session = await getAssistantSession(cleanedSessionId);
  return {
    sessionId: cleanedSessionId,
    session,
    ...result,
  };
}

export async function submitAssistantLeadFromSession(sessionId: string): Promise<AssistantSubmitResult> {
  const session = await getAssistantSession(sessionId);
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

  const nowIso = new Date().toISOString();
  const leadPayload = buildLeadDocument(session.sessionId, session.lead, nowIso);
  const ref = await addDoc(collection(db, COLLECTIONS.leads), leadPayload);

  await setDoc(
    doc(db, COLLECTIONS.sessions, session.sessionId),
    {
      submittedLeadId: ref.id,
      submittedAt: serverTimestamp(),
      submittedAtIso: nowIso,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true }
  );

  return {
    ok: true,
    lead: mapLeadRecord(ref.id, leadPayload),
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
  await updateDoc(leadRef, {
    status: normalizedVerdict,
    feedbackComment: cleanString(comment) || null,
    feedbackAt: serverTimestamp(),
    feedbackAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
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
  const [approvedLeads, knowledgeItems] = await Promise.all([
    getApprovedLeadSources(250, { includeSessionMessages: true }),
    getKnowledgeSources(250),
  ]);

  const trainingState = buildAssistantTrainingState(approvedLeads, knowledgeItems);
  const nowIso = new Date().toISOString();

  await persistTrainingState(trainingState, nowIso);

  return {
    positiveKeywordCount: trainingState.positiveKeywordCount,
    fieldGroups: trainingState.fieldGroups,
    approvedLeadCount: trainingState.approvedLeadCount,
    knowledgeCount: trainingState.knowledgeCount,
    topKeywords: trainingState.topKeywords,
    learnedProductAliases: trainingState.learnedProductAliases,
    learnedProductAliasCount: trainingState.learnedProductAliasCount,
    updatedAt: nowIso,
  };
}

async function persistTrainingState(trainingState: AssistantTrainingState, nowIso: string) {
  await setDoc(
    doc(db, COLLECTIONS.modelState, MODEL_STATE_KEY),
    {
      key: MODEL_STATE_KEY,
      positiveKeywords: trainingState.positiveKeywords,
      fieldKeywordCounts: trainingState.fieldKeywordCounts,
      positiveKeywordCount: trainingState.positiveKeywordCount,
      fieldGroups: trainingState.fieldGroups,
      approvedLeadCount: trainingState.approvedLeadCount,
      knowledgeCount: trainingState.knowledgeCount,
      topKeywords: trainingState.topKeywords,
      learnedProductAliases: trainingState.learnedProductAliases,
      learnedProductAliasCount: trainingState.learnedProductAliasCount,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true }
  );
}

async function retrainAssistantModelState(): Promise<AssistantTrainingState> {
  const [approvedLeads, knowledgeItems] = await Promise.all([
    getApprovedLeadSources(250, { includeSessionMessages: true }),
    getKnowledgeSources(250),
  ]);

  const trainingState = buildAssistantTrainingState(approvedLeads, knowledgeItems);
  const nowIso = new Date().toISOString();
  await persistTrainingState(trainingState, nowIso);
  return {
    ...trainingState,
    updatedAt: nowIso,
  };
}
