"use client";

import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const firebaseAdminEmail = process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL?.trim() || "";

export function isFirebaseAdminAuthConfigured() {
  return firebaseAdminEmail.length > 0;
}

async function resolveFirebaseAdminCredentials(fallbackPassword?: string) {
  let email = firebaseAdminEmail;
  let password = (fallbackPassword || "").trim();

  try {
    const res = await fetch("/api/admin/firebase-auth", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.configured && typeof data?.email === "string" && typeof data?.password === "string") {
      email = data.email;
      password = data.password;
    }
  } catch {
    // Keep the fallback password path for owner login.
  }

  if (!password) {
    throw new Error("Firebase admin auth password is not configured.");
  }

  return { email, password };
}

async function waitForFirebaseAuthState() {
  if (auth.currentUser) return;

  await new Promise<void>((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      () => {
        unsubscribe();
        resolve();
      },
      () => {
        unsubscribe();
        resolve();
      }
    );
  });
}

export async function signInAdminWithFirebase(fallbackPassword?: string) {
  if (!firebaseAdminEmail) return;

  await setPersistence(auth, browserLocalPersistence);
  const { email, password } = await resolveFirebaseAdminCredentials(fallbackPassword);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function ensureAdminFirebaseSession(fallbackPassword?: string) {
  if (!firebaseAdminEmail) return false;

  await setPersistence(auth, browserLocalPersistence);
  await waitForFirebaseAuthState();

  if (auth.currentUser?.email === firebaseAdminEmail) {
    return true;
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  const { email, password } = await resolveFirebaseAdminCredentials(fallbackPassword);
  await signInWithEmailAndPassword(auth, email, password);
  return true;
}

export async function signOutAdminFromFirebase() {
  if (!auth.currentUser) return;
  await signOut(auth);
}
