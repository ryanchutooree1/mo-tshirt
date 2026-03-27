import type {
  AssistantApprovedLeadSource,
  AssistantFaqEntry,
  AssistantFeedbackEntry,
  AssistantKnowledgeSource,
  AssistantLead,
  AssistantRetrievalIndex,
  AssistantRetrievalMatch,
  AssistantRetrievalMemoryItem,
} from "./types.ts";
import { cosineSimilarity, hybridTokens, incrementCounter, normalizeWhitespace, tfidfVector, unique } from "./utils.ts";

export function leadToRetrievalText(lead: AssistantLead) {
  return [
    lead.productType,
    lead.quantity ? `${lead.quantity} pieces` : "",
    lead.color,
    lead.sizes.join(" "),
    lead.sizeBreakdown
      .map((line) => [line.productType, line.color, line.size, line.quantity ? `${line.quantity}` : ""].filter(Boolean).join(" "))
      .join(" "),
    lead.printPositions.join(" "),
    lead.printSizes.join(" "),
    lead.printType,
    lead.deliveryMethod,
    lead.deadline,
    lead.clientName,
    lead.companyName,
    lead.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildRetrievalMemoryDocuments(input: {
  leads?: AssistantApprovedLeadSource[];
  knowledge?: AssistantKnowledgeSource[];
  feedback?: AssistantFeedbackEntry[];
  faq?: AssistantFaqEntry[];
  aliases?: Record<string, string[]>;
}) {
  const documents: AssistantRetrievalMemoryItem[] = [];

  (input.leads || []).forEach((source, index) => {
    const leadText = leadToRetrievalText(source.lead);
    documents.push({
      id: source.id || `lead-${index}`,
      kind: "past_lead",
      text: normalizeWhitespace(leadText || source.summary || ""),
      metadata: {
        productType: source.lead.productType || "",
        approved: source.status === "approved",
        sessionId: source.sessionId || "",
      },
    });

    if (source.status === "approved") {
      documents.push({
        id: `${source.id || `lead-${index}`}-summary`,
        kind: "approved_summary",
        text: normalizeWhitespace(source.summary || leadText),
        metadata: {
          productType: source.lead.productType || "",
          approved: true,
        },
      });
    }

    (source.acceptedReplies || []).forEach((reply, replyIndex) => {
      documents.push({
        id: `${source.id || `lead-${index}`}-reply-${replyIndex}`,
        kind: "assistant_reply",
        text: normalizeWhitespace(reply),
        answer: normalizeWhitespace(reply),
        metadata: {
          leadId: source.id || `lead-${index}`,
          productType: source.lead.productType || "",
        },
      });
    });
  });

  (input.knowledge || []).forEach((item, index) => {
    documents.push({
      id: item.id || `knowledge-${index}`,
      kind: "faq",
      text: normalizeWhitespace(`${item.title} ${item.content}`),
      answer: normalizeWhitespace(item.content),
      metadata: {
        title: item.title,
      },
    });
  });

  (input.faq || []).forEach((item) => {
    documents.push({
      id: item.id,
      kind: "faq",
      text: normalizeWhitespace(`${item.question} ${item.answer}`),
      answer: normalizeWhitespace(item.answer),
      metadata: {
        question: item.question,
      },
      tags: item.tags || [],
    });
  });

  Object.entries(input.aliases || {}).forEach(([canonical, aliases]) => {
    aliases.forEach((alias, index) => {
      documents.push({
        id: `alias-${canonical}-${index}`,
        kind: "alias",
        text: normalizeWhitespace(`${alias} means ${canonical}`),
        answer: canonical,
        metadata: {
          canonical,
          alias,
        },
      });
    });
  });

  (input.feedback || []).forEach((item, index) => {
    if (item.comment) {
      documents.push({
        id: item.id || `feedback-${index}`,
        kind: "faq",
        text: normalizeWhitespace(item.comment),
        answer: normalizeWhitespace(item.comment),
        metadata: {
          verdict: item.verdict,
        },
      });
    }
  });

  return documents.filter((item) => item.text);
}

export function buildRetrievalIndex(documents: AssistantRetrievalMemoryItem[]): AssistantRetrievalIndex {
  const docFrequency: Record<string, number> = {};

  documents.forEach((document) => {
    unique(hybridTokens(document.text)).forEach((token) => incrementCounter(docFrequency, token));
  });

  const docCount = documents.length || 1;
  const idf = Object.fromEntries(
    Object.keys(docFrequency)
      .sort((left, right) => left.localeCompare(right))
      .map((token) => [token, Math.log((docCount + 1) / ((docFrequency[token] || 0) + 1)) + 1])
  );

  const documentVectors = Object.fromEntries(
    documents.map((document) => [document.id, tfidfVector(hybridTokens(document.text), idf)])
  );

  return {
    idf,
    documentVectors,
    documentCount: documents.length,
  };
}

export function retrieveTopMatches(input: {
  query: string;
  documents: AssistantRetrievalMemoryItem[];
  index: AssistantRetrievalIndex;
  topK?: number;
  threshold?: number;
}): AssistantRetrievalMatch[] {
  const topK = input.topK ?? 5;
  const threshold = input.threshold ?? 0.18;
  const queryTokens = hybridTokens(input.query);
  const queryVector = tfidfVector(queryTokens, input.index.idf);

  return input.documents
    .map((document) => {
      const vector = input.index.documentVectors[document.id] || {};
      const score = cosineSimilarity(queryVector, vector);
      const overlapTerms = unique(queryTokens.filter((token) => token in vector))
        .filter((token) => token.length > 2)
        .slice(0, 5);

      return {
        id: document.id,
        kind: document.kind,
        text: document.text,
        answer: document.answer || null,
        score,
        overlapTerms,
        explanation:
          overlapTerms.length > 0
            ? `Matched on ${overlapTerms.join(", ")} with ${document.kind.replace(/_/g, " ")} memory.`
            : `Matched by overall TF-IDF similarity against ${document.kind.replace(/_/g, " ")} memory.`,
        metadata: document.metadata,
      } satisfies AssistantRetrievalMatch;
    })
    .filter((match) => match.score >= threshold)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, topK);
}

export function summarizeRetrievalIndex(documents: AssistantRetrievalMemoryItem[], threshold = 0.18) {
  const termCounts = documents.map((document) => unique(hybridTokens(document.text)).length);
  const average = termCounts.length ? termCounts.reduce((sum, value) => sum + value, 0) / termCounts.length : 0;
  return {
    documentCount: documents.length,
    avgTermsPerDocument: Number(average.toFixed(2)),
    threshold,
  };
}
