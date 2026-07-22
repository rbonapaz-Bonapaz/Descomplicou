'use client';

import React, { useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';

/**
 * FirebaseClientProvider initializes Firebase services once on the client
 * and provides them to the application via context.
 * 
 * We use useMemo to ensure initialization is stable and happens during the 
 * first render pass, which helps avoid hydration mismatches.
 */
export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const instances = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={instances.firebaseApp}
      firestore={instances.firestore}
      auth={instances.auth}
    >
      {children}
    </FirebaseProvider>
  );
}
