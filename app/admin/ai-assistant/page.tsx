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
  "rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,10,24,0.9),rgba(10,17,39,0.82))] p-5 shadow-[0_24px_64px_rgba(3,6,20,0.45)] backdrop-blur-xl";
const GALAXY_SUBPANEL_CLASS =
  "rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]";
const GALAXY_INPUT_CLASS =
  "w-full rounded-2xl border border-white/10 bg-[rgba(8,11,26,0.88)] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/60 focus:ring-4 focus:ring-fuchsia-500/15";

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
  return `/api/admin/ai-assistant/uploads/${encodeURIComponent(uploadId)}`;
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
  const metaRef = doc(db, "aiAssistantUploads", uploadId);

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
    batch.set(doc(db, "aiAssistantUploads", uploadId, "chunks", String(index).padStart(4, "0")), {
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
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "rejected") {
    return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  }
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
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
    <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_34px_rgba(2,6,23,0.26)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">{label}</p>
      <p className="mt-3 text-[2rem] font-semibold leading-none text-slate-50">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{sub}</p>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "cyan" | "amber" | "emerald";
}) {
  const topEdgeClass =
    accent === "amber"
      ? "from-fuchsia-300/80 via-fuchsia-200/30 to-white/0"
      : accent === "emerald"
        ? "from-indigo-300/80 via-violet-200/30 to-white/0"
        : "from-cyan-200/80 via-cyan-100/30 to-white/0";

  const labelClass =
    accent === "amber"
      ? "text-fuchsia-100/85"
      : accent === "emerald"
        ? "text-indigo-100/85"
        : "text-cyan-100/85";

  const subClass =
    accent === "amber"
      ? "text-fuchsia-50/82"
      : accent === "emerald"
        ? "text-indigo-50/82"
        : "text-slate-200";

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_52px_rgba(2,6,23,0.34)] backdrop-blur-md">
      <div aria-hidden className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${topEdgeClass}`} />
      <p className={`text-[11px] font-semibold uppercase tracking-[0.32em] ${labelClass}`}>{label}</p>
      <p className="mt-5 text-4xl font-semibold leading-none text-white">{value}</p>
      <p className={`mt-3 max-w-[16rem] text-sm leading-6 ${subClass}`}>{sub}</p>
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
    "max-w-[85%] rounded-3xl border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(14,31,55,0.84))] px-4 py-3 text-sm text-cyan-50 shadow-[0_18px_36px_rgba(8,15,35,0.34)] backdrop-blur";
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
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Upload complete
        </div>
        <p className="mt-3 font-semibold text-emerald-100">Logo attached to this session</p>
        <p className="mt-1 text-xs leading-5 text-emerald-200/85">
          Sales AI has this file now. Review it below or upload a new version if needed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={logoAttachment.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-white/[0.1]"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Review logo
          </a>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo || sending}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-[linear-gradient(135deg,#065f46_0%,#10b981_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            Upload new logo
          </button>
          {pendingLogoFile && (
            <button
              type="button"
              onClick={() => void handleSubmitLogo()}
              disabled={uploadingLogo || sending}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-[linear-gradient(135deg,#065f46_0%,#10b981_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit logo
            </button>
          )}
        </div>
        {pendingLogoFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-300/20 bg-white/[0.05] px-3 py-3 text-xs text-emerald-100">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-semibold">{pendingLogoFile.name}</span>
            {pendingLogoSize ? <span className="text-emerald-200/80">{pendingLogoSize}</span> : null}
            <span className="text-emerald-200/80">ready to send</span>
          </div>
        )}
        {pendingLogoPreviewUrl && pendingLogoFile && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-300/20 bg-white/[0.05] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingLogoPreviewUrl}
              alt={pendingLogoFile.name}
              className="max-h-64 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        )}
        {isImageAttachment(logoAttachment) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-300/20 bg-white/[0.05] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Upload pending
        </div>
        <p className="mt-3 font-semibold text-fuchsia-100">Logo will be attached later</p>
        <p className="mt-1 text-xs leading-5 text-fuchsia-200/85">
          Sales AI continued the flow without the file. Upload the logo again once storage is available.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo || sending}
            className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-[linear-gradient(135deg,#7c2d12_0%,#c026d3_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            Upload logo now
          </button>
          {pendingLogoFile && (
            <button
              type="button"
              onClick={() => void handleSubmitLogo()}
              disabled={uploadingLogo || sending}
              className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-[linear-gradient(135deg,#7c2d12_0%,#c026d3_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit logo
            </button>
          )}
        </div>
        {pendingLogoFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] px-3 py-3 text-xs text-fuchsia-100">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-semibold">{pendingLogoFile.name}</span>
            {pendingLogoSize ? <span className="text-fuchsia-200/80">{pendingLogoSize}</span> : null}
            <span className="text-fuchsia-200/80">ready to send</span>
          </div>
        )}
        {pendingLogoPreviewUrl && pendingLogoFile && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingLogoPreviewUrl}
              alt={pendingLogoFile.name}
              className="max-h-64 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="ai-assistant-page relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_22%),radial-gradient(circle_at_top_right,rgba(217,70,239,0.16),transparent_24%),radial-gradient(circle_at_50%_120%,rgba(79,70,229,0.24),transparent_28%),linear-gradient(180deg,#030712_0%,#081124_32%,#0b1330_68%,#111827_100%)] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-14 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.22),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-8rem] top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.24),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.24),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0)_1.5px),radial-gradient(circle_at_78%_32%,rgba(255,255,255,0.45)_0,rgba(255,255,255,0)_1.2px),radial-gradient(circle_at_64%_72%,rgba(255,255,255,0.5)_0,rgba(255,255,255,0)_1.6px),radial-gradient(circle_at_34%_82%,rgba(255,255,255,0.35)_0,rgba(255,255,255,0)_1.2px)]"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              ← Back to admin dashboard
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-sm backdrop-blur">
                <TestTube2 className="h-3.5 w-3.5" />
                Admin testing first
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-100 shadow-sm backdrop-blur">
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
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-slate-100 shadow-[0_16px_28px_rgba(2,6,23,0.22)] backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[0.1]"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleRetrain}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#312e81_0%,#9333ea_52%,#06b6d4_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(88,28,135,0.32)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              {training ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Retrain
            </button>
          </div>
        </div>

        <section className="relative isolate overflow-hidden rounded-[2.25rem] border border-white/10 bg-[linear-gradient(135deg,#090f23_0%,#131b44_28%,#4c1d95_66%,#7c3aed_100%)] px-6 py-7 shadow-[0_32px_110px_rgba(2,6,23,0.4)] sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_78%_26%,rgba(34,211,238,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.14),transparent_24%)]"
          />
          <div
            aria-hidden
            className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.28),transparent_68%)] blur-3xl"
          />
          <div
            aria-hidden
            className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.28),transparent_68%)] blur-3xl"
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1.35fr)_390px]">
            <div className="max-w-3xl text-white">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-100/90 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Private training cockpit
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.38em] text-cyan-100/80">MO T-SHIRT AI Lab</p>
              <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-[0.95] tracking-tight sm:text-5xl xl:text-[4.2rem]">
                Train and test your in-house sales AI inside admin before any public launch.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                This page keeps your AI private while you validate order capture, submit sample leads, save knowledge, and approve or reject results for learning.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/20 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
                  <Bot className="h-3.5 w-3.5" />
                  Chat-driven lead capture
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/20 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Session playback
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/20 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  Feedback-driven retraining
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <HeroStat
                label="Sessions"
                value={String(recentSessions.length)}
                sub={recentSessions.length ? "Recent admin runs loaded" : "No testing sessions yet"}
                accent="cyan"
              />
              <HeroStat
                label="Leads"
                value={String(recentLeads.length)}
                sub={recentLeads.length ? "Recent submitted leads ready for review" : "No submitted leads yet"}
                accent="emerald"
              />
              <HeroStat
                label="Knowledge"
                value={String(recentKnowledge.length)}
                sub={recentKnowledge.length ? "Business notes already feeding Sales AI" : "Knowledge base is empty"}
                accent="amber"
              />
            </div>
          </div>
        </section>

        {(notice || error) && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm shadow-[0_16px_32px_rgba(2,6,23,0.24)] ${
              error
                ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Testing Session</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Sales AI console</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Session: <span className="font-mono text-xs text-cyan-100">{session.sessionId}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startFreshSession}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-fuchsia-300/35 hover:bg-white/[0.08]"
                >
                  <Sparkles className="h-4 w-4" />
                  New session
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendMessage({ message: "summary" })}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={handleSubmitLead}
                  disabled={submitting || !session.readyToSubmit || Boolean(session.submittedLeadId)}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#4338ca_0%,#9333ea_52%,#06b6d4_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(91,33,182,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm transition hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-[26rem] rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(4,9,24,0.96),rgba(8,16,34,0.9))] p-4 shadow-inner shadow-black/30">
              <div ref={messageListRef} className="h-[25rem] space-y-3 overflow-y-auto pr-1">
                {loadingSession ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
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
                        ? "ml-auto max-w-[88%] rounded-[2rem] border border-fuchsia-300/20 bg-[linear-gradient(180deg,#22113f_0%,#0f172a_100%)] px-4 py-4 text-white shadow-[0_20px_40px_rgba(15,23,42,0.34)]"
                        : `max-w-[85%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                            message.role === "user"
                              ? "ml-auto border border-fuchsia-300/20 bg-[linear-gradient(135deg,#312e81_0%,#6d28d9_55%,#7e22ce_100%)] text-white shadow-[0_18px_38px_rgba(88,28,135,0.3)]"
                              : assistantBubbleClass
                          }`;

                      return (
                        <Fragment key={message.id}>
                      <div data-thread-item className={messageBubbleClass}>
                            {isUploadMessage ? (
                              <div className="space-y-3">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  Logo uploaded
                                </div>
                                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.05] px-4 py-3">
                                  <p className="text-xl font-semibold tracking-tight text-white">{message.attachment?.name || message.content}</p>
                                </div>
                              </div>
                            ) : printPrompt ? (
                              <div className="space-y-3">
                                <p className="text-base font-medium leading-6 text-cyan-50">{printPrompt.question}</p>
                                <div className="flex flex-wrap gap-2">
                                  {printPrompt.options.map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => void handleSendMessage({ message: option })}
                                      disabled={sending || uploadingLogo}
                                      className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold tracking-[0.04em] text-cyan-100 shadow-sm"
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
                                          ? "border-white/10 bg-white/[0.04]"
                                          : "border-white/15 bg-white/10"
                                        : "border-cyan-300/20 bg-white/[0.04]"
                                    }`}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={message.attachment.url}
                                      alt={message.attachment.name}
                                      className={`w-full rounded-xl object-contain ${
                                        isUploadMessage ? "max-h-64 bg-slate-900/40" : "max-h-48"
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
                                        ? "border-white/10 bg-white/[0.07] text-white"
                                        : "border-white/15 bg-white/10 text-white"
                                      : "border-cyan-300/20 bg-white/[0.05] text-cyan-50"
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
                                    ? "text-slate-300/90"
                                    : "text-slate-300"
                                  : "text-cyan-200/70"
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
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-[linear-gradient(135deg,#0f766e_0%,#06b6d4_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            Upload logo
                          </button>
                          {pendingLogoFile && (
                            <>
                              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-cyan-50">
                                <Paperclip className="h-3.5 w-3.5" />
                                {pendingLogoFile.name}
                                {pendingLogoSize ? <span className="text-cyan-200/80">{pendingLogoSize}</span> : null}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleSubmitLogo()}
                                disabled={uploadingLogo || sending}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-[linear-gradient(135deg,#065f46_0%,#10b981_100%)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {uploadingLogo ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Submit logo
                              </button>
                            </>
                          )}
                        </div>
                        {pendingLogoFile && (
                          <p className="mt-3 text-xs text-cyan-200/80">
                            Logo selected. Press Submit logo to send it into this chat flow.
                          </p>
                        )}
                        {pendingLogoPreviewUrl && pendingLogoFile && (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-300/20 bg-white/[0.05] p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pendingLogoPreviewUrl}
                              alt={pendingLogoFile.name}
                              className="max-h-64 w-full rounded-xl object-contain"
                              loading="lazy"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {canUploadLogo && logoAttachment && !hasInlineLogoStatus && renderLogoStatusCard()}
                    {logoPending && !logoAttachment && renderPendingLogoCard()}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-white/12 bg-white/[0.03] px-6 text-center">
                    <Bot className="h-10 w-10 text-cyan-300" />
                    <h3 className="mt-4 text-lg font-semibold text-white">No conversation yet</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                      Start with a real customer-style request. Sales AI will extract order details, ask for anything missing, and let you submit the lead from this admin test harness.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4">
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
                  <p className="text-xs text-slate-400">Press Enter to send. Shift+Enter adds a new line.</p>
                  {!canUploadLogo && (
                    <span className="text-xs text-slate-500">The upload step appears in the chat after the size breakdown is captured.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={!draft.trim() || sending || uploadingLogo}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#4338ca_0%,#9333ea_55%,#06b6d4_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(91,33,182,0.32)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  Send message
                </button>
              </div>
            </div>

            {(lastSuggestions.length > 0 || lastRelatedContext.length > 0) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.4rem] border border-fuchsia-300/20 bg-fuchsia-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-100">Sales AI suggestions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lastSuggestions.length ? (
                      lastSuggestions.map((item) => (
                        <span
                          key={item}
                          className="inline-flex rounded-full border border-fuchsia-300/20 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-fuchsia-50"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-fuchsia-100/80">No extra suggestions on the last reply.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-cyan-300/20 bg-cyan-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">Retrieved context</p>
                  <div className="mt-3 space-y-2">
                    {lastRelatedContext.length ? (
                      lastRelatedContext.map((item) => (
                        <div key={`${item.source}-${item.text}`} className="rounded-2xl border border-cyan-300/20 bg-white/[0.07] px-3 py-2 text-sm text-slate-100">
                          <p>{item.text}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">
                            {item.source} · match {Math.round(item.score * 100)}%
                          </p>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-cyan-100/80">No related approved patterns or knowledge surfaced yet.</span>
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
                  <h2 className="mt-2 text-2xl font-semibold text-white">Current extracted lead</h2>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    session.submittedLeadId
                      ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                      : session.readyToSubmit
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-400/25 bg-amber-400/10 text-amber-100"
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
                    <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
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
                        className="inline-flex rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100"
                      >
                        {formatAssistantFieldLabel(field)}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
                      All required details captured
                    </span>
                  )}
                </div>
                {session.lead.notes && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{session.lead.notes}</p>
                  </div>
                )}
                {session.lead.logoAttachment?.url && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Uploaded logo</p>
                    <p className="mt-2 text-sm text-slate-300">Review it here, then open the original file if needed.</p>
                    {isImageAttachment(session.lead.logoAttachment) && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
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
                  <h2 className="mt-2 text-2xl font-semibold text-white">Training overview</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-sm">
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
                        className="inline-flex rounded-full border border-cyan-300/20 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-cyan-100"
                      >
                        {fieldGroup.field} · {fieldGroup.examples.length} examples
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-300">No training groups yet.</span>
                  )}
                </div>
                <p className="mt-4 text-sm text-slate-300">
                  Last retrained: <span className="font-medium text-white">{formatDateTime(trainingSnapshot?.updatedAt || null)}</span>
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
                                className="inline-flex rounded-full border border-emerald-300/20 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-emerald-100"
                              >
                                {alias}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">No learned aliases yet.</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-slate-300">
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
                        className="inline-flex rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-100"
                      >
                        {item.keyword} · {item.count}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-300">Top keywords will appear after approvals or saved knowledge.</span>
                  )}
                </div>
              </div>
            </section>

            <section className={GALAXY_PANEL_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Knowledge Base</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Add business guidance</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100 shadow-sm">
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
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#7c3aed_0%,#ec4899_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
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
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{item.content}</p>
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm text-slate-300">
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
                <h2 className="mt-2 text-2xl font-semibold text-white">Replay test runs</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-slate-100 shadow-sm">
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
                        ? "border-cyan-300/30 bg-cyan-400/10 shadow-[0_18px_32px_rgba(6,182,212,0.14)]"
                        : "border-white/10 bg-white/[0.04] hover:border-fuchsia-300/20 hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-300">{item.sessionId}</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {item.lead.clientName || "Unnamed lead"} · {item.lead.productType || "No product yet"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                          {item.lastMessage || "No Sales AI reply stored yet."}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          item.readyToSubmit
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                            : "border-amber-400/25 bg-amber-400/10 text-amber-100"
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
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm text-slate-300">
                  No sessions yet. Start a fresh session above and send a message.
                </div>
              )}
            </div>
          </section>

          <section className={GALAXY_PANEL_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Recent Leads</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Approve or reject submissions</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recentLeads.length ? (
                recentLeads.map((lead) => (
                  <div key={lead.id} className={`${GALAXY_SUBPANEL_CLASS} p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {lead.lead.clientName || "Unnamed client"} · {lead.lead.productType || "No product"}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          Qty {lead.lead.quantity || 0} · {lead.lead.color || "No color"} · {lead.lead.printPositions.join(", ") || "No print positions"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                          Session {lead.sessionId || "n/a"} · {formatDateTime(lead.updatedAt)}
                        </p>
                        {lead.quoteId && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                            Quotation Approval ID {lead.quoteId}
                          </p>
                        )}
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${leadStatusClass(lead.status)}`}>
                        {lead.status}
                      </span>
                    </div>

                    {lead.feedbackComment && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-slate-200">
                        {lead.feedbackComment}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleFeedback(lead, "approved")}
                        className="rounded-full bg-[linear-gradient(135deg,#065f46_0%,#10b981_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFeedback(lead, "rejected")}
                        className="rounded-full bg-[linear-gradient(135deg,#881337_0%,#f43f5e_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm text-slate-300">
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
