"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function fmtTime(iso: string) {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "-";
  return time.toLocaleString();
}

function onlineTone(online: boolean | null) {
  if (online === true) return "border-emerald-300 bg-emerald-100 text-emerald-700";
  if (online === false) return "border-rose-300 bg-rose-100 text-rose-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

export default function IotControlCenterPage() {
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [hasKeys, setHasKeys] = useState<boolean>(false);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [globalError, setGlobalError] = useState<string>("");
  const [globalMessage, setGlobalMessage] = useState<string>("");
  const [deviceBusy, setDeviceBusy] = useState<Record<string, boolean>>({});
  const [deviceAlerts, setDeviceAlerts] = useState<Record<string, string>>({});
  const [commandState, setCommandState] = useState<Record<string, CommandState>>({});
  const [commandBusy, setCommandBusy] = useState<Record<string, boolean>>({});

  const updateCommandDefaults = useCallback((items: DeviceItem[]) => {
    setCommandState((current) => {
      const next = { ...current };
      for (const device of items) {
        const suggestedCode =
          device.status.find((item) => item.code.startsWith("switch_"))?.code ||
          device.status[0]?.code ||
          "";

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
      const data = (await response.json()) as {
        ok?: boolean;
        hasKeys?: boolean;
        baseUrl?: string;
        missingEnv?: string[];
      };
      setHasKeys(Boolean(data.hasKeys));
      setBaseUrl(typeof data.baseUrl === "string" ? data.baseUrl : "");
      setMissingEnv(Array.isArray(data.missingEnv) ? data.missingEnv : []);
      return Boolean(data.hasKeys);
    } catch {
      setHasKeys(false);
      setBaseUrl("");
      setMissingEnv([]);
      return false;
    }
  }, []);

  const loadDevices = useCallback(async (showSpinner = false) => {
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
  }, [updateCommandDefaults]);

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

  const refreshOne = async (deviceId: string) => {
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
      setDeviceAlerts((current) => ({ ...current, [deviceId]: "Status refreshed" }));
    } catch (error) {
      setDeviceAlerts((current) => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : "Refresh failed",
      }));
    } finally {
      setDeviceBusy((current) => ({ ...current, [deviceId]: false }));
    }
  };

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
        body: JSON.stringify({
          code: cmd.code.trim(),
          value: cmd.value,
        }),
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
        [deviceId]: payload.msg ? `Command sent (${payload.msg})` : "Command sent",
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

  const pageStatus = useMemo(() => {
    if (!hasKeys) return "Tuya keys missing";
    if (refreshingAll) return "Refreshing all devices...";
    if (loading) return "Loading devices...";
    return `${devices.length} device${devices.length === 1 ? "" : "s"} loaded`;
  }, [devices.length, hasKeys, loading, refreshingAll]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Admin Module</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">IoT Control Center</h1>
            <p className="mt-2 text-sm text-slate-600">
              List Tuya devices, inspect live status codes, and test commands securely from server-side APIs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshingAll || loading}
            className="inline-flex items-center rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshingAll ? "Refreshing..." : "Refresh All"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
            {pageStatus}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">
            Base URL: {baseUrl || "-"}
          </span>
        </div>
      </section>

      {globalError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {globalError}
        </div>
      ) : null}

      {globalMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {globalMessage}
        </div>
      ) : null}

      {!hasKeys ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Tuya keys missing. Add `TUYA_CLIENT_ID` and `TUYA_CLIENT_SECRET` to environment variables.
          {missingEnv.length > 0 ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Missing on server: {missingEnv.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasKeys ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Loading IoT devices...
            </div>
          ) : null}

          {!loading && devices.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No devices returned yet. If your Tuya project cannot list devices, set `TUYA_DEVICE_IDS`.
            </div>
          ) : null}

          {devices.map((device) => {
            const command = commandState[device.id] || { code: "", value: true };
            const isBusy = Boolean(deviceBusy[device.id]);
            const isCommandBusy = Boolean(commandBusy[device.id]);

            return (
              <article key={device.id} className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{device.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">ID: {device.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${onlineTone(device.online)}`}
                    >
                      {device.online === true ? "Online" : device.online === false ? "Offline" : "Unknown"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void refreshOne(device.id)}
                      disabled={isBusy || isCommandBusy}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">Last fetched: {fmtTime(device.lastFetchedAt)}</p>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Status</div>
                  {device.status.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No status items returned.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {device.status.map((item) => (
                        <li key={`${device.id}-${item.code}`} className="flex items-center justify-between gap-2">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700">
                            {item.code}
                          </span>
                          <span className="font-semibold text-slate-800">{safeText(item.value)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Command Tester</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Code</label>
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
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-0 focus:border-sky-400"
                      />
                      <datalist id={`tuya-code-list-${device.id}`}>
                        {device.status.map((item) => (
                          <option key={`${device.id}-${item.code}`} value={item.code} />
                        ))}
                      </datalist>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={command.value}
                        onChange={(event) =>
                          setCommandState((current) => ({
                            ...current,
                            [device.id]: {
                              ...(current[device.id] || { code: "", value: true }),
                              value: event.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4"
                      />
                      {command.value ? "true" : "false"}
                    </label>

                    <button
                      type="button"
                      onClick={() => void sendCommand(device.id)}
                      disabled={isCommandBusy}
                      className="rounded-xl border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCommandBusy ? "Sending..." : "Send Command"}
                    </button>
                  </div>
                </div>

                {device.error ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {device.error}
                  </div>
                ) : null}

                {deviceAlerts[device.id] ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {deviceAlerts[device.id]}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
