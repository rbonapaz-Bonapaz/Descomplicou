
'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

/**
 * Escuta erros de permissão do Firestore e os lança como exceções
 * para que o Next.js exiba o overlay de erro detalhado durante o desenvolvimento.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const handlePermissionError = (error: Error) => {
      // Lança o erro para atingir o boundary do Next.js
      throw error;
    };

    errorEmitter.on('permission-error', handlePermissionError);
    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
  }, []);

  return null;
}
