import type { EmailIntake } from "./email-intake-model";
import { normalizeEmailQuoteDraft } from "./email-quote";
import { buildPrintJobs, readPrintJobWorkflow, type PrintJobSource } from "./print-job-workflow";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const pick = (value: unknown, keys: string[]) => {
  const source = object(value);
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
};

/** Allowlist before deriving the job DTO: no transaction totals, payment labels,
 * costs, margins, accounts, receipts, ledger data or document financial fields. */
export function productionOrderSource(source: PrintJobSource): PrintJobSource {
  return { id: source.id, data: {
    ...pick(source.data, ["quoteId", "status", "invoiceNumber", "customerName", "email", "phoneNumber", "address", "deliveryMethod", "deadline", "transactionDate", "updatedAt", "statusChangedAt", "statusUpdatedAt", "deliveredAt", "completedAt", "inventoryAdjustedAt", "workflowDoneAt"]),
    documentProfile: pick(source.data.documentProfile, ["documentNumber", "clientName", "clientCompany", "clientEmail", "clientPhone", "clientAddress"]),
    products: Array.isArray(source.data.products) ? source.data.products.map(product => pick(product, ["garment", "product", "productName", "description", "color", "colour", "size", "sizes", "quantity", "printMethod", "printPlacement", "placement", "printDimensions", "printSize"])) : [],
  } };
}

export function buildProductionWorkspaceJobs(quotes: PrintJobSource[], orders: PrintJobSource[]) {
  // Preserve already-authorized quotation pricing; never use order ledger values.
  const quotationJobs = new Map(buildPrintJobs(quotes, []).map(job => [job.quoteId, job]));
  return buildPrintJobs(quotes, orders.map(productionOrderSource)).map(job => {
    const quotation = job.quoteId ? quotationJobs.get(job.quoteId) : undefined;
    return {
      ...job,
      documents: job.documents.filter(document => document.kind !== "order"),
      ...(quotation ? {
        total: quotation.total, currency: quotation.currency, payment: quotation.payment,
        details: job.details && quotation.details ? {
          ...job.details,
          pricingSource: quotation.details.pricingSource,
          pricingCurrency: quotation.details.pricingCurrency,
          pricingLines: quotation.details.pricingLines,
          deliveryFee: quotation.details.deliveryFee,
          discount: quotation.details.discount,
        } : job.details,
      } : {}),
    };
  });
}

export function isWorkspaceEnquiry(intake: EmailIntake) {
  return ["enquiry", "uncertain"].includes(intake.classification) && ["needs_details", "waiting", "ready", "review", "error"].includes(intake.status);
}

/** Saved client-enquiry content only. Never return the raw Gmail message object,
 * routing headers, send identifiers, integration state or arbitrary stored fields. */
export function workspaceEnquiry(intake: EmailIntake) {
  const metadata = intake as EmailIntake & { printJobWorkflow?: unknown; printJobWorkflowHistory?: unknown[] };
  return {
    id: intake.id, threadId: intake.threadId, version: intake.version,
    classification: intake.classification, confidence: intake.confidence, language: intake.language,
    subject: intake.subject, email: intake.email, summary: intake.summary,
    draft: normalizeEmailQuoteDraft(intake.draft),
    items: (intake.items || []).map(item => ({ product: item.product, quantity: item.quantity, colour: item.colour, sizes: item.sizes, printMethod: item.printMethod, placement: item.placement, artwork: item.artwork })),
    missing: (intake.missing || []).map(item => ({ key: item.key, label: item.label, question: item.question })),
    warnings: (intake.warnings || []).filter(value => typeof value === "string"),
    status: intake.status, ...(intake.quoteId ? { quoteId: intake.quoteId } : {}),
    updatedAtIso: intake.updatedAtIso, lastReplyAt: intake.lastReplyAt,
    originalText: intake.originalText || "", attachmentNames: intake.attachmentNames || [],
    lastMessage: { id: intake.lastMessage?.id || "", subject: intake.subject, from: intake.email, to: "", date: intake.lastReplyAt, snippet: "", unread: false },
    printJobWorkflow: readPrintJobWorkflow(metadata.printJobWorkflow),
    printJobWorkflowHistory: (metadata.printJobWorkflowHistory || []).flatMap(entry => {
      const workflow = readPrintJobWorkflow(entry);
      return workflow ? [{ ...workflow, id: typeof object(entry).id === "string" ? object(entry).id : "" }] : [];
    }),
  } satisfies EmailIntake & { printJobWorkflow: unknown; printJobWorkflowHistory: unknown[] };
}
