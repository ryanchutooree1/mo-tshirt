"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Boxes,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Copy,
  Cpu,
  Factory,
  Headphones,
  Link2,
  Megaphone,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Scale,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
} from "lucide-react";
import {
  departmentBlueprints,
  departmentById,
  getDepartmentById,
  type DepartmentBlueprint,
  type DepartmentFeature,
  type DepartmentId,
  type DepartmentWorkflow,
  type RoleBlueprint,
} from "@/data/admin-departments";

type CoverageStatus = "Filled" | "Hiring" | "Outsource" | "Needs owner";

type RoleAssignment = {
  owner: string;
  status: CoverageStatus;
  capacity: string;
  notes: string;
};

type CustomPerson = {
  id: string;
  name: string;
  title: string;
  focus: string;
};

type TaskTemplate = {
  id: string;
  label: string;
  owner: string;
  source: string;
};

const coverageStatuses: CoverageStatus[] = [
  "Filled",
  "Hiring",
  "Outsource",
  "Needs owner",
];

const departmentIcons: Record<DepartmentId, LucideIcon> = {
  management: Building2,
  sales: ShoppingCart,
  marketing: Megaphone,
  "customer-service": Headphones,
  design: Palette,
  production: Factory,
  purchasing: ShoppingCart,
  inventory: Boxes,
  logistics: Truck,
  quality: BadgeCheck,
  finance: Banknote,
  hr: UsersRound,
  technology: Cpu,
  "legal-compliance": Scale,
};

const accentClasses: Record<
  DepartmentId,
  { text: string; bg: string; border: string; bar: string; soft: string }
> = {
  management: {
    text: "text-slate-950",
    bg: "bg-slate-950",
    border: "border-slate-300",
    bar: "bg-slate-900",
    soft: "bg-slate-100",
  },
  sales: {
    text: "text-emerald-800",
    bg: "bg-emerald-700",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    soft: "bg-emerald-50",
  },
  marketing: {
    text: "text-rose-800",
    bg: "bg-rose-700",
    border: "border-rose-200",
    bar: "bg-rose-500",
    soft: "bg-rose-50",
  },
  "customer-service": {
    text: "text-sky-800",
    bg: "bg-sky-700",
    border: "border-sky-200",
    bar: "bg-sky-500",
    soft: "bg-sky-50",
  },
  design: {
    text: "text-violet-800",
    bg: "bg-violet-700",
    border: "border-violet-200",
    bar: "bg-violet-500",
    soft: "bg-violet-50",
  },
  production: {
    text: "text-orange-800",
    bg: "bg-orange-700",
    border: "border-orange-200",
    bar: "bg-orange-500",
    soft: "bg-orange-50",
  },
  purchasing: {
    text: "text-cyan-800",
    bg: "bg-cyan-700",
    border: "border-cyan-200",
    bar: "bg-cyan-500",
    soft: "bg-cyan-50",
  },
  inventory: {
    text: "text-teal-800",
    bg: "bg-teal-700",
    border: "border-teal-200",
    bar: "bg-teal-500",
    soft: "bg-teal-50",
  },
  logistics: {
    text: "text-blue-800",
    bg: "bg-blue-700",
    border: "border-blue-200",
    bar: "bg-blue-500",
    soft: "bg-blue-50",
  },
  quality: {
    text: "text-amber-800",
    bg: "bg-amber-700",
    border: "border-amber-200",
    bar: "bg-amber-500",
    soft: "bg-amber-50",
  },
  finance: {
    text: "text-emerald-800",
    bg: "bg-emerald-700",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    soft: "bg-emerald-50",
  },
  hr: {
    text: "text-pink-800",
    bg: "bg-pink-700",
    border: "border-pink-200",
    bar: "bg-pink-500",
    soft: "bg-pink-50",
  },
  technology: {
    text: "text-indigo-800",
    bg: "bg-indigo-700",
    border: "border-indigo-200",
    bar: "bg-indigo-500",
    soft: "bg-indigo-50",
  },
  "legal-compliance": {
    text: "text-neutral-800",
    bg: "bg-neutral-800",
    border: "border-neutral-300",
    bar: "bg-neutral-700",
    soft: "bg-neutral-100",
  },
};

function storageKey(departmentId: DepartmentId, suffix: string) {
  return `mo-department-os:${departmentId}:${suffix}:v1`;
}

function defaultAssignment(role: RoleBlueprint): RoleAssignment {
  const hasNamedOwner = !/open/i.test(role.suggestedOwner);
  const isOutsource = role.priority === "Outsource";

  return {
    owner: hasNamedOwner ? role.suggestedOwner : "",
    status: isOutsource ? "Outsource" : hasNamedOwner ? "Filled" : "Hiring",
    capacity: role.priority === "Core" ? "Primary" : role.priority,
    notes: "",
  };
}

function buildDefaultAssignments(department: DepartmentBlueprint) {
  return department.roles.reduce<Record<string, RoleAssignment>>((acc, role) => {
    acc[role.id] = defaultAssignment(role);
    return acc;
  }, {});
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function uniqueConnectedDepartments(department: DepartmentBlueprint) {
  const ids = new Set<DepartmentId>();
  department.roles.forEach((role) => role.connectedTo.forEach((id) => ids.add(id)));
  department.workflows.forEach((workflow) =>
    workflow.connectedTo.forEach((id) => ids.add(id))
  );
  return Array.from(ids)
    .map((id) => departmentById[id])
    .filter(Boolean);
}

function taskTemplatesFor(department: DepartmentBlueprint): TaskTemplate[] {
  const roleTasks = department.roles.map((role) => ({
    id: `role:${role.id}`,
    label: role.responsibilities[0],
    owner: role.title,
    source: "Role",
  }));

  const workflowTasks = department.workflows.map((workflow) => ({
    id: `workflow:${workflow.id}`,
    label: workflow.steps[0],
    owner: workflow.name,
    source: "Workflow",
  }));

  const featureTasks = department.features.slice(0, 3).map((feature) => ({
    id: `feature:${feature.name}`,
    label: feature.detail,
    owner: feature.owner,
    source: "Feature",
  }));

  return [...roleTasks, ...workflowTasks, ...featureTasks];
}

function statusClass(status: CoverageStatus) {
  if (status === "Filled") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Hiring") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Outsource") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
      {children}
    </label>
  );
}

function SmallStat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function RoleCard({
  role,
  assignment,
  accent,
  onChange,
}: {
  role: RoleBlueprint;
  assignment: RoleAssignment;
  accent: { bar: string };
  onChange: (next: RoleAssignment) => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className={`h-1.5 ${accent.bar}`} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">{role.title}</h2>
              <span
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusClass(assignment.status)}`}
              >
                {assignment.status}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                {role.priority}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{role.mission}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Owner</FieldLabel>
            <input
              value={assignment.owner}
              onChange={(event) => onChange({ ...assignment, owner: event.target.value })}
              placeholder={role.suggestedOwner}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>Status</FieldLabel>
            <select
              value={assignment.status}
              onChange={(event) =>
                onChange({
                  ...assignment,
                  status: event.target.value as CoverageStatus,
                })
              }
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              {coverageStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel>Capacity</FieldLabel>
            <input
              value={assignment.capacity}
              onChange={(event) =>
                onChange({ ...assignment, capacity: event.target.value })
              }
              placeholder="Primary, backup, vendor"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <textarea
          value={assignment.notes}
          onChange={(event) => onChange({ ...assignment, notes: event.target.value })}
          placeholder="Notes, backup person, hiring requirement, or access needed"
          className="mt-3 min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Responsibilities
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {role.responsibilities.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              KPIs
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {role.kpis.map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Automations
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {role.automations.map((item) => (
                <li key={item} className="flex gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}

function WorkflowCard({ workflow }: { workflow: DepartmentWorkflow }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">{workflow.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{workflow.trigger}</p>
        </div>
        <ClipboardList className="h-5 w-5 shrink-0 text-slate-500" />
      </div>
      <ol className="mt-4 space-y-2 text-sm text-slate-700">
        {workflow.steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        {workflow.outputs.map((output) => (
          <span
            key={output}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {output}
          </span>
        ))}
      </div>
    </article>
  );
}

function FeatureRow({ feature }: { feature: DepartmentFeature }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950">{feature.name}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{feature.detail}</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {feature.owner}
        </span>
      </div>
    </div>
  );
}

export default function DepartmentOperatingPage({
  departmentId,
}: {
  departmentId: DepartmentId;
}) {
  const department = getDepartmentById(departmentId);
  const DepartmentIcon = departmentIcons[departmentId];
  const accent = accentClasses[departmentId];

  const defaultAssignments = useMemo(
    () => buildDefaultAssignments(department),
    [department]
  );
  const taskTemplates = useMemo(() => taskTemplatesFor(department), [department]);
  const connectedDepartments = useMemo(
    () => uniqueConnectedDepartments(department),
    [department]
  );

  const [assignments, setAssignments] =
    useState<Record<string, RoleAssignment>>(defaultAssignments);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const [customPeople, setCustomPeople] = useState<CustomPerson[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personTitle, setPersonTitle] = useState("");
  const [personFocus, setPersonFocus] = useState("");

  useEffect(() => {
    const assignmentKey = storageKey(departmentId, "assignments");
    const tasksKey = storageKey(departmentId, "tasks");
    const peopleKey = storageKey(departmentId, "people");

    const savedAssignments = safeParse<Record<string, RoleAssignment>>(
      localStorage.getItem(assignmentKey),
      {}
    );

    setAssignments({
      ...defaultAssignments,
      ...savedAssignments,
    });
    setCheckedTasks(
      safeParse<Record<string, boolean>>(localStorage.getItem(tasksKey), {})
    );
    setCustomPeople(safeParse<CustomPerson[]>(localStorage.getItem(peopleKey), []));
    setHydrated(true);
  }, [defaultAssignments, departmentId]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey(departmentId, "assignments"),
      JSON.stringify(assignments)
    );
  }, [assignments, departmentId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey(departmentId, "tasks"),
      JSON.stringify(checkedTasks)
    );
  }, [checkedTasks, departmentId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey(departmentId, "people"),
      JSON.stringify(customPeople)
    );
  }, [customPeople, departmentId, hydrated]);

  const filledRoles = department.roles.filter((role) => {
    const assignment = assignments[role.id];
    return assignment?.status === "Filled" && assignment.owner.trim().length > 0;
  }).length;

  const openRoles = department.roles.length - filledRoles;
  const automationCount = department.roles.reduce(
    (total, role) => total + role.automations.length,
    0
  );
  const completionPct = taskTemplates.length
    ? Math.round(
        (taskTemplates.filter((task) => checkedTasks[task.id]).length /
          taskTemplates.length) *
          100
      )
    : 0;

  function updateRole(roleId: string, next: RoleAssignment) {
    setAssignments((current) => ({ ...current, [roleId]: next }));
  }

  function toggleTask(taskId: string) {
    setCheckedTasks((current) => ({ ...current, [taskId]: !current[taskId] }));
  }

  function resetTasks() {
    setCheckedTasks({});
  }

  function addCustomPerson() {
    if (!personName.trim() || !personTitle.trim()) return;
    setCustomPeople((current) => [
      {
        id: `${Date.now()}`,
        name: personName.trim(),
        title: personTitle.trim(),
        focus: personFocus.trim() || "Department support",
      },
      ...current,
    ]);
    setPersonName("");
    setPersonTitle("");
    setPersonFocus("");
  }

  function buildBriefing() {
    const openSeatLines = department.roles
      .filter((role) => assignments[role.id]?.status !== "Filled")
      .map((role) => {
        const assignment = assignments[role.id];
        return `- ${role.title}: ${assignment?.status || "Needs owner"}${
          assignment?.owner ? ` (${assignment.owner})` : ""
        }`;
      });

    const taskLines = taskTemplates
      .filter((task) => !checkedTasks[task.id])
      .slice(0, 8)
      .map((task) => `- ${task.owner}: ${task.label}`);

    return [
      `${department.name} daily brief`,
      `Mission: ${department.mission}`,
      `Primary KPI: ${department.primaryKpi}`,
      "",
      "Open seats:",
      openSeatLines.length ? openSeatLines.join("\n") : "- All core seats covered",
      "",
      "Today's command list:",
      taskLines.length ? taskLines.join("\n") : "- Daily checklist complete",
      "",
      `Connected departments: ${connectedDepartments
        .map((item) => item.shortName)
        .join(", ")}`,
    ].join("\n");
  }

  async function copyBriefing() {
    try {
      await navigator.clipboard.writeText(buildBriefing());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-[1760px] flex-col gap-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-white ${accent.bg}`}>
                <DepartmentIcon className="h-6 w-6" />
              </div>
              <div>
                <div className={`text-xs font-bold uppercase tracking-[0.18em] ${accent.text}`}>
                  {department.badge}
                </div>
                <h1 className="text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
                  {department.name}
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">
              {department.mission}
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Command question
              </div>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {department.commandQuestion}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={copyBriefing}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy Brief"}
            </button>
            <button
              type="button"
              onClick={resetTasks}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset Day
            </button>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-2">
        {departmentBlueprints.map((item) => {
          const Icon = departmentIcons[item.id];
          const active = item.id === departmentId;
          return (
            <Link
              key={item.id}
              href={item.route}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition ${
                active
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.shortName}
            </Link>
          );
        })}
      </nav>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SmallStat
          icon={UsersRound}
          label="Required Seats"
          value={`${department.roles.length}`}
          detail={`${filledRoles} filled, ${openRoles} still need ownership or hiring.`}
        />
        <SmallStat
          icon={Sparkles}
          label="Automation Hooks"
          value={`${automationCount}`}
          detail="Role-based reminders, approvals, alerts, and handoffs."
        />
        <SmallStat
          icon={Link2}
          label="Connected Teams"
          value={`${connectedDepartments.length}`}
          detail="Automatic handoffs mapped across the business."
        />
        <SmallStat
          icon={CheckCircle2}
          label="Today Complete"
          value={`${completionPct}%`}
          detail="Local command checklist for this department."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-950">People Seats</h2>
                <p className="text-sm text-slate-600">
                  Required people, backups, KPIs, tools, automations, and department handoffs.
                </p>
              </div>
              <div className={`rounded-md border px-3 py-2 text-sm font-bold ${accent.border} ${accent.soft} ${accent.text}`}>
                Next hire: {department.nextHire}
              </div>
            </div>
            <div className="grid gap-4">
              {department.roles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  assignment={assignments[role.id] || defaultAssignment(role)}
                  accent={accent}
                  onChange={(next) => updateRole(role.id, next)}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-2xl font-black text-slate-950">Workflow Connections</h2>
              <p className="text-sm text-slate-600">
                Every department has triggers, outputs, and receiving teams so work moves without retyping.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {department.workflows.map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-2xl font-black text-slate-950">Built-In Features</h2>
              <p className="text-sm text-slate-600">
                Functional controls each department needs before it becomes a full team.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {department.features.map((feature) => (
                <FeatureRow key={feature.name} feature={feature} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Daily Command</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Checklist generated from this department&apos;s seats, workflows, and features.
                </p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-md text-white ${accent.bg}`}>
                <ClipboardList className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {taskTemplates.map((task) => {
                const done = Boolean(checkedTasks[task.id]);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition ${
                      done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        {task.source} - {task.owner}
                      </span>
                      <span className="mt-1 block text-sm leading-6">{task.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-950">Add Person</h2>
              <Plus className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <FieldLabel>Name</FieldLabel>
                <input
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder="Person or vendor name"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Title</FieldLabel>
                <input
                  value={personTitle}
                  onChange={(event) => setPersonTitle(event.target.value)}
                  placeholder="Role or responsibility"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Focus</FieldLabel>
                <textarea
                  value={personFocus}
                  onChange={(event) => setPersonFocus(event.target.value)}
                  placeholder="What this person owns"
                  className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                onClick={addCustomPerson}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-white ${accent.bg}`}
              >
                <Save className="h-4 w-4" />
                Save Person
              </button>
            </div>
            {customPeople.length ? (
              <div className="mt-4 space-y-2">
                {customPeople.map((person) => (
                  <div
                    key={person.id}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="font-bold text-slate-950">{person.name}</div>
                    <div className="text-sm text-slate-600">{person.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {person.focus}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Connected Systems</h2>
            <div className="mt-4 space-y-2">
              {department.moduleLinks.map((module) => (
                <Link
                  key={`${module.label}-${module.href}`}
                  href={module.href}
                  className="block rounded-md border border-slate-200 bg-white px-3 py-3 transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-950">{module.label}</span>
                    <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{module.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Department Handoffs</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {connectedDepartments.map((item) => (
                <Link
                  key={item.id}
                  href={item.route}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-white"
                >
                  <Link2 className="h-4 w-4" />
                  {item.shortName}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
