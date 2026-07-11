"use client";

import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const firebaseAdminEmail =
  process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL?.trim() ||
  "motshirtmauritius@gmail.com";

export function isFirebaseAdminAuthConfigured(loginEmail?: string) {
  return Boolean(loginEmail?.trim() || firebaseAdminEmail);
}

function resolveFirebaseAdminEmail(loginEmail?: string) {
  const email = loginEmail?.trim().toLowerCase() || firebaseAdminEmail.toLowerCase();
  if (!email) throw new Error("A Firebase admin email is required.");
  return email;
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

export async function signInAdminWithFirebase(loginEmail: string, password: string) {
  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(
    auth,
    resolveFirebaseAdminEmail(loginEmail),
    password
  );
}

export async function ensureAdminFirebaseSession() {
  await setPersistence(auth, browserLocalPersistence);
  await waitForFirebaseAuthState();
  return Boolean(auth.currentUser);
}

export async function signOutAdminFromFirebase() {
  if (!auth.currentUser) return;
  await signOut(auth);
}
