import { NextResponse } from "next/server";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, WHATSAPP_PHONE } from "@/data/work";

const SYSTEM_PROMPT = [
  "You are the MO T-SHIRT AI assistant for a Mauritius custom printing shop.",
  "Be concise, friendly, and action-oriented. Use short paragraphs or bullets.",
  "If a user asks for pricing, ask for quantity, garment type, sizes, colors, print method, deadline, and delivery preference.",
  "Business info: pickup in Surinam, Mauritius; delivery via Mauritius Post; hours Mon-Fri 9:00-17:00.",
  `Contact: phone ${CONTACT_PHONE_DISPLAY} (${CONTACT_TEL}); WhatsApp https://wa.me/${WHATSAPP_PHONE}; email ${CONTACT_EMAIL}.`,
  "For urgent jobs, suggest WhatsApp for the fastest response.",
  "Artwork: AI, EPS, or PDF preferred; high-resolution PNG or JPG also works.",
  "Do not claim an order is placed. Offer the quote form at https://www.mo-tshirt.mu#contact or the contact page.",
].join("\n");

type IncomingMessage = {
  role?: string;
  content?: string;
};

function sanitizeMessages(messages: IncomingMessage[]) {
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content || "").slice(0, 2000),
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-12);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const payload = await req.json();
    const incoming = Array.isArray(payload?.messages) ? payload.messages : [];
    const messages = sanitizeMessages(incoming);

    if (!messages.length) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 300,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: "AI request failed.", detail: text }, { status: 500 });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 500 });
    }

    return NextResponse.json({ message: reply.trim() }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
