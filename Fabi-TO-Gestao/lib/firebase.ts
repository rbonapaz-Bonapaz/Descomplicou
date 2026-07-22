
'use client';

import { initializeFirebase } from '@/firebase/app';

const instances = initializeFirebase();

export const app = instances.firebaseApp;
export const db = instances.firestore;
export const auth = instances.auth;
