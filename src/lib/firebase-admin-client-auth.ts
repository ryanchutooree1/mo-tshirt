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

export async function signInAdminWithFirebase(password: string) {
  if (!firebaseAdminEmail) return;

  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, firebaseAdminEmail, password);
}

export async function signOutAdminFromFirebase() {
  if (!auth.currentUser) return;
  await signOut(auth);
}
