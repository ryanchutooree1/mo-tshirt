"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowUpRight,
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

const starterPrompts = [
  "I need 20 black polos for staff with logo on front left chest",
  "I need 12 white t-shirts for an event next Friday",
  "I need 8 hoodies with front and back print",
];

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
    <section className="relative overflow-hidden rounded-[34px] border border-[#F0E1D1] bg-[radial-gradient(circle_at_top_right,rgba(255,153,87,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(255,214,181,0.22),transparent_28%),linear-gradient(135deg,#fff8f1_0%,#fffdf9_48%,#fff6ed_100%)] p-6 shadow-[0_36px_90px_-58px_rgba(110,54,16,0.45)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.8)_0,rgba(255,255,255,0)_1.4px),radial-gradient(circle_at_78%_14%,rgba(255,184,123,0.6)_0,rgba(255,184,123,0)_1.6px),radial-gradient(circle_at_70%_82%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0)_1.4px)]"
      />

      <div className="relative grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F4C8A6] bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B95A1B] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            MO AI Order
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
            Start the order in chat, then let the AI push it to quotation.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-neutral-600">
            Tell MO AI what you need. It captures garments, sizes, logo, print method, delivery, and contact details,
            then sends the request into Quotation Approval once everything is complete.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Natural conversation",
                copy: "Mixed sizes, rough deadlines, and logo uploads are handled in the same flow.",
              },
              {
                title: "Less back-and-forth",
                copy: "The AI keeps what the client already said and only asks for missing details.",
              },
              {
                title: "Ready for approval",
                copy: "Completed chats flow straight into the admin quotation workspace.",
              },
              {
                title: "Better for rush jobs",
                copy: "Customers can start with one message instead of filling everything manually first.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-white/70 bg-white/75 p-4 shadow-[0_20px_40px_-34px_rgba(110,54,16,0.35)] backdrop-blur"
              >
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{item.copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[28px] border border-[#F1D2BA] bg-white/70 p-5 shadow-[0_18px_38px_-34px_rgba(110,54,16,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B95A1B]">Best way to start</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendChat(prompt)}
                  disabled={sending || uploadingLogo}
                  className="rounded-full border border-[#E9D4C1] bg-white px-4 py-2 text-left text-sm font-medium text-neutral-700 transition hover:-translate-y-0.5 hover:border-[#D98645] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#E8D9CB] bg-white/86 p-4 shadow-[0_32px_72px_-48px_rgba(110,54,16,0.45)] backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1E6DA] px-1 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF2E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B95A1B]">
                <Bot className="h-3.5 w-3.5" />
                Live order assistant
              </div>
              <h3 className="mt-3 text-xl font-semibold text-black">Chat with MO AI Order</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {session.readyToSubmit
                  ? "Order details captured. The chat is ready for quotation approval."
                  : stillNeeded.length
                    ? `Still capturing: ${stillNeeded.join(", ")}.`
                    : "Send the order naturally, one message at a time."}
              </p>
            </div>
            <button
              type="button"
              onClick={resetConversation}
              className="inline-flex items-center gap-2 rounded-full border border-[#E6D6C7] bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-[#D98645] hover:text-black"
            >
              <RefreshCw className="h-4 w-4" />
              New AI chat
            </button>
          </div>

          <div
            ref={messageListRef}
            className="mt-4 flex max-h-[28rem] min-h-[22rem] flex-col gap-3 overflow-y-auto rounded-[26px] bg-[linear-gradient(180deg,#fffaf5_0%,#fffefc_100%)] p-4"
          >
            {session.messages.length ? (
              session.messages.map((entry: AssistantMessageRecord) => {
                const userMessage = entry.role === "user";
                return (
                  <div key={entry.id} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-[24px] px-4 py-3 shadow-sm ${
                        userMessage
                          ? "border border-[#111111] bg-[#111111] text-white"
                          : "border border-[#F2D9C2] bg-white text-neutral-800"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
                      {entry.attachment && (
                        <div className="mt-3 space-y-3">
                          <a
                            href={entry.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                              userMessage
                                ? "border-white/15 bg-white/10 text-white"
                                : "border-[#F0D8C2] bg-[#FFF7F0] text-[#9A4F16]"
                            }`}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="truncate">{entry.attachment.name}</span>
                            {formatAttachmentSize(entry.attachment.size) ? (
                              <span className={userMessage ? "text-white/70" : "text-[#B95A1B]/70"}>
                                {formatAttachmentSize(entry.attachment.size)}
                              </span>
                            ) : null}
                          </a>
                          {isImageAttachment(entry.attachment) && (
                            <div className="overflow-hidden rounded-[20px] border border-black/5 bg-white/60 p-2">
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
              <div className="flex h-full flex-col items-center justify-center rounded-[22px] border border-dashed border-[#E9D8C8] bg-white/75 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF2E7] text-[#B95A1B]">
                  <Bot className="h-6 w-6" />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-black">Start with a real order request</h4>
                <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
                  Example: <span className="font-medium text-neutral-800">I need 15 black polos for staff with logo on the chest.</span>
                </p>
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
            <div className="mt-4 rounded-[24px] border border-[#F0D8C2] bg-[#FFF7F0] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo || sending}
                  className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingLogo ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  Upload logo
                </button>
                {pendingLogoFile ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#E6C8AE] bg-white px-3 py-2 text-xs font-semibold text-[#9A4F16]">
                    <Paperclip className="h-3.5 w-3.5" />
                    {pendingLogoFile.name}
                    {pendingLogoSize ? <span className="text-[#C67634]">{pendingLogoSize}</span> : null}
                  </span>
                ) : null}
              </div>
              {pendingLogoFile ? (
                <p className="mt-3 text-sm text-neutral-600">
                  Logo selected. Press Submit logo to attach it to this AI order.
                </p>
              ) : null}
              {pendingLogoPreviewUrl && pendingLogoFile ? (
                <div className="mt-3 overflow-hidden rounded-[22px] border border-[#EBCFB7] bg-white p-2">
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
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#111111_0%,#D96B1D_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="mo-ai-order-message">
              Message
            </label>
            <textarea
              id="mo-ai-order-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell MO AI what you need: garment, quantity, color, sizes, print, deadline..."
              rows={3}
              className="min-h-[6rem] w-full rounded-[24px] border border-[#E8D9CB] bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-[#D98645] focus:ring-4 focus:ring-[#FEE7D3] sm:min-h-[4rem] sm:flex-1"
            />
            <button
              type="submit"
              disabled={sending || uploadingLogo || (!message.trim() && !pendingLogoFile)}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              Send to MO AI
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className="rounded-full bg-[#FFF2E7] px-3 py-1 font-semibold text-[#B95A1B]">Garments</span>
            <span className="rounded-full bg-[#FFF2E7] px-3 py-1 font-semibold text-[#B95A1B]">Sizes</span>
            <span className="rounded-full bg-[#FFF2E7] px-3 py-1 font-semibold text-[#B95A1B]">Logo</span>
            <span className="rounded-full bg-[#FFF2E7] px-3 py-1 font-semibold text-[#B95A1B]">Delivery</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-neutral-500">
              Requests are sent to the quotation team once complete
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
