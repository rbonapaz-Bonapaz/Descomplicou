export type UserProfile = 'gestor' | 'secretaria' | 'colaborador' | 'visitante';
export type VinculoTipo = 'proprietario' | 'clt' | 'parceiro';

export interface User {
  uid: string;
  nome: string;
  email: string;
  perfil: UserProfile; 
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

  // Gestão de Funções (Multifunções)
  role_gestor?: boolean;
  role_secretaria?: boolean;
  role_profissional?: boolean;
  
  // Permissões Granulares
  access_financeiro?: boolean;
  access_inteligencia?: boolean;
  access_rh?: boolean;
  access_configuracoes?: boolean;
  access_recepcao?: boolean;
  access_agenda?: boolean;
  access_pacientes?: boolean;
  
  // Ações Críticas
  can_delete_data?: boolean;

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
  queixa_principal?: string;
  saldo_creditos?: number;
  historico_clinico?: EvolutionEntry[];
  foto_url?: string;
}

export interface EvolutionEntry {
  id: string;
  data: string;
  profissional_id: string;
  profissional_nome: string;
  descricao: string;
  observacao_secretaria?: string;
  tipo: 'evolucao' | 'anamnese' | 'avaliacao' | 'prescricao' | 'exame';
  assinatura_digital?: boolean;
  necessita_retorno?: boolean;
  prazo_retorno_dias?: number;
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