import type { Auth } from "firebase/auth"

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let authPromise: Promise<Auth> | null = null

/**
 * Firebase is loaded on demand so it never lands in the bundle of pages that don't use
 * phone login. Call this from the event handler that starts the phone-auth flow.
 */
export function getFirebaseAuth(): Promise<Auth> {
    if (!authPromise) {
        authPromise = Promise.all([import("firebase/app"), import("firebase/auth")]).then(
            ([{ initializeApp, getApps, getApp }, { getAuth }]) =>
                getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig))
        )
    }
    return authPromise
}
