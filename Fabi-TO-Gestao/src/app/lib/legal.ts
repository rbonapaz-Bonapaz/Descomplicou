/**
 * TEXTOS LEGAIS — versionados
 *
 * A versão importa: o aceite guardado em `/aceites` registra QUAL versão a pessoa
 * aceitou. Mudou o texto, sobe a versão, e o sistema volta a pedir aceite. Sem isso
 * não há como provar a que a pessoa consentiu.
 *
 * Isto é a base do produto, não aconselhamento jurídico. Antes de vender, mande um
 * advogado revisar — principalmente as cláusulas de responsabilidade e os prazos de
 * retenção, que variam conforme o conselho de classe de cada área.
 */

export const VERSAO_TERMOS = '2026-07-28.1';
export const VERSAO_PRIVACIDADE = '2026-07-28.1';

export const NOME_SISTEMA = 'Prontta';
export const EMAIL_ENCARREGADO = 'privacidade@prontta.com.br';
export const EMAIL_SUPORTE = 'contato@prontta.com.br';

export interface SecaoLegal {
  titulo: string;
  paragrafos: string[];
}

export const TERMOS_DE_USO: SecaoLegal[] = [
  {
    titulo: '1. O que é o Prontta',
    paragrafos: [
      `O ${NOME_SISTEMA} é um sistema de gestão para clínicas e consultórios da área da saúde. Ele organiza agenda, cadastro de pacientes, prontuário, financeiro e gestão de equipe.`,
      `O ${NOME_SISTEMA} é uma ferramenta administrativa. Ele não pratica ato de saúde, não emite diagnóstico, não substitui julgamento clínico e não se responsabiliza por decisões assistenciais tomadas por profissionais que o utilizam.`,
    ],
  },
  {
    titulo: '2. Quem contrata e quem usa',
    paragrafos: [
      'A contratação é feita pela clínica, que passa a ser a titular da conta. A clínica indica um administrador, responsável por cadastrar a equipe e definir o que cada pessoa acessa.',
      'Cada pessoa da equipe recebe acesso individual e intransferível. Compartilhar login é proibido: ele é o que identifica quem registrou cada evolução e quem acessou cada prontuário.',
      'A clínica é responsável por manter os acessos atualizados, removendo imediatamente quem deixa a equipe.',
    ],
  },
  {
    titulo: '3. Responsabilidade sobre o conteúdo',
    paragrafos: [
      'Todo conteúdo inserido no sistema — dados de pacientes, evoluções, prescrições, valores, documentos e anexos — é de responsabilidade exclusiva da clínica e do profissional que o inseriu.',
      `O ${NOME_SISTEMA} não revisa, valida, edita nem endossa esse conteúdo. Atuamos como operador de dados, tratando as informações conforme as instruções da clínica.`,
      'A clínica declara que possui base legal para tratar os dados que insere, incluindo o consentimento do titular ou de seu responsável legal quando exigido, e que os dados são verdadeiros e atualizados.',
      'É proibido usar o sistema para conteúdo ilícito, para dados de pessoas sem relação assistencial com a clínica, ou para qualquer finalidade diferente da gestão da própria clínica.',
      'A clínica responde perante pacientes, conselhos de classe e autoridades pelo conteúdo que registra, inclusive pela guarda e pelo sigilo profissional.',
    ],
  },
  {
    titulo: '4. Planos, teste e pagamento',
    paragrafos: [
      'O acesso começa por um período de teste gratuito, contado em dias, informado no momento da contratação.',
      'Terminado o teste, o uso depende de plano ativo (mensal, semestral ou anual). Sem plano ativo, a conta entra em modo somente leitura.',
      'Em modo somente leitura a clínica continua consultando e exportando tudo o que já registrou. Não retemos dados de ninguém como forma de cobrança.',
      'Valores podem ser reajustados anualmente, com aviso prévio de no mínimo 30 dias.',
    ],
  },
  {
    titulo: '5. Disponibilidade e continuidade',
    paragrafos: [
      'Trabalhamos para manter o sistema disponível, mas ele pode ficar indisponível por manutenção, falha de terceiros ou caso fortuito. Não garantimos operação ininterrupta.',
      'A clínica deve manter rotina própria de exportação periódica dos dados, disponível no sistema.',
      'Em caso de encerramento do contrato, a clínica tem 60 dias para exportar seus dados antes da eliminação definitiva, ressalvado o que a lei obrigue a reter.',
    ],
  },
  {
    titulo: '6. Encerramento',
    paragrafos: [
      'A clínica pode encerrar a assinatura a qualquer momento, sem multa, com efeito ao fim do período já pago.',
      'Podemos suspender ou encerrar o acesso em caso de descumprimento destes termos, uso ilícito ou inadimplência, sempre com aviso prévio, salvo quando houver risco iminente.',
    ],
  },
  {
    titulo: '7. Limitação de responsabilidade',
    paragrafos: [
      `Salvo dolo ou culpa grave, a responsabilidade do ${NOME_SISTEMA} fica limitada ao valor pago pela clínica nos 12 meses anteriores ao evento.`,
      'Não respondemos por lucros cessantes, perda de oportunidade, nem por decisões clínicas ou administrativas tomadas com base em informações inseridas pela própria clínica.',
    ],
  },
  {
    titulo: '8. Foro e alterações',
    paragrafos: [
      'Estes termos podem ser alterados. Mudanças relevantes são comunicadas com 30 dias de antecedência e exigem novo aceite.',
      'Aplica-se a lei brasileira, no foro do domicílio da clínica contratante.',
    ],
  },
];

export const POLITICA_PRIVACIDADE: SecaoLegal[] = [
  {
    titulo: '1. Nossos papéis nesta relação',
    paragrafos: [
      'A clínica é a CONTROLADORA dos dados de seus pacientes e de sua equipe: é ela quem decide o que coletar e para quê.',
      `O ${NOME_SISTEMA} é OPERADOR: tratamos os dados apenas para prestar o serviço, seguindo as instruções da clínica. Não vendemos, não alugamos e não usamos dados de pacientes para publicidade.`,
      'Somos controladores apenas dos dados de cadastro e cobrança da própria clínica contratante.',
    ],
  },
  {
    titulo: '2. Que dados são tratados',
    paragrafos: [
      'Da equipe: nome, e-mail, CPF, telefone, dados contratuais e de jornada, e registros de acesso ao sistema.',
      'De pacientes: identificação, contato, endereço, convênio, agendamentos, valores e — quando registrado por profissional de saúde — conteúdo clínico (anamnese, evolução, avaliação, prescrição, exames).',
      'Dado de saúde é DADO PESSOAL SENSÍVEL (art. 11 da LGPD) e recebe proteção reforçada, descrita no item 4.',
      'Registros técnicos: data, hora e autor de cada operação sobre dado pessoal, para fins de auditoria (art. 37 da LGPD).',
    ],
  },
  {
    titulo: '3. Com que base legal',
    paragrafos: [
      'Execução de contrato, para a operação do sistema contratado pela clínica.',
      'Tutela da saúde, por profissional de saúde ou serviço de saúde, para o tratamento de dados clínicos (art. 11, II, "f").',
      'Cumprimento de obrigação legal e regulatória, incluindo a guarda mínima de prontuário.',
      'Consentimento do titular, quando a finalidade não estiver amparada pelas hipóteses acima.',
    ],
  },
  {
    titulo: '4. Como o prontuário é protegido',
    paragrafos: [
      'O prontuário é armazenado separado do cadastro administrativo do paciente, com regra de acesso própria aplicada no servidor.',
      'Apenas quem tem o papel de profissional de saúde na clínica acessa conteúdo clínico. A recepção acessa o cadastro para agendar e receber, mas nunca a evolução clínica.',
      'Administrar a clínica não dá acesso ao prontuário: um administrador que não atende não lê conteúdo clínico. Quem administra e também atende recebe os dois papéis.',
      'Todo acesso a prontuário é registrado em trilha de auditoria imutável, com autor, paciente e horário.',
      'Evolução assinada não pode ser alterada nem apagada. Correções são feitas por retificação, preservando o registro original.',
      'Os dados de cada clínica ficam isolados: nenhuma clínica acessa dados de outra.',
    ],
  },
  {
    titulo: '5. Direitos do titular',
    paragrafos: [
      'O titular (ou seu responsável legal) pode confirmar a existência de tratamento, acessar seus dados, corrigir dados incompletos ou desatualizados, solicitar portabilidade, revogar consentimento e pedir eliminação.',
      'O pedido deve ser feito à clínica, que é a controladora. A clínica dispõe de ferramentas no sistema para exportar e para anonimizar os dados do titular.',
      'Limite legal à eliminação: o prontuário tem guarda obrigatória por prazo mínimo definido em norma (a Resolução CFM 1.821/2007 estabelece 20 anos, e conselhos de outras áreas têm prazos próprios). Nesses casos, o cadastro é anonimizado e o prontuário é preservado sem vínculo com a identificação do titular, conforme o art. 16, I, da LGPD.',
    ],
  },
  {
    titulo: '6. Onde ficam e por quanto tempo',
    paragrafos: [
      'Os dados são armazenados em infraestrutura do Google Cloud Platform (Firebase), com trânsito e repouso criptografados.',
      'Podem ser processados em servidores fora do Brasil, com as salvaguardas contratuais exigidas pelos arts. 33 a 36 da LGPD.',
      'Retemos os dados enquanto durar o contrato. Após o encerramento, mantemos por 60 dias para exportação e então eliminamos, exceto o que a lei obrigue a reter.',
    ],
  },
  {
    titulo: '7. Incidentes de segurança',
    paragrafos: [
      'Em caso de incidente com risco relevante aos titulares, comunicamos a clínica em até 48 horas da confirmação, com a descrição do ocorrido, os dados envolvidos e as medidas adotadas.',
      'Cabe à clínica, como controladora, comunicar a ANPD e os titulares, com nosso apoio técnico.',
    ],
  },
  {
    titulo: '8. Encarregado (DPO)',
    paragrafos: [
      `Dúvidas e solicitações sobre privacidade: ${EMAIL_ENCARREGADO}.`,
      'Cada clínica pode indicar seu próprio encarregado, exibido para sua equipe dentro do sistema.',
    ],
  },
];
