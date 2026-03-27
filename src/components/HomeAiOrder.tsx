"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  Paperclip,
  RefreshCw,
  SendHorizontal,
} from "lucide-react";
import {
  createEmptyAssistantLead,
  missingAssistantFields,
  type AssistantAttachment,
} from "@/lib/ai-assistant";
import type { AssistantChatPayload, AssistantSessionDetail } from "@/lib/ai-assistant-store";

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
  const hasMessages = session.messages.length > 0;

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
    <section className="mx-auto max-w-[50rem]">
      <div className="relative overflow-hidden rounded-[36px] border border-[#f0e5fb] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,248,252,0.98)_46%,rgba(248,252,255,0.98)_100%)] p-4 shadow-[0_36px_90px_-58px_rgba(142,82,255,0.42)] sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-12 top-4 h-28 w-28 rounded-full bg-cyan-200/[0.65] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 h-28 w-28 rounded-full bg-fuchsia-200/[0.55] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full bg-amber-200/[0.5] blur-3xl"
        />

        <div className="relative rounded-[30px] border border-white/90 bg-white/[0.9] p-4 shadow-[0_24px_66px_-46px_rgba(124,58,237,0.32)] backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee7f7] pb-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#eadcff] bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(168,85,247,0.12),rgba(244,114,182,0.12))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6b4ccf]">
                <Bot className="h-3.5 w-3.5 text-[#8257ff]" />
                Live order assistant
              </div>
              <h3 className="mt-3 text-[1.8rem] font-semibold tracking-tight text-[#161224] sm:text-[2rem]">
                Chat with MO AI Order
              </h3>
            </div>
            {hasMessages && (
              <button
                type="button"
                onClick={resetConversation}
                className="inline-flex items-center gap-2 rounded-full border border-[#e8dcff] bg-white px-4 py-2 text-sm font-medium text-[#5f4db8] transition hover:border-[#cfb9ff] hover:bg-[#fbf8ff]"
              >
                <RefreshCw className="h-4 w-4" />
                New chat
              </button>
            )}
          </div>

          <div
            ref={messageListRef}
            className="mt-4 flex max-h-[18.5rem] flex-col gap-3 overflow-y-auto rounded-[26px] border border-[#efe8fa] bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(252,247,255,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-5"
          >
            {hasMessages ? (
              session.messages.map((entry) => {
                const userMessage = entry.role === "user";
                return (
                  <div key={entry.id} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-[22px] border px-4 py-3 shadow-[0_20px_38px_-32px_rgba(74,39,150,0.22)] ${
                        userMessage
                          ? "border-[#eadbff] bg-[linear-gradient(135deg,#fff8fe_0%,#eefaff_52%,#fff6eb_100%)] text-[#1d1831]"
                          : "border-[#ede6fb] bg-white/95 text-[#231f38]"
                      }`}
                    >
                      <p
                        className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] ${
                          userMessage
                            ? "text-[#7a5de1]"
                            : "bg-[linear-gradient(90deg,#06b6d4_0%,#8b5cf6_48%,#ec4899_100%)] bg-clip-text text-transparent"
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
                                ? "border-[#e6d7ff] bg-white/80 text-[#5741b2]"
                                : "border-[#d9eef7] bg-[#f4fbff] text-[#0f7490]"
                            }`}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="truncate">{entry.attachment.name}</span>
                            {formatAttachmentSize(entry.attachment.size) ? (
                              <span className={userMessage ? "text-[#8f82c5]" : "text-[#5c9caf]"}>
                                {formatAttachmentSize(entry.attachment.size)}
                              </span>
                            ) : null}
                          </a>
                          {isImageAttachment(entry.attachment) && (
                            <div className="overflow-hidden rounded-[18px] border border-[#ebe2fa] bg-white p-2">
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
              <div className="flex min-h-[13rem] items-center justify-center rounded-[22px] border border-dashed border-[#e8defa] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(246,250,255,0.92),rgba(255,248,252,0.95))] px-5 py-6">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#eadcff] bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(168,85,247,0.16),rgba(244,114,182,0.14))] shadow-[0_18px_44px_-30px_rgba(124,58,237,0.45)]">
                  <div
                    aria-hidden
                    className="absolute inset-2 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(252,246,255,0.92))]"
                  />
                  <Bot className="relative h-7 w-7 text-[#7a5de1]" />
                </div>
              </div>
            )}
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {canUploadLogo && !session.lead.logoAttachment ? (
            <div className="mt-4 rounded-[26px] border border-[#ece2fb] bg-[linear-gradient(135deg,#f7fcff_0%,#fdf7ff_48%,#fffaf2_100%)] p-4 shadow-[0_22px_44px_-38px_rgba(124,58,237,0.28)]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo || sending}
                  className="inline-flex items-center gap-2 rounded-full border border-[#e3d6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5d4bb6] transition hover:border-[#cdb9ff] hover:bg-[#faf7ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  Upload logo
                </button>
                {pendingLogoFile ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e6dbfb] bg-white px-3 py-2 text-xs font-semibold text-[#6552bf]">
                    <Paperclip className="h-3.5 w-3.5" />
                    {pendingLogoFile.name}
                    {pendingLogoSize ? <span className="text-[#8c80c7]">{pendingLogoSize}</span> : null}
                  </span>
                ) : null}
              </div>
              {pendingLogoFile ? (
                <p className="mt-3 text-sm text-[#656178]">
                  Logo selected. Press Submit logo to attach it to this AI order.
                </p>
              ) : null}
              {pendingLogoPreviewUrl && pendingLogoFile ? (
                <div className="mt-3 overflow-hidden rounded-[20px] border border-[#ebe2fa] bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingLogoPreviewUrl}
                    alt={pendingLogoFile.name}
                    className="max-h-64 w-full rounded-[16px] object-contain"
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
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_48%,#ec4899_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_36px_-24px_rgba(124,58,237,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="rounded-[26px] border border-[#ece4fb] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(252,248,255,0.95))] p-4 shadow-[0_24px_48px_-38px_rgba(124,58,237,0.25)]">
              <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a7db8]" htmlFor="mo-ai-order-message">
                Message
              </label>
              <textarea
                id="mo-ai-order-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell MO AI what you need: garment, quantity, color, sizes, print, deadline..."
                rows={3}
                className="mt-3 min-h-[4.8rem] w-full rounded-[20px] border border-[#e8def9] bg-[#fcfbff] px-4 py-3 text-sm text-[#211c33] outline-none transition placeholder:text-[#9b96b3] focus:border-[#bca3ff] focus:ring-4 focus:ring-[#efe7ff]"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 font-semibold text-cyan-700">Garments</span>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-semibold text-violet-700">Sizes</span>
                  <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 font-semibold text-fuchsia-700">Logo</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">Delivery</span>
                </div>

                <button
                  type="submit"
                  disabled={sending || uploadingLogo || (!message.trim() && !pendingLogoFile)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_48%,#ec4899_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_22px_40px_-24px_rgba(124,58,237,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
