'use client';

import { addDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { col, SUB } from '@/lib/tenancy';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export type AuditSeverity = 'info' | 'alerta' | 'critico';

export interface AuditLogInput {
  uid: string;
  nome: string;
  acao: string;
  modulo: string;
  detalhe: string;
  /** Preenchido quando a ação toca dado de um paciente — é o que a LGPD quer rastrear. */
  pacienteId?: string;
  severidade?: AuditSeverity;
}

/**
 * TRILHA DE AUDITORIA (LGPD art. 37)
 *
 * Registra quem fez o quê com dado pessoal. O registro é imutável pelas regras:
 * cria e nunca mais muda — nem para o administrador da clínica.
 *
 * A hora vem do servidor (`serverTimestamp`), e as regras exigem exatamente isso.
 * Log com hora escolhida pelo próprio autor não prova nada.
 */
export async function registrarAuditoria(
  db: Firestore | null,
  clinicaId: string | null,
  input: AuditLogInput
) {
  if (!db || !clinicaId) return;

  const dados = {
    uid: input.uid,
    nome: input.nome,
    acao: input.acao,
    modulo: input.modulo,
    detalhe: input.detalhe,
    ...(input.pacienteId ? { paciente_id: input.pacienteId } : {}),
    severidade: input.severidade || 'info',
    registrado_em: serverTimestamp(),
  };

  const colecao = col(db, clinicaId, SUB.auditoria);

  // Sem await: auditar não pode travar a tela de quem está atendendo.
  addDoc(colecao, dados).catch(() => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: colecao.path,
        operation: 'create',
        requestResourceData: dados,
      } satisfies SecurityRuleContext)
    );
  });
}

/**
 * Atalho para o caso mais sensível: alguém abriu o prontuário de um paciente.
 * Toda tela que exibe evolução clínica deve chamar isto.
 */
export async function registrarAcessoProntuario(
  db: Firestore | null,
  clinicaId: string | null,
  autor: { uid: string; nome: string },
  pacienteId: string,
  pacienteNome: string
) {
  return registrarAuditoria(db, clinicaId, {
    uid: autor.uid,
    nome: autor.nome,
    acao: 'acessou_prontuario',
    modulo: 'prontuario',
    pacienteId,
    detalhe: `Prontuário de ${pacienteNome} aberto.`,
    severidade: 'alerta',
  });
}
