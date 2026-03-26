"use client";

import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const firebaseAdminEmail = process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL?.trim() || "";

export function isFirebaseAdminAuthConfigured() {
  return firebaseAdminEmail.length > 0;
}

export async function signInAdminWithFirebase(fallbackPassword?: string) {
  if (!firebaseAdminEmail) return;

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

  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutAdminFromFirebase() {
  if (!auth.currentUser) return;
  await signOut(auth);
}
