"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  MapPin,
  MessageSquare,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

type BusinessDetail = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  category?: string;
};

const STORAGE_KEY = "admin-business-details-v1";

const CATEGORY_OPTIONS = [
  { value: "Identity", label: "Identity", Icon: Building2, tone: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "Address", label: "Address", Icon: MapPin, tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "Banking", label: "Banking", Icon: CreditCard, tone: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "Message", label: "Message", Icon: MessageSquare, tone: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "Other", label: "Other", Icon: ClipboardList, tone: "bg-slate-100 text-slate-700 border-slate-200" },
] as const;

const categoryMap = new Map(CATEGORY_OPTIONS.map((c) => [c.value, c]));

const TEMPLATES = [
  { title: "BRN", content: "BRN: ", category: "Identity" },
  { title: "Business Address", content: "Address: ", category: "Address" },
  { title: "Account Number", content: "Account No: ", category: "Banking" },
  {
    title: "Client Message",
    content:
      "Hi! Thanks for reaching out to MO T-Shirt. Share your logo, quantity, and sizes, and we will quote you today.",
    category: "Message",
  },
];

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatDate = (value?: number) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function BusinessDetailsPage() {
  const [details, setDetails] = useState<BusinessDetail[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [draft, setDraft] = useState({ title: "", content: "", category: "Message" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const sanitized = parsed
        .filter((item) => item && typeof item.id === "string" && typeof item.content === "string")
        .map((item) => ({
          id: item.id,
          title: typeof item.title === "string" ? item.title : "",
          content: item.content,
          updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
          category: typeof item.category === "string" ? item.category : "Other",
        }));
      setDetails(sanitized);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
    } catch {}
  }, [details]);

  const stats = useMemo(() => {
    const total = details.length;
    const messageCount = details.filter((d) => d.category === "Message").length;
    const lastUpdated = details.reduce((latest, d) => Math.max(latest, d.updatedAt || 0), 0);
    return { total, messageCount, lastUpdated };
  }, [details]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return details
      .filter((detail) => {
        if (categoryFilter !== "All" && detail.category !== categoryFilter) return false;
        if (!q) return true;
        const blob = `${detail.title} ${detail.content}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [details, search, categoryFilter]);

  const resetDraft = () => {
    setDraft({ title: "", content: "", category: "Message" });
    setEditingId(null);
  };

  const saveDetail = () => {
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!content) return;
    const now = Date.now();
    if (editingId) {
      setDetails((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, title, content, category: draft.category || "Other", updatedAt: now }
            : item
        )
      );
    } else {
      setDetails((prev) => [
        {
          id: createId(),
          title,
          content,
          category: draft.category || "Other",
          updatedAt: now,
        },
        ...prev,
      ]);
    }
    resetDraft();
  };

  const editDetail = (detail: BusinessDetail) => {
    setEditingId(detail.id);
    setDraft({
      title: detail.title || "",
      content: detail.content || "",
      category: detail.category || "Other",
    });
  };

  const deleteDetail = (id: string) => {
    if (!confirm("Delete this detail?")) return;
    setDetails((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) resetDraft();
  };

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setEditingId(null);
    setDraft({
      title: template.title,
      content: template.content,
      category: template.category,
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    }
  };

  const copyDetail = async (detail: BusinessDetail) => {
    const text = detail.title ? `${detail.title}: ${detail.content}` : detail.content;
    await copyText(text);
    setCopiedId(detail.id);
    window.setTimeout(() => setCopiedId((prev) => (prev === detail.id ? null : prev)), 1400);
  };

  const copyAll = async () => {
    if (!details.length) return;
    const text = details
      .map((detail) => (detail.title ? `${detail.title}: ${detail.content}` : detail.content))
      .join("\n");
    await copyText(text);
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1400);
  };

  const panelClass = "rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur";

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] text-[#1a1a1a]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-8rem] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.25),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_70%)] blur-3xl"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 py-10">
        <header className={`${panelClass} relative overflow-hidden p-8`} style={{ animation: "fadeUp 0.5s ease-out both" }}>
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-100/70 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                Business Details
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-900">Copy-ready messages and company info</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Store BRN, address, banking info, and daily client templates. One click to copy for WhatsApp or email.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={copyAll}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  <Copy className="h-4 w-4" /> Copy all
                </button>
                {copiedAll ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Copied
                  </span>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total details</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</div>
                <div className="text-xs text-slate-500">Stored templates</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Messages</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.messageCount}</div>
                <div className="text-xs text-slate-500">Client-ready lines</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Last updated</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{formatDate(stats.lastUpdated)}</div>
                <div className="text-xs text-slate-500">Keep everything fresh</div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.55fr_1fr]">
          <div className={`${panelClass} p-6`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">New detail</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">Add or update</div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-500">
                {editingId ? "Editing" : "Draft"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.title}
                  onClick={() => applyTemplate(template)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {template.title}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 text-xs font-semibold text-slate-600">
              <label className="grid gap-1">
                Title
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. BRN, Bank Account, Delivery note"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="grid gap-1">
                Category
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                Message / Details
                <textarea
                  rows={4}
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  placeholder="Type your business info or client message..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={saveDetail}
                disabled={!draft.content.trim()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-slate-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Plus className="h-4 w-4" />
                {editingId ? "Save changes" : "Add detail"}
              </button>
              {editingId ? (
                <button
                  onClick={resetDraft}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Saved details</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">Ready to copy</div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search details..."
                  className="w-40 bg-transparent text-xs outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["All", ...CATEGORY_OPTIONS.map((c) => c.value)].map((option) => {
                const active = categoryFilter === option;
                return (
                  <button
                    key={option}
                    onClick={() => setCategoryFilter(option)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No details yet. Add your first template to start.
                </div>
              ) : (
                filtered.map((detail) => {
                  const category = categoryMap.get(detail.category || "Other") || categoryMap.get("Other")!;
                  const CategoryIcon = category.Icon;
                  return (
                    <div key={detail.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${category.tone}`}>
                              <CategoryIcon className="h-3.5 w-3.5" />
                              {category.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{formatDate(detail.updatedAt)}</span>
                          </div>
                          <div className="mt-2 text-base font-semibold text-slate-900">
                            {detail.title || "Untitled detail"}
                          </div>
                          <div className="mt-2 whitespace-pre-line text-sm text-slate-600">
                            {detail.content}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => copyDetail(detail)}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </button>
                          <button
                            onClick={() => editDetail(detail)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => deleteDetail(detail.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                      {copiedId === detail.id ? (
                        <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                          Copied
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
