"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "mo-tshirt-ai-chat";

const starterMessage: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I am your MO T-SHIRT AI assistant. Tell me quantity, garment type, sizes, and deadline for a fast quote.",
};

const quickPrompts = [
  { label: "Get a quote", message: "I need a quote for 50 t-shirts. What info do you need?" },
  { label: "Rush order", message: "Can you do a 48h rush order? What is required?" },
  { label: "Pickup info", message: "Where is pickup and what are your business hours?" },
  { label: "Artwork help", message: "What artwork formats do you accept for printing?" },
];

export default function AiChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([starterMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let restored: ChatMessage[] | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          restored = parsed
            .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
            .map((item) => ({ role: item.role, content: item.content }))
            .slice(-12);
        }
      }
    } catch {
      restored = null;
    }
    if (restored?.length) {
      setMessages(restored);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      return;
    }
  }, [messages, isHydrated]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, isOpen]);

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Request failed.");
      }
      const reply = typeof data?.message === "string" ? data.message : "Sorry, I did not get that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I cannot reach the AI right now. Please use WhatsApp or the contact form for a quick response.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setMessages([starterMessage]);
    setInput("");
  }

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <>
      <div
        id="ai-chat-panel"
        role="dialog"
        aria-label="MO T-SHIRT AI chat"
        aria-hidden={!isOpen}
        className={`fixed bottom-24 right-6 z-50 w-[92vw] max-w-md transition-all duration-200 sm:bottom-28 sm:right-8 ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-2xl">
          <header className="relative overflow-hidden bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#FFC36C] px-5 py-5 text-white">
            <div className="pointer-events-none absolute -top-16 right-6 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 left-4 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/80">MO T-SHIRT AI</p>
                <h3 className="text-xl font-semibold">Instant answers, real quotes</h3>
                <p className="mt-1 text-sm text-white/90">
                  Tell us quantity, garment, sizes, and deadline.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 1 && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/30"
                  >
                    New
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/30"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/90">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-lime-300" />
                Online now
              </span>
              <a
                href={getWhatsAppUrl("Hi! I need help with a t-shirt order.")}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/15 px-2.5 py-1 transition hover:bg-white/25"
              >
                WhatsApp
              </a>
              <a
                href={`tel:${CONTACT_TEL}`}
                className="rounded-full bg-white/15 px-2.5 py-1 transition hover:bg-white/25"
              >
                Call {CONTACT_PHONE_DISPLAY}
              </a>
            </div>
          </header>

          <div ref={listRef} role="log" aria-live="polite" className="max-h-[50vh] space-y-4 overflow-y-auto bg-[#FFFDF9] px-4 py-4">
            {messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    msg.role === "user"
                      ? "bg-black text-white"
                      : "border border-neutral-200 bg-white text-neutral-800"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-500 shadow-sm">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:120ms]" />
                    <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-200 bg-white px-4 py-4">
            {showSuggestions && (
              <div className="mb-3 flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => sendMessage(prompt.message)}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:border-black hover:text-black"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex items-end gap-2"
            >
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask about pricing, delivery, or artwork..."
                  className="w-full resize-none rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
            <p className="mt-3 text-[11px] text-neutral-500">
              AI assistant. For urgent orders, use WhatsApp for the fastest reply.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="ai-chat-panel"
        aria-label={isOpen ? "Close AI chat" : "Open AI chat"}
        className="group fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-black px-4 py-3 text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-neutral-900 sm:bottom-8 sm:right-8"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#FFC36C] text-sm font-semibold">
          AI
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-lime-400 shadow-[0_0_12px_rgba(132,204,22,0.8)]" />
        </span>
        <span className="hidden text-sm font-semibold sm:inline">{isOpen ? "Close chat" : "Ask Mo"}</span>
      </button>
    </>
  );
}
