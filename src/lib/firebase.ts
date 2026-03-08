import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// --- Firebase configuration ---
// Prefer env vars if present; fallback to project constants.
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
    "AIzaSyAhNoYB-MsYIy0Sk0sc1zUE_3ctGSvv5nY",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "pocket-entreprise-app.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pocket-entreprise-app",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "pocket-entreprise-app.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1063169876011",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:1063169876011:web:8c79c9f828a2478d1f0a6e",
} as const;

// Prevent re-initialization during hot reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
