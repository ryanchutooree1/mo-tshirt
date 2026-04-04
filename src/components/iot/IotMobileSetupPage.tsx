"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Link2,
  Loader2,
  PlugZap,
  Power,
  RefreshCcw,
  Router,
  ShieldAlert,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff,
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
  listError?: string | null;
  devices?: DeviceItem[];
};

type DeviceStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: StatusItem[];
  lastFetchedAt?: string;
};

type BlinkMode = "slow" | "fast";

type PowerCapability = {
  code: string;
  value: boolean | null;
};

const LINKED_DEVICES_STORAGE_KEY = "mo-tshirt-linked-tuya-devices";

function getPowerCapability(status: StatusItem[]): PowerCapability | null {
  const candidates = [
    status.find((item) => item.code === "switch_1" && typeof item.value === "boolean"),
    status.find((item) => item.code === "switch" && typeof item.value === "boolean"),
    status.find((item) => item.code.startsWith("switch_") && typeof item.value === "boolean"),
    status.find((item) => typeof item.value === "boolean"),
  ].filter(Boolean) as StatusItem[];

  const match = candidates[0];
  if (!match) return null;

  return {
    code: match.code,
    value: typeof match.value === "boolean" ? match.value : null,
  };
}

function hasBreakerLikeName(name: string) {
  const value = name.toLowerCase();
  return (
    value.includes("breaker") ||
    value.includes("switch") ||
    value.includes("power") ||
    value.includes("relay")
  );
}

function sortDevices(items: DeviceItem[]) {
  return [...items].sort((left, right) => {
    const leftPower = getPowerCapability(left.status) ? 1 : 0;
    const rightPower = getPowerCapability(right.status) ? 1 : 0;
    if (leftPower !== rightPower) return rightPower - leftPower;

    const leftBreaker = hasBreakerLikeName(left.name) ? 1 : 0;
    const rightBreaker = hasBreakerLikeName(right.name) ? 1 : 0;
    if (leftBreaker !== rightBreaker) return rightBreaker - leftBreaker;

    return left.name.localeCompare(right.name);
  });
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not yet synced";
  return parsed.toLocaleString();
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export default function IotMobileSetupPage() {
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [blinkMode, setBlinkMode] = useState<BlinkMode | null>(null);

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [deviceMessage, setDeviceMessage] = useState("");
  const [lastScanAt, setLastScanAt] = useState("");

  const [commandBusy, setCommandBusy] = useState<Record<string, boolean>>({});
  const [deviceBusy, setDeviceBusy] = useState<Record<string, boolean>>({});
  const [deviceFeedback, setDeviceFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storageAvailable()) return;

    const raw = window.localStorage.getItem(LINKED_DEVICES_STORAGE_KEY);
    if (!raw) {
      void loadDevices(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setLinkedIds(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
      }
    } catch {
      window.localStorage.removeItem(LINKED_DEVICES_STORAGE_KEY);
    }

    void loadDevices(true);
  }, []);

  const linkedDevices = useMemo(
    () => devices.filter((device) => linkedIds.includes(device.id)),
    [devices, linkedIds]
  );

  const availableDevices = useMemo(
    () => devices.filter((device) => !linkedIds.includes(device.id)),
    [devices, linkedIds]
  );

  const stepState = {
    category: true,
    wifi: Boolean(wifiName.trim() && wifiPassword.trim()),
    reset: Boolean(blinkMode),
    linked: linkedIds.length > 0,
  };

  function persistLinkedIds(next: string[]) {
    setLinkedIds(next);

    if (!storageAvailable()) return;
    window.localStorage.setItem(LINKED_DEVICES_STORAGE_KEY, JSON.stringify(next));
  }

  async function loadDevices(quiet = false) {
    if (!quiet) {
      setDeviceError("");
      setDeviceMessage("");
    }

    setLoadingDevices(true);

    try {
      const response = await fetch("/api/tuya/devices", { cache: "no-store" });
      const payload = (await response.json()) as DevicesResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || payload.listError || "Failed to load Tuya devices.");
      }

      setHasKeys(Boolean(payload.hasKeys));

      if (!payload.hasKeys) {
        setDevices([]);
        setDeviceError(payload.message || "Tuya keys are missing on the server.");
        return;
      }

      const nextDevices = sortDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setDevices(nextDevices);
      setLastScanAt(new Date().toISOString());
      setDeviceMessage(
        nextDevices.length > 0
          ? `Found ${nextDevices.length} Tuya device${nextDevices.length === 1 ? "" : "s"}. Link the breaker you want to control.`
          : payload.message || "No Tuya devices are visible yet."
      );

      if (payload.listError && nextDevices.length > 0) {
        setDeviceMessage(`Loaded devices with a partial cloud response. ${payload.listError}`);
      }
    } catch (error) {
      setHasKeys(false);
      setDevices([]);
      setDeviceError(error instanceof Error ? error.message : "Failed to load Tuya devices.");
    } finally {
      setLoadingDevices(false);
    }
  }

  async function refreshDevice(deviceId: string) {
    setDeviceBusy((current) => ({ ...current, [deviceId]: true }));
    setDeviceFeedback((current) => ({ ...current, [deviceId]: "" }));

    try {
      const response = await fetch(`/api/tuya/device/${encodeURIComponent(deviceId)}/status`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as DeviceStatusResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Failed to refresh device status.");
      }

      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                status: Array.isArray(payload.status) ? payload.status : device.status,
                lastFetchedAt: payload.lastFetchedAt || new Date().toISOString(),
                error: null,
              }
            : device
        )
      );

      setDeviceFeedback((current) => ({ ...current, [deviceId]: "Status refreshed." }));
    } catch (error) {
      setDeviceFeedback((current) => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : "Status refresh failed.",
      }));
    } finally {
      setDeviceBusy((current) => ({ ...current, [deviceId]: false }));
    }
  }

  async function toggleDevice(device: DeviceItem) {
    const power = getPowerCapability(device.status);
    if (!power?.code) {
      setDeviceFeedback((current) => ({
        ...current,
        [device.id]: "No boolean switch datapoint was found for this device.",
      }));
      return;
    }

    const nextValue = !(power.value === true);
    setCommandBusy((current) => ({ ...current, [device.id]: true }));
    setDeviceFeedback((current) => ({ ...current, [device.id]: "" }));

    try {
      const response = await fetch(`/api/tuya/device/${encodeURIComponent(device.id)}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: power.code,
          value: nextValue,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; msg?: string };

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Failed to send the command.");
      }

      setDeviceFeedback((current) => ({
        ...current,
        [device.id]: nextValue ? "Breaker turned on." : "Breaker turned off.",
      }));
      await refreshDevice(device.id);
    } catch (error) {
      setDeviceFeedback((current) => ({
        ...current,
        [device.id]: error instanceof Error ? error.message : "Command failed.",
      }));
    } finally {
      setCommandBusy((current) => ({ ...current, [device.id]: false }));
    }
  }

  function linkDevice(deviceId: string) {
    if (linkedIds.includes(deviceId)) return;
    persistLinkedIds([...linkedIds, deviceId]);
    setDeviceFeedback((current) => ({ ...current, [deviceId]: "Device linked to this app." }));
  }

  function unlinkDevice(deviceId: string) {
    persistLinkedIds(linkedIds.filter((id) => id !== deviceId));
    setDeviceFeedback((current) => ({ ...current, [deviceId]: "Device removed from this app." }));
  }

  return (
    <main className="iot-mobile-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-kicker">MO Smart Control</span>
          <h1>Set up a Tuya Wi-Fi breaker and switch it on or off.</h1>
          <p>
            This page gives your mobile app a clean breaker setup flow, then lets you link the breaker
            and control it with the Tuya cloud connection already configured on the server.
          </p>

          <div className="hero-checklist">
            <span className={stepState.category ? "done" : ""}>
              <CheckCircle2 className="h-4 w-4" />
              Breaker selected
            </span>
            <span className={stepState.wifi ? "done" : ""}>
              <CheckCircle2 className="h-4 w-4" />
              Wi-Fi entered
            </span>
            <span className={stepState.reset ? "done" : ""}>
              <CheckCircle2 className="h-4 w-4" />
              Reset confirmed
            </span>
            <span className={stepState.linked ? "done" : ""}>
              <CheckCircle2 className="h-4 w-4" />
              Device linked
            </span>
          </div>
        </div>

        <div className="hero-phone">
          <div className="phone-frame">
            <div className="phone-status">
              <span>21:19</span>
              <span>MO IOT</span>
            </div>
            <div className="phone-body">
              <div className="phone-chip">
                <PlugZap className="h-4 w-4" />
                Breaker (Wi-Fi)
              </div>
              <div className="phone-network">
                <Router className="h-5 w-5" />
                <div>
                  <strong>{wifiName.trim() || "Select 2.4 GHz Wi-Fi"}</strong>
                  <span>{wifiPassword ? "Password captured for this setup session" : "Password still needed"}</span>
                </div>
              </div>
              <div className="phone-reset">
                <div className={`phone-indicator ${blinkMode ? "is-active" : ""}`} />
                <div>
                  <strong>{blinkMode ? `Indicator blinking ${blinkMode}` : "Reset device"}</strong>
                  <span>Hold RESET for 5 seconds, then continue.</span>
                </div>
              </div>
              <div className="phone-footer">
                <span>Cloud scan</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="step-grid">
        <article className="step-card">
          <div className="step-head">
            <span className="step-number">01</span>
            <Smartphone className="h-5 w-5" />
          </div>
          <h2>Select Device</h2>
          <p>Start the pairing flow as a Wi-Fi breaker, matching the Tuya app category.</p>
          <button type="button" className="device-tile device-tile-active">
            <PlugZap className="h-5 w-5" />
            <div>
              <strong>Breaker (Wi-Fi)</strong>
              <span>Smart switch breaker for 2.4 GHz setup</span>
            </div>
          </button>
        </article>

        <article className="step-card">
          <div className="step-head">
            <span className="step-number">02</span>
            <Wifi className="h-5 w-5" />
          </div>
          <h2>Enter Wi-Fi</h2>
          <p>Use the same 2.4 GHz network that the breaker will join.</p>
          <label className="field">
            <span>Wi-Fi name</span>
            <input
              type="text"
              value={wifiName}
              onChange={(event) => setWifiName(event.target.value)}
              placeholder="Example: mo-tshirt.mu"
            />
          </label>
          <label className="field">
            <span>Wi-Fi password</span>
            <input
              type="password"
              value={wifiPassword}
              onChange={(event) => setWifiPassword(event.target.value)}
              placeholder="Enter the 2.4 GHz password"
            />
          </label>
          <small>The Wi-Fi fields stay in this browser session. The current web app does not provision Wi-Fi directly.</small>
        </article>

        <article className="step-card">
          <div className="step-head">
            <span className="step-number">03</span>
            <Unplug className="h-5 w-5" />
          </div>
          <h2>Reset The Breaker</h2>
          <p>Press and hold the breaker reset button for about 5 seconds until the indicator starts blinking.</p>
          <div className="blink-grid">
            <button
              type="button"
              className={`blink-tile ${blinkMode === "slow" ? "is-selected" : ""}`}
              onClick={() => setBlinkMode("slow")}
            >
              <CircleDot className="h-5 w-5" />
              <strong>Blink Slowly</strong>
              <span>Usually EZ mode</span>
            </button>
            <button
              type="button"
              className={`blink-tile ${blinkMode === "fast" ? "is-selected" : ""}`}
              onClick={() => setBlinkMode("fast")}
            >
              <CircleDot className="h-5 w-5" />
              <strong>Blink Quickly</strong>
              <span>Usually AP mode</span>
            </button>
          </div>
        </article>

        <article className="step-card">
          <div className="step-head">
            <span className="step-number">04</span>
            <RefreshCcw className="h-5 w-5" />
          </div>
          <h2>Scan & Link</h2>
          <p>Once the breaker is visible in your Tuya cloud project, bring it into this app and control it here.</p>
          <button type="button" className="primary-btn" onClick={() => void loadDevices()} disabled={loadingDevices}>
            {loadingDevices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Scan Tuya Devices
          </button>
          <small>
            Full native Wi-Fi provisioning still needs the Tuya mobile SDK. This page handles discovery,
            linking, and control through the existing cloud integration.
          </small>
        </article>
      </section>

      <section className="status-bar">
        <div>
          <strong>Tuya Cloud</strong>
          <span>
            {hasKeys === null && "Checking connection"}
            {hasKeys === true && "Connected"}
            {hasKeys === false && "Unavailable"}
          </span>
        </div>
        <div>
          <strong>Last scan</strong>
          <span>{lastScanAt ? formatDateTime(lastScanAt) : "Not yet scanned"}</span>
        </div>
      </section>

      {deviceError ? (
        <div className="notice notice-error">
          <ShieldAlert className="h-5 w-5" />
          <span>{deviceError}</span>
        </div>
      ) : null}

      {deviceMessage ? (
        <div className="notice notice-info">
          <Link2 className="h-5 w-5" />
          <span>{deviceMessage}</span>
        </div>
      ) : null}

      <section className="panel-section">
        <div className="section-head">
          <div>
            <span className="section-kicker">Linked Devices</span>
            <h2>Breakers already added to this app</h2>
          </div>
          <span className="pill">{linkedDevices.length} linked</span>
        </div>

        {linkedDevices.length === 0 ? (
          <div className="empty-card">
            <p>No breaker linked yet. Run a scan, then tap “Add to this app” on the correct Tuya device.</p>
          </div>
        ) : (
          <div className="device-grid">
            {linkedDevices.map((device) => {
              const power = getPowerCapability(device.status);
              const isOn = power?.value === true;
              const isOnline = device.online === true;

              return (
                <article key={device.id} className="device-card">
                  <div className="device-card-head">
                    <div>
                      <h3>{device.name}</h3>
                      <p>{device.id}</p>
                    </div>
                    <span className={`state-pill ${isOnline ? "online" : "offline"}`}>
                      {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>

                  <div className="device-meta">
                    <div>
                      <span>Power state</span>
                      <strong>{power ? (isOn ? "On" : "Off") : "No switch found"}</strong>
                    </div>
                    <div>
                      <span>Command code</span>
                      <strong>{power?.code || "Unavailable"}</strong>
                    </div>
                    <div>
                      <span>Last sync</span>
                      <strong>{formatDateTime(device.lastFetchedAt)}</strong>
                    </div>
                  </div>

                  <div className="device-actions">
                    <button
                      type="button"
                      className={`power-btn ${isOn ? "is-on" : ""}`}
                      onClick={() => void toggleDevice(device)}
                      disabled={Boolean(commandBusy[device.id]) || !power}
                    >
                      {commandBusy[device.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      {isOn ? "Turn Off" : "Turn On"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void refreshDevice(device.id)}
                      disabled={Boolean(deviceBusy[device.id])}
                    >
                      {deviceBusy[device.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Refresh
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => unlinkDevice(device.id)}>
                      Remove
                    </button>
                  </div>

                  {device.error ? <p className="device-note device-note-error">{device.error}</p> : null}
                  {deviceFeedback[device.id] ? <p className="device-note">{deviceFeedback[device.id]}</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-section">
        <div className="section-head">
          <div>
            <span className="section-kicker">Discovered Devices</span>
            <h2>Available Tuya devices you can link</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={() => void loadDevices()} disabled={loadingDevices}>
            {loadingDevices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh scan
          </button>
        </div>

        {availableDevices.length === 0 ? (
          <div className="empty-card">
            <p>
              {loadingDevices
                ? "Scanning Tuya cloud devices..."
                : "No unlinked Tuya devices are visible right now."}
            </p>
          </div>
        ) : (
          <div className="device-grid">
            {availableDevices.map((device) => {
              const power = getPowerCapability(device.status);
              const isBreaker = hasBreakerLikeName(device.name);

              return (
                <article key={device.id} className="device-card device-card-light">
                  <div className="device-card-head">
                    <div>
                      <h3>{device.name}</h3>
                      <p>{device.id}</p>
                    </div>
                    <span className={`state-pill ${device.online === true ? "online" : "offline"}`}>
                      {device.online === true ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                      {device.online === true ? "Online" : "Offline"}
                    </span>
                  </div>

                  <div className="device-tags">
                    <span className={isBreaker ? "tag tag-accent" : "tag"}>{isBreaker ? "Breaker-like" : "Tuya device"}</span>
                    <span className={power ? "tag tag-ok" : "tag"}>{power ? `Switch code: ${power.code}` : "No boolean switch found"}</span>
                  </div>

                  {device.error ? <p className="device-note device-note-error">{device.error}</p> : null}

                  <div className="device-actions">
                    <button type="button" className="primary-btn" onClick={() => linkDevice(device.id)}>
                      <Link2 className="h-4 w-4" />
                      Add to this app
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void refreshDevice(device.id)}
                      disabled={Boolean(deviceBusy[device.id])}
                    >
                      {deviceBusy[device.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Refresh
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        .iot-mobile-shell {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(255, 114, 53, 0.16), transparent 34%),
            radial-gradient(circle at top right, rgba(255, 208, 148, 0.22), transparent 28%),
            linear-gradient(180deg, #fff8f3 0%, #fffdf8 48%, #ffffff 100%);
          color: #1d1d1f;
          padding: 24px 16px 56px;
        }

        .hero-card,
        .step-card,
        .panel-section,
        .status-bar,
        .notice {
          max-width: 1180px;
          margin: 0 auto 18px;
          border: 1px solid rgba(29, 29, 31, 0.08);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 24px 60px rgba(243, 113, 33, 0.08);
          backdrop-filter: blur(18px);
        }

        .hero-card {
          border-radius: 32px;
          display: grid;
          gap: 24px;
          padding: 24px;
        }

        .hero-kicker,
        .section-kicker {
          display: inline-flex;
          align-items: center;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #ff6a21;
        }

        .hero-copy h1 {
          margin: 10px 0 12px;
          font-size: clamp(2rem, 5vw, 3.8rem);
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .hero-copy p {
          margin: 0;
          max-width: 720px;
          color: #58585f;
          font-size: 1rem;
        }

        .hero-checklist {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .hero-checklist span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          padding: 10px 14px;
          background: #fff5ee;
          color: #8f4d2d;
          font-size: 0.92rem;
          font-weight: 600;
        }

        .hero-checklist .done {
          background: rgba(20, 184, 116, 0.12);
          color: #126c49;
        }

        .hero-phone {
          display: flex;
          justify-content: center;
        }

        .phone-frame {
          width: min(100%, 340px);
          border-radius: 36px;
          background: linear-gradient(180deg, #191919 0%, #2b2b2f 100%);
          padding: 14px;
          box-shadow: 0 26px 50px rgba(22, 21, 19, 0.28);
        }

        .phone-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: rgba(255, 255, 255, 0.92);
          font-size: 0.78rem;
          padding: 4px 10px 12px;
        }

        .phone-body {
          border-radius: 26px;
          background: linear-gradient(180deg, #fffdfb 0%, #fff4eb 100%);
          padding: 20px;
        }

        .phone-chip,
        .phone-network,
        .phone-reset,
        .phone-footer {
          border-radius: 22px;
          background: #ffffff;
          border: 1px solid rgba(255, 106, 33, 0.08);
          box-shadow: 0 12px 24px rgba(255, 106, 33, 0.08);
        }

        .phone-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #ff6a21;
          font-weight: 700;
          padding: 10px 14px;
        }

        .phone-network,
        .phone-reset {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 14px;
          padding: 16px;
        }

        .phone-network span,
        .phone-reset span {
          display: block;
          color: #75757d;
          font-size: 0.86rem;
        }

        .phone-indicator {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #d6d6db;
          box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.75);
        }

        .phone-indicator.is-active {
          background: #ff7a28;
          box-shadow:
            0 0 0 10px rgba(255, 122, 40, 0.12),
            0 0 22px rgba(255, 122, 40, 0.38);
        }

        .phone-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
          padding: 14px 16px;
          color: #34343a;
          font-weight: 700;
        }

        .step-grid {
          display: grid;
          gap: 18px;
          max-width: 1180px;
          margin: 0 auto 18px;
        }

        .step-card {
          border-radius: 28px;
          padding: 22px;
        }

        .step-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          color: #ff6a21;
        }

        .step-number {
          font-size: 0.86rem;
          font-weight: 700;
          letter-spacing: 0.18em;
        }

        .step-card h2,
        .section-head h2 {
          margin: 0 0 6px;
          font-size: 1.36rem;
          line-height: 1.1;
          letter-spacing: -0.03em;
        }

        .step-card p,
        .empty-card p,
        .notice span {
          margin: 0;
          color: #616169;
        }

        .device-tile,
        .blink-tile,
        .field input,
        .primary-btn,
        .ghost-btn,
        .power-btn {
          border: 0;
          font: inherit;
        }

        .device-tile {
          margin-top: 16px;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 14px;
          border-radius: 24px;
          padding: 16px;
          text-align: left;
          background: linear-gradient(135deg, #fff0e5 0%, #ffffff 100%);
          border: 1px solid rgba(255, 106, 33, 0.14);
          color: #1d1d1f;
        }

        .device-tile span,
        .field span,
        .blink-tile span,
        .status-bar span,
        .device-card p,
        .device-meta span,
        .device-note,
        .step-card small {
          color: #6f6f77;
        }

        .device-tile strong,
        .blink-tile strong,
        .status-bar strong,
        .device-meta strong {
          display: block;
          color: #1d1d1f;
        }

        .device-tile-active {
          box-shadow: inset 0 0 0 1px rgba(255, 106, 33, 0.1);
        }

        .field {
          display: block;
          margin-top: 14px;
        }

        .field span {
          display: block;
          margin-bottom: 8px;
          font-size: 0.92rem;
          font-weight: 600;
        }

        .field input {
          width: 100%;
          border-radius: 18px;
          border: 1px solid rgba(29, 29, 31, 0.1);
          padding: 14px 16px;
          background: #fffdfb;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .field input:focus {
          border-color: rgba(255, 106, 33, 0.45);
          box-shadow: 0 0 0 4px rgba(255, 106, 33, 0.08);
        }

        .step-card small {
          display: block;
          margin-top: 12px;
        }

        .blink-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .blink-tile {
          border-radius: 22px;
          padding: 18px 14px;
          background: #fff8f2;
          border: 1px solid rgba(29, 29, 31, 0.06);
          text-align: left;
        }

        .blink-tile.is-selected {
          background: linear-gradient(180deg, rgba(255, 106, 33, 0.18), rgba(255, 255, 255, 0.98));
          border-color: rgba(255, 106, 33, 0.32);
          box-shadow: 0 16px 28px rgba(255, 106, 33, 0.12);
        }

        .primary-btn,
        .ghost-btn,
        .power-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 16px;
          padding: 14px 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
        }

        .primary-btn:hover,
        .ghost-btn:hover,
        .power-btn:hover {
          transform: translateY(-1px);
        }

        .primary-btn:disabled,
        .ghost-btn:disabled,
        .power-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .primary-btn {
          margin-top: 16px;
          width: 100%;
          background: linear-gradient(135deg, #ff5f20 0%, #ff8748 100%);
          color: #ffffff;
          box-shadow: 0 18px 34px rgba(255, 95, 32, 0.26);
        }

        .ghost-btn {
          background: #fff7f1;
          color: #5d361e;
        }

        .power-btn {
          flex: 1 1 180px;
          background: #151515;
          color: #ffffff;
        }

        .power-btn.is-on {
          background: linear-gradient(135deg, #0f9b6c 0%, #20bf8f 100%);
        }

        .status-bar {
          border-radius: 24px;
          display: grid;
          gap: 14px;
          padding: 16px 18px;
        }

        .status-bar > div {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .notice {
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
        }

        .notice-error {
          color: #962f2f;
          background: rgba(255, 235, 235, 0.96);
        }

        .notice-info {
          color: #734c29;
          background: rgba(255, 247, 239, 0.96);
        }

        .panel-section {
          border-radius: 28px;
          padding: 22px;
        }

        .section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .pill,
        .tag,
        .state-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.86rem;
          font-weight: 700;
        }

        .pill,
        .tag {
          background: #fff4eb;
          color: #8b4f2f;
        }

        .tag-ok {
          background: rgba(20, 184, 116, 0.12);
          color: #126c49;
        }

        .tag-accent {
          background: rgba(255, 106, 33, 0.12);
          color: #c45316;
        }

        .state-pill {
          background: #f3f3f5;
          color: #54545b;
        }

        .state-pill.online {
          background: rgba(20, 184, 116, 0.12);
          color: #126c49;
        }

        .device-grid {
          display: grid;
          gap: 16px;
        }

        .device-card,
        .empty-card {
          border-radius: 24px;
          background: linear-gradient(180deg, #fffaf5 0%, #ffffff 100%);
          border: 1px solid rgba(29, 29, 31, 0.08);
          padding: 18px;
        }

        .device-card-light {
          background: linear-gradient(180deg, #ffffff 0%, #fff8f1 100%);
        }

        .device-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .device-card-head h3 {
          margin: 0 0 4px;
          font-size: 1.08rem;
          letter-spacing: -0.02em;
        }

        .device-card-head p {
          margin: 0;
          word-break: break-all;
        }

        .device-meta {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }

        .device-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

        .device-note {
          margin: 14px 0 0;
          font-size: 0.94rem;
        }

        .device-note-error {
          color: #ab3f3f;
        }

        .device-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

        .empty-card {
          text-align: center;
        }

        @media (min-width: 900px) {
          .hero-card {
            grid-template-columns: minmax(0, 1.35fr) minmax(320px, 360px);
            align-items: center;
            padding: 32px;
          }

          .step-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .status-bar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .device-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .device-meta {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .iot-mobile-shell {
            padding-inline: 12px;
          }

          .hero-card,
          .step-card,
          .panel-section {
            border-radius: 24px;
            padding: 18px;
          }

          .blink-grid {
            grid-template-columns: 1fr;
          }

          .section-head,
          .device-card-head,
          .status-bar > div {
            flex-direction: column;
          }

          .pill,
          .state-pill {
            width: fit-content;
          }
        }
      `}</style>
    </main>
  );
}
