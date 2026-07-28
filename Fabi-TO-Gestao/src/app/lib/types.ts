import type { Papel } from '@/lib/permissions';

/**
 * @deprecated Substituído por `papeis: Papel[]` em `User`. Mantido só para ler documentos
 * antigos durante a migração — nenhuma decisão de acesso deve usar este campo.
 */
export type UserProfile = 'gestor' | 'secretaria' | 'colaborador' | 'visitante';
export type VinculoTipo = 'proprietario' | 'clt' | 'parceiro';

// ---------------------------------------------------------------------------
// Plataforma: a clínica como inquilino, e o plano que ela assina
// ---------------------------------------------------------------------------

export type PlanoTipo = 'teste' | 'mensal' | 'semestral' | 'anual' | 'vencido' | 'cancelado';

export const PLANO_ROTULO: Record<PlanoTipo, string> = {
  teste: 'Teste',
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

/** Área de atuação da clínica. Define rótulos e modelos padrão de prontuário. */
export type AreaClinica =
  | 'terapia_ocupacional'
  | 'fisioterapia'
  | 'psicologia'
  | 'fonoaudiologia'
  | 'nutricao'
  | 'odontologia'
  | 'medicina'
  | 'multidisciplinar'
  | 'outra';

/**
 * Módulos que a clínica liga ou desliga. Desligado some do menu e as regras
 * do Firestore recusam a escrita — não é só um enfeite visual.
 */
export interface ModulosClinica {
  financeiro: boolean;
  rh: boolean;
  ponto: boolean;
  ferias: boolean;
  recepcao: boolean;
  convenios: boolean;
  inteligencia: boolean;
  notaFiscal: boolean;
  lembretesWhatsapp: boolean;
}

export const MODULOS_PADRAO: ModulosClinica = {
  financeiro: true,
  rh: true,
  ponto: true,
  ferias: true,
  recepcao: true,
  convenios: true,
  inteligencia: true,
  // Emissão de nota entra numa fase seguinte; nasce desligada de propósito.
  notaFiscal: false,
  lembretesWhatsapp: false,
};

/** Identidade visual por clínica. */
export interface TemaClinica {
  cor_primaria?: string;
  cor_destaque?: string;
  logo_url?: string;
}

/** O inquilino. Um documento por cliente que comprou o sistema. */
export interface Clinica {
  id: string;
  nome: string;
  /** Usado no subdomínio/atalho de acesso. Único na plataforma. */
  slug: string;
  cnpj?: string;
  area: AreaClinica;
  email_contato: string;
  telefone?: string;
  endereco_cep?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  /** UID de quem administra a clínica. Nunca é o dono do sistema. */
  admin_uid: string;
  modulos: ModulosClinica;
  tema?: TemaClinica;
  criada_em: string;
  ativa: boolean;
  /** Encarregado de dados (LGPD art. 41). */
  dpo_nome?: string;
  dpo_email?: string;
}

/**
 * Estado comercial da clínica. Vive fora do documento da clínica porque só o dono do
 * sistema escreve aqui — o cliente lê o próprio plano, mas não consegue estendê-lo.
 */
export interface Assinatura {
  clinica_id: string;
  plano: PlanoTipo;
  /**
   * Quando o acesso de escrita expira, em epoch (ms). Vale tanto para o fim do
   * teste quanto para o fim do plano pago — um campo só, que é exatamente o que
   * o `firestore.rules` compara. Data em texto abriria brecha de fuso e formato.
   */
  expira_em: number;
  /** Mesma data em texto legível (YYYY-MM-DD), só para exibir na tela. */
  expira_em_label?: string;
  /** Teto de profissionais com agenda. `null` = sem limite. */
  limite_profissionais: number | null;
  valor_mensal?: number;
  observacao_interna?: string;
  atualizada_em: string;
}

/** Configuração global do produto, editável só pelo dono do sistema. */
export interface ConfigPlataforma {
  preco_mensal: number;
  preco_semestral: number;
  preco_anual: number;
  dias_teste: number;
  limite_profissionais_teste: number | null;
  versao_termos: string;
  versao_privacidade: string;
}

/** Situação do plano, já calculada para a tela. */
export interface SituacaoPlano {
  plano: PlanoTipo;
  emTeste: boolean;
  vencido: boolean;
  /** Dias até o fim do teste ou da vigência. `null` quando não se aplica. */
  diasRestantes: number | null;
  /** Bloqueia escrita e deixa o sistema só de leitura. */
  somenteLeitura: boolean;
}

// ---------------------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------------------

/** Aceite de termo de uso / política de privacidade, com versão e prova. */
export interface Aceite {
  uid: string;
  email: string;
  versao_termos: string;
  versao_privacidade: string;
  aceito_em: string;
  user_agent?: string;
}

/**
 * Consentimento do titular para tratamento de dado de saúde (LGPD art. 11).
 * Guardado por paciente, com registro de quem colheu.
 */
export interface Consentimento {
  id: string;
  paciente_id: string;
  finalidade: string;
  concedido: boolean;
  concedido_em: string;
  /** Quem assinou: o próprio paciente ou o responsável legal. */
  titular: 'paciente' | 'responsavel';
  titular_nome: string;
  colhido_por_uid: string;
  colhido_por_nome: string;
  revogado_em?: string;
}

/** Registro imutável de operação sobre dado pessoal (LGPD art. 37). */
export interface RegistroAuditoria {
  id: string;
  uid: string;
  nome: string;
  acao: string;
  modulo: string;
  /** Preenchido quando a operação toca dado de um paciente específico. */
  paciente_id?: string;
  detalhe: string;
  severidade: 'info' | 'alerta' | 'critico';
  registrado_em: string;
}

export interface User {
  uid: string;
  nome: string;
  email: string;
  /** Papéis efetivos. Espelhados no custom claim do token — a regra confia no claim. */
  papeis: Papel[];
  /** @deprecated Use `papeis`. Só para ler cadastros antigos. */
  perfil?: UserProfile;
  vinculo?: VinculoTipo;
  salario_base?: number;
  pro_labore?: number;
  data_cadastro?: string;
  cpf?: string;
  telefone?: string;
  telefone2?: string;
  telefone3?: string;
  fax?: string;
  matricula?: string;
  superior?: string;
  data_admissao?: string;
  departamento?: string;
  genero?: string;
  data_nascimento?: string;
  apelido?: string;
  nacionalidade?: string;
  naturalidade?: string;
  foto_url?: string;
  cor_agenda?: string; 
  biometria_ativa?: boolean;
  
  // Endereço
  endereco_cep?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  endereco_pais?: string;

  /**
   * @deprecated Substituídos por `papeis`. Migrados uma vez pela function de onboarding
   * e mantidos só para leitura de cadastros antigos.
   */
  role_gestor?: boolean;
  role_secretaria?: boolean;
  role_profissional?: boolean;
  access_financeiro?: boolean;
  access_inteligencia?: boolean;
  access_rh?: boolean;
  access_configuracoes?: boolean;
  access_recepcao?: boolean;
  access_agenda?: boolean;
  access_pacientes?: boolean;
  can_delete_data?: boolean;

  /** Registro no conselho de classe (CREFITO, CRP, CRM...). Exigido para assinar evolução. */
  conselho_sigla?: string;
  conselho_numero?: string;

  ativo?: boolean;

  possui_agenda?: boolean;
  area_atuacao?: string; 
  
  medicos_gerenciados?: string[]; 
  destino_pagamento?: 'clinica' | 'profissional';
  
  repasse_tipo?: 'fixo' | 'percentual';
  repasse_valor?: number;

  cobranca_tipo?: 'fixo' | 'percentual';
  cobranca_valor?: number;

  modelo_contrato?: 'comissao' | 'sublocacao_fixa' | 'taxa_uso';
  
  grade_individual_ativa?: boolean;
  grade_horaria?: {
    [key: string]: { 
      active: boolean; 
      start: string; 
      end: string; 
      pausas?: Break[];
    };
  };
}

export interface PriceLog {
  data: string;
  valor_anterior: number;
  valor_novo: number;
  lucro_anterior: number;
  lucro_novo: number;
  usuario_nome: string;
}

export interface Holiday {
  id: string;
  data: string;
  nome: string;
  tipo: 'nacional' | 'estadual' | 'municipal' | 'recesso' | 'ponto_facultativo';
  recorrente: boolean;
  bloqueia_agenda: boolean;
  origem?: 'api' | 'manual';
}

export interface HealthPlan {
  id: string;
  nome: string;
  tipo: 'convenio' | 'particular';
  valor_sessao: number;
  porcentagem_lucro: number;
  prazo_repasse_dias?: number;
  historico_precos?: PriceLog[];
}

export interface FinancialConfig {
  taxa_cartao_credito: number;
  taxa_cartao_debito: number;
  prazo_padrao_convenio: number;
}

export interface Transaction {
  id?: string;
  data_criacao: string;
  data_vencimento: string;
  paciente_id: string;
  paciente_nome: string;
  agendamento_id: string;
  tipo: 'entrada' | 'saida';
  meio_pagamento: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'convenio' | 'pacote';
  valor_bruto: number;
  taxa_valor: number;
  valor_liquido: number;
  status: 'pago' | 'pendente' | 'cancelado';
  categoria: 'sessao' | 'avulso' | 'salario' | 'pro_labore' | 'comissao' | 'sublocacao';
}

/**
 * Cadastro do paciente: o que a recepção precisa para agendar, atender no balcão e cobrar.
 *
 * IMPORTANTE: nada de conteúdo clínico entra aqui. Queixa, evolução, avaliação, prescrição
 * e exame vivem na subcoleção `prontuario`, que a recepção não lê. Colocar um campo clínico
 * neste documento reabre exatamente o vazamento que a subcoleção existe para fechar.
 */
export interface Patient {
  id: string;
  nome: string;
  cpf?: string;
  genero?: string;
  data_nascimento: string;
  email?: string;
  telefone: string;
  responsavel_nome?: string;
  responsavel_parentesco?: string;
  convenio_id: string;
  endereco_cep?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  saldo_creditos?: number;
  foto_url?: string;
  /** Profissionais que acompanham o caso. Usado para filtrar agenda e relatórios. */
  profissionais_ids?: string[];
  ativo?: boolean;
  criado_em?: string;
  /** Consentimento de tratamento de dado de saúde já colhido? (LGPD art. 11) */
  consentimento_ativo?: boolean;
  /**
   * @deprecated Movido para a subcoleção `prontuario`. Só existe em documentos antigos,
   * e a migração o remove. Nunca escreva neste campo.
   */
  historico_clinico?: EvolutionEntry[];
  /** @deprecated Movido para o prontuário — é conteúdo clínico. */
  queixa_principal?: string;
}

export type TipoEntradaProntuario =
  | 'evolucao'
  | 'anamnese'
  | 'avaliacao'
  | 'prescricao'
  | 'exame'
  | 'queixa';

/**
 * Entrada do prontuário. Documento em
 * `clinicas/{clinicaId}/pacientes/{pacienteId}/prontuario/{id}`.
 *
 * Só quem tem o papel `profissional` lê ou escreve — regra aplicada no Firestore, não na tela.
 * Uma vez assinada, a entrada não pode ser alterada nem apagada: correção se faz por
 * retificação (nova entrada apontando para a anterior), como manda a boa prática de
 * prontuário e a Resolução CFM 1.821/2007.
 */
export interface EvolutionEntry {
  id: string;
  data: string;
  profissional_id: string;
  profissional_nome: string;
  profissional_conselho?: string;
  descricao: string;
  tipo: TipoEntradaProntuario;
  agendamento_id?: string;
  /** Congela a entrada: a partir daqui, só retificação. */
  assinatura_digital?: boolean;
  assinada_em?: string;
  /** Preenchido quando esta entrada retifica outra. */
  retifica_entrada_id?: string;
  necessita_retorno?: boolean;
  prazo_retorno_dias?: number;
  criada_em?: string;
}

/**
 * Recado operacional da recepção sobre um atendimento (ex.: "paciente avisou que atrasa").
 * Fica FORA do prontuário de propósito: é informação administrativa, e é o que a recepção
 * de fato precisa escrever. Mora junto do agendamento.
 */
export interface ObservacaoRecepcao {
  id: string;
  agendamento_id: string;
  paciente_id: string;
  texto: string;
  autor_uid: string;
  autor_nome: string;
  criada_em: string;
}

export type AppointmentStatus = 
  | 'agendado' 
  | 'aguardando_confirmacao'
  | 'aguardando_retorno'
  | 'confirmado' 
  | 'espera' 
  | 'atendimento' 
  | 'realizado' 
  | 'faltou' 
  | 'cancelado' 
  | 'bloqueado';

export type RecurrenceType = 
  | 'nenhuma' 
  | 'diaria' 
  | 'semanal' 
  | 'mensal' 
  | 'anual' 
  | 'dias_uteis' 
  | 'personalizado';

export type BreakRecurrence = 'semanal' | 'mensal' | 'anual';

export interface Break {
  id: string;
  label: string;
  start: string;
  end: string;
  recorrencia: BreakRecurrence;
  recorrencia_intervalo?: number; 
  recorrencia_unidade?: 'semana' | 'mes'; 
  recorrencia_fim_tipo?: 'nunca' | 'data' | 'ocorrencias';
  recorrencia_fim_data?: string;
  recorrencia_fim_ocorrencias?: number;
  data_inicio: string;
}

export interface WorkingDay {
  active: boolean;
  start: string;
  end: string;
  pausas: Break[];
}

export interface ClinicSettings {
  duracao_sessao: number;
  intervalo_sessao: number;
  limite_manha: number;
  limite_tarde: number;
  prazo_cancelamento_horas: number;
  wifi_nome?: string;
  wifi_senha?: string;
  telefone_clinica?: string;
  telefone_clinica_2?: string;
  google_sync_enabled?: boolean;
  google_calendar_url?: string;
  google_calendar_email_type?: 'cadastro' | 'outro';
  google_calendar_custom_email?: string;
  google_exclusive_calendar?: boolean;
  google_show_personal?: boolean;
  motivos_bloqueio?: string[];
  banco_horas_ciclo_meses?: number;
  banco_horas_carga_diaria_min?: number;
  feriados?: Holiday[];
  workingHours: {
    [key: string]: WorkingDay;
  };
}

export type ExpenseCategory = 'fixo' | 'variavel' | 'avulso' | 'pessoal';
export type ExpenseStatus = 'pago' | 'pendente' | 'cancelado';

export interface RecurringExpense {
  id: string;
  nome: string;
  valor_estimado: number;
  dia_vencimento: number;
  categoria: ExpenseCategory;
  ativa: boolean;
}

export interface ExpenseRecord {
  id: string;
  nome: string;
  valor: number;
  vencimento: string; 
  pagamento?: string; 
  status: ExpenseStatus;
  categoria: ExpenseCategory;
  template_id?: string;
  mes_ano: string; 
  bloqueado_fechamento: boolean;
  tipo: 'receita' | 'despesa';
}

export interface MonthlyClosure {
  id: string; 
  total_receitas: number;
  total_despesas: number;
  saldo_final: number;
  data_fechamento: string;
  responsavel_fechamento: string;
  status: 'fechado';
}

export interface TimeClosure {
  id: string; 
  mes_ano: string;
  data_fechamento: string;
  responsavel_fechamento: string;
  status: 'fechado';
  totais_por_usuario: {
    userId: string;
    userName: string;
    totalMinutos: number;
    totalBatidas: number;
    saldoMinutos?: number;
  }[];
}

export interface VacationRequest {
  id: string;
  userId: string;
  userName: string;
  data_inicio: string;
  data_fim: string;
  status: 'pendente' | 'aprovado' | 'reprovado';
  data_solicitacao: string;
  observacao?: string;
}

export interface Appointment {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  data_hora: string;
  time?: string;
  endTime?: string;
  convenio_id: string;
  status: AppointmentStatus;
  status_anterior?: AppointmentStatus;
  valor_final: number;
  profissional_id: string;
  profissional_nome?: string; 
  motivo_bloqueio?: string | null;
  cancelamento_justificativa?: string;
  cancelamento_data?: string;
  cancelamento_origem?: 'paciente' | 'profissional';
  cancelamento_prazo?: 'no_prazo' | 'fora_do_prazo';
  cancelamento_cobrado?: boolean;
  exclusao_justificativa?: string;
  chegada_horario?: string;
  inicio_atendimento?: string;
  fim_atendimento?: string;
  necessita_retorno?: boolean;
  prazo_retorno_dias?: number;
  observacao_secretaria?: string;
  recorrencia_tipo?: RecurrenceType;
  reagendado_contagem?: number;
  status_financeiro?: 'pendente' | 'pago' | 'nao_cobrado';
  atraso_sinalizado_minutos?: number;
  conflito_com_bloqueio?: boolean;
}

export interface ClockInRecord {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  type: 'entrada' | 'saida';
  status: 'aprovado' | 'pendente' | 'reprovado';
  justificativa?: string;
  observacao_gestor?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}