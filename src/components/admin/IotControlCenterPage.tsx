"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

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
  missingEnv?: string[];
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

function asBooleanCount(status: StatusItem[]) {
  return status.reduce((count, item) => {
    if (typeof item.value === "boolean" && item.value) return count + 1;
    return count;
  }, 0);
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
      const data = (await response.json()) as PingResponse;
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
      setDeviceAlerts((current) => ({ ...current, [deviceId]: "Live status synchronized." }));
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

  const pageStatus = useMemo(() => {
    if (!hasKeys) return "Tuya keys missing";
    if (refreshingAll) return "Refreshing all device nodes";
    if (loading) return "Booting command grid";
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
              Orchestrate Tuya devices in real time, inspect datapoints, and execute command tests through secure
              server-side control channels.
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

      {!hasKeys ? (
        <section className="iot-panel iot-missing animate-rise">
          <h2>Tuya keys missing</h2>
          <p>Add `TUYA_CLIENT_ID` and `TUYA_CLIENT_SECRET` to server environment variables.</p>
          {missingEnv.length > 0 ? (
            <div className="iot-alert-inline">Missing on server: {missingEnv.join(", ")}</div>
          ) : null}
        </section>
      ) : null}

      {hasKeys ? (
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
            const command = commandState[device.id] || { code: "", value: true };
            const isBusy = Boolean(deviceBusy[device.id]);
            const isCommandBusy = Boolean(commandBusy[device.id]);
            const state = statusTone(device.online);
            const activeSignals = asBooleanCount(device.status);

            return (
              <article
                key={device.id}
                className="iot-panel iot-device-card animate-rise"
                style={{ animationDelay: `${100 + index * 40}ms` }}
              >
                <header className="iot-device-head">
                  <div>
                    <p className="iot-device-kicker">Device Node {index + 1}</p>
                    <h2>{device.name}</h2>
                    <p className="iot-device-id">ID: {device.id}</p>
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

                <div className="iot-inline-metrics">
                  <div>
                    <span>Last fetched</span>
                    <strong>{fmtTime(device.lastFetchedAt)}</strong>
                  </div>
                  <div>
                    <span>Status codes</span>
                    <strong>{device.status.length}</strong>
                  </div>
                  <div>
                    <span>Active switches</span>
                    <strong>{activeSignals}</strong>
                  </div>
                </div>

                <section className="iot-section">
                  <div className="iot-section-head">
                    <span>Live Status Matrix</span>
                  </div>
                  {device.status.length === 0 ? (
                    <p className="iot-empty-status">No status items returned.</p>
                  ) : (
                    <ul className="iot-status-grid">
                      {device.status.map((item) => (
                        <li key={`${device.id}-${item.code}`} className="iot-status-item">
                          <span className="iot-code-chip">{item.code}</span>
                          <span className="iot-value-chip">{safeText(item.value)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="iot-section iot-command-box">
                  <div className="iot-section-head">
                    <span>Command Tester</span>
                    <small>discover correct DP code before automating</small>
                  </div>

                  <div className="iot-command-grid">
                    <div className="iot-control-field">
                      <label>Code</label>
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
                      {isCommandBusy ? "Sending" : "Send Command"}
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
          --iot-bg-1: #eef6ff;
          --iot-bg-2: #e4f0ff;
          --iot-bg-3: #f5f9ff;
          --iot-surface: rgba(255, 255, 255, 0.82);
          --iot-surface-strong: rgba(246, 251, 255, 0.94);
          --iot-border: rgba(51, 65, 85, 0.2);
          --iot-text: #0f1d34;
          --iot-muted: #41546f;
          --iot-kicker: #0c7cb2;
          --iot-chip-bg: rgba(238, 246, 255, 0.95);
          --iot-chip-border: rgba(56, 189, 248, 0.35);
          --iot-input-bg: rgba(255, 255, 255, 0.96);
          --iot-success: #059669;
          --iot-danger: #e11d48;
          --iot-warn: #b45309;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
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

        :global(.admin-root.admin-light) .iot-alert-danger {
          background: rgba(254, 226, 226, 0.78);
          color: #be123c;
        }

        :global(.admin-root.admin-light) .iot-alert-warn {
          background: rgba(254, 243, 199, 0.78);
          color: #92400e;
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
          padding: 0.95rem;
        }

        .iot-device-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.8rem;
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
          color: #047857;
          background: rgba(167, 243, 208, 0.7);
        }

        :global(.admin-root.admin-light) .state-offline {
          color: #be123c;
          background: rgba(254, 205, 211, 0.72);
        }

        :global(.admin-root.admin-light) .state-unknown {
          color: #1d4ed8;
          background: rgba(191, 219, 254, 0.72);
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
          background: rgba(7, 18, 35, 0.68);
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
        }

        .iot-status-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.55rem;
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

        :global(.admin-root.admin-light) .iot-code-chip {
          background: rgba(224, 242, 254, 0.72);
          color: #0c4a6e;
        }

        :global(.admin-root.admin-light) .iot-value-chip {
          background: rgba(248, 250, 252, 0.95);
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
          grid-template-columns: 1fr auto auto;
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
          background: rgba(7, 18, 36, 0.76);
          color: var(--iot-muted);
          min-width: 54px;
          padding: 0.55rem 0.72rem;
          font-size: 0.78rem;
          font-weight: 700;
          transition: background 0.2s ease, color 0.2s ease;
        }

        :global(.admin-root.admin-light) .iot-toggle button {
          background: rgba(241, 245, 249, 0.88);
        }

        .iot-toggle button.is-active {
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.88), rgba(5, 150, 105, 0.84));
          color: #ecfeff;
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

        @media (max-width: 1100px) {
          .iot-hero-grid {
            grid-template-columns: 1fr;
          }

          .iot-device-grid {
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

          .iot-inline-metrics {
            grid-template-columns: 1fr;
          }

          .iot-command-grid {
            grid-template-columns: 1fr;
          }

          .iot-send {
            width: 100%;
          }

          .iot-telemetry-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-rise,
          .iot-refresh,
          .iot-send {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
