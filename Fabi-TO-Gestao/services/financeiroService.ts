
'use client';

import { 
  Firestore, 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  increment 
} from 'firebase/firestore';
import { Appointment, Transaction, FinancialConfig, HealthPlan } from '@/app/lib/types';
import { addDays } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

/**
 * GATILHO FINANCEIRO ISOLADO
 * Esta função processa toda a lógica financeira após a conclusão de uma sessão.
 */
export async function processarFechamentoSessao(
  db: Firestore, 
  appointment: Appointment,
  meio_pagamento: Transaction['meio_pagamento']
) {
  try {
    // 1. Obter Configurações de Taxas
    const configSnap = await getDoc(doc(db, 'configuracoes', 'financeiro'));
    const config = (configSnap.exists() ? configSnap.data() : {
      taxa_cartao_credito: 2.99,
      taxa_cartao_debito: 1.50,
      prazo_padrao_convenio: 45
    }) as FinancialConfig;

    const valorBruto = appointment.valor_final;
    let taxaValor = 0;
    let dataVencimento = new Date().toISOString();
    let status: Transaction['status'] = 'pago';

    // 2. Aplicar Regras por Meio de Pagamento
    switch (meio_pagamento) {
      case 'cartao_credito':
        taxaValor = valorBruto * (config.taxa_cartao_credito / 100);
        break;
      
      case 'cartao_debito':
        taxaValor = valorBruto * (config.taxa_cartao_debito / 100);
        break;

      case 'convenio':
        // Buscar prazo específico do convênio
        const convSnap = await getDoc(doc(db, 'convenios', appointment.convenio_id));
        const convenio = convSnap.exists() ? convSnap.data() as HealthPlan : null;
        const prazo = convenio?.prazo_repasse_dias || config.prazo_padrao_convenio;
        
        dataVencimento = addDays(new Date(), prazo).toISOString();
        status = 'pendente';
        break;

      case 'pacote':
        // Abater do saldo do paciente
        if (appointment.paciente_id) {
          const patientRef = doc(db, 'pacientes', appointment.paciente_id);
          updateDoc(patientRef, {
            saldo_creditos: increment(-1)
          }).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
              path: patientRef.path,
              operation: 'update',
              requestResourceData: { saldo_creditos: 'decrement' },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
          });
        }
        status = 'pago';
        break;

      default:
        // Dinheiro/Pix entrada direta
        status = 'pago';
        break;
    }

    const valorLiquido = valorBruto - taxaValor;

    // 3. Gerar Documento de Transação
    const transaction: Transaction = {
      data_criacao: new Date().toISOString(),
      data_vencimento: dataVencimento,
      paciente_id: appointment.paciente_id || 'anonimo',
      paciente_nome: appointment.paciente_nome,
      agendamento_id: appointment.id,
      tipo: 'entrada',
      meio_pagamento: meio_pagamento,
      valor_bruto: valorBruto,
      taxa_valor: taxaValor,
      valor_liquido: valorLiquido,
      status: status,
      categoria: 'sessao'
    };

    const transCollection = collection(db, 'transacoes_financeiras');
    addDoc(transCollection, transaction)
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: transCollection.path,
          operation: 'create',
          requestResourceData: transaction,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });

    return { success: true, transaction };
  } catch (error) {
    console.error('Erro interno no processamento financeiro:', error);
    throw error;
  }
}
