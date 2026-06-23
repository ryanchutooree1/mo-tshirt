import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma3:1b";

function getOllamaUrl() {
  return (process.env.GEMMA_OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
}

function getModel() {
  return process.env.GEMMA_MODEL || DEFAULT_MODEL;
}

async function fetchOllama(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    return await fetch(`${getOllamaUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    const res = await fetchOllama("/api/tags", { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        model: getModel(),
        endpoint: getOllamaUrl(),
        error: "Gemma/Ollama is not responding.",
      });
    }

    const data = (await res.json().catch(() => ({}))) as {
      models?: Array<{ name?: string }>;
    };
    const model = getModel();
    const installed = data.models?.some((entry) => entry.name === model) || false;

    return NextResponse.json({
      ok: installed,
      installed,
      model,
      endpoint: getOllamaUrl(),
      models: data.models?.map((entry) => entry.name).filter(Boolean) || [],
      error: installed ? null : `Model ${model} is not installed in Ollama yet.`,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      installed: false,
      model: getModel(),
      endpoint: getOllamaUrl(),
      error: "Gemma/Ollama is not reachable. Start the Docker Gemma service first.",
    });
  }
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json({ error: "Enter a message for Gemma." }, { status: 400 });
  }

  try {
    const res = await fetchOllama("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are Gemma inside the CBE portal. Give concise, practical help for project management, website tasks, notes, and planning.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      error?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Gemma did not respond." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: data.message?.content || "",
      model: getModel(),
    });
  } catch {
    return NextResponse.json(
      { error: "Gemma/Ollama is not reachable. Start the Docker Gemma service first." },
      { status: 503 }
    );
  }
}
