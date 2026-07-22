
'use client';

import { 
  Firestore, 
  collection, 
  addDoc 
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogInput {
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  severity?: AuditSeverity;
}

/**
 * SERVIÇO DE AUDITORIA IMUTÁVEL
 * Registra ações críticas do sistema para conformidade e segurança.
 */
export async function logAction(
  db: Firestore | null,
  input: AuditLogInput
) {
  if (!db) {
    // Fallback para modo demo/local se necessário, mas idealmente loga no console em desenvolvimento
    console.log('[AUDIT LOG]', input);
    return;
  }

  const logData = {
    ...input,
    timestamp: new Date().toISOString(),
    severity: input.severity || 'info'
  };

  const logsRef = collection(db, 'logs_auditoria');
  
  // Não usamos await para não bloquear a experiência do usuário
  addDoc(logsRef, logData)
    .catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: logsRef.path,
        operation: 'create',
        requestResourceData: logData,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
}
