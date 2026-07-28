/**
 * CAMADA DE ISOLAMENTO POR CLÍNICA (multi-tenant)
 *
 * Todo dado de uma clínica vive sob `clinicas/{clinicaId}/...`. Nada de dado clínico
 * mora em coleção raiz — é isso que impede a Clínica A de enxergar a Clínica B quando
 * as duas usam o mesmo projeto Firebase.
 *
 * Regra de ouro: nenhuma tela monta caminho de Firestore na mão. Toda leitura/escrita
 * passa por estes helpers, que exigem o `clinicaId` como primeiro argumento. Assim, um
 * caminho sem tenant não compila — o erro aparece no editor, não em produção.
 *
 * O `clinicaId` vem do custom claim do token (ver `permissions.ts`), não de um campo
 * que o navegador possa alterar.
 */

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

/** Raiz de cada clínica. */
export const CLINICAS = 'clinicas';

/**
 * Subcoleções de uma clínica. O prontuário é o único dado que a recepção nunca acessa,
 * por isso ele é subcoleção do paciente e não um campo dentro do documento dele:
 * regra de segurança sabe negar uma subcoleção, mas não sabe esconder um campo.
 */
export const SUB = {
  usuarios: 'usuarios',
  pacientes: 'pacientes',
  agendamentos: 'agendamentos',
  convenios: 'convenios',
  transacoes: 'transacoes',
  despesas: 'despesas',
  despesasRecorrentes: 'despesas_recorrentes',
  fechamentosMensais: 'fechamentos_mensais',
  batidasPonto: 'batidas_ponto',
  ajustesPonto: 'ajustes_ponto',
  fechamentosPonto: 'fechamentos_ponto',
  solicitacoesFerias: 'solicitacoes_ferias',
  comunicados: 'comunicados',
  configuracoes: 'configuracoes',
  feriados: 'feriados',
  auditoria: 'auditoria',
  consentimentos: 'consentimentos',
} as const;

/** Subcoleções de um paciente. */
export const SUB_PACIENTE = {
  prontuario: 'prontuario',
  anexos: 'anexos',
} as const;

/** Coleções globais da plataforma (fora de qualquer clínica). */
export const PLATAFORMA = {
  /** Configuração do produto: preços, dias de teste, módulos disponíveis. */
  config: 'plataforma',
  /** Estado comercial de cada clínica. Só o dono do sistema escreve. */
  assinaturas: 'assinaturas',
  /** Quem é dono do sistema. Leitura e escrita bloqueadas no cliente. */
  superadmins: 'superadmins',
  /** Índice uid -> clinicaId, para o primeiro login antes do claim propagar. */
  membros: 'membros',
  /** Aceites de termo de uso e política de privacidade, por usuário e versão. */
  aceites: 'aceites',
} as const;

function assertClinica(clinicaId: string | null | undefined): asserts clinicaId is string {
  if (!clinicaId) {
    throw new Error(
      'Tentativa de acessar dados sem clínica definida. ' +
        'Isso indica que o usuário não tem o claim `clinicaId` — nunca contorne com um valor padrão.'
    );
  }
}

/** Documento da própria clínica. */
export function clinicaRef(db: Firestore, clinicaId: string): DocumentReference {
  assertClinica(clinicaId);
  return doc(db, CLINICAS, clinicaId);
}

/**
 * Coleção dentro da clínica. Ex.: `col<Patient>(db, id, SUB.pacientes)`
 *
 * O genérico existe para os hooks (`useCollection<Patient>`) continuarem tipados:
 * sem ele tudo viraria `DocumentData` e o TypeScript deixaria de avisar quando um
 * campo some ou muda de nome.
 */
export function col<T = DocumentData>(
  db: Firestore,
  clinicaId: string,
  sub: (typeof SUB)[keyof typeof SUB]
): CollectionReference<T> {
  assertClinica(clinicaId);
  return collection(db, CLINICAS, clinicaId, sub) as CollectionReference<T>;
}

/** Documento dentro da clínica. */
export function ref<T = DocumentData>(
  db: Firestore,
  clinicaId: string,
  sub: (typeof SUB)[keyof typeof SUB],
  docId: string
): DocumentReference<T> {
  assertClinica(clinicaId);
  return doc(db, CLINICAS, clinicaId, sub, docId) as DocumentReference<T>;
}

/**
 * Prontuário de um paciente. Separado de propósito: quem não é profissional de saúde
 * é barrado aqui pelas regras, mesmo tendo acesso ao cadastro do paciente.
 */
export function prontuarioCol<T = DocumentData>(
  db: Firestore,
  clinicaId: string,
  pacienteId: string
): CollectionReference<T> {
  assertClinica(clinicaId);
  return collection(
    db,
    CLINICAS,
    clinicaId,
    SUB.pacientes,
    pacienteId,
    SUB_PACIENTE.prontuario
  ) as CollectionReference<T>;
}

export function prontuarioRef<T = DocumentData>(
  db: Firestore,
  clinicaId: string,
  pacienteId: string,
  entryId: string
): DocumentReference<T> {
  assertClinica(clinicaId);
  return doc(
    db,
    CLINICAS,
    clinicaId,
    SUB.pacientes,
    pacienteId,
    SUB_PACIENTE.prontuario,
    entryId
  ) as DocumentReference<T>;
}

export function anexosCol<T = DocumentData>(
  db: Firestore,
  clinicaId: string,
  pacienteId: string
): CollectionReference<T> {
  assertClinica(clinicaId);
  return collection(
    db,
    CLINICAS,
    clinicaId,
    SUB.pacientes,
    pacienteId,
    SUB_PACIENTE.anexos
  ) as CollectionReference<T>;
}

/** Documento de configuração da plataforma inteira (preços, trial, módulos). */
export function plataformaConfigRef(db: Firestore): DocumentReference {
  return doc(db, PLATAFORMA.config, 'config');
}

/** Assinatura de uma clínica. */
export function assinaturaRef(db: Firestore, clinicaId: string): DocumentReference {
  assertClinica(clinicaId);
  return doc(db, PLATAFORMA.assinaturas, clinicaId);
}

/** Índice de qual clínica um usuário pertence. */
export function membroRef(db: Firestore, uid: string): DocumentReference {
  return doc(db, PLATAFORMA.membros, uid);
}
