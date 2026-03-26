import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ALL_ADMIN_PAGE_PATHS,
  normalizeAdminAllowedPages,
  type AdminPagePath,
} from "@/lib/admin-access";

const ADMIN_USERS_COLLECTION = "adminUsers";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH_BITS = 256;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const encoder = new TextEncoder();

type AdminUserRecord = {
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  allowedPages: AdminPagePath[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AdminUserSummary = {
  email: string;
  displayName: string;
  allowedPages: AdminPagePath[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

function getAdminPasswordPepper() {
  const explicitSecret = (process.env.ADMIN_SESSION_SECRET || "").trim();
  return explicitSecret || process.env.ADMIN_PASSWORD || process.env.NEXT_ADMIN_PASSWORD || "";
}

function toBase64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function normalizeAdminUserEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidAdminUserEmail(value: string) {
  return EMAIL_RE.test(normalizeAdminUserEmail(value));
}

function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function derivePasswordHash(password: string, salt: string) {
  const pepper = getAdminPasswordPepper();
  if (!pepper) {
    throw new Error("Server is missing ADMIN_PASSWORD or ADMIN_SESSION_SECRET.");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${password}:${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PASSWORD_KEY_LENGTH_BITS
  );

  return toBase64Url(derivedBits);
}

function toSummary(record: AdminUserRecord) {
  return {
    email: record.email,
    displayName: record.displayName,
    allowedPages: record.allowedPages,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies AdminUserSummary;
}

function getUserRef(email: string) {
  return doc(db, ADMIN_USERS_COLLECTION, normalizeAdminUserEmail(email));
}

function sanitizeDisplayName(value: string) {
  const trimmed = value.trim();
  return trimmed || "Admin User";
}

function sanitizeAllowedPages(value: unknown): AdminPagePath[] {
  const normalized = normalizeAdminAllowedPages(value);
  return normalized.length ? normalized : ["/admin" as AdminPagePath];
}

export async function listAdminUsers() {
  const snap = await getDocs(query(collection(db, ADMIN_USERS_COLLECTION), orderBy("createdAt", "asc")));
  return snap.docs
    .map((docSnap) => {
      const data = docSnap.data() as Partial<AdminUserRecord>;
      if (typeof data.email !== "string") return null;

      return toSummary({
        email: data.email,
        displayName: typeof data.displayName === "string" ? data.displayName : "Admin User",
        passwordHash: typeof data.passwordHash === "string" ? data.passwordHash : "",
        passwordSalt: typeof data.passwordSalt === "string" ? data.passwordSalt : "",
        allowedPages: sanitizeAllowedPages(data.allowedPages),
        isActive: data.isActive !== false,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      });
    })
    .filter((entry): entry is AdminUserSummary => Boolean(entry));
}

export async function createAdminUser(input: {
  email: string;
  displayName: string;
  password: string;
  allowedPages: unknown;
}) {
  const email = normalizeAdminUserEmail(input.email);
  if (!isValidAdminUserEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (input.password.trim().length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const ref = getUserRef(email);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error("An admin user with that email already exists.");
  }

  const passwordSalt = createSalt();
  const passwordHash = await derivePasswordHash(input.password, passwordSalt);
  const now = Date.now();
  const allowedPages = sanitizeAllowedPages(input.allowedPages);

  await setDoc(ref, {
    email,
    displayName: sanitizeDisplayName(input.displayName),
    passwordHash,
    passwordSalt,
    allowedPages,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } satisfies AdminUserRecord);

  return {
    email,
    displayName: sanitizeDisplayName(input.displayName),
    allowedPages,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } satisfies AdminUserSummary;
}

export async function updateAdminUser(input: {
  email: string;
  displayName?: string;
  password?: string;
  allowedPages?: unknown;
  isActive?: boolean;
}) {
  const email = normalizeAdminUserEmail(input.email);
  const ref = getUserRef(email);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Admin user not found.");
  }

  const existing = snap.data() as AdminUserRecord;
  const nextPassword = typeof input.password === "string" ? input.password.trim() : "";
  if (nextPassword && nextPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordSalt = nextPassword ? createSalt() : existing.passwordSalt;
  const passwordHash = nextPassword
    ? await derivePasswordHash(nextPassword, passwordSalt)
    : existing.passwordHash;
  const updatedAt = Date.now();

  const nextRecord: AdminUserRecord = {
    email,
    displayName:
      typeof input.displayName === "string"
        ? sanitizeDisplayName(input.displayName)
        : sanitizeDisplayName(existing.displayName),
    passwordHash,
    passwordSalt,
    allowedPages:
      input.allowedPages !== undefined
        ? sanitizeAllowedPages(input.allowedPages)
        : sanitizeAllowedPages(existing.allowedPages),
    isActive:
      typeof input.isActive === "boolean" ? input.isActive : existing.isActive !== false,
    createdAt: typeof existing.createdAt === "number" ? existing.createdAt : updatedAt,
    updatedAt,
  };

  await setDoc(ref, nextRecord);
  return toSummary(nextRecord);
}

export async function verifyManagedAdminCredentials(emailInput: string, password: string) {
  const email = normalizeAdminUserEmail(emailInput);
  if (!isValidAdminUserEmail(email)) return null;

  const snap = await getDoc(getUserRef(email));
  if (!snap.exists()) return null;

  const data = snap.data() as Partial<AdminUserRecord>;
  if (data.isActive === false) return null;
  if (typeof data.passwordHash !== "string" || typeof data.passwordSalt !== "string") {
    return null;
  }

  const actualHash = await derivePasswordHash(password, data.passwordSalt);
  if (!constantTimeEqual(actualHash, data.passwordHash)) return null;

  return {
    email,
    displayName: typeof data.displayName === "string" ? data.displayName : email,
    allowedPages: sanitizeAllowedPages(data.allowedPages),
    isActive: true,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
  } satisfies AdminUserSummary;
}

export function getOwnerAllowedPages() {
  return [...ALL_ADMIN_PAGE_PATHS];
}
