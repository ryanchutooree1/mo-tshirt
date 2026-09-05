"use client";

import Link from "next/link";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  TestTube2,
} from "lucide-react";
import {
  createEmptyAssistantLead,
  formatAssistantFieldLabel,
  missingAssistantFields,
  type AssistantAttachment,
  type AssistantContextItem,
  type AssistantTrainingSnapshot,
} from "@/lib/ai-assistant";
import { db } from "@/lib/firebase";
import {
  getQuotationUploadUrl,
  QUOTATION_UPLOAD_COLLECTION,
} from "@/lib/quotation-upload-paths";
import type {
  AssistantChatPayload,
  AssistantKnowledgeRecord,
  AssistantLeadRecord,
  AssistantMessageRecord,
  AssistantOverview,
  AssistantSessionDetail,
  AssistantSessionSummary,
} from "@/lib/ai-assistant-store";

const LOGO_UPLOAD_ACCEPT = ".png,.jpg,.jpeg,.pdf,.ai,.eps,.svg";
const MAX_LOGO_UPLOAD_BYTES = 10 * 1024 * 1024;
const FALLBACK_UPLOAD_CHUNK_SIZE = 700_000;
const GALAXY_PANEL_CLASS =
  "rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.08)]";
const GALAXY_SUBPANEL_CLASS =
  "rounded-2xl border border-slate-200 bg-white";
const GALAXY_INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100";

function generateSessionId() {
  return `admin-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDraftSession(sessionId: string): AssistantSessionDetail {
  const emptyLead = createEmptyAssistantLead();
  return {
    sessionId,
    exists: false,
    lead: emptyLead,
    createdAt: null,
    updatedAt: null,
    lastMessage: null,
    messageCount: 0,
    submittedLeadId: null,
    submittedAt: null,
    readyToSubmit: false,
    missingFields: missingAssistantFields(emptyLead),
    messages: [],
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatAttachmentSize(value: number | null) {
  if (!value || value <= 0) return null;
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function buildFallbackUploadUrl(uploadId: string) {
  return getQuotationUploadUrl(uploadId);
}

function chunkString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

async function storeLogoUploadInternally(sessionId: string, file: File): Promise<AssistantAttachment> {
  const uploadId = `${sessionId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const chunks = chunkString(base64, FALLBACK_UPLOAD_CHUNK_SIZE);
  const metaRef = doc(db, QUOTATION_UPLOAD_COLLECTION, uploadId);

  await setDoc(metaRef, {
    uploadId,
    sessionId,
    filename: file.name,
    contentType: file.type || null,
    size: typeof file.size === "number" ? file.size : null,
    chunkCount: chunks.length,
    source: "internal-upload",
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  });

  const batch = writeBatch(db);
  chunks.forEach((chunk, index) => {
    batch.set(doc(db, QUOTATION_UPLOAD_COLLECTION, uploadId, "chunks", String(index).padStart(4, "0")), {
      index,
      data: chunk,
    });
  });
  await batch.commit();

  return {
    name: file.name,
    url: buildFallbackUploadUrl(uploadId),
    contentType: file.type || null,
    size: typeof file.size === "number" ? file.size : null,
    uploadedAt: new Date().toISOString(),
  };
}

function isImageAttachment(attachment: AssistantAttachment | null) {
  if (!attachment?.url) return false;
  if (attachment.contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(attachment.name);
}

function isLogoUploadMessage(message: AssistantMessageRecord) {
  return message.role === "user" && Boolean(message.attachment?.url) && /^uploaded logo file:/i.test(message.content.trim());
}

function titleCaseOption(value: string) {
  const titled = value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, char: string) => char.toUpperCase())
    .trim();

  return titled.replace(/\b(And|Or)\b/g, (word) => word.toLowerCase());
}

function parsePrintPositionPrompt(content: string) {
  const match = /^Where do you want the print:\s*(.+)\?$/i.exec(content.trim());
  if (!match) return null;

  const options = match[1]
    .replace(/\s+or\s+/gi, ", ")
    .split(",")
    .map((option) => titleCaseOption(option))
    .filter(Boolean);

  return {
    question: "Where do you want the print?",
    options,
  };
}

function formatSizeBreakdown(
  lines: Array<{ color: string | null; productType: string | null; size: string; quantity: number }>
) {
  if (!lines.length) return "Not set";
  return lines
    .map((line) => {
      const product =
        line.productType === "t-shirt"
          ? "T-Shirt"
          : line.productType
            ? `${line.productType.charAt(0).toUpperCase()}${line.productType.slice(1)}`
            : "Item";
      return `Product: ${product} Colour: ${
        line.color ? `${line.color.charAt(0).toUpperCase()}${line.color.slice(1)}` : "Not set"
      } Size: ${line.size} Quantity: ${line.quantity}`;
    })
    .join(" | ");
}

function leadStatusClass(status: string) {
  if (status === "approved") {
    return "border-emerald-200 bg-white text-emerald-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-white text-rose-700";
  }
  return "border-amber-200 bg-white text-amber-700";
}

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Request failed.");
  }
  return body as T;
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">{label}</p>
      <p className="mt-3 text-[2rem] font-semibold leading-none text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{sub}</p>
    </div>
  );
}

export default function AdminAiAssistantPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [overview, setOverview] = useState<AssistantOverview | null>(null);
  const [session, setSession] = useState<AssistantSessionDetail>(() => createDraftSession(generateSessionId()));
  const [draft, setDraft] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  const [lastRelatedContext, setLastRelatedContext] = useState<AssistantContextItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [training, setTraining] = useState(false);

  const refreshOverview = useCallback(async () => {
    const data = await readJson<AssistantOverview>(await fetch("/api/admin/ai-assistant", { cache: "no-store" }));
    startTransition(() => {
      setOverview(data);
    });
    return data;
  }, []);

  const refreshSession = useCallback(async (sessionId: string) => {
    setLoadingSession(true);
    try {
      const data = await readJson<{ session: AssistantSessionDetail }>(
        await fetch(`/api/admin/ai-assistant/session/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        })
      );
      startTransition(() => {
        setSession(data.session);
        setLastSuggestions([]);
        setLastRelatedContext([]);
        setPendingLogoFile(null);
      });
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingOverview(true);
    void refreshOverview()
      .catch((nextError: unknown) => {
        if (!alive) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load Sales AI.");
      })
      .finally(() => {
        if (alive) {
          setLoadingOverview(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [refreshOverview]);

  useEffect(() => {
    if (!pendingLogoFile || !pendingLogoFile.type.startsWith("image/")) {
      setPendingLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(pendingLogoFile);
    setPendingLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pendingLogoFile]);

  async function handleSendMessage(options?: {
    message?: string;
    attachment?: AssistantAttachment | null;
    preserveDraft?: boolean;
  }) {
    const nextMessage = (options?.message ?? draft).trim();
    const attachment = options?.attachment ?? null;
    if ((!nextMessage && !attachment) || sending) return false;

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const result = await readJson<AssistantChatPayload>(
        await fetch("/api/admin/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            message: nextMessage,
            attachment,
          }),
        })
      );

      startTransition(() => {
        setSession(result.session);
        if (!options?.preserveDraft) {
          setDraft("");
        }
        setLastSuggestions(result.suggestions || []);
        setLastRelatedContext(result.relatedContext || []);
      });
      if (result.autoSubmitted) {
        setNotice(
          result.quoteId
            ? `Request sent to Quotation Approval as ${result.quoteId}.`
            : "Request sent to Quotation Approval."
        );
      }

      await refreshOverview();
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to send message.");
      return null;
    } finally {
      setSending(false);
    }
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingLogo) return;

    if (file.size > MAX_LOGO_UPLOAD_BYTES) {
      setError("Logo file must be 10 MB or smaller.");
      return;
    }

    setError(null);
    setPendingLogoFile(file);
    setNotice(`Logo selected: ${file.name}. Press Submit logo to send it.`);
  }

  async function handleSubmitLogo() {
    if (!pendingLogoFile || uploadingLogo || sending) return;

    const currentSessionId = session.sessionId;
    const file = pendingLogoFile;
    setUploadingLogo(true);
    setError(null);
    setNotice("Uploading logo and waiting for the AI reply...");

    try {
      setPendingLogoFile(null);
      const attachment = await storeLogoUploadInternally(currentSessionId, file);

      const result = await handleSendMessage({
        message: `Uploaded logo file: ${file.name}`,
        attachment,
        preserveDraft: true,
      });
      if (result) {
        setNotice(`We have received the logo: ${file.name}. Review it in the chat thread or the Lead Snapshot panel.`);
      } else {
        await refreshSession(currentSessionId);
        setPendingLogoFile(file);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to upload logo.");
      setPendingLogoFile(file);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmitLead() {
    if (submitting || !session.sessionId) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await readJson<{ ok: true; lead: AssistantLeadRecord; quoteId: string | null }>(
        await fetch(`/api/admin/ai-assistant/session/${encodeURIComponent(session.sessionId)}/submit`, {
          method: "POST",
        })
      );
      setNotice(
        result.quoteId
          ? `Lead ${result.lead.id} submitted to Quotation Approval as request ${result.quoteId}.`
          : `Lead ${result.lead.id} submitted to Quotation Approval.`
      );
      await Promise.all([refreshOverview(), refreshSession(session.sessionId)]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to submit lead.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFeedback(lead: AssistantLeadRecord, verdict: "approved" | "rejected") {
    const commentPrompt =
      verdict === "approved"
        ? "Approval note (optional)"
        : "Reason for rejection (optional)";
    const comment = window.prompt(commentPrompt, lead.feedbackComment || "");
    if (comment === null) return;

    setError(null);
    setNotice(null);

    try {
      await readJson<{ ok: true; training: AssistantTrainingSnapshot }>(
        await fetch(`/api/admin/ai-assistant/feedback/${encodeURIComponent(lead.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict, comment }),
        })
      );
      setNotice(`Lead ${lead.id} marked ${verdict}.`);
      await refreshOverview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save feedback.");
    }
  }

  async function handleSaveKnowledge() {
    const title = knowledgeTitle.trim();
    const content = knowledgeContent.trim();
    if (!title || !content || savingKnowledge) return;

    setSavingKnowledge(true);
    setError(null);
    setNotice(null);

    try {
      await readJson<{ ok: true; knowledge: AssistantKnowledgeRecord }>(
        await fetch("/api/admin/ai-assistant/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        })
      );
      startTransition(() => {
        setKnowledgeTitle("");
        setKnowledgeContent("");
      });
      setNotice("Knowledge saved and Sales AI retrained.");
      await refreshOverview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save knowledge.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function handleRetrain() {
    if (training) return;

    setTraining(true);
    setError(null);
    setNotice(null);

    try {
      await readJson<{ ok: true; training: AssistantTrainingSnapshot }>(
        await fetch("/api/admin/ai-assistant/train", {
          method: "POST",
        })
      );
      setNotice("Sales AI retrained from approved leads and saved knowledge.");
      await refreshOverview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to retrain Sales AI.");
    } finally {
      setTraining(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }

  function startFreshSession() {
    startTransition(() => {
      setSession(createDraftSession(generateSessionId()));
      setDraft("");
      setPendingLogoFile(null);
      setLastSuggestions([]);
      setLastRelatedContext([]);
      setNotice("Started a fresh admin testing session.");
      setError(null);
    });
  }

  const recentSessions = overview?.sessions || [];
  const recentLeads = overview?.leads || [];
  const recentKnowledge = overview?.knowledge || [];
  const trainingSnapshot = overview?.training || null;
  const canUploadLogo =
    !session.missingFields.includes("sizeBreakdown") &&
    session.lead.logoReady !== false &&
    !session.lead.logoPending;
  const logoAttachment = session.lead.logoAttachment;
  const logoPending = session.lead.logoPending;
  const pendingLogoSize = pendingLogoFile ? formatAttachmentSize(pendingLogoFile.size) : null;
  const assistantBubbleClass =
    "max-w-[85%] rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-[0_12px_28px_rgba(15,23,42,0.06)]";
  const orderedMessages = [...session.messages].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.role === right.role) return 0;
    return left.role === "user" ? -1 : 1;
  });
  const hasInlineLogoStatus =
    Boolean(logoAttachment?.url) &&
    orderedMessages.some(
      (message) => message.role === "user" && message.attachment?.url && message.attachment.url === logoAttachment?.url
    );
  const samplePrompts = [
    "I need 20 black polo shirts with logo on front left chest and a big print at the back",
    "My name is Ryan and my phone is 59883880",
    "summary",
  ];

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || loadingSession) return;

    const frame = window.requestAnimationFrame(() => {
      const items = Array.from(list.querySelectorAll<HTMLElement>("[data-thread-item]"));
      const lastItem = items.at(-1);
      if (!lastItem) {
        list.scrollTo({
          top: list.scrollHeight,
          behavior: "smooth",
        });
        return;
      }

      const behavior: ScrollBehavior = "smooth";
      if (lastItem.offsetHeight > list.clientHeight * 0.7) {
        lastItem.scrollIntoView({ block: "start", behavior });
      } else {
        lastItem.scrollIntoView({ block: "end", behavior });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [loadingSession, orderedMessages.length, canUploadLogo, logoAttachment?.url, pendingLogoFile?.name]);

  function renderLogoStatusCard() {
    if (!logoAttachment) return null;

    return (
      <div data-thread-item className={assistantBubbleClass}>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Upload complete
        </div>
        <p className="mt-3 font-semibold text-slate-900">Logo attached to this session</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Sales AI has this file now. Review it below or upload a new version if needed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={logoAttachment.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Review logo
          </a>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo || sending}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            Upload new logo
          </button>
        </div>
        {pendingLogoFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-semibold">{pendingLogoFile.name}</span>
            {pendingLogoSize ? <span className="text-slate-500">{pendingLogoSize}</span> : null}
            <span className="text-slate-500">ready to send</span>
          </div>
        )}
        {pendingLogoPreviewUrl && pendingLogoFile && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
            { }
            <img
              src={pendingLogoPreviewUrl}
              alt={pendingLogoFile.name}
              className="max-h-64 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        )}
        {pendingLogoFile && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmitLogo()}
              disabled={uploadingLogo || sending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit logo
            </button>
          </div>
        )}
        {isImageAttachment(logoAttachment) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
            { }
            <img
              src={logoAttachment.url}
              alt={logoAttachment.name}
              className="h-28 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        )}
      </div>
    );
  }

  function renderPendingLogoCard() {
    if (!logoPending || logoAttachment) return null;

    return (
      <div data-thread-item className={assistantBubbleClass}>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Upload pending
        </div>
        <p className="mt-3 font-semibold text-slate-900">Logo will be attached later</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Sales AI continued the flow without the file. Upload the logo again once storage is available.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo || sending}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            Upload logo now
          </button>
        </div>
        {pendingLogoFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-semibold">{pendingLogoFile.name}</span>
            {pendingLogoSize ? <span className="text-slate-500">{pendingLogoSize}</span> : null}
            <span className="text-slate-500">ready to send</span>
          </div>
        )}
        {pendingLogoPreviewUrl && pendingLogoFile && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
            { }
            <img
              src={pendingLogoPreviewUrl}
              alt={pendingLogoFile.name}
              className="max-h-64 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        )}
        {pendingLogoFile && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmitLogo()}
              disabled={uploadingLogo || sending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit logo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="ai-assistant-page relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              ← Back to admin dashboard
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm">
                <TestTube2 className="h-3.5 w-3.5" />
                Admin testing first
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm">
                <DatabaseZap className="h-3.5 w-3.5" />
                Firestore backed
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setLoadingOverview(true);
                void refreshOverview()
                  .catch((nextError: unknown) => {
                    setError(nextError instanceof Error ? nextError.message : "Failed to refresh.");
                  })
                  .finally(() => {
                    setLoadingOverview(false);
                  });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleRetrain}
              className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
            >
              {training ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Retrain
            </button>
          </div>
        </div>

        <header className="py-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Assistant</h1>
        </header>

        {(notice || error) && (
          <div
            className={`mt-6 rounded-2xl border bg-white px-4 py-3 text-sm shadow-[0_12px_24px_rgba(15,23,42,0.06)] ${
              error
                ? "border-rose-200 text-rose-700"
                : "border-emerald-200 text-emerald-700"
            }`}
          >
            <div className="flex items-start gap-2">
              {error ? <CircleAlert className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
              <span>{error || notice}</span>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <section className={GALAXY_PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Testing Session</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Sales AI console</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Session: <span className="font-mono text-xs text-slate-700">{session.sessionId}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startFreshSession}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Sparkles className="h-4 w-4" />
                  New session
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendMessage({ message: "summary" })}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={handleSubmitLead}
                  disabled={submitting || !session.readyToSubmit || Boolean(session.submittedLeadId)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  {session.submittedLeadId ? "Already in Quotation Approval" : "Send to Quotation Approval"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {samplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSendMessage({ message: prompt })}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-[26rem] rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div ref={messageListRef} className="h-[25rem] space-y-3 overflow-y-auto pr-1">
                {loadingSession ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Loading session
                  </div>
                ) : orderedMessages.length ? (
                  <>
                    {orderedMessages.map((message) => {
                      const showInlineLogoStatus =
                        Boolean(logoAttachment?.url) &&
                        message.role === "user" &&
                        Boolean(message.attachment?.url) &&
                        message.attachment?.url === logoAttachment?.url;
                      const isUploadMessage = isLogoUploadMessage(message);
                      const printPrompt = message.role === "assistant" ? parsePrintPositionPrompt(message.content) : null;
                      const messageBubbleClass = isUploadMessage
                        ? "ml-auto max-w-[88%] rounded-[2rem] border border-slate-300 bg-slate-50 px-4 py-4 text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)]"
                        : `max-w-[85%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                            message.role === "user"
                              ? "ml-auto border border-slate-300 bg-slate-50 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                              : assistantBubbleClass
                          }`;

                      return (
                        <Fragment key={message.id}>
                      <div data-thread-item className={messageBubbleClass}>
                            {isUploadMessage ? (
                              <div className="space-y-3">
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  Logo uploaded
                                </div>
                                <div className="rounded-[1.6rem] border border-slate-200 bg-white px-4 py-3">
                                  <p className="text-xl font-semibold tracking-tight text-slate-900">{message.attachment?.name || message.content}</p>
                                </div>
                              </div>
                            ) : printPrompt ? (
                              <div className="space-y-3">
                                <p className="text-base font-medium leading-6 text-slate-900">{printPrompt.question}</p>
                                <div className="flex flex-wrap gap-2">
                                  {printPrompt.options.map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => void handleSendMessage({ message: option })}
                                      disabled={sending || uploadingLogo}
                                      className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.04em] text-slate-700 shadow-sm"
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                            )}
                            {message.attachment?.url && (
                              <div className="mt-3 space-y-2">
                                {isImageAttachment(message.attachment) && (
                                  <div
                                    className={`overflow-hidden rounded-2xl border p-2 ${
                                      message.role === "user"
                                        ? isUploadMessage
                                          ? "border-slate-200 bg-white"
                                          : "border-slate-200 bg-white"
                                        : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    { }
                                    <img
                                      src={message.attachment.url}
                                      alt={message.attachment.name}
                                      className={`w-full rounded-xl object-contain ${
                                        isUploadMessage ? "max-h-64 bg-slate-50" : "max-h-48"
                                      }`}
                                      loading="lazy"
                                    />
                                  </div>
                                )}
                                <a
                                  href={message.attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                                    message.role === "user"
                                      ? isUploadMessage
                                        ? "border-slate-200 bg-white text-slate-700"
                                        : "border-slate-200 bg-white text-slate-700"
                                      : "border-slate-200 bg-white text-slate-700"
                                  }`}
                                >
                                  <Paperclip className="h-4 w-4 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate font-medium">{message.attachment.name}</span>
                                  <span className="shrink-0 text-[11px] uppercase tracking-[0.18em] opacity-75">
                                    {[message.attachment.contentType?.split("/").pop(), formatAttachmentSize(message.attachment.size)]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </a>
                              </div>
                            )}
                            <p
                              className={`mt-2 text-[11px] uppercase tracking-[0.18em] ${
                                message.role === "user"
                                  ? isUploadMessage
                                    ? "text-slate-400"
                                    : "text-slate-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {message.role} · {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                          {showInlineLogoStatus && renderLogoStatusCard()}
                        </Fragment>
                      );
                    })}

                    {canUploadLogo && !logoAttachment && (
                      <div data-thread-item className={assistantBubbleClass}>
                        <p className="whitespace-pre-wrap leading-6">
                          If the design or logo is ready, use the upload button here to attach it now.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingLogo || sending}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            Upload logo
                          </button>
                          {pendingLogoFile && (
                            <>
                              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                                <Paperclip className="h-3.5 w-3.5" />
                                {pendingLogoFile.name}
                                {pendingLogoSize ? <span className="text-slate-500">{pendingLogoSize}</span> : null}
                              </span>
                            </>
                          )}
                        </div>
                        {pendingLogoFile && (
                          <p className="mt-3 text-xs text-slate-500">
                            Logo selected. Press Submit logo to send it into this chat flow.
                          </p>
                        )}
                        {pendingLogoPreviewUrl && pendingLogoFile && (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                            { }
                            <img
                              src={pendingLogoPreviewUrl}
                              alt={pendingLogoFile.name}
                              className="max-h-64 w-full rounded-xl object-contain"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {pendingLogoFile && (
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => void handleSubmitLogo()}
                              disabled={uploadingLogo || sending}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {uploadingLogo ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Submit logo
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {canUploadLogo && logoAttachment && !hasInlineLogoStatus && renderLogoStatusCard()}
                    {logoPending && !logoAttachment && renderPendingLogoCard()}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                    <Bot className="h-10 w-10 text-slate-400" />
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">No conversation yet</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                      Start with a real customer-style request. Sales AI will extract order details, ask for anything missing, and let you submit the lead from this admin test harness.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-4">
              <label htmlFor="assistant-composer" className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Send a test message
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_UPLOAD_ACCEPT}
                className="hidden"
                onChange={handleLogoUpload}
              />
              <textarea
                id="assistant-composer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                className={`mt-3 min-h-[7.5rem] ${GALAXY_INPUT_CLASS}`}
                placeholder="Example: I need 30 navy t-shirts with front left chest logo and back print for next week."
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">Press Enter to send. Shift+Enter adds a new line.</p>
                  {!canUploadLogo && (
                    <span className="text-xs text-slate-500">The upload step appears in the chat after the size breakdown is captured.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={!draft.trim() || sending || uploadingLogo}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  Send message
                </button>
              </div>
            </div>

            {(lastSuggestions.length > 0 || lastRelatedContext.length > 0) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Sales AI suggestions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lastSuggestions.length ? (
                      lastSuggestions.map((item) => (
                        <span
                          key={item}
                          className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No extra suggestions on the last reply.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Retrieved context</p>
                  <div className="mt-3 space-y-2">
                    {lastRelatedContext.length ? (
                      lastRelatedContext.map((item) => (
                        <div key={`${item.source}-${item.text}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          <p>{item.text}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {item.source} · match {Math.round(item.score * 100)}%
                          </p>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No related approved patterns or knowledge surfaced yet.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className={GALAXY_PANEL_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Lead Snapshot</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Current extracted lead</h2>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    session.submittedLeadId
                      ? "border-slate-200 bg-white text-slate-700"
                      : session.readyToSubmit
                        ? "border-emerald-200 bg-white text-emerald-700"
                        : "border-amber-200 bg-white text-amber-700"
                  }`}
                >
                  {session.submittedLeadId ? "Submitted" : session.readyToSubmit ? "Ready to submit" : "Missing details"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Client", session.lead.clientName || "Not set"],
                  ["Phone", session.lead.phone || "Not set"],
                  ["Email", session.lead.email || "Not set"],
                  ["Product", session.lead.productType || "Not set"],
                  ["Quantity", session.lead.quantity ? String(session.lead.quantity) : "Not set"],
                  ["Color", session.lead.color || "Not set"],
                  ["Sizes", session.lead.sizes.join(", ") || "Not set"],
                  ["Size breakdown", formatSizeBreakdown(session.lead.sizeBreakdown)],
                  ["Print positions", session.lead.printPositions.join(", ") || "Not set"],
                  ["Print sizes", session.lead.printSizes.join(", ") || "Not set"],
                  ["Logo ready", session.lead.logoReady === null ? "Not set" : session.lead.logoReady ? "Yes" : "No"],
                  ["Logo pending", session.lead.logoPending ? "Yes" : "No"],
                  ["Logo file", session.lead.logoAttachment?.name || "Not set"],
                  ["Delivery", session.lead.deliveryMethod || "Not set"],
                  ["Deadline", session.lead.deadline || "Not set"],
                ].map(([label, value]) => (
                  <div key={label} className={`${GALAXY_SUBPANEL_CLASS} px-4 py-3`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
                    <p className="mt-2 text-sm font-medium text-slate-800">{value}</p>
                  </div>
                ))}
              </div>

              <div className={`mt-4 ${GALAXY_SUBPANEL_CLASS} p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Missing required fields</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.missingFields.length ? (
                    session.missingFields.map((field) => (
                      <span
                        key={field}
                        className="inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700"
                      >
                        {formatAssistantFieldLabel(field)}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      All required details captured
                    </span>
                  )}
                </div>
                {session.lead.notes && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{session.lead.notes}</p>
                  </div>
                )}
                {session.lead.logoAttachment?.url && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Uploaded logo</p>
                    <p className="mt-2 text-sm text-slate-600">Review it here, then open the original file if needed.</p>
                    {isImageAttachment(session.lead.logoAttachment) && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                        { }
                        <img
                          src={session.lead.logoAttachment.url}
                          alt={session.lead.logoAttachment.name}
                          className="h-32 w-full rounded-xl object-contain"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <a
                      href={session.lead.logoAttachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Paperclip className="h-4 w-4" />
                      {session.lead.logoAttachment.name}
                    </a>
                  </div>
                )}
              </div>
            </section>

            <section className={GALAXY_PANEL_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Learning State</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Training overview</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                  <BrainCircuit className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniStat
                  label="Approved leads"
                  value={String(trainingSnapshot?.approvedLeadCount || 0)}
                  sub="Used as positive examples"
                />
                <MiniStat
                  label="Keywords"
                  value={String(trainingSnapshot?.positiveKeywordCount || 0)}
                  sub="Learned signal vocabulary"
                />
                <MiniStat
                  label="Aliases"
                  value={String(trainingSnapshot?.learnedProductAliasCount || 0)}
                  sub="Auto-learned product phrasing"
                />
              </div>

              <div className={`mt-4 ${GALAXY_SUBPANEL_CLASS} p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Field groups</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trainingSnapshot?.fieldGroups?.length ? (
                    trainingSnapshot.fieldGroups.map((fieldGroup) => (
                      <span
                        key={fieldGroup.field}
                        className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {fieldGroup.field} · {fieldGroup.examples.length} examples
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No training groups yet.</span>
                  )}
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  Last retrained: <span className="font-medium text-slate-900">{formatDateTime(trainingSnapshot?.updatedAt || null)}</span>
                </p>
              </div>

              <div className={`mt-4 ${GALAXY_SUBPANEL_CLASS} p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Learned product aliases</p>
                <div className="mt-3 space-y-3">
                  {trainingSnapshot?.learnedProductAliasCount ? (
                    Object.entries(trainingSnapshot.learnedProductAliases).map(([productType, aliases]) => (
                      <div key={productType}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{productType}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {aliases.length ? (
                            aliases.map((alias) => (
                              <span
                                key={`${productType}-${alias}`}
                                className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                              >
                                {alias}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">No learned aliases yet.</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      Sales AI only learns aliases from approved leads, so it adapts without training itself on bad chats.
                    </span>
                  )}
                </div>
              </div>

              <div className={`mt-4 ${GALAXY_SUBPANEL_CLASS} p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Top learned keywords</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trainingSnapshot?.topKeywords?.length ? (
                    trainingSnapshot.topKeywords.map((item) => (
                      <span
                        key={item.keyword}
                        className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {item.keyword} · {item.count}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">Top keywords will appear after approvals or saved knowledge.</span>
                  )}
                </div>
              </div>
            </section>

            <section className={GALAXY_PANEL_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Knowledge Base</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Add business guidance</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                  <DatabaseZap className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  value={knowledgeTitle}
                  onChange={(event) => setKnowledgeTitle(event.target.value)}
                  className={GALAXY_INPUT_CLASS}
                  placeholder="Knowledge title"
                />
                <textarea
                  value={knowledgeContent}
                  onChange={(event) => setKnowledgeContent(event.target.value)}
                  className={`min-h-[8rem] ${GALAXY_INPUT_CLASS}`}
                  placeholder="Example: Front left chest logo is usually 9x9 cm. Large back print is usually 22x22 cm."
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveKnowledge}
                    disabled={savingKnowledge || !knowledgeTitle.trim() || !knowledgeContent.trim()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingKnowledge ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                    Save knowledge
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {recentKnowledge.length ? (
                  recentKnowledge.map((item) => (
                    <div key={item.id} className={`${GALAXY_SUBPANEL_CLASS} p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.content}</p>
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No knowledge items saved yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className={GALAXY_PANEL_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Recent Sessions</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Replay test runs</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                <MessageSquareText className="h-6 w-6" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recentSessions.length ? (
                recentSessions.map((item: AssistantSessionSummary) => (
                  <button
                    key={item.sessionId}
                    type="button"
                    onClick={() => void refreshSession(item.sessionId)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      session.sessionId === item.sessionId
                        ? "border-slate-900 bg-slate-50 shadow-[0_14px_28px_rgba(15,23,42,0.06)]"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-500">{item.sessionId}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {item.lead.clientName || "Unnamed lead"} · {item.lead.productType || "No product yet"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {item.lastMessage || "No Sales AI reply stored yet."}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          item.readyToSubmit
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : "border-amber-200 bg-white text-amber-700"
                        }`}
                      >
                        {item.readyToSubmit ? "Ready" : "In progress"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                      {item.messageCount} messages · updated {formatDateTime(item.updatedAt)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No sessions yet. Start a fresh session above and send a message.
                </div>
              )}
            </div>
          </section>

          <section className={GALAXY_PANEL_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Recent Leads</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Approve or reject submissions</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recentLeads.length ? (
                recentLeads.map((lead) => (
                  <div key={lead.id} className={`${GALAXY_SUBPANEL_CLASS} p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {lead.lead.clientName || "Unnamed client"} · {lead.lead.productType || "No product"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Qty {lead.lead.quantity || 0} · {lead.lead.color || "No color"} · {lead.lead.printPositions.join(", ") || "No print positions"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                          Session {lead.sessionId || "n/a"} · {formatDateTime(lead.updatedAt)}
                        </p>
                        {lead.quoteId && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                            Quotation Approval ID {lead.quoteId}
                          </p>
                        )}
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${leadStatusClass(lead.status)}`}>
                        {lead.status}
                      </span>
                    </div>

                    {lead.feedbackComment && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        {lead.feedbackComment}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleFeedback(lead, "approved")}
                        className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFeedback(lead, "rejected")}
                        className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Submitted leads will appear here for approval testing.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
