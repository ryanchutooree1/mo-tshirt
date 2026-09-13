export type HomeWorkspaceView =
  | "overview"
  | "bills"
  | "maintenance"
  | "calendar"
  | "documents";

export type BillStatus = "upcoming" | "paid" | "overdue" | "paused";
export type MaintenanceStatus = "to-do" | "scheduled" | "in-progress" | "done";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";
export type HomeEventStatus = "planned" | "done" | "cancelled";

export type UtilityBill = {
  id: string;
  name: string;
  category: string;
  provider: string;
  amount: string;
  dueDate: string;
  frequency: string;
  status: BillStatus;
  accountReference: string;
  autoPay: boolean;
  notes: string;
};

export type MaintenanceTask = {
  id: string;
  title: string;
  area: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  dueDate: string;
  provider: string;
  estimatedCost: string;
  recurringMonths: string;
  notes: string;
};

export type HomeCalendarEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: string;
  who: string;
  repeat: string;
  reminder: string;
  status: HomeEventStatus;
  notes: string;
};

export type HomeDocument = {
  id: string;
  title: string;
  category: string;
  provider: string;
  reference: string;
  expiryDate: string;
  storageLocation: string;
  url: string;
  notes: string;
};

export type HomeManagementData = {
  bills: UtilityBill[];
  maintenance: MaintenanceTask[];
  events: HomeCalendarEvent[];
  documents: HomeDocument[];
};

export const EMPTY_HOME_MANAGEMENT_DATA: HomeManagementData = {
  bills: [],
  maintenance: [],
  events: [],
  documents: [],
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return value === true;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function recordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

export function newHomeRecordId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlankBill(): UtilityBill {
  return {
    id: newHomeRecordId("bill"),
    name: "New bill",
    category: "Electricity",
    provider: "",
    amount: "",
    dueDate: "",
    frequency: "Monthly",
    status: "upcoming",
    accountReference: "",
    autoPay: false,
    notes: "",
  };
}

export function createBlankMaintenanceTask(): MaintenanceTask {
  return {
    id: newHomeRecordId("maintenance"),
    title: "New maintenance task",
    area: "General",
    priority: "medium",
    status: "to-do",
    dueDate: "",
    provider: "",
    estimatedCost: "",
    recurringMonths: "",
    notes: "",
  };
}

export function createBlankHomeEvent(): HomeCalendarEvent {
  return {
    id: newHomeRecordId("event"),
    title: "New home event",
    date: "",
    time: "",
    type: "Reminder",
    who: "Both",
    repeat: "Does not repeat",
    reminder: "1 day before",
    status: "planned",
    notes: "",
  };
}

export function createBlankHomeDocument(): HomeDocument {
  return {
    id: newHomeRecordId("document"),
    title: "New document",
    category: "Warranty",
    provider: "",
    reference: "",
    expiryDate: "",
    storageLocation: "",
    url: "",
    notes: "",
  };
}

export function normalizeHomeManagementData(value: unknown): HomeManagementData {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    bills: recordList(source.bills).map((item) => ({
      id: stringValue(item.id) || newHomeRecordId("bill"),
      name: stringValue(item.name) || "Untitled bill",
      category: stringValue(item.category) || "Other",
      provider: stringValue(item.provider),
      amount: stringValue(item.amount),
      dueDate: stringValue(item.dueDate),
      frequency: stringValue(item.frequency) || "Monthly",
      status: enumValue(item.status, ["upcoming", "paid", "overdue", "paused"] as const, "upcoming"),
      accountReference: stringValue(item.accountReference),
      autoPay: booleanValue(item.autoPay),
      notes: stringValue(item.notes),
    })),
    maintenance: recordList(source.maintenance).map((item) => ({
      id: stringValue(item.id) || newHomeRecordId("maintenance"),
      title: stringValue(item.title) || "Untitled task",
      area: stringValue(item.area) || "General",
      priority: enumValue(item.priority, ["low", "medium", "high", "urgent"] as const, "medium"),
      status: enumValue(item.status, ["to-do", "scheduled", "in-progress", "done"] as const, "to-do"),
      dueDate: stringValue(item.dueDate),
      provider: stringValue(item.provider),
      estimatedCost: stringValue(item.estimatedCost),
      recurringMonths: stringValue(item.recurringMonths),
      notes: stringValue(item.notes),
    })),
    events: recordList(source.events).map((item) => ({
      id: stringValue(item.id) || newHomeRecordId("event"),
      title: stringValue(item.title) || "Untitled event",
      date: stringValue(item.date),
      time: stringValue(item.time),
      type: stringValue(item.type) || "Reminder",
      who: stringValue(item.who) || "Both",
      repeat: stringValue(item.repeat) || "Does not repeat",
      reminder: stringValue(item.reminder) || "1 day before",
      status: enumValue(item.status, ["planned", "done", "cancelled"] as const, "planned"),
      notes: stringValue(item.notes),
    })),
    documents: recordList(source.documents).map((item) => ({
      id: stringValue(item.id) || newHomeRecordId("document"),
      title: stringValue(item.title) || "Untitled document",
      category: stringValue(item.category) || "Other",
      provider: stringValue(item.provider),
      reference: stringValue(item.reference),
      expiryDate: stringValue(item.expiryDate),
      storageLocation: stringValue(item.storageLocation),
      url: stringValue(item.url),
      notes: stringValue(item.notes),
    })),
  };
}

export function dateDistanceInDays(dateValue: string, todayValue: string) {
  if (!dateValue || !todayValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date(`${todayValue}T00:00:00`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(today.getTime())) return null;
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}
