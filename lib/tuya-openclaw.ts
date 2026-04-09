import {
  getConfiguredDeviceIds,
  getDeviceDetail,
  getDeviceStatus,
  listDevicesFromCloud,
  sendDeviceCommand,
  type TuyaDeviceStatus,
} from "./tuya";

export type OpenClawPowerState = "on" | "off" | "toggle";

export type OpenClawTuyaRequest = {
  action?: unknown;
  power?: unknown;
  state?: unknown;
  code?: unknown;
  device?: unknown;
  deviceId?: unknown;
  deviceName?: unknown;
  message?: unknown;
  query?: unknown;
};

export class OpenClawTuyaError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "OpenClawTuyaError";
  }
}

type PowerDatapoint = {
  code: string;
  value: boolean;
};

type HydratedDevice = {
  id: string;
  name: string;
  online: boolean | null;
  status: TuyaDeviceStatus[];
  power: PowerDatapoint | null;
};

type DeviceCandidate = {
  id: string;
  name: string;
  online: boolean | null;
  hasPower: boolean;
  score: number;
};

const TURN_ON_PATTERNS = [
  /\bturn\s+on\b/i,
  /\bswitch\s+on\b/i,
  /\bpower\s+on\b/i,
  /\benable\b/i,
  /\bactivate\b/i,
  /^\s*on\s*$/i,
];

const TURN_OFF_PATTERNS = [
  /\bturn\s+off\b/i,
  /\bswitch\s+off\b/i,
  /\bpower\s+off\b/i,
  /\bdisable\b/i,
  /\bdeactivate\b/i,
  /^\s*off\s*$/i,
];

const TOGGLE_PATTERNS = [
  /\btoggle\b/i,
  /\bflip\b/i,
];

const ACTION_PREFIX_PATTERNS = [
  /\bturn\s+on\b/gi,
  /\bturn\s+off\b/gi,
  /\bswitch\s+on\b/gi,
  /\bswitch\s+off\b/gi,
  /\bpower\s+on\b/gi,
  /\bpower\s+off\b/gi,
  /\benable\b/gi,
  /\bdisable\b/gi,
  /\bactivate\b/gi,
  /\bdeactivate\b/gi,
  /\btoggle\b/gi,
  /\bflip\b/gi,
];

function toTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function looksLikeSwitchName(name: string) {
  const normalized = normalizeText(name);
  return (
    normalized.includes("light") ||
    normalized.includes("lamp") ||
    normalized.includes("switch") ||
    normalized.includes("breaker") ||
    normalized.includes("relay") ||
    normalized.includes("plug")
  );
}

function extractPowerDatapoint(status: TuyaDeviceStatus[]): PowerDatapoint | null {
  const preferred = [
    ...status.filter((item) => item.code === "switch_1"),
    ...status.filter((item) => item.code === "switch"),
    ...status.filter((item) => item.code.startsWith("switch_")),
    ...status,
  ];

  for (const item of preferred) {
    if (typeof item.value === "boolean") {
      return {
        code: item.code,
        value: item.value,
      };
    }
  }

  return null;
}

function parsePowerState(raw: string): OpenClawPowerState | null {
  if (!raw) return null;
  if (TOGGLE_PATTERNS.some((pattern) => pattern.test(raw))) return "toggle";
  if (TURN_ON_PATTERNS.some((pattern) => pattern.test(raw))) return "on";
  if (TURN_OFF_PATTERNS.some((pattern) => pattern.test(raw))) return "off";
  return null;
}

function cleanDeviceQuery(raw: string) {
  if (!raw) return "";

  let cleaned = raw;
  for (const pattern of ACTION_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = cleaned
    .replace(/\b(my|the|a|an|please)\b/gi, " ")
    .replace(/[^\w\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function resolveRequestedState(input: OpenClawTuyaRequest) {
  const explicit =
    toTrimmedString(input.action) ||
    toTrimmedString(input.power) ||
    toTrimmedString(input.state);
  const fromMessage =
    toTrimmedString(input.message) || toTrimmedString(input.query);

  return parsePowerState(explicit) || parsePowerState(fromMessage);
}

function resolveRequestedDevice(input: OpenClawTuyaRequest) {
  const explicitId = toTrimmedString(input.deviceId);
  if (explicitId) {
    return {
      deviceId: explicitId,
      query: "",
    };
  }

  const explicitQuery =
    toTrimmedString(input.device) ||
    toTrimmedString(input.deviceName);
  if (explicitQuery) {
    return {
      deviceId: "",
      query: explicitQuery,
    };
  }

  const fromMessage = toTrimmedString(input.message) || toTrimmedString(input.query);
  return {
    deviceId: "",
    query: cleanDeviceQuery(fromMessage),
  };
}

async function getSeedDevices() {
  try {
    const devices = await listDevicesFromCloud();
    if (devices.length > 0) {
      return devices.map((device) => ({
        id: device.id,
        name: device.name,
        online: device.online,
      }));
    }
  } catch {
    // Fallback to configured ids below.
  }

  return getConfiguredDeviceIds().map((id) => ({
    id,
    name: "",
    online: null,
  }));
}

async function hydrateDevice(seed: { id: string; name: string; online: boolean | null }) {
  let name = seed.name || "";
  let online = seed.online;

  if (!name || typeof online !== "boolean") {
    try {
      const detail = await getDeviceDetail(seed.id);
      const nameCandidate = detail?.name ?? detail?.custom_name ?? detail?.product_name;
      if (typeof nameCandidate === "string" && nameCandidate.trim()) {
        name = nameCandidate.trim();
      }

      if (typeof detail?.online === "boolean") {
        online = detail.online;
      } else if (typeof detail?.is_online === "boolean") {
        online = detail.is_online;
      }
    } catch {
      // Keep fallback values.
    }
  }

  const status = await getDeviceStatus(seed.id);
  return {
    id: seed.id,
    name: name || `Device ${seed.id.slice(-6)}`,
    online,
    status,
    power: extractPowerDatapoint(status),
  } satisfies HydratedDevice;
}

async function getHydratedDevices() {
  const seeds = await getSeedDevices();
  if (seeds.length === 0) {
    throw new OpenClawTuyaError(
      "No Tuya devices are configured. Add TUYA_DEVICE_IDS or connect devices in Tuya Cloud.",
      404
    );
  }

  return Promise.all(seeds.map((seed) => hydrateDevice(seed)));
}

function scoreDevice(device: HydratedDevice, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return device.power ? 10 : 0;
  }

  const normalizedName = normalizeText(device.name);
  const normalizedId = normalizeText(device.id);
  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const nameTokens = new Set(normalizedName.split(" ").filter(Boolean));

  if (normalizedId === normalizedQuery) return 500;
  if (normalizedName === normalizedQuery) return 300;
  if (normalizedName.includes(normalizedQuery)) return 220;

  let overlap = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0) return 0;

  let score = overlap * 40;
  if (device.power) score += 15;
  if (device.online === true) score += 5;
  if (looksLikeSwitchName(device.name)) score += 5;
  return score;
}

function toCandidate(device: HydratedDevice, score: number): DeviceCandidate {
  return {
    id: device.id,
    name: device.name,
    online: device.online,
    hasPower: Boolean(device.power),
    score,
  };
}

async function resolveTargetDevice(input: OpenClawTuyaRequest) {
  const requested = resolveRequestedDevice(input);
  const devices = await getHydratedDevices();

  if (requested.deviceId) {
    const match = devices.find((device) => device.id === requested.deviceId);
    if (!match) {
      throw new OpenClawTuyaError(`No Tuya device matched id "${requested.deviceId}".`, 404, {
        candidates: devices.map((device) => toCandidate(device, 0)),
      });
    }
    return match;
  }

  const powerCapable = devices.filter((device) => device.power);
  if (!requested.query) {
    if (powerCapable.length === 1) {
      return powerCapable[0];
    }

    throw new OpenClawTuyaError(
      "Multiple Tuya devices are available. Specify the device name or id.",
      400,
      {
        candidates: powerCapable.map((device) => toCandidate(device, 0)),
      }
    );
  }

  const scored = devices
    .map((device) => ({
      device,
      score: scoreDevice(device, requested.query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    throw new OpenClawTuyaError(`No Tuya device matched "${requested.query}".`, 404, {
      candidates: powerCapable.map((device) => toCandidate(device, 0)),
    });
  }

  const best = scored[0];
  const second = scored[1];
  if (second && second.score === best.score) {
    throw new OpenClawTuyaError(
      `The device match for "${requested.query}" is ambiguous.`,
      409,
      {
        candidates: scored.slice(0, 5).map((item) => toCandidate(item.device, item.score)),
      }
    );
  }

  return best.device;
}

export async function executeOpenClawTuyaPowerCommand(input: OpenClawTuyaRequest) {
  const requestedState = resolveRequestedState(input);
  if (!requestedState) {
    throw new OpenClawTuyaError(
      'A power action is required. Use "on", "off", or "toggle".',
      400
    );
  }

  const device = await resolveTargetDevice(input);
  const power = device.power;
  const codeOverride = toTrimmedString(input.code);

  if (!power && !codeOverride) {
    throw new OpenClawTuyaError(
      `Device "${device.name}" does not expose a boolean power datapoint.`,
      400
    );
  }

  const code = codeOverride || power!.code;
  const value =
    requestedState === "toggle"
      ? (() => {
          if (!power) {
            throw new OpenClawTuyaError(
              'Toggle requires a known boolean power datapoint. Pass "on" or "off" instead.',
              400
            );
          }
          return !power.value;
        })()
      : requestedState === "on";

  const result = await sendDeviceCommand(device.id, code, value);

  return {
    ok: true,
    message: value
      ? `Turned on ${device.name}.`
      : `Turned off ${device.name}.`,
    device: {
      id: device.id,
      name: device.name,
      online: device.online,
    },
    command: {
      requestedState,
      code,
      value,
    },
    tuya: {
      code: result.code ?? null,
      msg: result.msg ?? null,
      tid: result.tid ?? null,
      t: result.t ?? null,
      result: result.result ?? null,
    },
  };
}
