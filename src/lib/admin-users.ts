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
import {
  createFirebaseEmailPasswordUser,
  isFirebaseAuthAdminError,
  sendFirebasePasswordResetEmail,
  verifyFirebaseEmailPassword,
} from "@/lib/firebase-auth-admin";

const ADMIN_USERS_COLLECTION = "adminUsers";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH_BITS = 256;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const encoder = new TextEncoder();

export type AdminAuthProvider = "firebase" | "legacy";

type AdminUserRecord = {
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  authProvider: AdminAuthProvider;
  firebaseUid: string | null;
  allowedPages: AdminPagePath[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AdminUserSummary = {
  email: string;
  displayName: string;
  authProvider: AdminAuthProvider;
  firebaseUid: string | null;
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

function resolveAuthProvider(record: Partial<AdminUserRecord>): AdminAuthProvider {
  if (record.authProvider === "firebase") return "firebase";
  if (typeof record.firebaseUid === "string" && record.firebaseUid.trim()) {
    return "firebase";
  }
  return "legacy";
}

function normalizeFirebaseUid(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRecord(
  record: Partial<AdminUserRecord>,
  fallbackEmail?: string
): AdminUserRecord | null {
  const emailSource =
    typeof record.email === "string" ? record.email : fallbackEmail ?? "";
  const email = normalizeAdminUserEmail(emailSource);
  if (!isValidAdminUserEmail(email)) return null;

  return {
    email,
    displayName:
      typeof record.displayName === "string" ? sanitizeDisplayName(record.displayName) : "Admin User",
    passwordHash: typeof record.passwordHash === "string" ? record.passwordHash : "",
    passwordSalt: typeof record.passwordSalt === "string" ? record.passwordSalt : "",
    authProvider: resolveAuthProvider(record),
    firebaseUid: normalizeFirebaseUid(record.firebaseUid),
    allowedPages: sanitizeAllowedPages(record.allowedPages),
    isActive: record.isActive !== false,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

function toSummary(record: AdminUserRecord) {
  return {
    email: record.email,
    displayName: record.displayName,
    authProvider: record.authProvider,
    firebaseUid: record.firebaseUid,
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

function createTemporaryFirebasePassword() {
  return `${crypto.randomUUID()}Aa1!`;
}

async function attachFirebaseAuthIdentity(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  try {
    const created = await createFirebaseEmailPasswordUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });

    return {
      authProvider: "firebase" as const,
      firebaseUid: created.localId,
    };
  } catch (error) {
    if (!isFirebaseAuthAdminError(error, "EMAIL_EXISTS")) {
      throw error;
    }

    const existing = await verifyFirebaseEmailPassword({
      email: input.email,
      password: input.password,
    }).catch((verifyError) => {
      if (isFirebaseAuthAdminError(verifyError)) {
        throw new Error(
          "A Firebase Auth account already exists for that email. Use its current password or send a reset link from settings."
        );
      }

      throw verifyError;
    });

    return {
      authProvider: "firebase" as const,
      firebaseUid: existing.localId,
    };
  }
}

export async function listAdminUsers() {
  const snap = await getDocs(query(collection(db, ADMIN_USERS_COLLECTION), orderBy("createdAt", "asc")));
  return snap.docs
    .map((docSnap) => {
      const record = normalizeRecord(
        docSnap.data() as Partial<AdminUserRecord>,
        docSnap.id
      );
      return record ? toSummary(record) : null;
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

  const now = Date.now();
  const allowedPages = sanitizeAllowedPages(input.allowedPages);
  const displayName = sanitizeDisplayName(input.displayName);
  const firebaseIdentity = await attachFirebaseAuthIdentity({
    email,
    displayName,
    password: input.password,
  });

  await setDoc(ref, {
    email,
    displayName,
    passwordHash: "",
    passwordSalt: "",
    authProvider: firebaseIdentity.authProvider,
    firebaseUid: firebaseIdentity.firebaseUid,
    allowedPages,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } satisfies AdminUserRecord);

  return {
    email,
    displayName,
    authProvider: firebaseIdentity.authProvider,
    firebaseUid: firebaseIdentity.firebaseUid,
    allowedPages,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } satisfies AdminUserSummary;
}

export async function ensureFirebaseAdminUser(input: {
  email: string;
  displayName: string;
  allowedPages: unknown;
  isActive?: boolean;
}) {
  const email = normalizeAdminUserEmail(input.email);
  if (!isValidAdminUserEmail(email)) throw new Error("Enter a valid email address.");

  const ref = getUserRef(email);
  const existingSnap = await getDoc(ref);
  if (existingSnap.exists()) {
    const existing = normalizeRecord(existingSnap.data() as Partial<AdminUserRecord>, email);
    const updated = await updateAdminUser({
      email,
      displayName: input.displayName,
      allowedPages: input.allowedPages,
      isActive: input.isActive,
    });
    return existing && resolveAuthProvider(existing) === "legacy"
      ? sendAdminUserPasswordReset(email)
      : updated;
  }

  const displayName = sanitizeDisplayName(input.displayName);
  let firebaseUid: string | null = null;
  try {
    const created = await createFirebaseEmailPasswordUser({
      email,
      password: createTemporaryFirebasePassword(),
      displayName,
    });
    firebaseUid = created.localId;
  } catch (error) {
    if (!isFirebaseAuthAdminError(error, "EMAIL_EXISTS")) throw error;
  }

  const now = Date.now();
  const record: AdminUserRecord = {
    email,
    displayName,
    passwordHash: "",
    passwordSalt: "",
    authProvider: "firebase",
    firebaseUid,
    allowedPages: sanitizeAllowedPages(input.allowedPages),
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, record);
  await sendFirebasePasswordResetEmail(email);
  return toSummary(record);
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

  const existing = normalizeRecord(
    snap.data() as Partial<AdminUserRecord>,
    email
  );
  if (!existing) {
    throw new Error("Admin user record is invalid.");
  }

  const nextPassword = typeof input.password === "string" ? input.password.trim() : "";
  if (nextPassword && nextPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const updatedAt = Date.now();
  const nextDisplayName =
    typeof input.displayName === "string"
      ? sanitizeDisplayName(input.displayName)
      : sanitizeDisplayName(existing.displayName);
  const authProvider = resolveAuthProvider(existing);
  let nextAuthProvider: AdminAuthProvider = authProvider;
  let nextFirebaseUid = existing.firebaseUid;
  let passwordHash = existing.passwordHash;
  let passwordSalt = existing.passwordSalt;

  if (authProvider === "firebase") {
    if (nextPassword) {
      throw new Error(
        "Use the password reset action for Firebase-managed users."
      );
    }
  } else if (nextPassword) {
    const firebaseIdentity = await attachFirebaseAuthIdentity({
      email,
      displayName: nextDisplayName,
      password: nextPassword,
    });
    nextAuthProvider = firebaseIdentity.authProvider;
    nextFirebaseUid = firebaseIdentity.firebaseUid;
    passwordHash = "";
    passwordSalt = "";
  }

  const nextRecord: AdminUserRecord = {
    email,
    displayName: nextDisplayName,
    passwordHash,
    passwordSalt,
    authProvider: nextAuthProvider,
    firebaseUid: nextFirebaseUid,
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

  const record = normalizeRecord(
    snap.data() as Partial<AdminUserRecord>,
    email
  );
  if (!record || !record.isActive) return null;

  if (resolveAuthProvider(record) === "firebase") {
    try {
      await verifyFirebaseEmailPassword({
        email,
        password,
      });
      return toSummary(record);
    } catch (error) {
      if (isFirebaseAuthAdminError(error)) {
        return null;
      }
      throw error;
    }
  }

  if (!record.passwordHash || !record.passwordSalt) return null;

  const actualHash = await derivePasswordHash(password, record.passwordSalt);
  if (!constantTimeEqual(actualHash, record.passwordHash)) return null;

  return toSummary(record);
}

export async function sendAdminUserPasswordReset(emailInput: string) {
  const email = normalizeAdminUserEmail(emailInput);
  if (!isValidAdminUserEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const ref = getUserRef(email);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Admin user not found.");
  }

  const existing = normalizeRecord(
    snap.data() as Partial<AdminUserRecord>,
    email
  );
  if (!existing) {
    throw new Error("Admin user record is invalid.");
  }

  let nextRecord = existing;

  if (resolveAuthProvider(existing) === "legacy") {
    let firebaseUid = existing.firebaseUid;

    try {
      const created = await createFirebaseEmailPasswordUser({
        email,
        password: createTemporaryFirebasePassword(),
        displayName: existing.displayName,
      });
      firebaseUid = created.localId;
    } catch (error) {
      if (!isFirebaseAuthAdminError(error, "EMAIL_EXISTS")) {
        throw error;
      }
    }

    nextRecord = {
      ...existing,
      authProvider: "firebase",
      firebaseUid,
      passwordHash: "",
      passwordSalt: "",
      updatedAt: Date.now(),
    };

    await setDoc(ref, nextRecord);
  }

  await sendFirebasePasswordResetEmail(email);
  return toSummary(nextRecord);
}

export function getOwnerAllowedPages() {
  return [...ALL_ADMIN_PAGE_PATHS];
}
