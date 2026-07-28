/**
 * TESTES DAS REGRAS DE SEGURANÇA
 *
 * Estas regras são a única barreira do sistema, e um erro nelas vaza prontuário ou
 * mistura clínicas. Por isso as três invariantes do `firestore.rules` são testadas
 * aqui, e não confiadas à leitura do arquivo.
 *
 * Rodar: npm run test:rules   (sobe o emulador do Firestore automaticamente)
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const CLINICA_A = 'clinica_a';
const CLINICA_B = 'clinica_b';

/** Um mês à frente: assinatura em dia. */
const FUTURO = Date.now() + 30 * 24 * 60 * 60 * 1000;
/** Ontem: assinatura vencida. */
const PASSADO = Date.now() - 24 * 60 * 60 * 1000;

let env: RulesTestEnvironment;

/** Cria um contexto autenticado com os claims indicados. */
function como(uid: string, clinicaId: string | null, papeis: string[], superadmin = false) {
  return env.authenticatedContext(uid, {
    ...(clinicaId ? { clinicaId } : {}),
    papeis,
    ...(superadmin ? { superadmin: true } : {}),
  }).firestore();
}

// Elenco fixo, para os testes lerem como frases.
const atores = {
  drA: () => como('dr_a', CLINICA_A, ['profissional']),
  drA2: () => como('dr_a2', CLINICA_A, ['profissional']),
  recepA: () => como('recep_a', CLINICA_A, ['recepcao']),
  adminA: () => como('admin_a', CLINICA_A, ['admin_clinica']),
  adminQueAtendeA: () => como('admin_med_a', CLINICA_A, ['admin_clinica', 'profissional']),
  drB: () => como('dr_b', CLINICA_B, ['profissional']),
  adminB: () => como('admin_b', CLINICA_B, ['admin_clinica']),
  dono: () => como('dono', null, [], true),
  anonimo: () => env.unauthenticatedContext().firestore(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'prontta-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  // Semeia o estado base ignorando as regras — é o "mundo já existente".
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    for (const cid of [CLINICA_A, CLINICA_B]) {
      await setDoc(doc(db, 'assinaturas', cid), {
        clinica_id: cid,
        plano: 'mensal',
        expira_em: FUTURO,
      });
      await setDoc(doc(db, 'clinicas', cid), { nome: cid, ativa: true });
      await setDoc(doc(db, 'clinicas', cid, 'pacientes', 'p1'), {
        nome: 'Paciente Um',
        telefone: '11999999999',
      });
      await setDoc(doc(db, 'clinicas', cid, 'pacientes', 'p1', 'prontuario', 'e1'), {
        profissional_id: cid === CLINICA_A ? 'dr_a' : 'dr_b',
        descricao: 'Evolução da sessão.',
        tipo: 'evolucao',
        assinatura_digital: false,
      });
      await setDoc(doc(db, 'clinicas', cid, 'prontuario_dummy', 'x'), { ok: true });
    }

    // Uma entrada já assinada, para testar imutabilidade.
    await setDoc(doc(db, 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'assinada'), {
      profissional_id: 'dr_a',
      descricao: 'Evolução assinada.',
      tipo: 'evolucao',
      assinatura_digital: true,
    });

    await setDoc(doc(db, 'clinicas', CLINICA_A, 'usuarios', 'dr_a'), {
      nome: 'Dr. A',
      papeis: ['profissional'],
      salario_base: 5000,
      ativo: true,
    });

    await setDoc(doc(db, 'clinicas', CLINICA_A, 'batidas_ponto', 'b1'), {
      userId: 'recep_a',
      tipo: 'entrada',
    });
  });
});

// ---------------------------------------------------------------------------

describe('Invariante 1 — isolamento entre clínicas', () => {
  it('profissional da Clínica B não lê paciente da Clínica A', async () => {
    await assertFails(getDoc(doc(atores.drB(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });

  it('profissional da Clínica B não lê prontuário da Clínica A', async () => {
    await assertFails(
      getDoc(doc(atores.drB(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1'))
    );
  });

  it('admin da Clínica B não escreve na Clínica A', async () => {
    await assertFails(
      setDoc(doc(atores.adminB(), 'clinicas', CLINICA_A, 'pacientes', 'novo'), {
        nome: 'Invasor',
        telefone: '1',
      })
    );
  });

  it('profissional lê o paciente da própria clínica', async () => {
    await assertSucceeds(getDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });

  it('visitante sem login não lê nada', async () => {
    await assertFails(getDoc(doc(atores.anonimo(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });
});

describe('Invariante 2 — prontuário só para profissional de saúde', () => {
  it('recepção NÃO lê o prontuário', async () => {
    await assertFails(
      getDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1'))
    );
  });

  it('recepção lê o cadastro do paciente (precisa para agendar)', async () => {
    await assertSucceeds(getDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });

  it('administrador que não atende NÃO lê o prontuário', async () => {
    await assertFails(
      getDoc(doc(atores.adminA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1'))
    );
  });

  it('administrador que também é profissional lê o prontuário', async () => {
    await assertSucceeds(
      getDoc(
        doc(atores.adminQueAtendeA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1')
      )
    );
  });

  it('recepção não consegue gravar conteúdo clínico no cadastro do paciente', async () => {
    await assertFails(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'pacientes', 'p2'), {
        nome: 'Contorno',
        telefone: '1',
        historico_clinico: [{ descricao: 'tentativa de burlar' }],
      })
    );
  });

  it('nem o profissional reintroduz queixa clínica no cadastro', async () => {
    await assertFails(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p3'), {
        nome: 'Contorno 2',
        telefone: '1',
        queixa_principal: 'conteúdo clínico no lugar errado',
      })
    );
  });

  it('profissional grava evolução em seu próprio nome', async () => {
    await assertSucceeds(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'nova'), {
        profissional_id: 'dr_a',
        descricao: 'Sessão realizada.',
        tipo: 'evolucao',
      })
    );
  });

  it('profissional não assina evolução em nome de outro', async () => {
    await assertFails(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'forjada'), {
        profissional_id: 'dr_a2',
        descricao: 'Assinatura forjada.',
        tipo: 'evolucao',
      })
    );
  });

  it('evolução assinada não pode ser alterada', async () => {
    await assertFails(
      updateDoc(
        doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'assinada'),
        { descricao: 'reescrevendo o passado' }
      )
    );
  });

  it('prontuário não pode ser apagado nem pelo administrador', async () => {
    await assertFails(
      deleteDoc(
        doc(atores.adminQueAtendeA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1')
      )
    );
  });
});

describe('Invariante 3 — ninguém se autopromove', () => {
  it('profissional não altera os próprios papéis', async () => {
    await assertFails(
      updateDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a'), {
        papeis: ['admin_clinica', 'profissional'],
      })
    );
  });

  it('profissional não altera o próprio salário', async () => {
    await assertFails(
      updateDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a'), {
        salario_base: 99999,
      })
    );
  });

  it('profissional ajusta os próprios dados de contato', async () => {
    await assertSucceeds(
      updateDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a'), {
        telefone: '11988887777',
        cor_agenda: '#123456',
      })
    );
  });

  it('nem o administrador troca papéis pelo cliente (só Cloud Function)', async () => {
    await assertFails(
      updateDoc(doc(atores.adminA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a'), {
        papeis: ['recepcao'],
      })
    );
  });

  it('recepção não lê a ficha de RH de um colega', async () => {
    await assertFails(getDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a')));
  });

  it('administrador lê a ficha da equipe', async () => {
    await assertSucceeds(getDoc(doc(atores.adminA(), 'clinicas', CLINICA_A, 'usuarios', 'dr_a')));
  });

  it('clínica não consegue estender a própria assinatura', async () => {
    await assertFails(
      updateDoc(doc(atores.adminA(), 'assinaturas', CLINICA_A), { expira_em: FUTURO * 2 })
    );
  });

  it('clínica lê o próprio plano', async () => {
    await assertSucceeds(getDoc(doc(atores.adminA(), 'assinaturas', CLINICA_A)));
  });

  it('ninguém se cadastra como dono do sistema', async () => {
    await assertFails(
      setDoc(doc(atores.adminA(), 'superadmins', 'admin_a'), { superadmin: true })
    );
  });
});

describe('Dono do sistema não enxerga dado de cliente', () => {
  it('não lê paciente de clínica alguma', async () => {
    await assertFails(getDoc(doc(atores.dono(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });

  it('não lê prontuário', async () => {
    await assertFails(
      getDoc(doc(atores.dono(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'e1'))
    );
  });

  it('administra assinaturas', async () => {
    await assertSucceeds(
      setDoc(doc(atores.dono(), 'assinaturas', CLINICA_A), {
        clinica_id: CLINICA_A,
        plano: 'anual',
        expira_em: FUTURO,
      })
    );
  });
});

describe('Ponto eletrônico é inviolável', () => {
  it('batida registrada não pode ser editada pelo próprio', async () => {
    await assertFails(
      updateDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'b1'), {
        tipo: 'saida',
      })
    );
  });

  it('batida registrada não pode ser editada pelo administrador', async () => {
    await assertFails(
      updateDoc(doc(atores.adminA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'b1'), {
        tipo: 'saida',
      })
    );
  });

  it('batida não pode ser apagada', async () => {
    await assertFails(
      deleteDoc(doc(atores.adminA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'b1'))
    );
  });

  it('ninguém bate ponto no lugar de outra pessoa', async () => {
    await assertFails(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'falsa'), {
        userId: 'dr_a',
        tipo: 'entrada',
        origem: 'app',
        registrado_em: serverTimestamp(),
      })
    );
  });

  it('bate o próprio ponto com hora do servidor', async () => {
    await assertSucceeds(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'minha'), {
        userId: 'recep_a',
        tipo: 'entrada',
        origem: 'app',
        registrado_em: serverTimestamp(),
      })
    );
  });

  it('batida com hora vinda do celular é recusada', async () => {
    await assertFails(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'batidas_ponto', 'mentirosa'), {
        userId: 'recep_a',
        tipo: 'entrada',
        origem: 'app',
        registrado_em: new Date('2020-01-01'),
      })
    );
  });

  it('correção entra como pedido pendente, não como batida', async () => {
    await assertSucceeds(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'ajustes_ponto', 'a1'), {
        userId: 'recep_a',
        status: 'pendente',
        justificativa: 'Esqueci de bater a saída.',
      })
    );
  });

  it('funcionário não aprova o próprio pedido de ajuste', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clinicas', CLINICA_A, 'ajustes_ponto', 'a2'), {
        userId: 'recep_a',
        status: 'pendente',
        justificativa: 'x',
      });
    });
    await assertFails(
      updateDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'ajustes_ponto', 'a2'), {
        status: 'aprovado',
      })
    );
  });
});

describe('Assinatura vencida deixa o sistema só de leitura', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assinaturas', CLINICA_A), {
        clinica_id: CLINICA_A,
        plano: 'mensal',
        expira_em: PASSADO,
      });
    });
  });

  it('leitura do histórico continua liberada', async () => {
    await assertSucceeds(getDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1')));
  });

  it('escrita de evolução é bloqueada', async () => {
    await assertFails(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'pacientes', 'p1', 'prontuario', 'nova'), {
        profissional_id: 'dr_a',
        descricao: 'Sessão.',
        tipo: 'evolucao',
      })
    );
  });

  it('novo agendamento é bloqueado', async () => {
    await assertFails(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'agendamentos', 'ag1'), {
        profissional_id: 'dr_a',
        paciente_id: 'p1',
      })
    );
  });
});

describe('Auditoria e agenda', () => {
  it('registro de auditoria não pode ser alterado depois', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'clinicas', CLINICA_A, 'auditoria', 'log1'), {
        uid: 'dr_a',
        acao: 'leu_prontuario',
      });
    });
    await assertFails(
      updateDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'auditoria', 'log1'), { acao: 'nada' })
    );
  });

  it('registro de auditoria não pode ser criado em nome de outro', async () => {
    await assertFails(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'auditoria', 'log2'), {
        uid: 'admin_a',
        acao: 'forjado',
        registrado_em: serverTimestamp(),
      })
    );
  });

  it('profissional não marca agendamento na agenda de outro', async () => {
    await assertFails(
      setDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'agendamentos', 'ag2'), {
        profissional_id: 'dr_a2',
        paciente_id: 'p1',
      })
    );
  });

  it('recepção marca para qualquer profissional', async () => {
    await assertSucceeds(
      setDoc(doc(atores.recepA(), 'clinicas', CLINICA_A, 'agendamentos', 'ag3'), {
        profissional_id: 'dr_a2',
        paciente_id: 'p1',
      })
    );
  });

  it('coleção sem regra explícita nasce negada', async () => {
    await assertFails(
      getDoc(doc(atores.drA(), 'clinicas', CLINICA_A, 'prontuario_dummy', 'x'))
    );
  });
});
