"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import {
  BookOpen,
  Compass,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  TrendingUp,
  Video,
} from "lucide-react";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";

type Note = {
  id: string;
  title: string;
  body: string;
  category: string;
  source?: string;
  tags?: string[];
  pinned?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const CATEGORY_OPTIONS = [
  { value: "Idea", label: "Idea", Icon: Sparkles, tone: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "Principle", label: "Principle", Icon: BookOpen, tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "Improvement", label: "Improvement", Icon: TrendingUp, tone: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "Discovery", label: "Discovery", Icon: Compass, tone: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "Video", label: "Video", Icon: Video, tone: "bg-slate-100 text-slate-700 border-slate-200" },
] as const;

type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

const categoryMap = new Map<string, CategoryOption>(CATEGORY_OPTIONS.map((c) => [c.value, c]));

const prompts = [
  "What was the biggest insight today?",
  "What system would remove friction this week?",
  "Which customer request repeats the most?",
  "What would 2x speed look like?",
  "What did the video teach that we can test?",
];

const parseTags = (input: string) =>
  input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const formatDate = (ts?: Timestamp) => {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export default function BusinessNotesPage() {
  const adminId = "mo-owner";
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sortDir, setSortDir] = useState<"new" | "old">("new");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [draft, setDraft] = useState({
    title: "",
    body: "",
    category: "Idea",
    source: "",
    tags: "",
    pinned: false,
  });
  const [editing, setEditing] = useState<Note | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    body: "",
    category: "Idea",
    source: "",
    tags: "",
    pinned: false,
  });

  useEffect(() => {
    const qy = query(collection(db, "users", adminId, "businessNotes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Note[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Note, "id">),
      }));
      setNotes(list);
      setLoading(false);
    });
    return () => unsub();
  }, [adminId]);

  const stats = useMemo(() => {
    const total = notes.length;
    const pinned = notes.filter((n) => n.pinned).length;
    const week = notes.filter((n) => {
      const dt = n.createdAt?.toDate ? n.createdAt.toDate() : null;
      if (!dt) return false;
      return Date.now() - dt.getTime() <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const video = notes.filter((n) => n.category === "Video").length;
    return { total, pinned, week, video };
  }, [notes]);

  const topTags = useMemo(() => {
    const map = new Map<string, number>();
    notes.forEach((n) => (n.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = notes.filter((n) => {
      if (pinnedOnly && !n.pinned) return false;
      if (categoryFilter !== "All" && n.category !== categoryFilter) return false;
      if (!q) return true;
      const blob = `${n.title} ${n.body} ${(n.tags || []).join(" ")} ${(n.source || "")}`.toLowerCase();
      return blob.includes(q);
    });
    const toMs = (ts?: Timestamp) => (ts?.toDate ? ts.toDate().getTime() : 0);
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return sortDir === "new" ? toMs(b.createdAt) - toMs(a.createdAt) : toMs(a.createdAt) - toMs(b.createdAt);
    });
  }, [notes, search, categoryFilter, pinnedOnly, sortDir]);

  const draftHasChanges = useMemo(
    () =>
      Boolean(
        draft.title.trim() ||
          draft.body.trim() ||
          draft.source.trim() ||
          draft.tags.trim() ||
          draft.pinned
      ),
    [draft.body, draft.pinned, draft.source, draft.tags, draft.title]
  );

  const editHasChanges = useMemo(() => Boolean(editing), [editing]);

  const addNote = async () => {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title && !body) return false;
    await addDoc(collection(db, "users", adminId, "businessNotes"), {
      title,
      body,
      category: draft.category,
      source: draft.source.trim(),
      tags: parseTags(draft.tags),
      pinned: draft.pinned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDraft({ title: "", body: "", category: draft.category, source: "", tags: "", pinned: false });
    return true;
  };

  const togglePinned = async (note: Note) => {
    await updateDoc(doc(db, "users", adminId, "businessNotes", note.id), {
      pinned: !note.pinned,
      updatedAt: serverTimestamp(),
    });
  };

  const startEdit = (note: Note) => {
    setEditing(note);
    setEditDraft({
      title: note.title || "",
      body: note.body || "",
      category: note.category || "Idea",
      source: note.source || "",
      tags: (note.tags || []).join(", "),
      pinned: !!note.pinned,
    });
  };

  const saveEdit = async () => {
    if (!editing) return true;
    await updateDoc(doc(db, "users", adminId, "businessNotes", editing.id), {
      title: editDraft.title.trim(),
      body: editDraft.body.trim(),
      category: editDraft.category,
      source: editDraft.source.trim(),
      tags: parseTags(editDraft.tags),
      pinned: editDraft.pinned,
      updatedAt: serverTimestamp(),
    });
    setEditing(null);
    return true;
  };

  const savePendingChanges = async () => {
    if (editing) return saveEdit();
    if (draftHasChanges) return addNote();
    return true;
  };

  const removeNote = async (note: Note) => {
    if (!confirm("Delete this note?")) return;
    await deleteDoc(doc(db, "users", adminId, "businessNotes", note.id));
  };

  const panelClass = "rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur";

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] text-[#1a1a1a]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.24),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-64 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_70%)] blur-3xl"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 py-10">
        <header className={`${panelClass} relative overflow-hidden p-8`} style={{ animation: "fadeUp 0.5s ease-out both" }}>
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_60%)]"
          />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Business Notes</p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
                Capture ideas, principles, and breakthroughs.
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Your private vault for insights from clients, production, and business videos. Everything stays organized,
                searchable, and ready to act on.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => composerRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" /> New note
                </button>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                  <PenLine className="h-4 w-4 text-slate-500" /> Build your playbook
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Weekly focus</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">Document every winning process.</div>
                <div className="mt-2 text-xs text-slate-500">Aim for 5 insights this week.</div>
              </div>
              <div className="rounded-3xl border border-slate-200/70 bg-slate-900 p-5 text-white shadow-sm">
                <div className="text-xs uppercase tracking-[0.22em] text-white/60">Capture prompt</div>
                <div className="mt-2 text-sm">{prompts[0]}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ animation: "fadeUp 0.5s ease-out both", animationDelay: "0.08s" }}>
          {[
            { label: "Total notes", value: stats.total, tone: "bg-sky-50 text-sky-700 border-sky-100" },
            { label: "Pinned ideas", value: stats.pinned, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
            { label: "This week", value: stats.week, tone: "bg-amber-50 text-amber-700 border-amber-100" },
            { label: "Video insights", value: stats.video, tone: "bg-slate-50 text-slate-700 border-slate-100" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border ${item.tone} px-4 py-4 shadow-sm`}>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]" style={{ animation: "fadeUp 0.5s ease-out both", animationDelay: "0.16s" }}>
          <div className="flex flex-col gap-6">
            <div ref={composerRef} className={`${panelClass} p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">New note</h2>
                  <p className="text-xs text-slate-500">Capture the insight while it is fresh.</p>
                </div>
                <button
                  onClick={addNote}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" /> Save note
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Title
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="e.g., Corporate uniform upsell bundle"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Category
                    <select
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Notes
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    placeholder="Write the idea, principle, or workflow..."
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Tags (comma separated)
                    <input
                      value={draft.tags}
                      onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                      placeholder="sales, pricing, workflow"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Source (video, client, etc.)
                    <input
                      value={draft.source}
                      onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                      placeholder="YouTube / Client / Meeting"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.pinned}
                    onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  Pin this note
                </label>
              </div>
            </div>

            <div className={`${panelClass} p-6`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Notes library</h2>
                  <p className="text-xs text-slate-500">Search, filter, and refine your playbook.</p>
                </div>
                <div className="text-xs text-slate-500">{filtered.length} notes</div>
              </div>

              {loading ? (
                <div className="mt-6 text-sm text-slate-500">Loading notes...</div>
              ) : filtered.length === 0 ? (
                <div className="mt-6 text-sm text-slate-500">No notes yet. Capture your first insight above.</div>
              ) : (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {filtered.map((note) => {
                    const cat = categoryMap.get(note.category) || CATEGORY_OPTIONS[0];
                    const Icon = cat.Icon;
                    const isExpanded = expanded.has(note.id);
                    const body = note.body || "";
                    const showTrim = body.length > 180 && !isExpanded;
                    return (
                      <div
                        key={note.id}
                        className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                          note.pinned ? "ring-1 ring-amber-200" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${cat.tone}`}>
                            <Icon className="h-3.5 w-3.5" /> {cat.label}
                          </span>
                          <button
                            onClick={() => togglePinned(note)}
                            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                            aria-label="Pin note"
                          >
                            {note.pinned ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="mt-3 text-sm font-semibold text-slate-900">{note.title || "Untitled note"}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {showTrim ? `${body.slice(0, 180)}...` : body || "No details yet."}
                        </div>
                        {body.length > 180 && (
                          <button
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(note.id)) next.delete(note.id);
                                else next.add(note.id);
                                return next;
                              })
                            }
                            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          {(note.tags || []).map((t) => (
                            <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                              #{t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          Source: <span className="font-medium text-slate-700">{note.source || "—"}</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          <span>Created {formatDate(note.createdAt)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(note)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                            >
                              <PenLine className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => removeNote(note)}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:border-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className={`${panelClass} p-6`}>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Filters</div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Search
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus-within:ring-2 focus-within:ring-sky-200">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search title, tags, source..."
                      className="w-full bg-transparent text-sm text-slate-700 focus:outline-none"
                    />
                  </div>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Category
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="All">All categories</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Sort
                  <select
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as "new" | "old")}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="new">Newest first</option>
                    <option value="old">Oldest first</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={pinnedOnly}
                    onChange={(e) => setPinnedOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  Pinned only
                </label>
              </div>
            </div>

            <div className={`${panelClass} p-6`}>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Top tags</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {topTags.length === 0 ? (
                  <span className="text-xs text-slate-500">No tags yet.</span>
                ) : (
                  topTags.map(([tag, count]) => (
                    <button
                      key={tag}
                      onClick={() => setSearch(tag)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    >
                      #{tag} · {count}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Capture prompts</div>
              <div className="mt-4 space-y-2 text-sm text-white/75">
                {prompts.map((p) => (
                  <div key={p} className="rounded-2xl bg-white/5 px-3 py-2">
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {editing && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Edit note</h3>
                <button onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Close
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Title
                    <input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Category
                    <select
                      value={editDraft.category}
                      onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Notes
                  <textarea
                    value={editDraft.body}
                    onChange={(e) => setEditDraft((d) => ({ ...d, body: e.target.value }))}
                    className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Tags
                    <input
                      value={editDraft.tags}
                      onChange={(e) => setEditDraft((d) => ({ ...d, tags: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Source
                    <input
                      value={editDraft.source}
                      onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={editDraft.pinned}
                    onChange={(e) => setEditDraft((d) => ({ ...d, pinned: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  Pin this note
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <UnsavedChangesGuard
        active={draftHasChanges || editHasChanges}
        onSave={savePendingChanges}
        title="Save business note changes?"
        message="You have an unsaved business note. Save it before opening another admin page, or leave without saving."
        saveLabel={editing ? "Save changes" : "Add note"}
      />
    </main>
  );
}
