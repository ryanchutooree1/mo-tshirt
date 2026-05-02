import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  readyMadeUniforms,
  type ReadyMadeUniform,
} from "@/data/ready-made-uniforms";
import { db } from "@/lib/firebase";

export const READY_MADE_UNIFORMS_COLLECTION = "readyMadeUniforms";

export type ReadyMadeUniformItem = ReadyMadeUniform & {
  id: string;
  position: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ReadyMadeUniformInput = Omit<
  ReadyMadeUniformItem,
  "id" | "createdAt" | "updatedAt"
>;

const DEFAULT_POSITION_STEP = 1000;

export const READY_MADE_UNIFORM_ACCENT_OPTIONS = [
  {
    label: "Security Slate",
    value: "from-slate-950 via-slate-800 to-slate-700",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
  {
    label: "Staff Orange",
    value: "from-orange-500 via-amber-500 to-yellow-400",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    label: "Restaurant Red",
    value: "from-red-600 via-orange-500 to-amber-300",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
  {
    label: "Team Blue",
    value: "from-blue-600 via-cyan-500 to-sky-300",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    label: "NGO Green",
    value: "from-emerald-600 via-green-500 to-lime-300",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    label: "Corporate Pink",
    value: "from-violet-700 via-fuchsia-600 to-pink-400",
    badgeClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  },
] as const;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanString(entry))
      .filter(Boolean);
  }

  return cleanString(value)
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return fallback;
}

function parsePosition(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultPosition(index: number) {
  return (readyMadeUniforms.length - index) * DEFAULT_POSITION_STEP;
}

function defaultItem(uniform: ReadyMadeUniform, index: number): ReadyMadeUniformItem {
  return {
    ...uniform,
    id: uniform.code,
    position: defaultPosition(index),
    isActive: true,
  };
}

function getFallbackAccent(value: string) {
  return (
    READY_MADE_UNIFORM_ACCENT_OPTIONS.find((option) => option.value === value) ||
    READY_MADE_UNIFORM_ACCENT_OPTIONS[0]
  );
}

export function sortReadyMadeUniforms<T extends { position?: number; code: string }>(items: T[]) {
  return items.slice().sort((left, right) => {
    const positionDelta = (Number(right.position) || 0) - (Number(left.position) || 0);
    if (positionDelta !== 0) return positionDelta;
    return left.code.localeCompare(right.code, undefined, { sensitivity: "base" });
  });
}

export function mapReadyMadeUniformDoc(
  id: string,
  data: Record<string, unknown>,
  fallback?: ReadyMadeUniformItem
): ReadyMadeUniformItem {
  const code = normalizeCode(cleanString(data.code) || fallback?.code || id);
  const accentClass = cleanString(data.accentClass) || fallback?.accentClass || READY_MADE_UNIFORM_ACCENT_OPTIONS[0].value;
  const fallbackAccent = getFallbackAccent(accentClass);

  return {
    id,
    code,
    title: cleanString(data.title) || fallback?.title || code,
    audience: cleanString(data.audience) || fallback?.audience || "",
    description: cleanString(data.description) || fallback?.description || "",
    features: cleanStringList(data.features).length
      ? cleanStringList(data.features)
      : fallback?.features || [],
    imageSrc: cleanString(data.imageSrc) || fallback?.imageSrc || "/mockups/polo-front.png",
    imageGallery: cleanStringList(data.imageGallery).length
      ? cleanStringList(data.imageGallery)
      : fallback?.imageGallery || [],
    accentClass,
    badgeClass: cleanString(data.badgeClass) || fallback?.badgeClass || fallbackAccent.badgeClass,
    message:
      cleanString(data.message) ||
      fallback?.message ||
      `Hi! I want the ready-made uniform ${code}. Can you customize it with my logo?`,
    position: parsePosition(data.position, fallback?.position ?? 0),
    isActive: parseBoolean(data.isActive, fallback?.isActive ?? true),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function mergeReadyMadeUniforms(
  docs: ReadyMadeUniformItem[],
  options: { includeInactive?: boolean } = {}
) {
  const defaults = new Map(
    readyMadeUniforms.map((uniform, index) => [uniform.code, defaultItem(uniform, index)])
  );
  const merged = new Map<string, ReadyMadeUniformItem>(defaults);

  docs.forEach((item) => {
    const fallback = defaults.get(item.code);
    const next = fallback ? { ...fallback, ...item } : item;
    merged.set(next.code, next);
  });

  const list = Array.from(merged.values()).filter(
    (item) => options.includeInactive || item.isActive
  );
  return sortReadyMadeUniforms(list);
}

export async function getReadyMadeUniformDocs() {
  const snap = await getDocs(
    query(collection(db, READY_MADE_UNIFORMS_COLLECTION), orderBy("position", "desc"))
  );
  const defaults = new Map(
    readyMadeUniforms.map((uniform, index) => [uniform.code, defaultItem(uniform, index)])
  );

  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const code = normalizeCode(cleanString(data.code) || docSnap.id);
    return mapReadyMadeUniformDoc(docSnap.id, data, defaults.get(code) || defaults.get(docSnap.id));
  });
}

export async function getReadyMadeUniformItems(options: { includeInactive?: boolean } = {}) {
  const docs = await getReadyMadeUniformDocs();
  return mergeReadyMadeUniforms(docs, options);
}

export function parseReadyMadeUniformPayload(body: unknown):
  | { ok: true; data: ReadyMadeUniformInput; id: string }
  | { ok: false; error: string } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const code = normalizeCode(cleanString(payload.code));
  if (!code) return { ok: false, error: "Style code is required." };

  const title = cleanString(payload.title);
  if (!title) return { ok: false, error: "Title is required." };

  const audience = cleanString(payload.audience);
  if (!audience) return { ok: false, error: "Audience is required." };

  const description = cleanString(payload.description);
  if (!description) return { ok: false, error: "Description is required." };

  const features = cleanStringList(payload.features);
  if (!features.length) return { ok: false, error: "Add at least one feature." };

  const imageSrc = cleanString(payload.imageSrc);
  if (!imageSrc) return { ok: false, error: "Image is required." };

  const accentClass = cleanString(payload.accentClass) || READY_MADE_UNIFORM_ACCENT_OPTIONS[0].value;
  const accent = getFallbackAccent(accentClass);
  const badgeClass = cleanString(payload.badgeClass) || accent.badgeClass;

  const data: ReadyMadeUniformInput = {
    code,
    title,
    audience,
    description,
    features,
    imageSrc,
    imageGallery: cleanStringList(payload.imageGallery),
    accentClass,
    badgeClass,
    message:
      cleanString(payload.message) ||
      `Hi! I want the ready-made uniform ${code} ${title}. Can you customize it with my logo?`,
    position: parsePosition(payload.position, Date.now()),
    isActive: parseBoolean(payload.isActive, true),
  };

  return { ok: true, data, id: code };
}
