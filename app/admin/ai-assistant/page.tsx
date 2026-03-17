"use client";

import Link from "next/link";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
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
import { storage } from "@/lib/firebase";
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

function isImageAttachment(attachment: AssistantAttachment | null) {
  if (!attachment?.url) return false;
  if (attachment.contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(attachment.name);
}

function isLogoUploadMessage(message: AssistantMessageRecord) {
  return message.role === "user" && Boolean(message.attachment?.url) && /^uploaded logo file:/i.test(message.content.trim());
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
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
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
    <div className="rounded-[1.35rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-3 text-[2rem] font-semibold leading-none text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{sub}</p>
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
      ? "from-amber-200/80 via-amber-100/30 to-white/0"
      : accent === "emerald"
        ? "from-emerald-200/80 via-emerald-100/30 to-white/0"
        : "from-cyan-200/80 via-cyan-100/30 to-white/0";

  const labelClass =
    accent === "amber"
      ? "text-amber-100/85"
      : accent === "emerald"
        ? "text-emerald-100/85"
        : "text-cyan-100/85";

  const subClass =
    accent === "amber"
      ? "text-amber-50/82"
      : accent === "emerald"
        ? "text-emerald-50/82"
        : "text-slate-200";

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))] p-5 shadow-[0_18px_45px_rgba(2,6,23,0.18)] backdrop-blur-md">
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
        setError(nextError instanceof Error ? nextError.message : "Failed to load AI assistant.");
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

      await refreshOverview();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to send message.");
      return false;
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

    setUploadingLogo(true);
    setError(null);
    setNotice(null);

    try {
      const file = pendingLogoFile;
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const uploadRef = ref(storage, `ai-assistant/${session.sessionId}/${Date.now()}-${safeName}`);
      const snap = await uploadBytes(uploadRef, file);
      const url = await getDownloadURL(snap.ref);

      const sent = await handleSendMessage({
        message: `Uploaded logo file: ${file.name}`,
        attachment: {
          name: file.name,
          url,
          contentType: file.type || null,
          size: typeof file.size === "number" ? file.size : null,
          uploadedAt: new Date().toISOString(),
        },
        preserveDraft: true,
      });
      if (sent) {
        setPendingLogoFile(null);
        setNotice(`We have received the logo: ${file.name}. Review it in the chat thread or the Lead Snapshot panel.`);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to upload logo.");
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
      setNotice("Knowledge saved and assistant retrained.");
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
      setNotice("Assistant retrained from approved leads and saved knowledge.");
      await refreshOverview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to retrain assistant.");
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
  const canUploadLogo = !session.missingFields.includes("sizeBreakdown") && session.lead.logoReady !== false;
  const logoAttachment = session.lead.logoAttachment;
  const pendingLogoSize = pendingLogoFile ? formatAttachmentSize(pendingLogoFile.size) : null;
  const assistantBubbleClass =
    "max-w-[85%] rounded-3xl border border-[#7dd3fc] bg-[rgba(255,255,255,0.96)] px-4 py-3 text-sm text-[#082f49] shadow-sm";
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
      list.scrollTo({
        top: list.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [loadingSession, orderedMessages.length, canUploadLogo, logoAttachment?.url, pendingLogoFile?.name]);

  function renderLogoStatusCard() {
    if (!logoAttachment) return null;

    return (
      <div className={assistantBubbleClass}>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Upload complete
        </div>
        <p className="mt-3 font-semibold text-emerald-950">Logo attached to this session</p>
        <p className="mt-1 text-xs leading-5 text-emerald-800">
          The assistant has this file now. Review it below or upload a new version if needed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={logoAttachment.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Review logo
          </a>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo || sending}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            Upload new logo
          </button>
          {pendingLogoFile && (
            <button
              type="button"
              onClick={() => void handleSubmitLogo()}
              disabled={uploadingLogo || sending}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit logo
            </button>
          )}
        </div>
        {pendingLogoFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-xs text-emerald-900">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-semibold">{pendingLogoFile.name}</span>
            {pendingLogoSize ? <span className="text-emerald-700">{pendingLogoSize}</span> : null}
            <span className="text-emerald-700">ready to send</span>
          </div>
        )}
        {isImageAttachment(logoAttachment) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-2">
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

  return (
    <main className="ai-assistant-page relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#f5f7fb_0%,#f7fbff_42%,#eef4ff_100%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-14 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-8rem] top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12),transparent_72%)] blur-3xl"
      />

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
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800 shadow-sm backdrop-blur">
                <TestTube2 className="h-3.5 w-3.5" />
                Admin testing first
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800 shadow-sm backdrop-blur">
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
              className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleRetrain}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#164e63_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              {training ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Retrain
            </button>
          </div>
        </div>

        <section className="relative isolate overflow-hidden rounded-[2.25rem] border border-slate-200/80 bg-[linear-gradient(135deg,#0f172a_0%,#15314a_34%,#155e75_70%,#f59e0b_150%)] px-6 py-7 shadow-[0_28px_100px_rgba(15,23,42,0.18)] sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_24%)]"
          />
          <div
            aria-hidden
            className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.32),transparent_68%)] blur-3xl"
          />
          <div
            aria-hidden
            className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.28),transparent_68%)] blur-3xl"
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1.35fr)_390px]">
            <div className="max-w-3xl text-white">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-100/90 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Private training cockpit
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.38em] text-cyan-100/80">MO T-SHIRT AI Lab</p>
              <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-[0.95] tracking-tight sm:text-5xl xl:text-[4.2rem]">
                Train and test the local sales assistant inside admin before any public launch.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                This page keeps the assistant private while you validate order capture, submit sample leads, save knowledge, and approve or reject results for learning.
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
                sub={recentKnowledge.length ? "Business notes already feeding the assistant" : "Knowledge base is empty"}
                accent="amber"
              />
            </div>
          </div>
        </section>

        {(notice || error) && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <div className="flex items-start gap-2">
              {error ? <CircleAlert className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
              <span>{error || notice}</span>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Testing Session</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Assistant console</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Session: <span className="font-mono text-xs text-slate-700">{session.sessionId}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startFreshSession}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <Sparkles className="h-4 w-4" />
                  New session
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendMessage({ message: "summary" })}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={handleSubmitLead}
                  disabled={submitting || !session.readyToSubmit}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#155e75_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  Send to Quotation Approval
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {samplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSendMessage({ message: prompt })}
                  className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-[26rem] rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-inner shadow-slate-200/70">
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
                      const messageBubbleClass = isUploadMessage
                        ? "ml-auto max-w-[88%] rounded-[2rem] border border-slate-800/90 bg-[linear-gradient(180deg,#0f172a_0%,#182235_100%)] px-4 py-4 text-white shadow-[0_20px_40px_rgba(15,23,42,0.34)]"
                        : `max-w-[85%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                            message.role === "user" ? "ml-auto bg-[#0f172a] text-white" : assistantBubbleClass
                          }`;

                      return (
                        <Fragment key={message.id}>
                          <div className={messageBubbleClass}>
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
                                        : "border-cyan-200 bg-cyan-50/70"
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
                                      : "border-cyan-200 bg-cyan-50 text-cyan-900"
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
                                  : "text-[#0c4a6e]"
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
                      <div className={assistantBubbleClass}>
                        <p className="whitespace-pre-wrap leading-6">
                          If the design or logo is ready, use the upload button here to attach it now.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingLogo || sending}
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            Upload logo
                          </button>
                          {pendingLogoFile && (
                            <>
                              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-900">
                                <Paperclip className="h-3.5 w-3.5" />
                                {pendingLogoFile.name}
                                {pendingLogoSize ? <span className="text-cyan-700">{pendingLogoSize}</span> : null}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleSubmitLogo()}
                                disabled={uploadingLogo || sending}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                          <p className="mt-3 text-xs text-cyan-700">
                            Logo selected. Press Submit logo to send it into this chat flow.
                          </p>
                        )}
                      </div>
                    )}

                    {canUploadLogo && logoAttachment && !hasInlineLogoStatus && renderLogoStatusCard()}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-slate-200 bg-white/80 px-6 text-center">
                    <Bot className="h-10 w-10 text-cyan-500" />
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">No conversation yet</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                      Start with a real customer-style request. The assistant will extract order details, ask for missing fields, and let you submit the lead from this admin test harness.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] p-4">
              <label htmlFor="assistant-composer" className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
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
                className="mt-3 min-h-[7.5rem] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                placeholder="Example: I need 30 navy t-shirts with front left chest logo and back print for next week."
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">Press Enter to send. Shift+Enter adds a new line.</p>
                  {!canUploadLogo && (
                    <span className="text-xs text-slate-400">The upload step appears in the chat after the size breakdown is captured.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={!draft.trim() || sending || uploadingLogo}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0891b2_0%,#155e75_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(8,145,178,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  Send message
                </button>
              </div>
            </div>

            {(lastSuggestions.length > 0 || lastRelatedContext.length > 0) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Assistant suggestions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lastSuggestions.length ? (
                      lastSuggestions.map((item) => (
                        <span
                          key={item}
                          className="inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-amber-700">No extra suggestions on the last reply.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-cyan-200 bg-cyan-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Retrieved context</p>
                  <div className="mt-3 space-y-2">
                    {lastRelatedContext.length ? (
                      lastRelatedContext.map((item) => (
                        <div key={`${item.source}-${item.text}`} className="rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-700">
                          <p>{item.text}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cyan-700">
                            {item.source} · match {Math.round(item.score * 100)}%
                          </p>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-cyan-700">No related approved patterns or knowledge surfaced yet.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Lead Snapshot</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Current extracted lead</h2>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    session.readyToSubmit
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {session.readyToSubmit ? "Ready to submit" : "Missing details"}
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
                  ["Logo file", session.lead.logoAttachment?.name || "Not set"],
                  ["Delivery", session.lead.deliveryMethod || "Not set"],
                  ["Deadline", session.lead.deadline || "Not set"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Missing required fields</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.missingFields.length ? (
                    session.missingFields.map((field) => (
                      <span
                        key={field}
                        className="inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{session.lead.notes}</p>
                  </div>
                )}
                {session.lead.logoAttachment?.url && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Uploaded logo</p>
                    <p className="mt-2 text-sm text-slate-600">Review it here, then open the original file if needed.</p>
                    {isImageAttachment(session.lead.logoAttachment) && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
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
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                    >
                      <Paperclip className="h-4 w-4" />
                      {session.lead.logoAttachment.name}
                    </a>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Learning State</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Training overview</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-sm">
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

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Field groups</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trainingSnapshot?.fieldGroups?.length ? (
                    trainingSnapshot.fieldGroups.map((fieldGroup) => (
                      <span
                        key={fieldGroup}
                        className="inline-flex rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700"
                      >
                        {fieldGroup}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-600">No training groups yet.</span>
                  )}
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  Last retrained: <span className="font-medium text-slate-900">{formatDateTime(trainingSnapshot?.updatedAt || null)}</span>
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Learned product aliases</p>
                <div className="mt-3 space-y-3">
                  {trainingSnapshot?.learnedProductAliasCount ? (
                    Object.entries(trainingSnapshot.learnedProductAliases).map(([productType, aliases]) => (
                      <div key={productType}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{productType}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {aliases.length ? (
                            aliases.map((alias) => (
                              <span
                                key={`${productType}-${alias}`}
                                className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
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
                    <span className="text-sm text-slate-600">
                      The assistant only learns aliases from approved leads, so it adapts without training itself on bad chats.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Top learned keywords</p>
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
                    <span className="text-sm text-slate-600">Top keywords will appear after approvals or saved knowledge.</span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Knowledge Base</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Add business guidance</h2>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-700 shadow-sm">
                  <DatabaseZap className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  value={knowledgeTitle}
                  onChange={(event) => setKnowledgeTitle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                  placeholder="Knowledge title"
                />
                <textarea
                  value={knowledgeContent}
                  onChange={(event) => setKnowledgeContent(event.target.value)}
                  className="min-h-[8rem] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                  placeholder="Example: Front left chest logo is usually 9x9 cm. Large back print is usually 22x22 cm."
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveKnowledge}
                    disabled={savingKnowledge || !knowledgeTitle.trim() || !knowledgeContent.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingKnowledge ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                    Save knowledge
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {recentKnowledge.length ? (
                  recentKnowledge.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.content}</p>
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                    No knowledge items saved yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Recent Sessions</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Replay test runs</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 shadow-sm">
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
                        ? "border-cyan-300 bg-cyan-50 shadow-[0_14px_28px_rgba(8,145,178,0.12)]"
                        : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-700">{item.sessionId}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {item.lead.clientName || "Unnamed lead"} · {item.lead.productType || "No product yet"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {item.lastMessage || "No assistant reply stored yet."}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          item.readyToSubmit
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.readyToSubmit ? "Ready" : "In progress"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {item.messageCount} messages · updated {formatDateTime(item.updatedAt)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                  No sessions yet. Start a fresh session above and send a message.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Recent Leads</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Approve or reject submissions</h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recentLeads.length ? (
                recentLeads.map((lead) => (
                  <div key={lead.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {lead.lead.clientName || "Unnamed client"} · {lead.lead.productType || "No product"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Qty {lead.lead.quantity || 0} · {lead.lead.color || "No color"} · {lead.lead.printPositions.join(", ") || "No print positions"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                          Session {lead.sessionId || "n/a"} · {formatDateTime(lead.updatedAt)}
                        </p>
                        {lead.quoteId && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
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
                        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFeedback(lead, "rejected")}
                        className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
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
