"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Menu,
  PanelLeftClose,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type PortalTab = "information" | "projects" | "storage";

type InfoEntry = {
  id: string;
  title: string;
  email: string;
  password: string;
  notes: string;
  createdAt: string;
};

type ProjectEntry = {
  id: string;
  name: string;
  owner: string;
  status: "Planning" | "In progress" | "Waiting" | "Done";
  priority: "Normal" | "Important" | "Urgent";
  dueDate: string;
  notes: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
};

type StorageSnapshot = {
  databaseName: string;
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  tableBytes: {
    information: number;
    projects: number;
  };
};

type PortalPayload = {
  information: InfoEntry[];
  projects: ProjectEntry[];
  storage: StorageSnapshot;
  error?: string;
};

const statusStyles: Record<ProjectEntry["status"], string> = {
  Planning: "border-slate-200 bg-slate-50 text-slate-700",
  "In progress": "border-amber-200 bg-amber-50 text-amber-800",
  Waiting: "border-sky-200 bg-sky-50 text-sky-800",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const priorityStyles: Record<ProjectEntry["priority"], string> = {
  Normal: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Important: "border-amber-200 bg-amber-50 text-amber-800",
  Urgent: "border-rose-200 bg-rose-50 text-rose-800",
};

const EMPTY_INFO_DRAFT = {
  title: "",
  email: "",
  password: "",
  notes: "",
};

const EMPTY_PROJECT_DRAFT = {
  name: "",
  owner: "",
  priority: "Normal" as ProjectEntry["priority"],
  dueDate: "",
  notes: "",
};

export default function CbePortalClient() {
  const [activeTab, setActiveTab] = useState<PortalTab>("information");
  const [showPasswords, setShowPasswords] = useState(false);
  const [information, setInformation] = useState<InfoEntry[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [storage, setStorage] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [infoDraft, setInfoDraft] = useState(EMPTY_INFO_DRAFT);
  const [projectDraft, setProjectDraft] = useState(EMPTY_PROJECT_DRAFT);

  const projectSummary = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((project) => project.status !== "Done" && !project.completedAt).length,
      done: projects.filter((project) => project.status === "Done" || project.completedAt).length,
    };
  }, [projects]);

  async function loadPortalData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cbe-portal", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<PortalPayload>;
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 401
              ? "Sign in to the MO T-SHIRT admin account to use the CBE portal."
              : "Could not load CBE portal data.")
        );
      }
      setInformation(data.information || []);
      setProjects(data.projects || []);
      setStorage(data.storage || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CBE portal data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortalData();
  }, []);

  async function refreshStorage() {
    await loadPortalData();
    setNotice("PostgreSQL storage refreshed.");
  }

  async function addInfoEntry() {
    if (!infoDraft.title.trim() && !infoDraft.email.trim()) return;
    setSavingInfo(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/cbe-portal/information", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infoDraft),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entry?: InfoEntry;
        error?: string;
      };
      if (!res.ok || !data.entry) throw new Error(data.error || "Could not save information.");
      setInformation((current) => [data.entry!, ...current]);
      setInfoDraft(EMPTY_INFO_DRAFT);
      setNotice("Information saved to PostgreSQL.");
      await loadPortalData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save information.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function deleteInfoEntry(id: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/cbe-portal/information/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete information.");
      setInformation((current) => current.filter((item) => item.id !== id));
      setNotice("Information deleted from PostgreSQL.");
      await loadPortalData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete information.");
    }
  }

  async function addProject() {
    if (!projectDraft.name.trim()) return;
    setSavingProject(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/cbe-portal/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectDraft),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: ProjectEntry;
        error?: string;
      };
      if (!res.ok || !data.project) throw new Error(data.error || "Could not save project.");
      setProjects((current) => [data.project!, ...current]);
      setProjectDraft(EMPTY_PROJECT_DRAFT);
      setNotice("Project saved to PostgreSQL.");
      await loadPortalData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save project.");
    } finally {
      setSavingProject(false);
    }
  }

  async function deleteProject(id: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/cbe-portal/projects/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete project.");
      setProjects((current) => current.filter((item) => item.id !== id));
      setNotice("Project deleted from PostgreSQL.");
      await loadPortalData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete project.");
    }
  }

  async function toggleProjectCompletion(id: string, completed: boolean) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/cbe-portal/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: ProjectEntry;
        error?: string;
      };
      if (!res.ok || !data.project) throw new Error(data.error || "Could not update project.");
      setProjects((current) =>
        current.map((project) => (project.id === id ? data.project! : project))
      );
      setNotice(completed ? "Task completed date saved." : "Task reopened.");
      await loadPortalData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update project.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                cbe.mo-tshirt.mu
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                CBE Client Portal
              </h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              <ShieldCheck size={18} />
              PostgreSQL workspace
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Saved info" value={information.length.toString()} icon={<KeyRound size={18} />} />
            <Metric label="Active projects" value={projectSummary.active.toString()} icon={<ClipboardList size={18} />} />
            <Metric label="Completed" value={projectSummary.done.toString()} icon={<CheckCircle2 size={18} />} />
            <Metric label="PostgreSQL" value={storage ? formatStorageBytes(storage.usedBytes) : "--"} icon={<Database size={18} />} />
          </div>
        </div>
      </section>

      <section
        className={`mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8 ${
          menuOpen ? "lg:grid-cols-[260px_minmax(0,1fr)]" : "lg:grid-cols-1"
        }`}
      >
        {menuOpen ? (
          <aside className="rounded-lg border border-slate-200 bg-white p-3 lg:sticky lg:top-4 lg:self-start">
            <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                CBE Menu
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Hide CBE menu"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
            <nav className="grid gap-1">
              <TabButton
                active={activeTab === "information"}
                icon={<KeyRound size={18} />}
                label="Information"
                description="Emails, passwords, notes"
                onClick={() => setActiveTab("information")}
              />
              <TabButton
                active={activeTab === "projects"}
                icon={<LayoutDashboard size={18} />}
                label="Project Management"
                description="Deadlines and task progress"
                onClick={() => setActiveTab("projects")}
              />
              <TabButton
                active={activeTab === "storage"}
                icon={<HardDrive size={18} />}
                label="PostgreSQL Storage"
                description="Capacity progress"
                onClick={() => setActiveTab("storage")}
              />
            </nav>
          </aside>
        ) : null}

        <div className="grid gap-4">
          {!menuOpen ? (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Menu size={18} />
              Show menu
            </button>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              {notice}
            </div>
          ) : null}
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
              Loading CBE PostgreSQL data...
            </div>
          ) : null}

          {activeTab === "information" ? (
            <InformationTab
              draft={infoDraft}
              entries={information}
              saving={savingInfo}
              showPasswords={showPasswords}
              onDraftChange={setInfoDraft}
              onSave={addInfoEntry}
              onDelete={deleteInfoEntry}
              onTogglePasswords={() => setShowPasswords((value) => !value)}
            />
          ) : null}

          {activeTab === "projects" ? (
            <ProjectsTab
              draft={projectDraft}
              projects={projects}
              saving={savingProject}
              summary={projectSummary}
              onDraftChange={setProjectDraft}
              onSave={addProject}
              onDelete={deleteProject}
              onToggleComplete={toggleProjectCompletion}
            />
          ) : null}

          {activeTab === "storage" ? (
            <StorageTab storage={storage} onRefresh={() => void refreshStorage()} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function InformationTab({
  draft,
  entries,
  saving,
  showPasswords,
  onDraftChange,
  onSave,
  onDelete,
  onTogglePasswords,
}: {
  draft: typeof EMPTY_INFO_DRAFT;
  entries: InfoEntry[];
  saving: boolean;
  showPasswords: boolean;
  onDraftChange: (draft: typeof EMPTY_INFO_DRAFT) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onTogglePasswords: () => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Mail className="text-teal-700" size={20} />
          <h2 className="text-lg font-semibold">Insert information</h2>
        </div>
        <div className="mt-4 grid gap-3">
          <Field
            label="Title"
            value={draft.title}
            placeholder="Example: Gmail account"
            onChange={(value) => onDraftChange({ ...draft, title: value })}
          />
          <Field
            label="Email or username"
            value={draft.email}
            placeholder="name@example.com"
            onChange={(value) => onDraftChange({ ...draft, email: value })}
          />
          <Field
            label="Password"
            type="password"
            value={draft.password}
            placeholder="Saved to PostgreSQL"
            onChange={(value) => onDraftChange({ ...draft, password: value })}
          />
          <TextArea
            label="Notes"
            value={draft.notes}
            placeholder="Extra login notes, owner, recovery email, or instructions"
            onChange={(value) => onDraftChange({ ...draft, notes: value })}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus size={18} />
            {saving ? "Saving..." : "Save to PostgreSQL"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Saved information</h2>
            <p className="mt-1 text-sm text-slate-500">
              This data is loaded from PostgreSQL.
            </p>
          </div>
          <button
            type="button"
            onClick={onTogglePasswords}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
            {showPasswords ? "Hide" : "Show"}
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {entries.length === 0 ? (
            <EmptyState icon={<LockKeyhole size={20} />} text="No information saved yet." />
          ) : null}
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{entry.title}</h3>
                  <p className="mt-1 break-all text-sm text-slate-600">{entry.email || "No email added"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-rose-600"
                  aria-label={`Delete ${entry.title}`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700">
                {entry.password
                  ? showPasswords
                    ? entry.password
                    : "************"
                  : "No password added"}
              </p>
              {entry.notes ? <p className="mt-3 text-sm leading-6 text-slate-600">{entry.notes}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectsTab({
  draft,
  projects,
  saving,
  summary,
  onDraftChange,
  onSave,
  onDelete,
  onToggleComplete,
}: {
  draft: typeof EMPTY_PROJECT_DRAFT;
  projects: ProjectEntry[];
  saving: boolean;
  summary: { total: number; active: number; done: number };
  onDraftChange: (draft: typeof EMPTY_PROJECT_DRAFT) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="text-teal-700" size={20} />
          <h2 className="text-lg font-semibold">New task</h2>
        </div>
        <div className="mt-4 grid gap-3">
          <Field
            label="Task name"
            value={draft.name}
            placeholder="Example: Send first website preview"
            onChange={(value) => onDraftChange({ ...draft, name: value })}
          />
          <Field
            label="Owner"
            value={draft.owner}
            placeholder="Responsible person"
            onChange={(value) => onDraftChange({ ...draft, owner: value })}
          />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Task type
            <select
              value={draft.priority}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  priority: event.target.value as ProjectEntry["priority"],
                })
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              <option>Normal</option>
              <option>Important</option>
              <option>Urgent</option>
            </select>
          </label>
          <Field
            label="Deadline date"
            type="date"
            value={draft.dueDate}
            onChange={(value) => onDraftChange({ ...draft, dueDate: value })}
          />
          <TextArea
            label="Notes"
            value={draft.notes}
            placeholder="Next actions, blockers, links, or delivery notes"
            onChange={(value) => onDraftChange({ ...draft, notes: value })}
          />
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
            Started date is saved automatically when the task is created. Ended date is saved when you tick completed.
          </p>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus size={18} />
            {saving ? "Saving..." : "Save task"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Project management</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {summary.done}/{summary.total} done
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {projects.length === 0 ? (
            <EmptyState icon={<ClipboardList size={20} />} text="No tasks saved yet." />
          ) : null}
          {projects.map((project) => (
            <TaskCard
              key={project.id}
              project={project}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskCard({
  project,
  onDelete,
  onToggleComplete,
}: {
  project: ProjectEntry;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
}) {
  const deadline = getDeadlineProgress(project);
  const completed = project.status === "Done" || Boolean(project.completedAt);
  const timelineDays = getTimelineDays(project);

  return (
    <article className={`rounded-lg border p-5 ${completed ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={completed}
            onChange={(event) => onToggleComplete(project.id, event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700"
          />
          <span className="min-w-0">
            <span className={`block font-semibold ${completed ? "text-slate-500 line-through" : "text-slate-950"}`}>
              {project.name}
            </span>
            <span className="mt-1 block text-sm text-slate-600">Owner: {project.owner}</span>
          </span>
        </label>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityStyles[project.priority]}`}>
            {project.priority}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[project.status]}`}>
            {completed ? "Completed" : project.status}
          </span>
          <button
            type="button"
            onClick={() => onDelete(project.id)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-rose-600"
            aria-label={`Delete ${project.name}`}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-lg font-bold text-slate-800">
            <span className="inline-flex items-center gap-2">
              <CalendarDays size={20} />
              {deadline.label}
            </span>
            <span>{deadline.percent.toFixed(0)}%</span>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <div
              className={`absolute inset-y-0 left-0 ${deadline.color} transition-all`}
              style={{ width: `${Math.max(3, Math.min(100, deadline.percent))}%` }}
            />
            <div
              className="relative z-10 grid min-h-16"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, timelineDays.length)}, minmax(42px, 1fr))`,
              }}
            >
              {timelineDays.map((day, index) => (
                <div
                  key={day.key}
                  className={`flex flex-col items-center justify-center border-l border-white/55 px-1 text-center first:border-l-0 ${
                    day.isToday ? "bg-white/30" : ""
                  }`}
                >
                  <span className="text-sm font-black tabular-nums text-slate-950">
                    {day.label}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">
                    {day.month}
                  </span>
                  {index === 0 || index === timelineDays.length - 1 || day.isToday ? (
                    <span className="mt-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {day.badge}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-3">
            <span>Started: {formatDate(project.startedAt)}</span>
            <span>Deadline: {formatDeadlineDate(project.dueDate)}</span>
            <span>Ended: {project.completedAt ? formatDate(project.completedAt) : "Not completed"}</span>
          </div>
        </div>

        {project.notes ? <p className="text-sm leading-6 text-slate-600">{project.notes}</p> : null}
      </div>
    </article>
  );
}

function StorageTab({
  storage,
  onRefresh,
}: {
  storage: StorageSnapshot | null;
  onRefresh: () => void;
}) {
  const percent = storage?.percentUsed || 0;

  return (
    <section className="grid gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Database className="text-teal-700" size={20} />
              <h2 className="text-lg font-semibold">PostgreSQL storage capacity</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Tracks the current database size and CBE table footprint.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        {storage ? (
          <div className="mt-6 grid gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                <span>{formatStorageBytes(storage.usedBytes)} used</span>
                <span>{formatStorageBytes(storage.limitBytes)} limit</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {percent.toFixed(2)}% used in database {storage.databaseName}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Information table"
                value={formatStorageBytes(storage.tableBytes.information)}
                icon={<KeyRound size={18} />}
              />
              <Metric
                label="Projects table"
                value={formatStorageBytes(storage.tableBytes.projects)}
                icon={<ClipboardList size={18} />}
              />
            </div>
          </div>
        ) : (
          <EmptyState icon={<Database size={20} />} text="Storage details are not loaded yet." />
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      </div>
      <div className="rounded-lg bg-white p-2 text-teal-700 shadow-sm">{icon}</div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
        active ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className={`rounded-lg p-2 ${active ? "bg-white/10" : "bg-slate-100 text-teal-700"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className={`block truncate text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
          {description}
        </span>
      </span>
    </button>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
      <span className="rounded-lg bg-white p-2 text-slate-400">{icon}</span>
      {text}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

function getDeadlineProgress(project: ProjectEntry) {
  if (project.completedAt) {
    return {
      percent: 100,
      color: "bg-emerald-600",
      label: "Completed",
    };
  }

  if (!project.dueDate) {
    return {
      percent: 0,
      color: "bg-slate-400",
      label: "No deadline set",
    };
  }

  const start = startOfDay(project.startedAt ? new Date(project.startedAt) : new Date(project.createdAt));
  const end = endOfDay(new Date(`${project.dueDate}T00:00:00`));
  const now = new Date();
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);

  let color = "bg-emerald-600";
  if (percent >= 85 || daysLeft <= 1) color = "bg-rose-600";
  else if (percent >= 65 || daysLeft <= 3) color = "bg-orange-500";
  else if (percent >= 40 || daysLeft <= 7) color = "bg-amber-500";

  return {
    percent,
    color,
    label:
      daysLeft < 0
        ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`
        : daysLeft === 0
          ? "Due today"
          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
  };
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getTimelineDays(project: ProjectEntry) {
  const start = startOfDay(project.startedAt ? new Date(project.startedAt) : new Date(project.createdAt));
  const end = project.dueDate
    ? startOfDay(new Date(`${project.dueDate}T00:00:00`))
    : startOfDay(new Date());
  const last = end.getTime() >= start.getTime() ? end : start;
  const totalDays = Math.floor((last.getTime() - start.getTime()) / 86_400_000) + 1;
  const maxTicks = 16;
  const step = Math.max(1, Math.ceil(totalDays / maxTicks));
  const todayKey = toDateKey(new Date());
  const days: Array<{
    key: string;
    label: string;
    month: string;
    badge: string;
    isToday: boolean;
  }> = [];

  for (let index = 0; index < totalDays; index += step) {
    days.push(toTimelineDay(addDays(start, index), todayKey, index === 0, false));
  }

  const endDay = toTimelineDay(last, todayKey, false, true);
  if (days[days.length - 1]?.key !== endDay.key) {
    days.push(endDay);
  } else {
    days[days.length - 1] = endDay;
  }

  return days;
}

function toTimelineDay(date: Date, todayKey: string, isStart: boolean, isDeadline: boolean) {
  const key = toDateKey(date);
  const label = date.toLocaleDateString(undefined, { day: "2-digit" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return {
    key,
    label,
    month,
    badge: key === todayKey ? "Today" : isStart ? "Start" : isDeadline ? "Deadline" : "",
    isToday: key === todayKey,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDeadlineDate(value: string) {
  if (!value) return "Not set";
  return formatDate(`${value}T00:00:00`);
}

function formatStorageBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );
  const sized = value / Math.pow(1024, exponent);
  return `${sized.toFixed(exponent === 0 ? 0 : exponent === 1 ? 1 : 2)} ${units[exponent]}`;
}
