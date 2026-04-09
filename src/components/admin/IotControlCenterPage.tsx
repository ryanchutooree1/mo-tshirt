"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Cpu,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type StatusItem = {
  code: string;
  value: unknown;
};

type DeviceItem = {
  id: string;
  name: string;
  online: boolean | null;
  status: StatusItem[];
  lastFetchedAt: string;
  error?: string | null;
};

type DevicesResponse = {
  ok?: boolean;
  hasKeys?: boolean;
  message?: string;
  missingEnv?: string[];
  source?: "cloud" | "env";
  listError?: string | null;
  devices?: DeviceItem[];
};

type CommandState = {
  code: string;
  value: boolean;
};

type PingResponse = {
  hasKeys?: boolean;
  baseUrl?: string;
  projectCode?: string;
  configuredDeviceIdsCount?: number;
  missingEnv?: string[];
};

type AutomationTriggerType = "manual" | "daily";
type AutomationRunStatus = "idle" | "success" | "error";

type IotAutomation = {
  id: string;
  name: string;
  deviceId: string;
  deviceName: string;
  code: string;
  value: boolean;
  triggerType: AutomationTriggerType;
  dailyTime: string;
  timezone: string;
  enabled: boolean;
  lastRunStatus: AutomationRunStatus;
  lastRunNote: string;
  lastRunAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type AutomationDraft = {
  id?: string;
  name: string;
  deviceId: string;
  deviceName: string;
  code: string;
  value: boolean;
  triggerType: AutomationTriggerType;
  dailyTime: string;
  timezone: string;
  enabled: boolean;
};

const ADMIN_ID = "mo-owner";

function safeText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "-";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object" && value !== null) {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === "function") {
      const parsed = maybeTs.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof maybeTs.seconds === "number") {
      const parsed = new Date(maybeTs.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function fmtTime(iso: string) {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "-";
  return time.toLocaleString();
}

function fmtDateTime(date: Date | null) {
  if (!date) return "-";
  return date.toLocaleString();
}

function asBooleanCount(status: StatusItem[]) {
  return status.reduce((count, item) => {
    if (typeof item.value === "boolean" && item.value) return count + 1;
    return count;
  }, 0);
}

function preferredCommandCode(status: StatusItem[]) {
  return status.find((item) => item.code.startsWith("switch_"))?.code || status[0]?.code || "";
}

function statusValueTone(value: unknown) {
  if (typeof value === "boolean") return value ? "status-boolean-on" : "status-boolean-off";
  if (typeof value === "number") return "status-number";
  if (typeof value === "string" && value.trim()) return "status-text";
  return "status-neutral";
}

function statusTone(online: boolean | null) {
  if (online === true) {
    return {
      label: "Online",
      icon: <Wifi className="h-3.5 w-3.5" />,
      className: "state-online",
    };
  }

  if (online === false) {
    return {
      label: "Offline",
      icon: <WifiOff className="h-3.5 w-3.5" />,
      className: "state-offline",
    };
  }

  return {
    label: "Unknown",
    icon: <Activity className="h-3.5 w-3.5" />,
    className: "state-unknown",
  };
}

function automationStatusClass(status: AutomationRunStatus) {
  if (status === "success") return "auto-status-success";
  if (status === "error") return "auto-status-error";
  return "auto-status-idle";
}

export default function IotControlCenterPage() {
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [hasKeys, setHasKeys] = useState<boolean>(false);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [projectCode, setProjectCode] = useState<string>("");
  const [configuredDeviceIdsCount, setConfiguredDeviceIdsCount] = useState<number>(0);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [automations, setAutomations] = useState<IotAutomation[]>([]);

  const [globalError, setGlobalError] = useState<string>("");
  const [globalMessage, setGlobalMessage] = useState<string>("");
  const [automationMessage, setAutomationMessage] = useState<string>("");

  const [deviceBusy, setDeviceBusy] = useState<Record<string, boolean>>({});
  const [deviceAlerts, setDeviceAlerts] = useState<Record<string, string>>({});
  const [commandState, setCommandState] = useState<Record<string, CommandState>>({});
  const [commandBusy, setCommandBusy] = useState<Record<string, boolean>>({});

  const [automationOpen, setAutomationOpen] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [runningAutomationId, setRunningAutomationId] = useState<string | null>(null);
  const [automationDraft, setAutomationDraft] = useState<AutomationDraft | null>(null);

  const updateCommandDefaults = useCallback((items: DeviceItem[]) => {
    setCommandState((current) => {
      const next = { ...current };
      for (const device of items) {
        const suggestedCode = preferredCommandCode(device.status);

        if (!next[device.id]) {
          next[device.id] = { code: suggestedCode, value: true };
          continue;
        }

        if (!next[device.id].code && suggestedCode) {
          next[device.id] = { ...next[device.id], code: suggestedCode };
        }
      }
      return next;
    });
  }, []);

  const loadPing = useCallback(async () => {
    try {
      const response = await fetch("/api/tuya/ping", { cache: "no-store" });
      const data = (await response.json()) as PingResponse;
      setHasKeys(Boolean(data.hasKeys));
      setBaseUrl(typeof data.baseUrl === "string" ? data.baseUrl : "");
      setProjectCode(typeof data.projectCode === "string" ? data.projectCode : "");
      setConfiguredDeviceIdsCount(
        typeof data.configuredDeviceIdsCount === "number" && Number.isFinite(data.configuredDeviceIdsCount)
          ? data.configuredDeviceIdsCount
          : 0
      );
      setMissingEnv(Array.isArray(data.missingEnv) ? data.missingEnv : []);
      return Boolean(data.hasKeys);
    } catch {
      setHasKeys(false);
      setBaseUrl("");
      setProjectCode("");
      setConfiguredDeviceIdsCount(0);
      setMissingEnv([]);
      return false;
    }
  }, []);

  const loadDevices = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshingAll(true);
      setGlobalError("");
      setGlobalMessage("");

      try {
        const response = await fetch("/api/tuya/devices", { cache: "no-store" });
        const payload = (await response.json()) as DevicesResponse;

        if (payload.hasKeys === false) {
          setHasKeys(false);
          setMissingEnv(Array.isArray(payload.missingEnv) ? payload.missingEnv : []);
          setDevices([]);
          setGlobalMessage(payload.message || "Tuya keys missing");
          return;
        }

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.message || "Failed to load Tuya devices.");
        }

        const list = Array.isArray(payload.devices) ? payload.devices : [];
        setDevices(list);
        updateCommandDefaults(list);

        if (payload.message) {
          setGlobalMessage(payload.message);
        } else if (payload.source === "env") {
          setGlobalMessage("Loaded devices from TUYA_DEVICE_IDS fallback.");
        }

        if (payload.listError) {
          setGlobalError(payload.listError);
        }
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : "Failed to load devices.");
      } finally {
        if (showSpinner) setRefreshingAll(false);
      }
    },
    [updateCommandDefaults]
  );

  useEffect(() => {
    const col = collection(db, "users", ADMIN_ID, "iotAutomations");
    const qy = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows: IotAutomation[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const triggerType = data.triggerType === "daily" ? "daily" : "manual";
        const lastRunStatusRaw = String(data.lastRunStatus || "idle").toLowerCase();
        const lastRunStatus: AutomationRunStatus =
          lastRunStatusRaw === "success" || lastRunStatusRaw === "error" ? (lastRunStatusRaw as AutomationRunStatus) : "idle";

        return {
          id: docSnap.id,
          name: String(data.name || "IoT Automation"),
          deviceId: String(data.deviceId || ""),
          deviceName: String(data.deviceName || "Device"),
          code: String(data.code || ""),
          value: Boolean(data.value),
          triggerType,
          dailyTime: String(data.dailyTime || ""),
          timezone: String(data.timezone || "UTC"),
          enabled: data.enabled !== false,
          lastRunStatus,
          lastRunNote: String(data.lastRunNote || ""),
          lastRunAt: asDate(data.lastRunAt),
          createdAt: asDate(data.createdAt),
          updatedAt: asDate(data.updatedAt),
        };
      });
      setAutomations(rows);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      const keysPresent = await loadPing();
      if (!mounted) return;
      if (keysPresent) {
        await loadDevices(false);
      } else {
        setGlobalMessage("Tuya keys missing");
      }
      if (mounted) setLoading(false);
    }

    void boot();

    return () => {
      mounted = false;
    };
  }, [loadDevices, loadPing]);

  const refreshAll = async () => {
    await loadPing();
    await loadDevices(true);
  };

  const refreshOne = useCallback(async (deviceId: string) => {
    setDeviceBusy((current) => ({ ...current, [deviceId]: true }));
    setDeviceAlerts((current) => ({ ...current, [deviceId]: "" }));

    try {
      const response = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/status`, {
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: StatusItem[];
        error?: string;
        lastFetchedAt?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to refresh status");
      }

      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                status: Array.isArray(payload.status) ? payload.status : [],
                lastFetchedAt: payload.lastFetchedAt || new Date().toISOString(),
                error: null,
              }
            : device
        )
      );
      setDeviceAlerts((current) => ({ ...current, [deviceId]: "Live status synchronized." }));
    } catch (error) {
      setDeviceAlerts((current) => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : "Refresh failed",
      }));
    } finally {
      setDeviceBusy((current) => ({ ...current, [deviceId]: false }));
    }
  }, []);

  const sendCommand = async (deviceId: string) => {
    const cmd = commandState[deviceId] || { code: "", value: true };
    if (!cmd.code.trim()) {
      setDeviceAlerts((current) => ({ ...current, [deviceId]: "Enter a command code first." }));
      return;
    }

    setCommandBusy((current) => ({ ...current, [deviceId]: true }));
    setDeviceAlerts((current) => ({ ...current, [deviceId]: "" }));

    try {
      const response = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cmd.code.trim(), value: cmd.value }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        msg?: string | null;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Command failed");
      }

      setDeviceAlerts((current) => ({
        ...current,
        [deviceId]: payload.msg ? `Command accepted (${payload.msg}).` : "Command accepted.",
      }));

      await refreshOne(deviceId);
    } catch (error) {
      setDeviceAlerts((current) => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : "Command failed",
      }));
    } finally {
      setCommandBusy((current) => ({ ...current, [deviceId]: false }));
    }
  };

  const runAutomation = useCallback(
    async (automation: IotAutomation) => {
      if (!automation.deviceId || !automation.code) {
        setAutomationMessage("Automation is missing device or command code.");
        return;
      }

      setRunningAutomationId(automation.id);

      try {
        const response = await fetch(`/api/tuya/device/${encodeURIComponent(automation.deviceId)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: automation.code, value: automation.value }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          msg?: string | null;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Automation command failed.");
        }

        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
          lastRunAt: serverTimestamp(),
          lastRunStatus: "success",
          lastRunNote: payload.msg ? `Manual run: ${payload.msg}` : "Manual run completed",
          updatedAt: serverTimestamp(),
        });

        setAutomationMessage(`Automation "${automation.name}" executed successfully.`);

        await refreshOne(automation.deviceId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Automation failed.";

        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
          lastRunAt: serverTimestamp(),
          lastRunStatus: "error",
          lastRunNote: message,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);

        setAutomationMessage(message);
      } finally {
        setRunningAutomationId(null);
      }
    },
    [refreshOne]
  );

  const openAutomationComposer = useCallback(
    (seed?: { deviceId: string; code: string; value: boolean }) => {
      const fallbackDeviceId = seed?.deviceId || devices[0]?.id || "";
      const matched = devices.find((item) => item.id === fallbackDeviceId) || null;
      const fallbackCode = seed?.code || commandState[fallbackDeviceId]?.code || preferredCommandCode(matched?.status || []);

      setAutomationDraft({
        name: matched ? `${matched.name} automation` : "IoT automation",
        deviceId: fallbackDeviceId,
        deviceName: matched?.name || "",
        code: fallbackCode,
        value: seed?.value ?? commandState[fallbackDeviceId]?.value ?? true,
        triggerType: "manual",
        dailyTime: "08:00",
        timezone: browserTimezone,
        enabled: true,
      });
      setAutomationOpen(true);
    },
    [browserTimezone, commandState, devices]
  );

  const openAutomationEditor = useCallback((automation: IotAutomation) => {
    setAutomationDraft({
      id: automation.id,
      name: automation.name,
      deviceId: automation.deviceId,
      deviceName: automation.deviceName,
      code: automation.code,
      value: automation.value,
      triggerType: automation.triggerType,
      dailyTime: automation.dailyTime || "08:00",
      timezone: automation.timezone || "UTC",
      enabled: automation.enabled,
    });
    setAutomationOpen(true);
  }, []);

  const closeAutomationComposer = () => {
    setAutomationOpen(false);
    setAutomationDraft(null);
  };

  const saveAutomationDraft = async () => {
    if (!automationDraft) return;

    const name = automationDraft.name.trim();
    const code = automationDraft.code.trim();
    if (!name || !automationDraft.deviceId || !code) {
      setAutomationMessage("Automation name, device, and code are required.");
      return;
    }

    setSavingAutomation(true);

    try {
      const matchedDevice = devices.find((device) => device.id === automationDraft.deviceId);
      const payload = {
        name,
        deviceId: automationDraft.deviceId,
        deviceName: matchedDevice?.name || automationDraft.deviceName || `Device ${automationDraft.deviceId.slice(-6)}`,
        code,
        value: automationDraft.value,
        triggerType: automationDraft.triggerType,
        dailyTime: automationDraft.triggerType === "daily" ? automationDraft.dailyTime : "",
        timezone: automationDraft.triggerType === "daily" ? automationDraft.timezone : "",
        enabled: automationDraft.enabled,
        updatedAt: serverTimestamp(),
      };

      if (automationDraft.id) {
        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automationDraft.id), payload);
        setAutomationMessage("Automation updated.");
      } else {
        await addDoc(collection(db, "users", ADMIN_ID, "iotAutomations"), {
          ...payload,
          lastRunStatus: "idle",
          lastRunNote: "",
          lastRunAt: null,
          createdAt: serverTimestamp(),
        });
        setAutomationMessage("Automation created.");
      }

      closeAutomationComposer();
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Failed to save automation.");
    } finally {
      setSavingAutomation(false);
    }
  };

  const toggleAutomationEnabled = async (automation: IotAutomation) => {
    try {
      await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
        enabled: !automation.enabled,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Failed to update automation status.");
    }
  };

  const deleteAutomation = async (automation: IotAutomation) => {
    if (!confirm(`Delete automation "${automation.name}"?`)) return;
    try {
      await deleteDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id));
      setAutomationMessage("Automation deleted.");
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Failed to delete automation.");
    }
  };

  const pageStatus = useMemo(() => {
    if (!hasKeys) return "Tuya keys missing";
    if (refreshingAll) return "Refreshing all devices";
    if (loading) return "Preparing device view";
    return `${devices.length} device${devices.length === 1 ? "" : "s"} linked`;
  }, [devices.length, hasKeys, loading, refreshingAll]);

  const summary = useMemo(() => {
    const online = devices.filter((device) => device.online === true).length;
    const offline = devices.filter((device) => device.online === false).length;
    const unknown = devices.length - online - offline;
    const signalCount = devices.reduce((sum, device) => sum + device.status.length, 0);

    return {
      total: devices.length,
      online,
      offline,
      unknown,
      signalCount,
    };
  }, [devices]);

  const automationSummary = useMemo(() => {
    const enabled = automations.filter((item) => item.enabled).length;
    const daily = automations.filter((item) => item.enabled && item.triggerType === "daily").length;
    const failed = automations.filter((item) => item.lastRunStatus === "error").length;

    return { enabled, daily, failed };
  }, [automations]);

  return (
    <div className="iot-deck mx-auto w-full max-w-[1400px]">
      <div aria-hidden className="iot-glow iot-glow-a" />
      <div aria-hidden className="iot-glow iot-glow-b" />
      <div aria-hidden className="iot-grid-pattern" />

      <section className="iot-panel iot-hero animate-rise">
        <div className="iot-hero-grid">
          <div>
            <p className="iot-kicker">Admin Module</p>
            <h1 className="iot-title">IoT Command Deck</h1>
            <p className="iot-subtitle">
              Watch device health live, trigger quick power actions, and turn repeatable moves into clean automations.
            </p>

            <div className="iot-chip-row">
              <span className="iot-chip">
                <Cpu className="h-3.5 w-3.5" />
                {pageStatus}
              </span>
              <span className="iot-chip">
                <ShieldCheck className="h-3.5 w-3.5" />
                Base: {baseUrl || "-"}
              </span>
              <span className="iot-chip">
                <Cpu className="h-3.5 w-3.5" />
                Project: {projectCode || "Not set"}
              </span>
              <span className="iot-chip">
                <CalendarClock className="h-3.5 w-3.5" />
                {automationSummary.enabled} active automations
              </span>
            </div>
          </div>

          <div className="iot-hero-side">
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshingAll || loading}
              className="iot-refresh"
            >
              {refreshingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              {refreshingAll ? "Syncing" : "Refresh All"}
            </button>

            <div className="iot-telemetry-grid">
              <div className="telemetry-card">
                <span>Online</span>
                <strong>{summary.online}</strong>
              </div>
              <div className="telemetry-card">
                <span>Offline</span>
                <strong>{summary.offline}</strong>
              </div>
              <div className="telemetry-card">
                <span>Unknown</span>
                <strong>{summary.unknown}</strong>
              </div>
              <div className="telemetry-card">
                <span>Signals</span>
                <strong>{summary.signalCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {globalError ? (
        <div className="iot-alert iot-alert-danger animate-rise">
          <AlertTriangle className="h-4 w-4" />
          <span>{globalError}</span>
        </div>
      ) : null}

      {globalMessage ? (
        <div className="iot-alert iot-alert-warn animate-rise">
          <Zap className="h-4 w-4" />
          <span>{globalMessage}</span>
        </div>
      ) : null}

      {automationMessage ? (
        <div className="iot-alert iot-alert-info animate-rise">
          <CheckCircle2 className="h-4 w-4" />
          <span>{automationMessage}</span>
        </div>
      ) : null}

      {!hasKeys ? (
        <section className="iot-panel iot-missing animate-rise">
          <h2>Tuya keys missing</h2>
          <p>Add your new Tuya project settings to the website server environment before using IoT Control.</p>
          <div className="iot-alert-inline">
            Required server values: `TUYA_BASE_URL=https://openapi.tuyaeu.com`, `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`,
            `TUYA_PROJECT_CODE`, and `TUYA_DEVICE_IDS`.
          </div>
          {missingEnv.length > 0 ? (
            <div className="iot-alert-inline">Missing on server: {missingEnv.join(", ")}</div>
          ) : null}
        </section>
      ) : null}

      {hasKeys ? (
        <>
          <section className="iot-panel animate-rise">
            <header className="iot-automation-head">
              <div>
                <p className="iot-kicker">Cloud Setup</p>
                <h2 className="iot-automation-title">Website Tuya Project</h2>
                <p className="iot-automation-note">
                  This admin deck is connected through your website server environment, not hard-coded secrets.
                </p>
              </div>
            </header>

            <div className="iot-chip-row">
              <span className="iot-chip">
                <ShieldCheck className="h-3.5 w-3.5" />
                Base URL: {baseUrl || "https://openapi.tuyaeu.com"}
              </span>
              <span className="iot-chip">
                <Cpu className="h-3.5 w-3.5" />
                Project code: {projectCode || "Not set"}
              </span>
              <span className="iot-chip">
                <Zap className="h-3.5 w-3.5" />
                Configured device IDs: {configuredDeviceIdsCount}
              </span>
            </div>
          </section>

          <section className="iot-panel iot-automation animate-rise">
            <header className="iot-automation-head">
              <div>
                <p className="iot-kicker">Automation Lab</p>
                <h2 className="iot-automation-title">Create Device Automations</h2>
                <p className="iot-automation-note">
                  Build reusable command automations. Daily schedules execute 24/7 via secure server cron.
                </p>
                <p className="iot-automation-hint">
                  Trigger modes available: <strong>Manual run only</strong> and{" "}
                  <strong>Daily (24/7 server cron)</strong>.
                </p>
              </div>
              <button type="button" onClick={() => openAutomationComposer()} className="iot-create-btn">
                <Plus className="h-4 w-4" />
                New Automation
              </button>
            </header>

            <div className="iot-chip-row">
              <span className="iot-chip">
                <Clock3 className="h-3.5 w-3.5" />
                {automations.length} total
              </span>
              <span className="iot-chip">
                <ToggleRight className="h-3.5 w-3.5" />
                {automationSummary.enabled} enabled
              </span>
              <span className="iot-chip">
                <CalendarClock className="h-3.5 w-3.5" />
                {automationSummary.daily} daily schedules
              </span>
              <span className="iot-chip">
                <AlertTriangle className="h-3.5 w-3.5" />
                {automationSummary.failed} failed
              </span>
            </div>

            {automations.length === 0 ? (
              <div className="iot-automation-empty">
                <p>No automations yet. Create one from this panel or directly from any device control panel below.</p>
              </div>
            ) : (
              <div className="iot-automation-grid">
                {automations.map((automation) => (
                  <article key={automation.id} className="iot-automation-card">
                    <div className="iot-automation-row">
                      <div>
                        <h3>{automation.name}</h3>
                        <p>{automation.deviceName}</p>
                      </div>
                      <span className={`auto-status-pill ${automationStatusClass(automation.lastRunStatus)}`}>
                        {automation.lastRunStatus}
                      </span>
                    </div>

                    <div className="iot-automation-meta">
                      <span>Code: {automation.code}</span>
                      <span>Value: {automation.value ? "ON" : "OFF"}</span>
                      <span>
                        Trigger:{" "}
                        {automation.triggerType === "daily"
                          ? `${automation.dailyTime || "--:--"} (${automation.timezone || "UTC"})`
                          : "Manual"}
                      </span>
                      <span>Last run: {fmtDateTime(automation.lastRunAt)}</span>
                    </div>

                    <div className="iot-automation-actions">
                      <button type="button" onClick={() => toggleAutomationEnabled(automation)} className="iot-mini-btn">
                        {automation.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        {automation.enabled ? "Enabled" : "Disabled"}
                      </button>

                      <button type="button" onClick={() => openAutomationEditor(automation)} className="iot-mini-btn iot-ghost-btn">
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => void runAutomation(automation)}
                        disabled={runningAutomationId === automation.id}
                        className="iot-run-btn"
                      >
                        {runningAutomationId === automation.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {runningAutomationId === automation.id ? "Running" : "Run now"}
                      </button>

                      <button type="button" onClick={() => void deleteAutomation(automation)} className="iot-delete-btn">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>

                    {automation.lastRunNote ? <p className="iot-automation-note-line">{automation.lastRunNote}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="iot-device-grid">
            {loading ? (
              <article className="iot-panel iot-state-card">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading device matrix...</span>
              </article>
            ) : null}

            {!loading && devices.length === 0 ? (
              <article className="iot-panel iot-state-card">
                <AlertTriangle className="h-5 w-5" />
                <span>No devices returned. Add `TUYA_DEVICE_IDS` if cloud listing is restricted.</span>
              </article>
            ) : null}

            {devices.map((device, index) => {
              const suggestedCode = preferredCommandCode(device.status);
              const command = commandState[device.id] || { code: suggestedCode, value: true };
              const isBusy = Boolean(deviceBusy[device.id]);
              const isCommandBusy = Boolean(commandBusy[device.id]);
              const state = statusTone(device.online);
              const activeSignals = asBooleanCount(device.status);
              const primaryCode = command.code || suggestedCode;
              const primaryStatus =
                device.status.find((item) => item.code === primaryCode) ||
                device.status.find((item) => item.code === suggestedCode) ||
                null;
              const primaryValue = primaryStatus ? safeText(primaryStatus.value) : "Waiting";
              const switchCount = device.status.filter((item) => item.code.startsWith("switch_")).length;
              const deviceNumber = String(index + 1).padStart(2, "0");

              return (
                <article
                  key={device.id}
                  className="iot-panel iot-device-card animate-rise"
                  style={{ animationDelay: `${100 + index * 40}ms` }}
                >
                  <header className="iot-device-head">
                    <div className="iot-device-identity">
                      <div className="iot-device-orb">
                        <Cpu className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="iot-device-kicker">Connected Device {deviceNumber}</p>
                        <h2>{device.name}</h2>
                        <p className="iot-device-id">ID: {device.id}</p>
                      </div>
                    </div>

                    <div className="iot-head-actions">
                      <span className={`iot-state-pill ${state.className}`}>
                        {state.icon}
                        {state.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => void refreshOne(device.id)}
                        disabled={isBusy || isCommandBusy}
                        className="iot-mini-btn"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                        {isBusy ? "Syncing" : "Refresh"}
                      </button>
                    </div>
                  </header>

                  <div className="iot-device-spotlight">
                    <div className="iot-device-spotlight-copy">
                      <span>Ready datapoint</span>
                      <strong>{primaryCode || "Select a datapoint below"}</strong>
                      <p>
                        {primaryCode
                          ? `Live value: ${primaryValue}`
                          : "Choose the device datapoint you want to control, then apply it or save it as a routine."}
                      </p>
                    </div>

                    <div className="iot-device-spotlight-stats">
                      <div>
                        <span>Smart toggles</span>
                        <strong>{switchCount}</strong>
                      </div>
                      <div>
                        <span>Signals active</span>
                        <strong>{activeSignals}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="iot-inline-metrics">
                    <div>
                      <span>Last fetched</span>
                      <strong>{fmtTime(device.lastFetchedAt)}</strong>
                    </div>
                    <div>
                      <span>Live datapoints</span>
                      <strong>{device.status.length}</strong>
                    </div>
                    <div>
                      <span>Active signals</span>
                      <strong>{activeSignals}</strong>
                    </div>
                  </div>

                  <section className="iot-section">
                    <div className="iot-section-head">
                      <span>Live Signals</span>
                      <small>{device.status.length} datapoints</small>
                    </div>
                    {device.status.length === 0 ? (
                      <p className="iot-empty-status">No status items returned.</p>
                    ) : (
                      <ul className="iot-status-grid">
                        {device.status.map((item) => (
                          <li key={`${device.id}-${item.code}`} className={`iot-status-item ${statusValueTone(item.value)}`}>
                            <div className="iot-status-copy">
                              <span className="iot-code-chip">{item.code}</span>
                              <small>{typeof item.value === "boolean" ? "switch state" : "live value"}</small>
                            </div>
                            <span className="iot-value-chip">{safeText(item.value)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="iot-section iot-command-box">
                    <div className="iot-section-head">
                      <span>Quick Controls</span>
                      <small>{primaryCode ? `Ready for ${primaryCode}` : "Choose a datapoint"}</small>
                    </div>

                    <div className="iot-command-grid">
                      <div className="iot-control-field">
                        <label>Datapoint</label>
                        <input
                          list={`tuya-code-list-${device.id}`}
                          value={command.code}
                          onChange={(event) =>
                            setCommandState((current) => ({
                              ...current,
                              [device.id]: {
                                ...(current[device.id] || { code: "", value: true }),
                                code: event.target.value,
                              },
                            }))
                          }
                          placeholder="switch_1"
                          className="iot-input"
                        />
                        <datalist id={`tuya-code-list-${device.id}`}>
                          {device.status.map((item) => (
                            <option key={`${device.id}-${item.code}`} value={item.code} />
                          ))}
                        </datalist>
                      </div>

                      <div className="iot-toggle-wrap">
                        <label>Value</label>
                        <div className="iot-toggle">
                          <button
                            type="button"
                            onClick={() =>
                              setCommandState((current) => ({
                                ...current,
                                [device.id]: {
                                  ...(current[device.id] || { code: "", value: true }),
                                  value: true,
                                },
                              }))
                            }
                            className={command.value ? "is-active" : ""}
                          >
                            ON
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCommandState((current) => ({
                                ...current,
                                [device.id]: {
                                  ...(current[device.id] || { code: "", value: true }),
                                  value: false,
                                },
                              }))
                            }
                            className={!command.value ? "is-active" : ""}
                          >
                            OFF
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void sendCommand(device.id)}
                        disabled={isCommandBusy}
                        className="iot-send"
                      >
                        {isCommandBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {isCommandBusy ? "Applying" : "Apply Now"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openAutomationComposer({
                            deviceId: device.id,
                            code: command.code,
                            value: command.value,
                          })
                        }
                        className="iot-ghost-btn"
                      >
                        <Plus className="h-4 w-4" />
                        Save Routine
                      </button>
                    </div>
                  </section>

                  {device.error ? (
                    <div className="iot-alert-inline iot-alert-inline-danger">{device.error}</div>
                  ) : null}

                  {deviceAlerts[device.id] ? (
                    <div className="iot-alert-inline iot-alert-inline-info">
                      <CheckCircle2 className="h-4 w-4" />
                      {deviceAlerts[device.id]}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </>
      ) : null}

      {automationOpen && automationDraft ? (
        <div className="iot-modal-backdrop" role="dialog" aria-modal="true">
          <div className="iot-modal-panel">
            <div className="iot-modal-head">
              <div>
                <p className="iot-kicker">Automation Lab</p>
                <h3>{automationDraft.id ? "Edit IoT Automation" : "New IoT Automation"}</h3>
              </div>
              <button type="button" className="iot-mini-btn" onClick={closeAutomationComposer}>
                Close
              </button>
            </div>

            <div className="iot-modal-grid">
              <label className="iot-modal-field">
                Name
                <input
                  className="iot-input"
                  value={automationDraft.name}
                  onChange={(event) =>
                    setAutomationDraft((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Living Room Night Shutdown"
                />
              </label>

              <label className="iot-modal-field">
                Device
                <select
                  className="iot-input"
                  value={automationDraft.deviceId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const matched = devices.find((device) => device.id === nextId);
                    setAutomationDraft((current) =>
                      current
                        ? {
                            ...current,
                            deviceId: nextId,
                            deviceName: matched?.name || current.deviceName,
                          }
                        : current
                    );
                  }}
                >
                  <option value="">Select device</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="iot-modal-field">
                Command code
                <input
                  className="iot-input"
                  value={automationDraft.code}
                  onChange={(event) =>
                    setAutomationDraft((current) =>
                      current
                        ? {
                            ...current,
                            code: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="switch_1"
                />
              </label>

              <div className="iot-modal-field">
                Command value
                <div className="iot-toggle iot-modal-toggle">
                  <button
                    type="button"
                    className={automationDraft.value ? "is-active" : ""}
                    onClick={() =>
                      setAutomationDraft((current) =>
                        current
                          ? {
                              ...current,
                              value: true,
                            }
                          : current
                      )
                    }
                  >
                    ON
                  </button>
                  <button
                    type="button"
                    className={!automationDraft.value ? "is-active" : ""}
                    onClick={() =>
                      setAutomationDraft((current) =>
                        current
                          ? {
                              ...current,
                              value: false,
                            }
                          : current
                      )
                    }
                  >
                    OFF
                  </button>
                </div>
              </div>

              <label className="iot-modal-field">
                Trigger
                <select
                  className="iot-input"
                  value={automationDraft.triggerType}
                  onChange={(event) =>
                    setAutomationDraft((current) =>
                      current
                        ? {
                            ...current,
                            triggerType: event.target.value === "daily" ? "daily" : "manual",
                          }
                        : current
                    )
                  }
                >
                  <option value="manual">Manual run only</option>
                  <option value="daily">Daily (24/7 server cron)</option>
                </select>
              </label>

              {automationDraft.triggerType === "daily" ? (
                <>
                  <label className="iot-modal-field">
                    Daily time
                    <input
                      type="time"
                      className="iot-input"
                      value={automationDraft.dailyTime}
                      onChange={(event) =>
                        setAutomationDraft((current) =>
                          current
                            ? {
                                ...current,
                                dailyTime: event.target.value,
                              }
                            : current
                        )
                      }
                    />
                  </label>

                  <label className="iot-modal-field">
                    Timezone
                    <input
                      className="iot-input"
                      value={automationDraft.timezone}
                      onChange={(event) =>
                        setAutomationDraft((current) =>
                          current
                            ? {
                                ...current,
                                timezone: event.target.value,
                              }
                            : current
                        )
                      }
                    />
                  </label>
                </>
              ) : null}

              <label className="iot-modal-field">
                Enabled
                <select
                  className="iot-input"
                  value={automationDraft.enabled ? "1" : "0"}
                  onChange={(event) =>
                    setAutomationDraft((current) =>
                      current
                        ? {
                            ...current,
                            enabled: event.target.value === "1",
                          }
                        : current
                    )
                  }
                >
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </label>
            </div>

            <div className="iot-modal-actions">
              <button type="button" className="iot-ghost-btn" onClick={closeAutomationComposer}>
                Cancel
              </button>
              <button type="button" className="iot-send" disabled={savingAutomation} onClick={() => void saveAutomationDraft()}>
                {savingAutomation ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {savingAutomation ? "Saving" : automationDraft.id ? "Update Automation" : "Create Automation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .iot-deck {
          --iot-bg-1: #020617;
          --iot-bg-2: #03112a;
          --iot-bg-3: #082545;
          --iot-surface: rgba(7, 20, 40, 0.76);
          --iot-surface-strong: rgba(8, 24, 48, 0.9);
          --iot-border: rgba(148, 163, 184, 0.22);
          --iot-text: #e5edf9;
          --iot-muted: #9fb0ca;
          --iot-kicker: #67d7ff;
          --iot-chip-bg: rgba(15, 33, 66, 0.74);
          --iot-chip-border: rgba(125, 211, 252, 0.32);
          --iot-input-bg: rgba(4, 14, 33, 0.9);
          --iot-toggle-bg: rgba(7, 18, 36, 0.76);
          --iot-toggle-text: #c1d0e4;
          --iot-toggle-active-bg: linear-gradient(135deg, rgba(13, 148, 136, 0.88), rgba(5, 150, 105, 0.84));
          --iot-toggle-active-text: #ecfeff;
          --iot-success: #34d399;
          --iot-danger: #fb7185;
          --iot-warn: #fbbf24;
          position: relative;
          overflow: hidden;
          border-radius: 2rem;
          padding: clamp(0.85rem, 2vw, 1.4rem);
          background:
            radial-gradient(130% 90% at 80% -10%, rgba(56, 189, 248, 0.16), transparent 60%),
            linear-gradient(145deg, var(--iot-bg-1) 0%, var(--iot-bg-2) 48%, var(--iot-bg-3) 100%);
          color: var(--iot-text);
          isolation: isolate;
        }

        :global(.admin-root.admin-light) .iot-deck {
          --iot-bg-1: #ffffff;
          --iot-bg-2: #ffffff;
          --iot-bg-3: #ffffff;
          --iot-surface: rgba(255, 255, 255, 0.96);
          --iot-surface-strong: rgba(255, 255, 255, 0.98);
          --iot-border: rgba(34, 34, 34, 0.1);
          --iot-text: #222222;
          --iot-muted: #6a6a6a;
          --iot-kicker: #6a6a6a;
          --iot-chip-bg: rgba(255, 255, 255, 0.98);
          --iot-chip-border: rgba(34, 34, 34, 0.12);
          --iot-input-bg: rgba(255, 255, 255, 0.98);
          --iot-toggle-bg: rgba(255, 255, 255, 0.98);
          --iot-toggle-text: #222222;
          --iot-toggle-active-bg: #222222;
          --iot-toggle-active-text: #ffffff;
          --iot-success: #222222;
          --iot-danger: #222222;
          --iot-warn: #222222;
          background: #ffffff;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
        }

        :global(.admin-root.admin-light) .iot-glow,
        :global(.admin-root.admin-light) .iot-grid-pattern {
          display: none;
        }

        .iot-glow {
          position: absolute;
          pointer-events: none;
          border-radius: 999px;
          filter: blur(60px);
          z-index: 0;
        }

        .iot-glow-a {
          top: -80px;
          right: -120px;
          width: 320px;
          height: 320px;
          background: rgba(56, 189, 248, 0.3);
        }

        .iot-glow-b {
          bottom: -110px;
          left: -100px;
          width: 260px;
          height: 260px;
          background: rgba(45, 212, 191, 0.22);
        }

        .iot-grid-pattern {
          position: absolute;
          inset: 0;
          z-index: 0;
          opacity: 0.24;
          background-image: radial-gradient(rgba(148, 163, 184, 0.36) 0.8px, transparent 0.8px);
          background-size: 18px 18px;
        }

        .iot-panel {
          position: relative;
          z-index: 1;
          border: 1px solid var(--iot-border);
          border-radius: 1.55rem;
          background: linear-gradient(152deg, var(--iot-surface) 0%, var(--iot-surface-strong) 100%);
          backdrop-filter: blur(8px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 40px rgba(2, 6, 23, 0.32);
        }

        .iot-hero {
          padding: clamp(1rem, 3vw, 2rem);
          margin-bottom: 1rem;
        }

        .iot-hero-grid {
          display: grid;
          gap: 1.4rem;
          grid-template-columns: 1.2fr 0.8fr;
          align-items: stretch;
        }

        .iot-kicker {
          margin: 0;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.34em;
          font-weight: 700;
          color: var(--iot-kicker);
        }

        .iot-title {
          margin: 0.5rem 0 0;
          font-size: clamp(1.9rem, 4vw, 3.3rem);
          line-height: 1.05;
          letter-spacing: -0.02em;
          font-weight: 700;
          color: var(--iot-text);
        }

        .iot-subtitle {
          margin: 0.8rem 0 0;
          max-width: 62ch;
          color: var(--iot-muted);
          font-size: clamp(0.94rem, 1.55vw, 1.08rem);
        }

        .iot-chip-row {
          margin-top: 1rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .iot-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          border: 1px solid var(--iot-chip-border);
          background: var(--iot-chip-bg);
          color: var(--iot-text);
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0.42rem 0.72rem;
          border-radius: 999px;
        }

        .iot-hero-side {
          display: grid;
          gap: 0.8rem;
          align-content: start;
        }

        .iot-refresh {
          border: 1px solid rgba(56, 189, 248, 0.5);
          background: linear-gradient(135deg, rgba(7, 95, 162, 0.7), rgba(3, 67, 125, 0.82));
          color: #e0f2fe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          font-weight: 700;
          font-size: 0.9rem;
          border-radius: 999px;
          padding: 0.64rem 1rem;
          transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease;
        }

        :global(.admin-root.admin-light) .iot-refresh {
          border-color: rgba(34, 34, 34, 0.12);
          background: #222222;
          color: #ffffff;
        }

        .iot-refresh:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.12);
        }

        .iot-refresh:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        .iot-telemetry-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.55rem;
        }

        .telemetry-card {
          border: 1px solid var(--iot-border);
          border-radius: 1rem;
          background: rgba(4, 18, 38, 0.66);
          padding: 0.62rem 0.72rem;
        }

        :global(.admin-root.admin-light) .telemetry-card {
          background: rgba(255, 255, 255, 0.84);
        }

        .telemetry-card span {
          display: block;
          font-size: 0.68rem;
          letter-spacing: 0.17em;
          text-transform: uppercase;
          color: var(--iot-muted);
        }

        .telemetry-card strong {
          margin-top: 0.12rem;
          display: block;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--iot-text);
        }

        .iot-alert {
          position: relative;
          z-index: 1;
          margin-bottom: 0.72rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 0.95rem;
          border: 1px solid;
          padding: 0.68rem 0.85rem;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .iot-alert-danger {
          border-color: rgba(251, 113, 133, 0.45);
          background: rgba(127, 29, 29, 0.35);
          color: #fecdd3;
        }

        .iot-alert-warn {
          border-color: rgba(251, 191, 36, 0.5);
          background: rgba(120, 53, 15, 0.35);
          color: #fde68a;
        }

        .iot-alert-info {
          border-color: rgba(52, 211, 153, 0.42);
          background: rgba(6, 78, 59, 0.3);
          color: #bbf7d0;
        }

        :global(.admin-root.admin-light) .iot-alert-danger {
          background: rgba(255, 255, 255, 0.96);
          color: #222222;
        }

        :global(.admin-root.admin-light) .iot-alert-warn {
          background: rgba(255, 255, 255, 0.96);
          color: #222222;
        }

        :global(.admin-root.admin-light) .iot-alert-info {
          background: rgba(255, 255, 255, 0.96);
          color: #222222;
        }

        .iot-missing {
          margin-bottom: 0.8rem;
          padding: 1rem;
        }

        .iot-missing h2 {
          margin: 0;
          font-size: 1.1rem;
          color: var(--iot-text);
        }

        .iot-missing p {
          margin: 0.35rem 0 0;
          color: var(--iot-muted);
          font-size: 0.9rem;
        }

        .iot-alert-inline {
          margin-top: 0.65rem;
          border-radius: 0.8rem;
          border: 1px dashed rgba(251, 191, 36, 0.45);
          background: rgba(120, 53, 15, 0.22);
          color: #fde68a;
          padding: 0.55rem 0.7rem;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .iot-automation {
          padding: 1rem;
          margin-bottom: 0.95rem;
        }

        .iot-automation-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.8rem;
        }

        .iot-automation-title {
          margin: 0.4rem 0 0;
          font-size: clamp(1.1rem, 2vw, 1.45rem);
          color: var(--iot-text);
        }

        .iot-automation-note {
          margin: 0.38rem 0 0;
          font-size: 0.84rem;
          color: var(--iot-muted);
          max-width: 64ch;
        }

        .iot-automation-hint {
          margin: 0.45rem 0 0;
          font-size: 0.77rem;
          color: var(--iot-muted);
          letter-spacing: 0.04em;
        }

        .iot-automation-hint strong {
          color: var(--iot-text);
          font-weight: 700;
        }

        .iot-automation-empty {
          margin-top: 0.75rem;
          border: 1px dashed var(--iot-border);
          border-radius: 1rem;
          background: rgba(8, 21, 42, 0.56);
          padding: 0.9rem;
          color: var(--iot-muted);
          font-size: 0.88rem;
        }

        .iot-automation-grid {
          margin-top: 0.8rem;
          display: grid;
          gap: 0.65rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .iot-automation-card {
          border: 1px solid var(--iot-border);
          border-radius: 1rem;
          background: rgba(4, 16, 34, 0.74);
          padding: 0.78rem;
        }

        :global(.admin-root.admin-light) .iot-automation-card {
          background: rgba(255, 255, 255, 0.9);
        }

        .iot-automation-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .iot-automation-row h3 {
          margin: 0;
          color: var(--iot-text);
          font-size: 0.95rem;
          line-height: 1.2;
        }

        .iot-automation-row p {
          margin: 0.2rem 0 0;
          color: var(--iot-muted);
          font-size: 0.76rem;
        }

        .auto-status-pill {
          border-radius: 999px;
          border: 1px solid;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          padding: 0.22rem 0.55rem;
        }

        .auto-status-success {
          border-color: rgba(52, 211, 153, 0.45);
          background: rgba(6, 78, 59, 0.4);
          color: #86efac;
        }

        .auto-status-error {
          border-color: rgba(251, 113, 133, 0.45);
          background: rgba(127, 29, 29, 0.4);
          color: #fecdd3;
        }

        .auto-status-idle {
          border-color: rgba(148, 163, 184, 0.45);
          background: rgba(51, 65, 85, 0.38);
          color: #cbd5e1;
        }

        :global(.admin-root.admin-light) .auto-status-idle {
          background: rgba(255, 255, 255, 0.96);
          color: #222222;
        }

        :global(.admin-root.admin-light) .auto-status-success,
        :global(.admin-root.admin-light) .auto-status-error {
          background: rgba(255, 255, 255, 0.96);
          color: #222222;
        }

        .iot-automation-meta {
          margin-top: 0.56rem;
          display: grid;
          gap: 0.22rem;
        }

        .iot-automation-meta span {
          font-size: 0.75rem;
          color: var(--iot-muted);
        }

        .iot-automation-actions {
          margin-top: 0.62rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.44rem;
        }

        .iot-automation-note-line {
          margin: 0.55rem 0 0;
          padding-top: 0.5rem;
          border-top: 1px dashed var(--iot-border);
          font-size: 0.74rem;
          color: var(--iot-muted);
        }

        .iot-create-btn,
        .iot-run-btn,
        .iot-delete-btn,
        .iot-ghost-btn {
          border-radius: 0.78rem;
          border: 1px solid rgba(148, 163, 184, 0.42);
          background: rgba(7, 20, 39, 0.72);
          color: var(--iot-text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.5rem 0.72rem;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease;
        }

        .iot-create-btn {
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.75), rgba(2, 132, 199, 0.75));
          border-color: rgba(125, 211, 252, 0.5);
          color: #ecfeff;
        }

        .iot-run-btn {
          background: linear-gradient(135deg, rgba(14, 116, 144, 0.84), rgba(2, 132, 199, 0.82));
          border-color: rgba(125, 211, 252, 0.52);
          color: #ecfeff;
        }

        .iot-delete-btn {
          border-color: rgba(251, 113, 133, 0.45);
          color: #fecdd3;
          background: rgba(127, 29, 29, 0.35);
        }

        .iot-create-btn:hover:not(:disabled),
        .iot-run-btn:hover:not(:disabled),
        .iot-delete-btn:hover:not(:disabled),
        .iot-ghost-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        .iot-create-btn:disabled,
        .iot-run-btn:disabled,
        .iot-delete-btn:disabled,
        .iot-ghost-btn:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        :global(.admin-root.admin-light) .iot-create-btn,
        :global(.admin-root.admin-light) .iot-run-btn,
        :global(.admin-root.admin-light) .iot-delete-btn,
        :global(.admin-root.admin-light) .iot-ghost-btn {
          background: rgba(255, 255, 255, 0.98);
          color: #222222;
        }

        .iot-device-grid {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 0.9rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .iot-state-card {
          min-height: 96px;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 1rem;
          color: var(--iot-muted);
          font-weight: 600;
        }

        .iot-device-card {
          overflow: hidden;
          isolation: isolate;
          padding: 0.95rem;
        }

        .iot-device-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 120px;
          background:
            radial-gradient(circle at 12% 22%, rgba(45, 212, 191, 0.2), transparent 34%),
            radial-gradient(circle at 82% 18%, rgba(56, 189, 248, 0.22), transparent 36%);
          pointer-events: none;
          z-index: 0;
        }

        .iot-device-card > * {
          position: relative;
          z-index: 1;
        }

        .iot-device-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.8rem;
        }

        .iot-device-identity {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          min-width: 0;
        }

        .iot-device-orb {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          flex-shrink: 0;
          border-radius: 1rem;
          border: 1px solid rgba(125, 211, 252, 0.34);
          background: linear-gradient(145deg, rgba(15, 118, 110, 0.55), rgba(8, 47, 73, 0.88));
          color: #d1fae5;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        :global(.admin-root.admin-light) .iot-device-orb {
          background: rgba(255, 255, 255, 0.98);
          color: #222222;
        }

        .iot-device-kicker {
          margin: 0;
          color: var(--iot-kicker);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-size: 0.68rem;
          font-weight: 700;
        }

        .iot-device-head h2 {
          margin: 0.24rem 0 0;
          font-size: 1.32rem;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: var(--iot-text);
        }

        .iot-device-id {
          margin: 0.35rem 0 0;
          font-size: 0.78rem;
          color: var(--iot-muted);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .iot-head-actions {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          justify-content: flex-end;
        }

        .iot-device-spotlight {
          margin-top: 0.9rem;
          display: grid;
          gap: 0.75rem;
          grid-template-columns: minmax(0, 1.4fr) minmax(180px, 0.8fr);
          border: 1px solid rgba(125, 211, 252, 0.26);
          border-radius: 1.15rem;
          background:
            linear-gradient(145deg, rgba(7, 26, 48, 0.9), rgba(3, 12, 27, 0.84)),
            rgba(2, 6, 23, 0.4);
          padding: 0.88rem;
        }

        :global(.admin-root.admin-light) .iot-device-spotlight {
          border-color: rgba(34, 34, 34, 0.1);
          background: rgba(255, 255, 255, 0.98);
        }

        .iot-device-spotlight-copy span,
        .iot-device-spotlight-stats span {
          display: block;
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--iot-muted);
          font-weight: 700;
        }

        .iot-device-spotlight-copy strong {
          display: block;
          margin-top: 0.24rem;
          color: var(--iot-text);
          font-size: 1.04rem;
          line-height: 1.2;
        }

        .iot-device-spotlight-copy p {
          margin: 0.3rem 0 0;
          color: var(--iot-muted);
          font-size: 0.85rem;
        }

        .iot-device-spotlight-stats {
          display: grid;
          gap: 0.5rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .iot-device-spotlight-stats div {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 0.95rem;
          background: rgba(2, 6, 23, 0.28);
          padding: 0.68rem 0.72rem;
        }

        :global(.admin-root.admin-light) .iot-device-spotlight-stats div {
          background: rgba(255, 255, 255, 0.68);
        }

        .iot-device-spotlight-stats strong {
          display: block;
          margin-top: 0.22rem;
          color: var(--iot-text);
          font-size: 1.08rem;
        }

        .iot-state-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 999px;
          padding: 0.32rem 0.62rem;
          border: 1px solid;
          font-size: 0.74rem;
          font-weight: 700;
        }

        .state-online {
          color: #86efac;
          border-color: rgba(52, 211, 153, 0.42);
          background: rgba(6, 78, 59, 0.52);
        }

        .state-offline {
          color: #fecdd3;
          border-color: rgba(251, 113, 133, 0.42);
          background: rgba(127, 29, 29, 0.52);
        }

        .state-unknown {
          color: #bfdbfe;
          border-color: rgba(96, 165, 250, 0.42);
          background: rgba(30, 58, 138, 0.52);
        }

        :global(.admin-root.admin-light) .state-online {
          color: #222222;
          background: rgba(255, 255, 255, 0.98);
        }

        :global(.admin-root.admin-light) .state-offline {
          color: #222222;
          background: rgba(255, 255, 255, 0.98);
        }

        :global(.admin-root.admin-light) .state-unknown {
          color: #222222;
          background: rgba(255, 255, 255, 0.98);
        }

        .iot-mini-btn {
          border: 1px solid rgba(148, 163, 184, 0.42);
          background: rgba(2, 6, 23, 0.46);
          color: var(--iot-text);
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.34rem 0.62rem;
          font-size: 0.73rem;
          font-weight: 700;
        }

        :global(.admin-root.admin-light) .iot-mini-btn {
          background: rgba(255, 255, 255, 0.86);
          color: #0f1d34;
        }

        .iot-mini-btn:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        .iot-inline-metrics {
          margin-top: 0.85rem;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.48rem;
        }

        .iot-inline-metrics div {
          border: 1px solid var(--iot-border);
          border-radius: 0.9rem;
          background: rgba(7, 18, 35, 0.56);
          padding: 0.5rem 0.6rem;
        }

        :global(.admin-root.admin-light) .iot-inline-metrics div {
          background: rgba(255, 255, 255, 0.88);
        }

        .iot-inline-metrics span {
          display: block;
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--iot-muted);
        }

        .iot-inline-metrics strong {
          margin-top: 0.2rem;
          display: block;
          color: var(--iot-text);
          font-size: 0.9rem;
        }

        .iot-section {
          margin-top: 0.8rem;
          border: 1px solid var(--iot-border);
          border-radius: 1rem;
          background: rgba(3, 12, 27, 0.7);
          padding: 0.75rem;
        }

        :global(.admin-root.admin-light) .iot-section {
          background: rgba(255, 255, 255, 0.88);
        }

        .iot-section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.6rem;
          margin-bottom: 0.6rem;
        }

        .iot-section-head span {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: var(--iot-kicker);
          font-weight: 700;
        }

        .iot-section-head small {
          font-size: 0.68rem;
          color: var(--iot-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .iot-empty-status {
          margin: 0;
          font-size: 0.84rem;
          color: var(--iot-muted);
        }

        .iot-status-grid {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.45rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .iot-status-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.55rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 0.95rem;
          background: rgba(7, 18, 35, 0.52);
          padding: 0.58rem 0.62rem;
        }

        :global(.admin-root.admin-light) .iot-status-item {
          background: rgba(248, 250, 252, 0.94);
        }

        .iot-status-copy {
          min-width: 0;
        }

        .iot-status-copy small {
          display: block;
          margin-top: 0.24rem;
          color: var(--iot-muted);
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .iot-code-chip {
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.36);
          background: rgba(7, 34, 66, 0.72);
          color: #bae6fd;
          padding: 0.26rem 0.62rem;
          font-size: 0.72rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .iot-value-chip {
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.36);
          background: rgba(10, 26, 51, 0.74);
          color: var(--iot-text);
          padding: 0.28rem 0.62rem;
          font-size: 0.76rem;
          font-weight: 700;
          max-width: min(60%, 360px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .iot-status-item.status-boolean-on {
          border-color: rgba(52, 211, 153, 0.3);
        }

        .iot-status-item.status-boolean-on .iot-value-chip {
          border-color: rgba(52, 211, 153, 0.36);
          background: rgba(6, 95, 70, 0.45);
          color: #d1fae5;
        }

        .iot-status-item.status-boolean-off {
          border-color: rgba(251, 113, 133, 0.28);
        }

        .iot-status-item.status-boolean-off .iot-value-chip {
          border-color: rgba(251, 113, 133, 0.36);
          background: rgba(127, 29, 29, 0.35);
          color: #fecdd3;
        }

        .iot-status-item.status-number .iot-value-chip {
          border-color: rgba(125, 211, 252, 0.36);
          background: rgba(8, 47, 73, 0.48);
          color: #bae6fd;
        }

        .iot-status-item.status-text .iot-value-chip {
          border-color: rgba(251, 191, 36, 0.34);
          background: rgba(120, 53, 15, 0.34);
          color: #fde68a;
        }

        :global(.admin-root.admin-light) .iot-code-chip {
          background: rgba(224, 242, 254, 0.72);
          color: #0c4a6e;
        }

        :global(.admin-root.admin-light) .iot-value-chip {
          background: rgba(248, 250, 252, 0.95);
        }

        :global(.admin-root.admin-light) .iot-status-item.status-boolean-on .iot-value-chip {
          background: rgba(209, 250, 229, 0.95);
          color: #047857;
        }

        :global(.admin-root.admin-light) .iot-status-item.status-boolean-off .iot-value-chip {
          background: rgba(254, 226, 226, 0.95);
          color: #be123c;
        }

        :global(.admin-root.admin-light) .iot-status-item.status-number .iot-value-chip {
          background: rgba(224, 242, 254, 0.95);
          color: #0369a1;
        }

        :global(.admin-root.admin-light) .iot-status-item.status-text .iot-value-chip {
          background: rgba(254, 243, 199, 0.95);
          color: #92400e;
        }

        .iot-command-box {
          border-color: rgba(56, 189, 248, 0.38);
          background: linear-gradient(145deg, rgba(6, 26, 50, 0.9), rgba(4, 18, 36, 0.85));
        }

        :global(.admin-root.admin-light) .iot-command-box {
          background: linear-gradient(145deg, rgba(236, 246, 255, 0.9), rgba(255, 255, 255, 0.93));
        }

        .iot-command-grid {
          display: grid;
          gap: 0.64rem;
          grid-template-columns: minmax(0, 1.35fr) auto auto auto;
          align-items: end;
        }

        .iot-control-field label,
        .iot-toggle-wrap label {
          display: block;
          font-size: 0.7rem;
          color: var(--iot-muted);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 0.32rem;
          font-weight: 700;
        }

        .iot-input {
          width: 100%;
          border-radius: 0.85rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: var(--iot-input-bg);
          color: var(--iot-text);
          font-size: 0.88rem;
          padding: 0.58rem 0.7rem;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .iot-input:focus {
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
        }

        .iot-toggle {
          display: inline-flex;
          border-radius: 0.8rem;
          border: 1px solid rgba(148, 163, 184, 0.38);
          overflow: hidden;
        }

        .iot-toggle button {
          border: 0;
          background: var(--iot-toggle-bg);
          color: var(--iot-toggle-text);
          min-width: 54px;
          padding: 0.55rem 0.72rem;
          font-size: 0.78rem;
          font-weight: 700;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .iot-toggle button.is-active {
          background: var(--iot-toggle-active-bg);
          color: var(--iot-toggle-active-text);
        }

        .iot-send {
          border: 1px solid rgba(125, 211, 252, 0.52);
          background: linear-gradient(135deg, rgba(14, 116, 144, 0.84), rgba(2, 132, 199, 0.82));
          color: #ecfeff;
          border-radius: 0.85rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          font-weight: 700;
          font-size: 0.83rem;
          min-height: 42px;
          min-width: 138px;
          padding: 0 0.9rem;
          transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease;
        }

        .iot-send:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.08);
        }

        .iot-send:disabled {
          opacity: 0.64;
          cursor: not-allowed;
        }

        .iot-alert-inline-danger {
          border-color: rgba(251, 113, 133, 0.42);
          background: rgba(127, 29, 29, 0.3);
          color: #fecdd3;
        }

        .iot-alert-inline-info {
          border-style: solid;
          border-color: rgba(52, 211, 153, 0.35);
          background: rgba(6, 78, 59, 0.28);
          color: #bbf7d0;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        :global(.admin-root.admin-light) .iot-alert-inline-danger {
          background: rgba(254, 226, 226, 0.78);
          color: #be123c;
        }

        :global(.admin-root.admin-light) .iot-alert-inline-info {
          background: rgba(220, 252, 231, 0.78);
          color: #047857;
        }

        .iot-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          background: rgba(2, 6, 23, 0.62);
          backdrop-filter: blur(4px);
          padding: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .iot-modal-panel {
          width: min(760px, 96vw);
          border-radius: 1.2rem;
          border: 1px solid var(--iot-border);
          background: linear-gradient(150deg, rgba(6, 19, 37, 0.96), rgba(5, 14, 29, 0.94));
          box-shadow: 0 20px 50px rgba(2, 6, 23, 0.55);
          padding: 1rem;
          max-height: 92vh;
          overflow: auto;
        }

        :global(.admin-root.admin-light) .iot-modal-panel {
          background: linear-gradient(150deg, rgba(245, 250, 255, 0.98), rgba(255, 255, 255, 0.96));
        }

        .iot-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.8rem;
          margin-bottom: 0.8rem;
        }

        .iot-modal-head h3 {
          margin: 0.35rem 0 0;
          font-size: 1.18rem;
          color: var(--iot-text);
        }

        .iot-modal-grid {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .iot-modal-field {
          display: grid;
          gap: 0.34rem;
          font-size: 0.74rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--iot-muted);
          font-weight: 700;
        }

        .iot-modal-toggle {
          margin-top: 0.1rem;
        }

        .iot-modal-actions {
          margin-top: 0.9rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.55rem;
        }

        .animate-rise {
          animation: riseIn 0.55s ease both;
        }

        @keyframes riseIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 1220px) {
          .iot-automation-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 1100px) {
          .iot-hero-grid,
          .iot-device-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 900px) {
          .iot-modal-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .iot-deck {
            border-radius: 1.25rem;
            padding: 0.65rem;
          }

          .iot-title {
            font-size: clamp(1.55rem, 8vw, 2.2rem);
          }

          .iot-hero {
            padding: 0.85rem;
          }

          .iot-device-head,
          .iot-head-actions {
            flex-direction: column;
            align-items: flex-start;
          }

          .iot-inline-metrics {
            grid-template-columns: 1fr;
          }

          .iot-status-grid,
          .iot-device-spotlight {
            grid-template-columns: 1fr;
          }

          .iot-command-grid {
            grid-template-columns: 1fr;
          }

          .iot-send,
          .iot-ghost-btn,
          .iot-run-btn,
          .iot-delete-btn,
          .iot-create-btn {
            width: 100%;
          }

          .iot-automation-head {
            flex-direction: column;
          }

          .iot-telemetry-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .iot-automation-actions {
            flex-direction: column;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-rise,
          .iot-refresh,
          .iot-send,
          .iot-run-btn,
          .iot-create-btn,
          .iot-delete-btn,
          .iot-ghost-btn {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
