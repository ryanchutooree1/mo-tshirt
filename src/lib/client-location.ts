export const MAURITIUS_DISTRICTS = [
  "Black River",
  "Flacq",
  "Grand Port",
  "Moka",
  "Pamplemousses",
  "Plaines Wilhems",
  "Port Louis",
  "Riviere du Rempart",
  "Savanne",
] as const;

export type MauritiusDistrict = (typeof MAURITIUS_DISTRICTS)[number];

export type ClientLocationSource = "manual" | "address" | "district" | "legacy";

export type ClientLocation = {
  district?: MauritiusDistrict | null;
  hotspotKey?: string | null;
  hotspotLabel?: string | null;
  x?: number | null;
  y?: number | null;
  notes?: string | null;
  source?: ClientLocationSource | null;
  updatedAt?: unknown;
};

export type MauritiusHotspot = {
  key: string;
  label: string;
  district: MauritiusDistrict;
  x: number;
  y: number;
  aliases: string[];
};

export type ResolvedClientLocation = {
  district: MauritiusDistrict;
  hotspotKey: string;
  hotspotLabel: string;
  x: number;
  y: number;
  notes?: string;
  source: ClientLocationSource;
  inferred: boolean;
};

export const MAURITIUS_HOTSPOTS: MauritiusHotspot[] = [
  {
    key: "grand-baie",
    label: "Grand Baie",
    district: "Riviere du Rempart",
    x: 60.5,
    y: 11.5,
    aliases: ["grand baie", "pereybere", "cap malheureux", "mont choisy"],
  },
  {
    key: "goodlands",
    label: "Goodlands",
    district: "Riviere du Rempart",
    x: 57.5,
    y: 18.5,
    aliases: ["goodlands", "mapou", "riviere du rempart", "rivière du rempart"],
  },
  {
    key: "triolet",
    label: "Triolet",
    district: "Pamplemousses",
    x: 49.5,
    y: 21.5,
    aliases: ["triolet", "pamplemousses", "arsenal", "terre rouge"],
  },
  {
    key: "port-louis",
    label: "Port Louis",
    district: "Port Louis",
    x: 41.5,
    y: 24.5,
    aliases: ["port louis", "caudan", "pailles", "cassis"],
  },
  {
    key: "moka-ebene",
    label: "Moka / Ebene",
    district: "Moka",
    x: 52.5,
    y: 31.5,
    aliases: ["moka", "ebene", "ébène", "telfair", "bagatelle", "saint pierre", "st pierre"],
  },
  {
    key: "beau-bassin",
    label: "Beau Bassin / Rose Hill",
    district: "Plaines Wilhems",
    x: 41,
    y: 35,
    aliases: ["beau bassin", "rose hill", "stanley", "coromandel"],
  },
  {
    key: "quatre-bornes",
    label: "Quatre Bornes",
    district: "Plaines Wilhems",
    x: 45,
    y: 40,
    aliases: ["quatre bornes", "sodnac", "palma"],
  },
  {
    key: "vacoas-phoenix",
    label: "Vacoas / Phoenix",
    district: "Plaines Wilhems",
    x: 50.5,
    y: 46.5,
    aliases: ["vacoas", "phoenix", "highlands", "la caverne"],
  },
  {
    key: "curepipe",
    label: "Curepipe",
    district: "Plaines Wilhems",
    x: 54,
    y: 56,
    aliases: ["curepipe", "floreal", "floréal", "forest side"],
  },
  {
    key: "bambous-tamarin",
    label: "Bambous / Tamarin",
    district: "Black River",
    x: 35.5,
    y: 46,
    aliases: ["bambous", "tamarin", "black river", "riviere noire", "rivière noire", "flic en flac", "cascavelle", "albion"],
  },
  {
    key: "flacq",
    label: "Centre de Flacq",
    district: "Flacq",
    x: 69,
    y: 45,
    aliases: ["flacq", "centre de flacq", "belle mare", "trou d eau douce", "poste de flacq"],
  },
  {
    key: "rose-belle",
    label: "Rose Belle",
    district: "Grand Port",
    x: 61,
    y: 63,
    aliases: ["rose belle", "new grove", "nouvelle france", "new grove", "rivière des anguiles"],
  },
  {
    key: "mahebourg",
    label: "Mahebourg",
    district: "Grand Port",
    x: 72,
    y: 74,
    aliases: ["mahebourg", "mahébourg", "blue bay", "plaine magnien", "grand port"],
  },
  {
    key: "surinam",
    label: "Surinam",
    district: "Savanne",
    x: 56,
    y: 79,
    aliases: ["surinam", "st aubin", "saint aubin"],
  },
  {
    key: "souillac",
    label: "Souillac",
    district: "Savanne",
    x: 49,
    y: 88,
    aliases: ["souillac", "chemin grenier", "savanne", "riambel", "bel ombre"],
  },
];

const DISTRICT_ALIASES: Record<MauritiusDistrict, string[]> = {
  "Black River": ["black river", "riviere noire", "rivière noire"],
  Flacq: ["flacq"],
  "Grand Port": ["grand port"],
  Moka: ["moka"],
  Pamplemousses: ["pamplemousses"],
  "Plaines Wilhems": ["plaines wilhems"],
  "Port Louis": ["port louis"],
  "Riviere du Rempart": ["riviere du rempart", "rivière du rempart", "rempart"],
  Savanne: ["savanne"],
};

const HOTSPOT_BY_KEY = new Map(MAURITIUS_HOTSPOTS.map((hotspot) => [hotspot.key, hotspot]));

const DISTRICT_CENTROIDS = Object.fromEntries(
  MAURITIUS_DISTRICTS.map((district) => {
    const entries = MAURITIUS_HOTSPOTS.filter((hotspot) => hotspot.district === district);
    const x = entries.reduce((sum, entry) => sum + entry.x, 0) / entries.length;
    const y = entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length;
    return [district, { x, y }];
  })
) as Record<MauritiusDistrict, { x: number; y: number }>;

function normalizeLookup(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampCoord(value: number | null) {
  if (typeof value !== "number") return null;
  return Math.min(92, Math.max(8, Math.round(value * 10) / 10));
}

export function isMauritiusDistrict(value: unknown): value is MauritiusDistrict {
  return typeof value === "string" && MAURITIUS_DISTRICTS.includes(value as MauritiusDistrict);
}

export function getHotspotByKey(key?: string | null) {
  if (!key) return null;
  return HOTSPOT_BY_KEY.get(key) || null;
}

export function findNearestHotspot(x: number, y: number) {
  let nearest: MauritiusHotspot | null = null;
  let best = Number.POSITIVE_INFINITY;

  for (const hotspot of MAURITIUS_HOTSPOTS) {
    const distance = Math.hypot(hotspot.x - x, hotspot.y - y);
    if (distance < best) {
      best = distance;
      nearest = hotspot;
    }
  }

  return nearest;
}

export function getDistrictCentroid(district?: MauritiusDistrict | null) {
  if (!district) return null;
  return DISTRICT_CENTROIDS[district] || null;
}

export function createLocationFromHotspot(
  hotspot: MauritiusHotspot,
  source: ClientLocationSource,
  notes?: string
): ResolvedClientLocation {
  return {
    district: hotspot.district,
    hotspotKey: hotspot.key,
    hotspotLabel: hotspot.label,
    x: hotspot.x,
    y: hotspot.y,
    notes: notes?.trim() || undefined,
    source,
    inferred: source !== "manual",
  };
}

export function normalizeClientLocation(value: unknown): ClientLocation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const district = isMauritiusDistrict(raw.district) ? raw.district : null;
  const hotspotKey = cleanString(raw.hotspotKey);
  const hotspotLabel = cleanString(raw.hotspotLabel);
  const notes = cleanString(raw.notes);
  const source = cleanString(raw.source) as ClientLocationSource | "";
  const x = clampCoord(toNumber(raw.x));
  const y = clampCoord(toNumber(raw.y));

  if (!district && !hotspotKey && !hotspotLabel && x === null && y === null && !notes) {
    return null;
  }

  return {
    district,
    hotspotKey: hotspotKey || null,
    hotspotLabel: hotspotLabel || null,
    x,
    y,
    notes: notes || null,
    source: source || null,
    updatedAt: raw.updatedAt,
  };
}

export function inferLocationFromAddress(address?: string | null): ResolvedClientLocation | null {
  const lookup = normalizeLookup(address);
  if (!lookup) return null;

  for (const hotspot of MAURITIUS_HOTSPOTS) {
    if (hotspot.aliases.some((alias) => lookup.includes(normalizeLookup(alias)))) {
      return createLocationFromHotspot(hotspot, "address");
    }
  }

  for (const district of MAURITIUS_DISTRICTS) {
    if (DISTRICT_ALIASES[district].some((alias) => lookup.includes(normalizeLookup(alias)))) {
      const centroid = getDistrictCentroid(district);
      const fallback = MAURITIUS_HOTSPOTS.find((hotspot) => hotspot.district === district);
      if (!centroid || !fallback) return null;
      return {
        district,
        hotspotKey: fallback.key,
        hotspotLabel: `${district} Area`,
        x: centroid.x,
        y: centroid.y,
        source: "district",
        inferred: true,
      };
    }
  }

  return null;
}

export function resolveClientLocation(client: {
  customerAddress?: string | null;
  location?: ClientLocation | null;
}): ResolvedClientLocation | null {
  const manual = normalizeClientLocation(client.location);

  if (manual) {
    const preset = getHotspotByKey(manual.hotspotKey || undefined);
    const x = clampCoord(manual.x ?? preset?.x ?? null);
    const y = clampCoord(manual.y ?? preset?.y ?? null);
    const nearest = x !== null && y !== null ? findNearestHotspot(x, y) : null;
    const district =
      manual.district ||
      preset?.district ||
      nearest?.district ||
      inferLocationFromAddress(client.customerAddress)?.district ||
      null;
    const hotspot = preset || nearest || (district ? MAURITIUS_HOTSPOTS.find((entry) => entry.district === district) || null : null);

    if (!district || x === null || y === null || !hotspot) {
      return inferLocationFromAddress(client.customerAddress);
    }

    return {
      district,
      hotspotKey: hotspot.key,
      hotspotLabel: manual.hotspotLabel || preset?.label || hotspot.label,
      x,
      y,
      notes: manual.notes || undefined,
      source: manual.source || "legacy",
      inferred: false,
    };
  }

  return inferLocationFromAddress(client.customerAddress);
}

export function serializeClientLocation(location: ClientLocation | null | undefined) {
  const normalized = normalizeClientLocation(location);
  if (!normalized) return null;

  const resolved = resolveClientLocation({ location: normalized });
  return {
    district: resolved?.district || normalized.district || null,
    hotspotKey: resolved?.hotspotKey || normalized.hotspotKey || null,
    hotspotLabel: normalized.hotspotLabel || resolved?.hotspotLabel || null,
    x: typeof normalized.x === "number" ? normalized.x : resolved?.x || null,
    y: typeof normalized.y === "number" ? normalized.y : resolved?.y || null,
    notes: normalized.notes || null,
    source: normalized.source || "manual",
  };
}
