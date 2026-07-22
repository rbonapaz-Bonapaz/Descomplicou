
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

/**
 * Singleton das instâncias do Firebase para evitar duplicação de SyncEngine
 * e erros de Unexpected state (Fe: -1).
 */
let firebaseInstances: {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
} | null = null;

export function initializeFirebase(): {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
} {
  if (typeof window === 'undefined') {
    return { firebaseApp: null, firestore: null, auth: null };
  }

  if (firebaseInstances) return firebaseInstances;

  try {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('Dummy')) {
      return { firebaseApp: null, firestore: null, auth: null };
    }

    const firebaseApp =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const firestore = getFirestore(firebaseApp);
    const auth = getAuth(firebaseApp);

    firebaseInstances = { firebaseApp, firestore, auth };
    return firebaseInstances;
  } catch (error) {
    return { firebaseApp: null, firestore: null, auth: null };
  }
}
