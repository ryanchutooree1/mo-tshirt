import { NextResponse } from "next/server";
import {
  getConfiguredDeviceIds,
  getDeviceDetail,
  getDeviceStatus,
  hasTuyaKeys,
  listDevicesFromCloud,
} from "../../../../lib/tuya";

export const runtime = "nodejs";

type SeedDevice = {
  id: string;
  name?: string;
  online?: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDeviceName(detail: unknown, fallbackId: string) {
  if (isRecord(detail)) {
    const nameCandidate = detail.name ?? detail.custom_name ?? detail.product_name;
    if (typeof nameCandidate === "string" && nameCandidate.trim()) {
      return nameCandidate.trim();
    }
  }

  return `Device ${fallbackId.slice(-6)}`;
}

function getOnline(detail: unknown, fallback: boolean | null) {
  if (isRecord(detail)) {
    if (typeof detail.online === "boolean") return detail.online;
    if (typeof detail.is_online === "boolean") return detail.is_online;
  }
  return fallback;
}

function dedupeDevices(items: SeedDevice[]) {
  const map = new Map<string, SeedDevice>();
  items.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Tuya error";
}

async function hydrateDevice(seed: SeedDevice) {
  let detail: Record<string, unknown> | null = null;
  let statusError: string | null = null;
  let detailError: string | null = null;

  if (!seed.name || typeof seed.online !== "boolean") {
    try {
      detail = await getDeviceDetail(seed.id);
    } catch (error) {
      detailError = toMessage(error);
    }
  }

  let status: Awaited<ReturnType<typeof getDeviceStatus>> = [];
  try {
    status = await getDeviceStatus(seed.id);
  } catch (error) {
    statusError = toMessage(error);
  }

  const name = seed.name || getDeviceName(detail, seed.id);
  const online = getOnline(detail, seed.online ?? null);

  return {
    id: seed.id,
    name,
    online,
    status,
    lastFetchedAt: new Date().toISOString(),
    error: [detailError, statusError].filter(Boolean).join(" | ") || null,
  };
}

export async function GET() {
  if (!hasTuyaKeys()) {
    return NextResponse.json({
      ok: true,
      hasKeys: false,
      message: "Tuya keys missing",
      devices: [],
    });
  }

  const knownIds = getConfiguredDeviceIds();
  let source: "cloud" | "env" = "cloud";
  let listError: string | null = null;

  let seeds: SeedDevice[] = [];

  try {
    const cloudDevices = await listDevicesFromCloud();
    seeds = cloudDevices.map((device) => ({
      id: device.id,
      name: device.name,
      online: device.online,
    }));
  } catch (error) {
    listError = toMessage(error);
  }

  if (seeds.length === 0 && knownIds.length > 0) {
    source = "env";
    seeds = knownIds.map((id) => ({ id }));
  }

  if (seeds.length === 0) {
    return NextResponse.json({
      ok: true,
      hasKeys: true,
      message: listError
        ? "Unable to list devices from Tuya Cloud API. Set TUYA_DEVICE_IDS as fallback."
        : "No Tuya devices found. Set TUYA_DEVICE_IDS to load known devices.",
      listError,
      devices: [],
    });
  }

  const uniqueSeeds = dedupeDevices(seeds);
  const devices = await Promise.all(uniqueSeeds.map((seed) => hydrateDevice(seed)));

  return NextResponse.json({
    ok: true,
    hasKeys: true,
    source,
    listError,
    devices,
  });
}
