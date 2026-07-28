/**
 * MATRIZ DE PERMISSÕES
 *
 * Fonte única da verdade sobre quem pode o quê. As telas consultam este arquivo para
 * decidir o que mostrar; o `firestore.rules` repete a mesma matriz do lado do servidor.
 *
 * Esconder um botão NÃO é segurança — é conveniência. A proteção real está nas regras
 * do Firestore. Sempre que mudar algo aqui, mude o equivalente lá.
 *
 * Dois níveis de administração, que nunca se misturam:
 *
 *   - `superadmin`  = dono do sistema (você). Cadastra clínicas, define planos e preços.
 *                     NÃO tem acesso a prontuário, paciente ou financeiro de cliente algum.
 *   - `admin_clinica` = quem comprou o sistema. Manda dentro da própria clínica e só dela.
 */

/** Papéis dentro de uma clínica. Um usuário pode acumular mais de um. */
export type Papel =
  /** Administrador da clínica: equipe, financeiro, configurações, RH. */
  | 'admin_clinica'
  /** Profissional de saúde: agenda própria, atendimento e prontuário. */
  | 'profissional'
  /** Recepção: agenda coletiva, cadastro de paciente, caixa. Nunca prontuário. */
  | 'recepcao'
  /** Acesso ao financeiro sem ser administrador. */
  | 'financeiro';

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  {
    valor: 'admin_clinica',
    rotulo: 'Administrador da clínica',
    descricao: 'Gerencia equipe, financeiro, RH e configurações. Não vê prontuário se não for profissional.',
  },
  {
    valor: 'profissional',
    rotulo: 'Profissional de saúde',
    descricao: 'Tem agenda própria, atende e é o único que acessa prontuário.',
  },
  {
    valor: 'recepcao',
    rotulo: 'Recepção',
    descricao: 'Agenda de todos, cadastro de pacientes e caixa. Nunca acessa prontuário.',
  },
  {
    valor: 'financeiro',
    rotulo: 'Financeiro',
    descricao: 'Acesso a relatórios financeiros e despesas, sem poderes de administrador.',
  },
];

/**
 * O que existe para ser protegido. Um nome por área sensível do sistema.
 */
export type Capacidade =
  | 'prontuario.ler'
  | 'prontuario.escrever'
  | 'paciente.ler'
  | 'paciente.escrever'
  | 'paciente.excluir'
  | 'agenda.ler.propria'
  | 'agenda.ler.todas'
  | 'agenda.escrever.propria'
  | 'agenda.escrever.todas'
  | 'recepcao.usar'
  | 'financeiro.ler'
  | 'financeiro.escrever'
  | 'rh.ler'
  | 'rh.escrever'
  | 'ponto.registrar.proprio'
  | 'ponto.ler.proprio'
  | 'ponto.ler.todos'
  | 'ponto.aprovar'
  | 'equipe.ler'
  | 'equipe.escrever'
  | 'configuracoes.ler'
  | 'configuracoes.escrever'
  | 'auditoria.ler'
  | 'relatorios.ler'
  | 'lgpd.exportar'
  | 'lgpd.eliminar';

/**
 * Capacidades que cada papel concede.
 *
 * `prontuario.*` aparece só em `profissional`. Essa é a decisão central do sistema:
 * administrar a clínica não é o mesmo que atender paciente. Um administrador que também
 * atende recebe os dois papéis e aí sim enxerga o prontuário — pelo papel de profissional,
 * não pelo de administrador.
 */
const CAPACIDADES_POR_PAPEL: Record<Papel, Capacidade[]> = {
  profissional: [
    'prontuario.ler',
    'prontuario.escrever',
    'paciente.ler',
    'paciente.escrever',
    'agenda.ler.propria',
    'agenda.ler.todas',
    'agenda.escrever.propria',
    'ponto.registrar.proprio',
    'ponto.ler.proprio',
    'relatorios.ler',
  ],
  recepcao: [
    'paciente.ler',
    'paciente.escrever',
    'agenda.ler.todas',
    'agenda.escrever.todas',
    'recepcao.usar',
    'ponto.registrar.proprio',
    'ponto.ler.proprio',
  ],
  financeiro: [
    'financeiro.ler',
    'financeiro.escrever',
    'relatorios.ler',
    'ponto.registrar.proprio',
    'ponto.ler.proprio',
  ],
  admin_clinica: [
    'paciente.ler',
    'paciente.escrever',
    'paciente.excluir',
    'agenda.ler.todas',
    'agenda.escrever.todas',
    'recepcao.usar',
    'financeiro.ler',
    'financeiro.escrever',
    'rh.ler',
    'rh.escrever',
    'ponto.registrar.proprio',
    'ponto.ler.proprio',
    'ponto.ler.todos',
    'ponto.aprovar',
    'equipe.ler',
    'equipe.escrever',
    'configuracoes.ler',
    'configuracoes.escrever',
    'auditoria.ler',
    'relatorios.ler',
    'lgpd.exportar',
    'lgpd.eliminar',
  ],
};

/**
 * Identidade do usuário conforme o token verificado — não conforme o documento no
 * Firestore, que o próprio usuário poderia tentar editar.
 */
export interface Identidade {
  uid: string;
  clinicaId: string | null;
  papeis: Papel[];
  /** Dono do sistema. Vive fora de qualquer clínica. */
  superadmin: boolean;
}

export const IDENTIDADE_VAZIA: Identidade = {
  uid: '',
  clinicaId: null,
  papeis: [],
  superadmin: false,
};

/** O usuário tem esta capacidade dentro da própria clínica? */
export function pode(identidade: Identidade | null, capacidade: Capacidade): boolean {
  if (!identidade) return false;
  // O dono do sistema administra a plataforma, não as clínicas. Nenhuma capacidade
  // clínica é concedida por ser superadmin — inclusive prontuário e financeiro do cliente.
  if (!identidade.clinicaId) return false;
  return identidade.papeis.some((papel) =>
    CAPACIDADES_POR_PAPEL[papel]?.includes(capacidade)
  );
}

/** Atalho para telas que exigem qualquer uma de várias capacidades. */
export function podeAlguma(
  identidade: Identidade | null,
  capacidades: Capacidade[]
): boolean {
  return capacidades.some((c) => pode(identidade, c));
}

export function temPapel(identidade: Identidade | null, papel: Papel): boolean {
  return !!identidade?.papeis.includes(papel);
}

/** Todas as capacidades resultantes da soma dos papéis. Útil para depurar e exibir. */
export function capacidadesDe(identidade: Identidade | null): Capacidade[] {
  if (!identidade?.clinicaId) return [];
  const conjunto = new Set<Capacidade>();
  identidade.papeis.forEach((papel) =>
    CAPACIDADES_POR_PAPEL[papel]?.forEach((c) => conjunto.add(c))
  );
  return Array.from(conjunto);
}

/**
 * Capacidade mínima exigida por rota. O guarda de rota usa este mapa; sem entrada aqui,
 * a rota é tratada como autenticada apenas.
 *
 * As chaves batem com o caminho já normalizado com barra final (`trailingSlash: true`).
 */
export const CAPACIDADE_POR_ROTA: Record<string, Capacidade[]> = {
  '/pacientes/': ['paciente.ler'],
  '/pacientes/prontuario/': ['prontuario.ler'],
  '/agenda/': ['agenda.ler.propria', 'agenda.ler.todas'],
  '/recepcao/': ['recepcao.usar'],
  '/recepcao/tv/': ['recepcao.usar'],
  '/financeiro/': ['financeiro.ler'],
  '/despesas/': ['financeiro.ler'],
  '/convenios/': ['financeiro.ler'],
  '/inteligencia/': ['relatorios.ler'],
  '/rh/equipe/': ['equipe.ler'],
  '/rh/jornada/': ['ponto.aprovar'],
  '/configuracoes/': ['configuracoes.ler'],
};

/** Rotas que não exigem login. */
export const ROTAS_PUBLICAS = [
  '/login/',
  '/register/',
  '/ponto-mobile/',
  '/termos/',
  '/privacidade/',
];

/** Rotas exclusivas do dono do sistema. */
export const PREFIXO_SUPERADMIN = '/plataforma/';
