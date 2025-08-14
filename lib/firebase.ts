// lib/firebase.ts
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// --- Your Firebase configuration (direct values) ---
const firebaseConfig = {
  apiKey: "AIzaSyAhNoYB-MsYIy0Sk0sc1zUE_3ctGSvv5nY",
  authDomain: "pocket-entreprise-app.firebaseapp.com",
  projectId: "pocket-entreprise-app",
  storageBucket: "pocket-entreprise-app.appspot.com",
  messagingSenderId: "1063169876011",
  appId: "1:1063169876011:web:8c79c9f828a2478d1f0a6e"
}

// Prevent re-initialization during hot reload
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0]

// Export Firebase & Storage services
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app);