"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  Paperclip,
  RefreshCw,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import {
  createEmptyAssistantLead,
  formatAssistantFieldLabel,
  missingAssistantFields,
  type AssistantAttachment,
} from "@/lib/ai-assistant";
import type { AssistantChatPayload, AssistantMessageRecord, AssistantSessionDetail } from "@/lib/ai-assistant-store";

const LOGO_UPLOAD_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,.eps";
const MAX_LOGO_UPLOAD_BYTES = 10 * 1024 * 1024;

function generateSessionId() {
  return `web-order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Request failed.");
  }
  return body as T;
}

export default function HomeAiOrder() {
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [session, setSession] = useState<AssistantSessionDetail>(() => createDraftSession(sessionId));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canUploadLogo =
    !session.missingFields.includes("sizeBreakdown") &&
    session.lead.logoReady !== false &&
    !session.lead.logoPending;
  const pendingLogoSize = pendingLogoFile ? formatAttachmentSize(pendingLogoFile.size) : null;
  const stillNeeded = session.missingFields.slice(0, 4).map(formatAssistantFieldLabel);

  useEffect(() => {
    if (!pendingLogoFile) {
      setPendingLogoPreviewUrl(null);
      return;
    }

    if (!pendingLogoFile.type.startsWith("image/")) {
      setPendingLogoPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(pendingLogoFile);
    setPendingLogoPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [pendingLogoFile]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [session.messages.length, pendingLogoPreviewUrl]);

  function resetConversation() {
    const nextSessionId = generateSessionId();
    setSessionId(nextSessionId);
    setSession(createDraftSession(nextSessionId));
    setMessage("");
    setError(null);
    setNotice(null);
    setPendingLogoFile(null);
    setPendingLogoPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendChat(nextMessage: string, attachment?: AssistantAttachment | null) {
    const trimmed = nextMessage.trim();
    if (!trimmed && !attachment) return;

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const result = await readJson<AssistantChatPayload>(
        await fetch("/api/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: trimmed,
            attachment: attachment || null,
          }),
        })
      );

      setSessionId(result.sessionId);
      setSession(result.session);
      setMessage("");

      if (result.autoSubmitted && result.quoteId) {
        setNotice(`Sent to Quotation Approval as ${result.quoteId}.`);
      } else if (result.autoSubmitted) {
        setNotice("Sent to Quotation Approval.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendChat(message);
  }

  function handleLogoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setPendingLogoFile(null);
      setPendingLogoPreviewUrl(null);
      return;
    }

    if (file.size > MAX_LOGO_UPLOAD_BYTES) {
      setError("Logo must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setError(null);
    setNotice(`Logo selected: ${file.name}. Press Submit logo to continue.`);
    setPendingLogoFile(file);
  }

  async function handleSubmitLogo() {
    if (!pendingLogoFile) return;

    setUploadingLogo(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", pendingLogoFile);
      formData.append("sessionId", sessionId);

      const result = await readJson<{ attachment: AssistantAttachment; sessionId: string }>(
        await fetch("/api/ai-assistant/uploads", {
          method: "POST",
          body: formData,
        })
      );

      setSessionId(result.sessionId);
      await sendChat("", result.attachment);
      setPendingLogoFile(null);
      setPendingLogoPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[40px] bg-[#050510] p-[1px] shadow-[0_46px_140px_-60px_rgba(76,29,149,0.7)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[conic-gradient(from_210deg_at_50%_50%,rgba(34,211,238,0.75),rgba(56,189,248,0.25),rgba(168,85,247,0.78),rgba(244,114,182,0.72),rgba(251,146,60,0.7),rgba(250,204,21,0.58),rgba(34,211,238,0.75))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-cyan-400/[0.35] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-6 top-0 h-56 w-56 rounded-full bg-fuchsia-500/[0.3] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-2rem] left-1/3 h-48 w-48 rounded-full bg-orange-400/[0.3] blur-3xl"
      />

      <div className="relative rounded-[39px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.18),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_24%),linear-gradient(180deg,rgba(7,8,20,0.98)_0%,rgba(10,12,28,0.97)_44%,rgba(12,15,34,0.98)_100%)] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              MO AI Order
            </div>
            <h2 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Chat the order. Let the AI shape it into a quotation-ready request.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Garments, sizes, artwork, print method, delivery, and contact details all stay inside one guided AI flow.
            </p>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/85 backdrop-blur transition hover:border-cyan-300/40 hover:bg-white/[0.12] hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            New AI chat
          </button>
        </div>

        <div className="mt-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_28px_80px_-48px_rgba(8,15,40,0.9)] backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(168,85,247,0.22),rgba(244,114,182,0.22))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                <Bot className="h-3.5 w-3.5 text-fuchsia-200" />
                Live order assistant
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-white">Chat with MO AI Order</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {session.readyToSubmit
                  ? "Order details captured. This request is ready for quotation approval."
                  : stillNeeded.length
                    ? `Still capturing: ${stillNeeded.join(", ")}.`
                    : "Send the order naturally, one message at a time."}
              </p>
            </div>

            <div className="flex max-w-xl flex-wrap justify-end gap-2">
              {session.readyToSubmit ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.15] px-3 py-1 text-xs font-semibold text-emerald-100">
                  Ready for quotation
                </span>
              ) : (
                stillNeeded.map((field, index) => (
                  <span
                    key={field}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold text-white/90 ${
                      index % 4 === 0
                        ? "border-cyan-300/30 bg-cyan-400/10"
                        : index % 4 === 1
                          ? "border-fuchsia-300/30 bg-fuchsia-400/10"
                          : index % 4 === 2
                            ? "border-violet-300/30 bg-violet-400/10"
                            : "border-orange-300/30 bg-orange-400/10"
                    }`}
                  >
                    {field}
                  </span>
                ))
              )}
            </div>
          </div>

          <div
            ref={messageListRef}
            className="mt-5 flex max-h-[30rem] min-h-[22rem] flex-col gap-3 overflow-y-auto rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_18%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.09),transparent_20%),linear-gradient(180deg,rgba(6,10,24,0.92),rgba(9,14,30,0.96))] p-4 sm:p-5"
          >
            {session.messages.length ? (
              session.messages.map((entry: AssistantMessageRecord) => {
                const userMessage = entry.role === "user";
                return (
                  <div key={entry.id} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-[24px] px-4 py-3 shadow-[0_22px_40px_-30px_rgba(4,10,26,0.9)] ${
                        userMessage
                          ? "border border-white/10 bg-[linear-gradient(135deg,#06b6d4_0%,#8b5cf6_46%,#ec4899_100%)] text-white"
                          : "border border-white/10 bg-white/[0.08] text-slate-100 backdrop-blur"
                      }`}
                    >
                      <p
                        className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] ${
                          userMessage ? "text-white/70" : "text-cyan-200/80"
                        }`}
                      >
                        {userMessage ? "You" : "MO AI"}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
                      {entry.attachment && (
                        <div className="mt-3 space-y-3">
                          <a
                            href={entry.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                              userMessage
                                ? "border-white/20 bg-white/10 text-white"
                                : "border-cyan-300/20 bg-white/10 text-cyan-100"
                            }`}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="truncate">{entry.attachment.name}</span>
                            {formatAttachmentSize(entry.attachment.size) ? (
                              <span className={userMessage ? "text-white/70" : "text-cyan-200/70"}>
                                {formatAttachmentSize(entry.attachment.size)}
                              </span>
                            ) : null}
                          </a>
                          {isImageAttachment(entry.attachment) && (
                            <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/20 p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={entry.attachment.url}
                                alt={entry.attachment.name}
                                className="max-h-64 w-full rounded-2xl object-contain"
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-[24px] border border-dashed border-white/[0.12] bg-white/[0.04] px-6 text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(168,85,247,0.24),rgba(244,114,182,0.22))] text-white shadow-[0_0_40px_rgba(168,85,247,0.28)]">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-white">Start with the first order message</h4>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                  Example: <span className="font-medium text-white">I need 15 black polos for staff with logo on the chest.</span>
                </p>
                <button
                  type="button"
                  onClick={() => void sendChat("I need 15 black polos for staff with logo on the chest")}
                  disabled={sending || uploadingLogo}
                  className="mt-4 rounded-full border border-white/[0.15] bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:border-cyan-300/[0.35] hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Use sample prompt
                </button>
              </div>
            )}
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.12] px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/[0.12] px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {canUploadLogo && !session.lead.logoAttachment ? (
            <div className="mt-4 rounded-[26px] border border-white/[0.12] bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(139,92,246,0.16),rgba(236,72,153,0.15))] p-4 shadow-[0_24px_44px_-34px_rgba(6,182,212,0.45)]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo || sending}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-black/[0.35] px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  Upload logo
                </button>
                {pendingLogoFile ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/10 px-3 py-2 text-xs font-semibold text-white/90">
                    <Paperclip className="h-3.5 w-3.5" />
                    {pendingLogoFile.name}
                    {pendingLogoSize ? <span className="text-cyan-100/80">{pendingLogoSize}</span> : null}
                  </span>
                ) : null}
              </div>
              {pendingLogoFile ? (
                <p className="mt-3 text-sm text-slate-200">
                  Logo selected. Press Submit logo to attach it to this AI order.
                </p>
              ) : null}
              {pendingLogoPreviewUrl && pendingLogoFile ? (
                <div className="mt-3 overflow-hidden rounded-[22px] border border-white/[0.12] bg-black/20 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingLogoPreviewUrl}
                    alt={pendingLogoFile.name}
                    className="max-h-64 w-full rounded-[18px] object-contain"
                    loading="lazy"
                  />
                </div>
              ) : null}
              {pendingLogoFile ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSubmitLogo()}
                    disabled={uploadingLogo || sending}
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#06b6d4_0%,#8b5cf6_48%,#ec4899_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_20px_32px_-20px_rgba(168,85,247,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Submit logo
                  </button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_UPLOAD_ACCEPT}
                className="hidden"
                onChange={handleLogoSelect}
              />
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-4">
            <div className="rounded-[28px] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 backdrop-blur sm:p-5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400" htmlFor="mo-ai-order-message">
                Message
              </label>
              <textarea
                id="mo-ai-order-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell MO AI what you need: garment, quantity, color, sizes, print, deadline..."
                rows={3}
                className="mt-3 min-h-[6rem] w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35 focus:ring-4 focus:ring-cyan-400/10 sm:min-h-[4.6rem]"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 font-semibold text-cyan-100">Garments</span>
                  <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 font-semibold text-fuchsia-100">Sizes</span>
                  <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 font-semibold text-violet-100">Logo</span>
                  <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 font-semibold text-orange-100">Delivery</span>
                </div>

                <button
                  type="submit"
                  disabled={sending || uploadingLogo || (!message.trim() && !pendingLogoFile)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#06b6d4_0%,#8b5cf6_48%,#ec4899_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_24px_40px_-22px_rgba(168,85,247,0.85)] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  Send to MO AI
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
