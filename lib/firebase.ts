import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import { getDatabase, type Database } from "firebase/database"
import { getAuth, type Auth } from "firebase/auth"

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: "https://pokemon-adventure-87f0a-default-rtdb.europe-west1.firebasedatabase.app",
}

let app: FirebaseApp | null = null
let db: Database | null = null
let auth: Auth | null = null
let isInitialized = false
let initializationError: Error | null = null

function isConfigValid(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  )
}

export function initializeFirebase(): {
  app: FirebaseApp | null
  db: Database | null
  auth: Auth | null
  error: Error | null
} {
  // Only run on client side
  if (typeof window === "undefined") {
    console.log("[v0] Firebase: Server-side environment - skipping")
    return { app: null, db: null, auth: null, error: new Error("Server-side environment") }
  }

  console.log("[v0] Firebase: Checking config validity...")
  console.log("[v0] Firebase config:", {
    apiKey: firebaseConfig.apiKey ? "✓" : "✗",
    authDomain: firebaseConfig.authDomain ? "✓" : "✗",
    projectId: firebaseConfig.projectId ? "✓" : "✗",
    databaseURL: firebaseConfig.databaseURL ? "✓" : "✗",
  })

  // Return cached instances if already initialized
  if (isInitialized) {
    console.log("[v0] Firebase: Already initialized")
    return { app, db, auth, error: initializationError }
  }

  // Validate configuration
  if (!isConfigValid()) {
    const error = new Error("Firebase configuration incomplete")
    console.log("[v0] Firebase: Configuration invalid:", error.message)
    initializationError = error
    isInitialized = true
    return { app: null, db: null, auth: null, error }
  }

  try {
    console.log("[v0] Firebase: Initializing app...")
    // Initialize Firebase app
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
    console.log("[v0] Firebase: App initialized")

    try {
      console.log("[v0] Firebase: Getting database reference...")
      db = getDatabase(app)
      console.log("[v0] Firebase: Database ready:", db !== null)
      auth = getAuth(app)
    } catch (dbError) {
      // Database not available in v0 preview environment - this is expected
      console.log("[v0] Firebase: Database not available in preview:", dbError)
      initializationError = new Error("Firebase not available in preview environment")
      isInitialized = true
      return { app, db: null, auth: null, error: initializationError }
    }

    console.log("[v0] Firebase: Initialization complete - ready:", db !== null)
    isInitialized = true
    return { app, db, auth, error: null }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.log("[v0] Firebase: Initialization error:", err.message)
    initializationError = err
    isInitialized = true
    return { app: null, db: null, auth: null, error: err }
  }
}

export function isFirebaseReady(): boolean {
  return isInitialized && db !== null && initializationError === null
}

export function getFirebaseError(): Error | null {
  return initializationError
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isInitialized) {
    initializeFirebase()
  }
  return app
}

export function getFirebaseDb(): Database | null {
  if (!isInitialized) {
    initializeFirebase()
  }
  return db
}

export function getFirebaseAuth(): Auth | null {
  if (!isInitialized) {
    initializeFirebase()
  }
  return auth
}

export { app, db, auth }
