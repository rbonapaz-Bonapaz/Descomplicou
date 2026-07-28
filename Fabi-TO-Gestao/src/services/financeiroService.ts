'use client';

import { addDoc, getDoc, increment, updateDoc, type Firestore } from 'firebase/firestore';
import { Appointment, Transaction, FinancialConfig, HealthPlan } from '@/app/lib/types';
import { addDays } from 'date-fns';
import { col, ref, SUB } from '@/lib/tenancy';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const TAXAS_PADRAO: FinancialConfig = {
  taxa_cartao_credito: 2.99,
  taxa_cartao_debito: 1.5,
  prazo_padrao_convenio: 45,
};

/**
 * FECHAMENTO FINANCEIRO DA SESSÃO
 *
 * Chamado quando a recepção conclui um atendimento. Calcula taxa e prazo conforme
 * o meio de pagamento e gera o lançamento.
 *
 * Todo caminho é escopado pela clínica: sem `clinicaId` a operação nem monta o
 * caminho (o helper lança), em vez de gravar no lugar errado.
 */
export async function processarFechamentoSessao(
  db: Firestore,
  clinicaId: string,
  appointment: Appointment,
  meio_pagamento: Transaction['meio_pagamento']
) {
  const configSnap = await getDoc(ref(db, clinicaId, SUB.configuracoes, 'financeiro'));
  const config = (configSnap.exists() ? configSnap.data() : TAXAS_PADRAO) as FinancialConfig;

  const valorBruto = appointment.valor_final;
  let taxaValor = 0;
  let dataVencimento = new Date().toISOString();
  let status: Transaction['status'] = 'pago';

  switch (meio_pagamento) {
    case 'cartao_credito':
      taxaValor = valorBruto * (config.taxa_cartao_credito / 100);
      break;

    case 'cartao_debito':
      taxaValor = valorBruto * (config.taxa_cartao_debito / 100);
      break;

    case 'convenio': {
      // Convênio paga depois: o prazo do próprio convênio manda, com o padrão
      // da clínica como reserva.
      const convSnap = await getDoc(ref(db, clinicaId, SUB.convenios, appointment.convenio_id));
      const convenio = convSnap.exists() ? (convSnap.data() as HealthPlan) : null;
      const prazo = convenio?.prazo_repasse_dias || config.prazo_padrao_convenio;

      dataVencimento = addDays(new Date(), prazo).toISOString();
      status = 'pendente';
      break;
    }

    case 'pacote':
      // Sessão de pacote já foi paga antes: consome um crédito e não gera cobrança.
      if (appointment.paciente_id) {
        const pacienteRef = ref(db, clinicaId, SUB.pacientes, appointment.paciente_id);
        updateDoc(pacienteRef, { saldo_creditos: increment(-1) }).catch(() => {
          errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: pacienteRef.path,
              operation: 'update',
              requestResourceData: { saldo_creditos: 'decrement' },
            } satisfies SecurityRuleContext)
          );
        });
      }
      status = 'pago';
      break;

    default:
      // Dinheiro e Pix entram na hora.
      status = 'pago';
      break;
  }

  const transacao: Transaction = {
    data_criacao: new Date().toISOString(),
    data_vencimento: dataVencimento,
    paciente_id: appointment.paciente_id || 'anonimo',
    paciente_nome: appointment.paciente_nome,
    agendamento_id: appointment.id,
    tipo: 'entrada',
    meio_pagamento,
    valor_bruto: valorBruto,
    taxa_valor: taxaValor,
    valor_liquido: valorBruto - taxaValor,
    status,
    categoria: 'sessao',
  };

  const colecao = col(db, clinicaId, SUB.transacoes);
  addDoc(colecao, transacao).catch(() => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: colecao.path,
        operation: 'create',
        requestResourceData: transacao,
      } satisfies SecurityRuleContext)
    );
  });

  return { success: true, transaction: transacao };
}
