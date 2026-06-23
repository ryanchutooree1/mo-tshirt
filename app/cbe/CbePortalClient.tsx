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
  dueDate: string;
  notes: string;
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

const EMPTY_INFO_DRAFT = {
  title: "",
  email: "",
  password: "",
  notes: "",
};

const EMPTY_PROJECT_DRAFT = {
  name: "",
  owner: "",
  status: "Planning" as ProjectEntry["status"],
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
  const [infoDraft, setInfoDraft] = useState(EMPTY_INFO_DRAFT);
  const [projectDraft, setProjectDraft] = useState(EMPTY_PROJECT_DRAFT);

  const projectSummary = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((project) => project.status !== "Done").length,
      done: projects.filter((project) => project.status === "Done").length,
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

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              CBE Menu
            </p>
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
              description="Tasks and progress"
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

        <div className="grid gap-4">
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
}: {
  draft: typeof EMPTY_PROJECT_DRAFT;
  projects: ProjectEntry[];
  saving: boolean;
  summary: { total: number; active: number; done: number };
  onDraftChange: (draft: typeof EMPTY_PROJECT_DRAFT) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="text-teal-700" size={20} />
          <h2 className="text-lg font-semibold">New project item</h2>
        </div>
        <div className="mt-4 grid gap-3">
          <Field
            label="Project name"
            value={draft.name}
            placeholder="Example: Product photo upload"
            onChange={(value) => onDraftChange({ ...draft, name: value })}
          />
          <Field
            label="Owner"
            value={draft.owner}
            placeholder="Responsible person"
            onChange={(value) => onDraftChange({ ...draft, owner: value })}
          />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  status: event.target.value as ProjectEntry["status"],
                })
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              <option>Planning</option>
              <option>In progress</option>
              <option>Waiting</option>
              <option>Done</option>
            </select>
          </label>
          <Field
            label="Due date"
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
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus size={18} />
            {saving ? "Saving..." : "Save project"}
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
            <EmptyState icon={<ClipboardList size={20} />} text="No projects saved yet." />
          ) : null}
          {projects.map((project) => (
            <article key={project.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{project.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">Owner: {project.owner}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[project.status]}`}>
                    {project.status}
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
              {project.dueDate ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                  <CalendarDays size={16} />
                  Due {project.dueDate}
                </p>
              ) : null}
              {project.notes ? <p className="mt-3 text-sm leading-6 text-slate-600">{project.notes}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
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
