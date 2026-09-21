"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Landmark,
  Lightbulb,
  ListChecks,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { db } from "@/lib/firebase";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import X5FreedomPlanPanel from "@/components/admin/X5FreedomPlan";
import {
  calculateX5ExecutionProgress,
  createX5ExecutionSteps,
  normalizeX5ExecutionStatus,
  normalizeX5ExecutionSteps,
  X5_EXECUTION_STATUSES,
  type X5ExecutionStatus,
  type X5ExecutionStep,
} from "@/lib/x5-execution";

type ExecutionProject = {
  id: string;
  title: string;
  idea: string;
  outcome: string;
  steps: X5ExecutionStep[];
  status: X5ExecutionStatus;
  notes: string;
  results: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type ProjectEditor = Pick<
  ExecutionProject,
  "title" | "idea" | "outcome" | "notes" | "results"
>;

const PROJECTS_COLLECTION = ["users", "mo-owner", "x5ExecutionProjects"] as const;

const EMPTY_EDITOR: ProjectEditor = {
  title: "",
  idea: "",
  outcome: "",
  notes: "",
  results: "",
};

const STATUS_STYLES: Record<X5ExecutionStatus, string> = {
  ACTIVE: "border-sky-200 bg-sky-50 text-sky-700",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BLOCKED: "border-amber-200 bg-amber-50 text-amber-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_ICONS: Record<X5ExecutionStatus, typeof Circle> = {
  ACTIVE: Clock3,
  DONE: CheckCircle2,
  BLOCKED: AlertTriangle,
  FAILED: XCircle,
};

function toProject(id: string, value: Record<string, unknown>): ExecutionProject {
  return {
    id,
    title: typeof value.title === "string" ? value.title : "Untitled idea",
    idea: typeof value.idea === "string" ? value.idea : "",
    outcome: typeof value.outcome === "string" ? value.outcome : "",
    steps: normalizeX5ExecutionSteps(value.steps),
    status: normalizeX5ExecutionStatus(value.status),
    notes: typeof value.notes === "string" ? value.notes : "",
    results: typeof value.results === "string" ? value.results : "",
    createdAt: value.createdAt instanceof Timestamp ? value.createdAt : undefined,
    updatedAt: value.updatedAt instanceof Timestamp ? value.updatedAt : undefined,
  };
}

function projectEditor(project: ExecutionProject): ProjectEditor {
  return {
    title: project.title,
    idea: project.idea,
    outcome: project.outcome,
    notes: project.notes,
    results: project.results,
  };
}

function formatUpdatedAt(timestamp?: Timestamp) {
  if (!timestamp) return "Saving…";
  return timestamp.toDate().toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: X5ExecutionStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${STATUS_STYLES[status]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

export default function X5ExecutionPage() {
  const [activeWorkspace, setActiveWorkspace] = useState<"execution" | "freedom">("execution");
  const [projects, setProjects] = useState<ExecutionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<X5ExecutionStatus | "ALL">("ALL");
  const [newIdea, setNewIdea] = useState("");
  const [newOutcome, setNewOutcome] = useState("");
  const [creating, setCreating] = useState(false);
  const [editor, setEditor] = useState<ProjectEditor>(EMPTY_EDITOR);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const loadedEditorProjectId = useRef<string | null>(null);

  useEffect(() => {
    const projectQuery = query(
      collection(db, ...PROJECTS_COLLECTION),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      projectQuery,
      (snapshot) => {
        const nextProjects = snapshot.docs.map((projectDoc) =>
          toProject(projectDoc.id, projectDoc.data())
        );
        setProjects(nextProjects);
        setSelectedId((current) =>
          current && nextProjects.some((project) => project.id === current)
            ? current
            : nextProjects[0]?.id || null
        );
        setLoadError("");
        setLoading(false);
      },
      (error) => {
        console.error("Could not load X5 execution projects", error);
        setLoadError("Projects could not be loaded. Check the database connection and try again.");
        setLoading(false);
      }
    );
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId]
  );

  useEffect(() => {
    if (!selectedProject) {
      loadedEditorProjectId.current = null;
      setEditor(EMPTY_EDITOR);
      setDirty(false);
      return;
    }
    if (loadedEditorProjectId.current === selectedProject.id) return;
    loadedEditorProjectId.current = selectedProject.id;
    setEditor(projectEditor(selectedProject));
    setDirty(false);
    setActionError("");
  }, [selectedProject]);

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter !== "ALL" && project.status !== statusFilter) return false;
      if (!needle) return true;
      return `${project.title} ${project.idea} ${project.outcome}`
        .toLowerCase()
        .includes(needle);
    });
  }, [projects, search, statusFilter]);

  const summary = useMemo(() => {
    const done = projects.filter((project) => project.status === "DONE").length;
    const needsAttention = projects.filter((project) =>
      ["BLOCKED", "FAILED"].includes(project.status)
    ).length;
    const averageProgress = projects.length
      ? Math.round(
          projects.reduce(
            (total, project) => total + calculateX5ExecutionProgress(project.steps),
            0
          ) / projects.length
        )
      : 0;
    return { done, needsAttention, averageProgress };
  }, [projects]);

  async function createProject() {
    const idea = newIdea.trim();
    if (!idea || creating) return;
    if (dirty && selectedProject) {
      const saved = await saveProject();
      if (!saved) return;
    }
    setCreating(true);
    setActionError("");
    try {
      const title = idea.length > 72 ? `${idea.slice(0, 69).trim()}…` : idea;
      const reference = await addDoc(collection(db, ...PROJECTS_COLLECTION), {
        title,
        idea,
        outcome: newOutcome.trim(),
        steps: createX5ExecutionSteps(),
        status: "ACTIVE",
        notes: "",
        results: "",
        workflowVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedId(reference.id);
      setNewIdea("");
      setNewOutcome("");
    } catch (error) {
      console.error("Could not create X5 execution project", error);
      setActionError("The project could not be created. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStep(stepId: string) {
    if (!selectedProject) return;
    const steps = selectedProject.steps.map((step) =>
      step.id === stepId ? { ...step, completed: !step.completed } : step
    );
    setActionError("");
    try {
      await updateDoc(doc(db, ...PROJECTS_COLLECTION, selectedProject.id), {
        steps,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Could not update X5 workflow step", error);
      setActionError("That checklist update did not save. Please try again.");
    }
  }

  async function setStatus(status: X5ExecutionStatus) {
    if (!selectedProject || selectedProject.status === status) return;
    setActionError("");
    try {
      await updateDoc(doc(db, ...PROJECTS_COLLECTION, selectedProject.id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Could not update X5 execution status", error);
      setActionError("The status did not save. Please try again.");
    }
  }

  async function saveProject() {
    if (!selectedProject || saving) return false;
    const title = editor.title.trim();
    const idea = editor.idea.trim();
    if (!title || !idea) {
      setActionError("Project name and idea are required.");
      return false;
    }
    setSaving(true);
    setActionError("");
    try {
      await updateDoc(doc(db, ...PROJECTS_COLLECTION, selectedProject.id), {
        title,
        idea,
        outcome: editor.outcome.trim(),
        notes: editor.notes.trim(),
        results: editor.results.trim(),
        updatedAt: serverTimestamp(),
      });
      setDirty(false);
      return true;
    } catch (error) {
      console.error("Could not save X5 execution project", error);
      setActionError("Changes could not be saved. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function selectProject(projectId: string) {
    if (projectId === selectedId) return;
    if (dirty) {
      const saved = await saveProject();
      if (!saved) return;
    }
    setSelectedId(projectId);
  }

  async function openWorkspace(workspace: "execution" | "freedom") {
    if (workspace === activeWorkspace) return;
    if (activeWorkspace === "execution" && dirty) {
      const saved = await saveProject();
      if (!saved) return;
    }
    setActiveWorkspace(workspace);
  }

  async function removeProject() {
    if (!selectedProject) return;
    if (!window.confirm(`Delete “${selectedProject.title}”? This cannot be undone.`)) return;
    setActionError("");
    try {
      await deleteDoc(doc(db, ...PROJECTS_COLLECTION, selectedProject.id));
    } catch (error) {
      console.error("Could not delete X5 execution project", error);
      setActionError("The project could not be deleted. Please try again.");
    }
  }

  function updateEditor<K extends keyof ProjectEditor>(key: K, value: ProjectEditor[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const progress = selectedProject
    ? calculateX5ExecutionProgress(selectedProject.steps)
    : 0;

  return (
    <main className="min-h-screen bg-slate-50/50 text-slate-950">
      <UnsavedChangesGuard
        active={dirty}
        isSaving={saving}
        onSave={saveProject}
        title="Save this execution project?"
        message="Your idea, outcome, notes, or results changed. Save them before leaving X5 Execution."
      />
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f0442a]">
              <Sparkles className="h-4 w-4" /> Idea to verified result
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">
              X5 Execution
            </h1>
            <p data-admin-description className="mt-1 text-sm text-slate-500">
              Turn every idea into one clear execution project with only the actions Ryan needs to handle.
            </p>
          </div>
          {activeWorkspace === "execution" ? <div className="grid grid-cols-3 gap-2 sm:min-w-[390px]">
            {[
              { label: "Projects", value: projects.length },
              { label: "Done", value: summary.done },
              { label: "Avg. progress", value: `${summary.averageProgress}%` },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="text-lg font-bold tracking-tight text-slate-900">{item.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {item.label}
                </div>
              </div>
            ))}
          </div> : null}
        </header>

        <nav aria-label="X5 Execution workspaces" className="inline-flex w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => void openWorkspace("execution")}
            aria-current={activeWorkspace === "execution" ? "page" : undefined}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition sm:flex-none ${
              activeWorkspace === "execution"
                ? "bg-[#141921] text-white"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <ListChecks className="h-4 w-4" /> Execution Projects
          </button>
          <button
            type="button"
            onClick={() => void openWorkspace("freedom")}
            aria-current={activeWorkspace === "freedom" ? "page" : undefined}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition sm:flex-none ${
              activeWorkspace === "freedom"
                ? "bg-[#141921] text-white"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Landmark className="h-4 w-4" /> Freedom Plan
          </button>
        </nav>

        <div className={activeWorkspace === "execution" ? "space-y-5" : "hidden"}>
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">
            Capture a new idea
            <input
              value={newIdea}
              onChange={(event) => setNewIdea(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) void createProject();
              }}
              placeholder="What should we execute?"
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">
            Desired outcome <span className="font-normal text-slate-400">(optional)</span>
            <input
              value={newOutcome}
              onChange={(event) => setNewOutcome(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) void createProject();
              }}
              placeholder="What does success look like?"
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
            />
          </label>
          <button
            type="button"
            onClick={() => void createProject()}
            disabled={!newIdea.trim() || creating}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#141921] px-5 text-sm font-bold text-white transition hover:bg-[#252c36] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="h-4 w-4" /> {creating ? "Creating…" : "Create project"}
          </button>
        </section>

        {summary.needsAttention > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> {summary.needsAttention} project{summary.needsAttention === 1 ? "" : "s"} need attention.
          </div>
        ) : null}

        {loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {loadError}
          </div>
        ) : null}

        <section className="grid min-h-[680px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search projects"
                  aria-label="Search execution projects"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
                />
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                {(["ALL", ...X5_EXECUTION_STATUSES] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold tracking-[0.06em] transition ${
                      statusFilter === status
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {loading ? (
                <div className="p-8 text-center text-xs font-semibold text-slate-400">Loading projects…</div>
              ) : filteredProjects.length ? (
                filteredProjects.map((project) => {
                  const projectProgress = calculateX5ExecutionProgress(project.steps);
                  const active = project.id === selectedId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void selectProject(project.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/10" : "bg-orange-50 text-[#f0442a]"}`}>
                          <Lightbulb className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{project.title}</span>
                          <span className={`mt-1 block truncate text-[11px] ${active ? "text-white/55" : "text-slate-400"}`}>
                            {project.outcome || "Outcome not defined yet"}
                          </span>
                        </span>
                        <ArrowRight className={`mt-2 h-3.5 w-3.5 shrink-0 ${active ? "text-white/45" : "text-slate-300"}`} />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${active ? "bg-white/10" : "bg-slate-100"}`}>
                          <span className={`block h-full rounded-full ${active ? "bg-[#f0442a]" : "bg-slate-900"}`} style={{ width: `${projectProgress}%` }} />
                        </span>
                        <span className={`text-[10px] font-bold ${active ? "text-white/65" : "text-slate-500"}`}>{projectProgress}%</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center">
                  <ListChecks className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    {projects.length ? "No projects match this filter." : "Capture your first idea above."}
                  </p>
                </div>
              )}
            </div>
          </aside>

          {selectedProject ? (
            <article className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selectedProject.status} />
                    <span className="text-[11px] text-slate-400">Updated {formatUpdatedAt(selectedProject.updatedAt)}</span>
                  </div>
                  <input
                    value={editor.title}
                    onChange={(event) => updateEditor("title", event.target.value)}
                    aria-label="Project name"
                    className="mt-3 w-full border-0 bg-transparent p-0 text-xl font-bold tracking-[-0.03em] text-slate-950 outline-none placeholder:text-slate-300 sm:text-2xl"
                    placeholder="Project name"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void removeProject()}
                  className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Idea
                  <textarea
                    value={editor.idea}
                    onChange={(event) => updateEditor("idea", event.target.value)}
                    className="min-h-24 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    placeholder="Describe the idea clearly."
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Defined outcome
                  <textarea
                    value={editor.outcome}
                    onChange={(event) => updateEditor("outcome", event.target.value)}
                    className="min-h-24 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    placeholder="Write the measurable verified result."
                  />
                </label>
              </div>

              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Execution workflow</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Every tick saves directly to the database.</p>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#f0442a] transition-[width] duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
                <ol className="grid gap-2 lg:grid-cols-2">
                  {selectedProject.steps.map((step, index) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={step.completed}
                        onClick={() => void toggleStep(step.id)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          step.completed
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${step.completed ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                          <Check className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Step {index + 1}</span>
                          <span className={`block text-sm font-semibold ${step.completed ? "text-emerald-800" : "text-slate-700"}`}>{step.label}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Final status</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Keep ACTIVE while work is still moving.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {X5_EXECUTION_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void setStatus(status)}
                        aria-pressed={selectedProject.status === status}
                        className={`rounded-lg border px-3 py-2 text-[10px] font-bold tracking-[0.08em] transition ${
                          selectedProject.status === status
                            ? STATUS_STYLES[status]
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Notes / actions requiring Ryan
                  <textarea
                    value={editor.notes}
                    onChange={(event) => updateEditor("notes", event.target.value)}
                    className="min-h-36 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    placeholder="Only list decisions or actions Ryan must complete."
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Results / learnings
                  <textarea
                    value={editor.results}
                    onChange={(event) => updateEditor("results", event.target.value)}
                    className="min-h-36 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    placeholder="Record the verified result and what to reuse next time."
                  />
                </label>
              </section>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div aria-live="polite" className={`text-xs font-semibold ${actionError ? "text-rose-600" : "text-slate-400"}`}>
                  {actionError || (dirty ? "You have unsaved text changes." : "All text changes are saved.")}
                </div>
                <button
                  type="button"
                  onClick={() => void saveProject()}
                  disabled={!dirty || saving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#141921] px-5 text-sm font-bold text-white transition hover:bg-[#252c36] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </article>
          ) : (
            <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div>
                <Lightbulb className="mx-auto h-9 w-9 text-slate-300" />
                <h2 className="mt-3 text-base font-bold text-slate-700">No execution project selected</h2>
                <p className="mt-1 text-sm text-slate-400">Capture an idea above to start the ten-step workflow.</p>
              </div>
            </div>
          )}
        </section>
        </div>

        <div className={activeWorkspace === "freedom" ? "block" : "hidden"}>
          <X5FreedomPlanPanel />
        </div>
      </div>
    </main>
  );
}
