import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiCandidate = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
};

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function getModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function getEndpoint() {
  return `${GEMINI_ENDPOINT}/${encodeURIComponent(getModel())}:generateContent`;
}

function extractText(data: GeminiResponse) {
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n")
      .trim() || ""
  );
}

export async function GET() {
  const configured = Boolean(getApiKey());

  return NextResponse.json({
    ok: configured,
    configured,
    model: getModel(),
    endpoint: getEndpoint(),
    provider: "Google Gemini",
    error: configured ? null : "Missing GEMINI_API_KEY or GOOGLE_API_KEY in Vercel.",
  });
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const apiKey = getApiKey();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY or GOOGLE_API_KEY in Vercel." },
      { status: 500 }
    );
  }

  if (!prompt) {
    return NextResponse.json({ error: "Enter a message for Gemini." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const url = new URL(getEndpoint());
    url.searchParams.set("key", apiKey);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are Gemini inside the CBE client portal. Give concise, practical help for project management, website tasks, notes, deadlines, and planning.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 900,
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Gemini did not respond." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: extractText(data) || "Gemini returned an empty response.",
      model: getModel(),
      provider: "Google Gemini",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Gemini took too long to respond."
            : "Could not reach Gemini.",
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
