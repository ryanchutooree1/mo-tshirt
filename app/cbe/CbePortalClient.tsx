"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type PortalTab = "information" | "projects";

type InfoEntry = {
  id: number;
  title: string;
  email: string;
  password: string;
  notes: string;
};

type ProjectEntry = {
  id: number;
  name: string;
  owner: string;
  status: "Planning" | "In progress" | "Waiting" | "Done";
  dueDate: string;
  notes: string;
};

const INITIAL_INFO: InfoEntry[] = [
  {
    id: 1,
    title: "Main contact email",
    email: "admin@cbe.mu",
    password: "",
    notes: "Primary inbox for project communication.",
  },
];

const INITIAL_PROJECTS: ProjectEntry[] = [
  {
    id: 1,
    name: "Website setup",
    owner: "MO T-SHIRT",
    status: "In progress",
    dueDate: "",
    notes: "Initial client portal with information and project management tabs.",
  },
];

const statusStyles: Record<ProjectEntry["status"], string> = {
  Planning: "border-slate-200 bg-slate-50 text-slate-700",
  "In progress": "border-amber-200 bg-amber-50 text-amber-800",
  Waiting: "border-sky-200 bg-sky-50 text-sky-800",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export default function CbePortalClient() {
  const [activeTab, setActiveTab] = useState<PortalTab>("information");
  const [showPasswords, setShowPasswords] = useState(false);
  const [infoEntries, setInfoEntries] = useState(INITIAL_INFO);
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [infoDraft, setInfoDraft] = useState<Omit<InfoEntry, "id">>({
    title: "",
    email: "",
    password: "",
    notes: "",
  });
  const [projectDraft, setProjectDraft] = useState<Omit<ProjectEntry, "id">>({
    name: "",
    owner: "",
    status: "Planning",
    dueDate: "",
    notes: "",
  });

  const projectSummary = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((project) => project.status !== "Done").length,
      done: projects.filter((project) => project.status === "Done").length,
    };
  }, [projects]);

  function addInfoEntry() {
    if (!infoDraft.title.trim() && !infoDraft.email.trim()) return;
    setInfoEntries((current) => [
      {
        id: Date.now(),
        title: infoDraft.title.trim() || "Untitled information",
        email: infoDraft.email.trim(),
        password: infoDraft.password,
        notes: infoDraft.notes.trim(),
      },
      ...current,
    ]);
    setInfoDraft({ title: "", email: "", password: "", notes: "" });
  }

  function addProject() {
    if (!projectDraft.name.trim()) return;
    setProjects((current) => [
      {
        id: Date.now(),
        name: projectDraft.name.trim(),
        owner: projectDraft.owner.trim() || "Unassigned",
        status: projectDraft.status,
        dueDate: projectDraft.dueDate,
        notes: projectDraft.notes.trim(),
      },
      ...current,
    ]);
    setProjectDraft({
      name: "",
      owner: "",
      status: "Planning",
      dueDate: "",
      notes: "",
    });
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
              Private client workspace
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Saved info" value={infoEntries.length.toString()} icon={<KeyRound size={18} />} />
            <Metric label="Active projects" value={projectSummary.active.toString()} icon={<ClipboardList size={18} />} />
            <Metric label="Completed" value={projectSummary.done.toString()} icon={<CheckCircle2 size={18} />} />
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex w-full gap-2 rounded-xl border border-slate-200 bg-white p-1">
          <TabButton
            active={activeTab === "information"}
            icon={<KeyRound size={18} />}
            label="Information"
            onClick={() => setActiveTab("information")}
          />
          <TabButton
            active={activeTab === "projects"}
            icon={<LayoutDashboard size={18} />}
            label="Project Management"
            onClick={() => setActiveTab("projects")}
          />
        </div>

        {activeTab === "information" ? (
          <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Mail className="text-teal-700" size={20} />
                <h2 className="text-lg font-semibold">Insert information</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <Field
                  label="Title"
                  value={infoDraft.title}
                  placeholder="Example: Gmail account"
                  onChange={(value) => setInfoDraft((draft) => ({ ...draft, title: value }))}
                />
                <Field
                  label="Email or username"
                  value={infoDraft.email}
                  placeholder="name@example.com"
                  onChange={(value) => setInfoDraft((draft) => ({ ...draft, email: value }))}
                />
                <Field
                  label="Password"
                  type="password"
                  value={infoDraft.password}
                  placeholder="Keep blank until secure vault is added"
                  onChange={(value) => setInfoDraft((draft) => ({ ...draft, password: value }))}
                />
                <TextArea
                  label="Notes"
                  value={infoDraft.notes}
                  placeholder="Extra login notes, owner, recovery email, or instructions"
                  onChange={(value) => setInfoDraft((draft) => ({ ...draft, notes: value }))}
                />
                <button
                  type="button"
                  onClick={addInfoEntry}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus size={18} />
                  Add information
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Saved information</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Passwords are masked on screen. Use a real encrypted vault before storing live passwords.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
                  {showPasswords ? "Hide" : "Show"}
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {infoEntries.map((entry) => (
                  <article key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{entry.title}</h3>
                        <p className="mt-1 break-all text-sm text-slate-600">{entry.email || "No email added"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setInfoEntries((current) => current.filter((item) => item.id !== entry.id))
                        }
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
        ) : (
          <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="text-teal-700" size={20} />
                <h2 className="text-lg font-semibold">New project item</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <Field
                  label="Project name"
                  value={projectDraft.name}
                  placeholder="Example: Product photo upload"
                  onChange={(value) => setProjectDraft((draft) => ({ ...draft, name: value }))}
                />
                <Field
                  label="Owner"
                  value={projectDraft.owner}
                  placeholder="Responsible person"
                  onChange={(value) => setProjectDraft((draft) => ({ ...draft, owner: value }))}
                />
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Status
                  <select
                    value={projectDraft.status}
                    onChange={(event) =>
                      setProjectDraft((draft) => ({
                        ...draft,
                        status: event.target.value as ProjectEntry["status"],
                      }))
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
                  value={projectDraft.dueDate}
                  onChange={(value) => setProjectDraft((draft) => ({ ...draft, dueDate: value }))}
                />
                <TextArea
                  label="Notes"
                  value={projectDraft.notes}
                  placeholder="Next actions, blockers, links, or delivery notes"
                  onChange={(value) => setProjectDraft((draft) => ({ ...draft, notes: value }))}
                />
                <button
                  type="button"
                  onClick={addProject}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus size={18} />
                  Add project
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Project management</h2>
              <div className="mt-4 grid gap-3">
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
                          onClick={() => setProjects((current) => current.filter((item) => item.id !== project.id))}
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
        )}
      </section>
    </main>
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
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {icon}
      {label}
    </button>
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
