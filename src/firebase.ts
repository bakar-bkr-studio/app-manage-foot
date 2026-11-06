import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
export const dataMode = firebaseConfigured ? 'firebase' : 'demo'

const app = firebaseConfigured ? initializeApp(firebaseConfig) : undefined
export const firebaseAuth = app ? getAuth(app) : undefined
// Certains champs de l'effectif sont optionnels. Firestore les ignore lorsqu'ils
// ne sont pas renseignés, plutôt que de refuser toute la sauvegarde.
export const firestore = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : undefined
