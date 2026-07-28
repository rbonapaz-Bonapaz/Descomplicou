/**
 * CLOUD FUNCTIONS — Prontta
 *
 * Estas funções existem porque algumas decisões NÃO podem ser tomadas pelo navegador:
 *
 *   - Quem é de qual clínica e com quais papéis (vira custom claim no token).
 *   - Até quando a clínica pode gravar (vira o campo que o firestore.rules compara).
 *   - Quem é dono do sistema.
 *
 * O Admin SDK ignora o firestore.rules. Por isso toda função aqui refaz a checagem de
 * permissão na mão, na primeira linha. Uma função sem essa checagem é um buraco que
 * anula todas as regras de segurança do projeto.
 *
 * Região igual à do FaroBella para manter a operação num lugar só. O SDK do cliente
 * precisa apontar para a mesma região, senão cai em 404.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });

const PAPEIS_VALIDOS = ['admin_clinica', 'profissional', 'recepcao', 'financeiro'];
const DIAS_TESTE_PADRAO = 14;

// ---------------------------------------------------------------------------
// Guardas
// ---------------------------------------------------------------------------

function exigirLogin(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login novamente.');
  return uid;
}

/**
 * Dono do sistema. Confere na coleção `superadmins`, que o cliente não lê nem
 * escreve — o claim sozinho não basta como fonte da verdade para conceder poder.
 */
async function exigirSuperadmin(request) {
  const uid = exigirLogin(request);
  const snap = await db.doc(`superadmins/${uid}`).get();
  if (!snap.exists) {
    logger.warn('Tentativa de ação de dono do sistema por usuário sem permissão', { uid });
    throw new HttpsError('permission-denied', 'Ação restrita ao administrador do sistema.');
  }
  return uid;
}

/** Administrador da clínica indicada. Lê do token, que só a nossa função grava. */
function exigirAdminDaClinica(request, clinicaId) {
  const uid = exigirLogin(request);
  const token = request.auth.token || {};
  const papeis = Array.isArray(token.papeis) ? token.papeis : [];
  if (token.clinicaId !== clinicaId || !papeis.includes('admin_clinica')) {
    throw new HttpsError('permission-denied', 'Só o administrador desta clínica pode fazer isso.');
  }
  return uid;
}

function validarPapeis(papeis) {
  if (!Array.isArray(papeis) || papeis.length === 0) {
    throw new HttpsError('invalid-argument', 'Informe ao menos um papel.');
  }
  const invalido = papeis.find((p) => !PAPEIS_VALIDOS.includes(p));
  if (invalido) {
    throw new HttpsError('invalid-argument', `Papel desconhecido: ${invalido}`);
  }
  return Array.from(new Set(papeis));
}

/**
 * Grava os papéis no token e no documento na mesma operação lógica.
 *
 * O claim é a autoridade para o firestore.rules; o documento é o que a tela exibe.
 * Se os dois divergirem, a tela mente sobre o que o usuário pode fazer — por isso
 * papel nunca é alterado direto pelo cliente, só por aqui.
 */
async function aplicarClaims(uid, { clinicaId, papeis, superadmin = false }) {
  const claims = { clinicaId, papeis };
  if (superadmin) claims.superadmin = true;
  await auth.setCustomUserClaims(uid, claims);
  // Marca a hora da mudança para o app saber que precisa renovar o token.
  await db.doc(`membros/${uid}`).set(
    { uid, clinicaId, papeis, claims_atualizados_em: Date.now() },
    { merge: true }
  );
}

function diasEmMs(dias) {
  return dias * 24 * 60 * 60 * 1000;
}

function rotuloData(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Provisionamento de clínica (dono do sistema)
// ---------------------------------------------------------------------------

/**
 * Cadastra um cliente novo: cria a clínica, o usuário administrador dela e o
 * período de teste. É a porta de entrada de toda venda.
 *
 * O acesso nasce como TESTE POR DIAS — não por número de pacientes, que não faz
 * sentido em clínica (uma clínica pequena com 8 pacientes fixos nunca esbarraria
 * no limite e usaria de graça para sempre).
 */
exports.provisionarClinica = onCall(async (request) => {
  await exigirSuperadmin(request);

  const {
    nomeClinica,
    slug,
    area = 'multidisciplinar',
    emailAdmin,
    nomeAdmin,
    cnpj = '',
    telefone = '',
    diasTeste,
  } = request.data || {};

  if (!nomeClinica || !slug || !emailAdmin || !nomeAdmin) {
    throw new HttpsError(
      'invalid-argument',
      'Informe nome da clínica, identificador, nome e e-mail do administrador.'
    );
  }

  const slugLimpo = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (slugLimpo.length < 3) {
    throw new HttpsError('invalid-argument', 'O identificador precisa ter ao menos 3 caracteres.');
  }

  const jaExiste = await db.collection('clinicas').where('slug', '==', slugLimpo).limit(1).get();
  if (!jaExiste.empty) {
    throw new HttpsError('already-exists', `Já existe uma clínica com o identificador "${slugLimpo}".`);
  }

  // Reaproveita a conta se o e-mail já tiver login; senão cria uma nova. A senha
  // não é definida aqui — o administrador recebe o link de definição por e-mail,
  // então nenhuma senha trafega por esta chamada nem fica em log.
  let usuarioAdmin;
  try {
    usuarioAdmin = await auth.getUserByEmail(emailAdmin);
  } catch {
    usuarioAdmin = await auth.createUser({
      email: emailAdmin,
      displayName: nomeAdmin,
      emailVerified: false,
    });
  }

  const claimsAtuais = (await auth.getUser(usuarioAdmin.uid)).customClaims || {};
  if (claimsAtuais.clinicaId && claimsAtuais.clinicaId !== usuarioAdmin.uid) {
    throw new HttpsError(
      'failed-precondition',
      'Este e-mail já pertence a outra clínica. Use um e-mail diferente para o administrador.'
    );
  }

  const config = (await db.doc('plataforma/config').get()).data() || {};
  const dias = Number(diasTeste || config.dias_teste || DIAS_TESTE_PADRAO);
  const expiraEm = Date.now() + diasEmMs(dias);

  const clinicaRef = db.collection('clinicas').doc();
  const clinicaId = clinicaRef.id;

  const lote = db.batch();

  lote.set(clinicaRef, {
    id: clinicaId,
    nome: nomeClinica,
    slug: slugLimpo,
    cnpj,
    area,
    email_contato: emailAdmin,
    telefone,
    admin_uid: usuarioAdmin.uid,
    modulos: {
      financeiro: true,
      rh: true,
      ponto: true,
      ferias: true,
      recepcao: true,
      convenios: true,
      inteligencia: true,
      notaFiscal: false,
      lembretesWhatsapp: false,
    },
    criada_em: new Date().toISOString(),
    ativa: true,
  });

  lote.set(db.doc(`assinaturas/${clinicaId}`), {
    clinica_id: clinicaId,
    plano: 'teste',
    expira_em: expiraEm,
    expira_em_label: rotuloData(expiraEm),
    limite_profissionais: config.limite_profissionais_teste ?? null,
    atualizada_em: new Date().toISOString(),
  });

  // O administrador da clínica nasce também como profissional: na maioria das
  // clínicas pequenas quem compra o sistema é quem atende. Ele pode remover o
  // papel depois, se for administrativo puro.
  lote.set(db.doc(`clinicas/${clinicaId}/usuarios/${usuarioAdmin.uid}`), {
    uid: usuarioAdmin.uid,
    nome: nomeAdmin,
    email: emailAdmin,
    papeis: ['admin_clinica', 'profissional'],
    possui_agenda: true,
    ativo: true,
    data_cadastro: new Date().toISOString(),
  });

  await lote.commit();
  await aplicarClaims(usuarioAdmin.uid, {
    clinicaId,
    papeis: ['admin_clinica', 'profissional'],
  });

  const linkSenha = await auth.generatePasswordResetLink(emailAdmin);

  logger.info('Clínica provisionada', { clinicaId, slug: slugLimpo, dias });

  return { clinicaId, slug: slugLimpo, expiraEm, linkDefinicaoSenha: linkSenha };
});

// ---------------------------------------------------------------------------
// Equipe da clínica (administrador da clínica)
// ---------------------------------------------------------------------------

/** Admite um membro na equipe, já com papéis e claim. */
exports.convidarMembro = onCall(async (request) => {
  const { clinicaId, email, nome, papeis, possuiAgenda = false } = request.data || {};
  if (!clinicaId) throw new HttpsError('invalid-argument', 'Informe a clínica.');
  exigirAdminDaClinica(request, clinicaId);

  if (!email || !nome) throw new HttpsError('invalid-argument', 'Informe nome e e-mail.');
  const papeisValidados = validarPapeis(papeis);

  // Teto de profissionais do plano. Conta só quem tem agenda — é o que a clínica
  // de fato contrata.
  if (papeisValidados.includes('profissional')) {
    const assinatura = (await db.doc(`assinaturas/${clinicaId}`).get()).data() || {};
    const limite = assinatura.limite_profissionais;
    if (limite != null) {
      const atuais = await db
        .collection(`clinicas/${clinicaId}/usuarios`)
        .where('papeis', 'array-contains', 'profissional')
        .where('ativo', '==', true)
        .get();
      if (atuais.size >= limite) {
        throw new HttpsError(
          'resource-exhausted',
          `Seu plano permite ${limite} profissionais. Fale com o suporte para ampliar.`
        );
      }
    }
  }

  let usuario;
  try {
    usuario = await auth.getUserByEmail(email);
    const claims = usuario.customClaims || {};
    if (claims.clinicaId && claims.clinicaId !== clinicaId) {
      throw new HttpsError(
        'already-exists',
        'Este e-mail já está vinculado a outra clínica.'
      );
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    usuario = await auth.createUser({ email, displayName: nome, emailVerified: false });
  }

  await db.doc(`clinicas/${clinicaId}/usuarios/${usuario.uid}`).set(
    {
      uid: usuario.uid,
      nome,
      email,
      papeis: papeisValidados,
      possui_agenda: possuiAgenda || papeisValidados.includes('profissional'),
      ativo: true,
      data_cadastro: new Date().toISOString(),
    },
    { merge: true }
  );

  await aplicarClaims(usuario.uid, { clinicaId, papeis: papeisValidados });
  const linkSenha = await auth.generatePasswordResetLink(email);

  return { uid: usuario.uid, linkDefinicaoSenha: linkSenha };
});

/**
 * Altera os papéis de um membro. Passa por aqui, e não pelo Firestore direto,
 * porque documento e claim precisam mudar juntos.
 */
exports.alterarPapeis = onCall(async (request) => {
  const { clinicaId, uid, papeis } = request.data || {};
  if (!clinicaId || !uid) throw new HttpsError('invalid-argument', 'Informe a clínica e o usuário.');
  const solicitante = exigirAdminDaClinica(request, clinicaId);

  const papeisValidados = validarPapeis(papeis);

  // Trava contra a clínica ficar sem dono: o último administrador não pode se rebaixar.
  if (uid === solicitante && !papeisValidados.includes('admin_clinica')) {
    const admins = await db
      .collection(`clinicas/${clinicaId}/usuarios`)
      .where('papeis', 'array-contains', 'admin_clinica')
      .where('ativo', '==', true)
      .get();
    if (admins.size <= 1) {
      throw new HttpsError(
        'failed-precondition',
        'Você é o único administrador. Promova outra pessoa antes de remover seu próprio acesso.'
      );
    }
  }

  const membro = await db.doc(`clinicas/${clinicaId}/usuarios/${uid}`).get();
  if (!membro.exists) throw new HttpsError('not-found', 'Este usuário não é da sua equipe.');

  await db.doc(`clinicas/${clinicaId}/usuarios/${uid}`).update({ papeis: papeisValidados });
  await aplicarClaims(uid, { clinicaId, papeis: papeisValidados });

  await db.collection(`clinicas/${clinicaId}/auditoria`).add({
    uid: solicitante,
    nome: request.auth.token.name || request.auth.token.email || solicitante,
    acao: 'alterou_papeis',
    modulo: 'equipe',
    detalhe: `Papéis de ${uid} definidos como: ${papeisValidados.join(', ')}`,
    severidade: 'critico',
    registrado_em: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/**
 * Desliga um membro: perde o acesso na hora (claims zerados) mas o cadastro fica,
 * porque o histórico de ponto e as evoluções que ele assinou continuam válidos.
 */
exports.desligarMembro = onCall(async (request) => {
  const { clinicaId, uid } = request.data || {};
  if (!clinicaId || !uid) throw new HttpsError('invalid-argument', 'Informe a clínica e o usuário.');
  const solicitante = exigirAdminDaClinica(request, clinicaId);

  if (uid === solicitante) {
    throw new HttpsError('failed-precondition', 'Você não pode desligar a si mesmo.');
  }

  await db.doc(`clinicas/${clinicaId}/usuarios/${uid}`).update({
    ativo: false,
    papeis: [],
    desligado_em: new Date().toISOString(),
  });
  await auth.setCustomUserClaims(uid, {});
  await auth.revokeRefreshTokens(uid);
  await db.doc(`membros/${uid}`).delete().catch(() => {});

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Planos (dono do sistema)
// ---------------------------------------------------------------------------

/** Define o plano e a vigência de uma clínica. */
exports.definirPlano = onCall(async (request) => {
  const dono = await exigirSuperadmin(request);
  const { clinicaId, plano, dias, valorMensal, limiteProfissionais, observacao } =
    request.data || {};

  if (!clinicaId || !plano) throw new HttpsError('invalid-argument', 'Informe a clínica e o plano.');

  const planosValidos = ['teste', 'mensal', 'semestral', 'anual', 'vencido', 'cancelado'];
  if (!planosValidos.includes(plano)) {
    throw new HttpsError('invalid-argument', `Plano desconhecido: ${plano}`);
  }

  const duracaoPadrao = { teste: 14, mensal: 30, semestral: 182, anual: 365 };
  const encerrado = plano === 'vencido' || plano === 'cancelado';
  const expiraEm = encerrado
    ? Date.now()
    : Date.now() + diasEmMs(Number(dias || duracaoPadrao[plano] || 30));

  await db.doc(`assinaturas/${clinicaId}`).set(
    {
      clinica_id: clinicaId,
      plano,
      expira_em: expiraEm,
      expira_em_label: rotuloData(expiraEm),
      ...(valorMensal != null ? { valor_mensal: Number(valorMensal) } : {}),
      ...(limiteProfissionais !== undefined
        ? { limite_profissionais: limiteProfissionais === null ? null : Number(limiteProfissionais) }
        : {}),
      ...(observacao != null ? { observacao_interna: String(observacao) } : {}),
      atualizada_em: new Date().toISOString(),
    },
    { merge: true }
  );

  logger.info('Plano definido', { clinicaId, plano, expiraEm, por: dono });
  return { ok: true, expiraEm };
});

/**
 * Todo dia de manhã, marca como vencidas as assinaturas que passaram do prazo.
 *
 * As regras já barram a escrita pela data, então isto não é a trava de segurança —
 * é o que deixa o painel do dono do sistema mostrando a realidade sem precisar
 * recalcular na tela.
 */
exports.verificarAssinaturas = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const agora = Date.now();
    const vencidas = await db
      .collection('assinaturas')
      .where('expira_em', '<', agora)
      .where('plano', 'not-in', ['vencido', 'cancelado'])
      .get();

    if (vencidas.empty) {
      logger.info('Nenhuma assinatura venceu hoje.');
      return;
    }

    const lote = db.batch();
    vencidas.forEach((doc) => {
      lote.update(doc.ref, { plano: 'vencido', atualizada_em: new Date().toISOString() });
    });
    await lote.commit();

    logger.info(`Assinaturas marcadas como vencidas: ${vencidas.size}`);
  }
);

// ---------------------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------------------

/**
 * Direito de acesso e portabilidade (LGPD arts. 18, II e V): devolve tudo que a
 * clínica guarda sobre um paciente, em JSON.
 *
 * Exige papel de profissional porque o pacote inclui o prontuário. Um administrador
 * que não atende não pode baixar evolução clínica por esta porta — seria contornar
 * a invariante nº 2 das regras.
 */
exports.exportarDadosPaciente = onCall(async (request) => {
  const uid = exigirLogin(request);
  const { clinicaId, pacienteId } = request.data || {};
  const token = request.auth.token || {};
  const papeis = Array.isArray(token.papeis) ? token.papeis : [];

  if (token.clinicaId !== clinicaId || !papeis.includes('profissional')) {
    throw new HttpsError(
      'permission-denied',
      'Só um profissional de saúde desta clínica pode exportar o prontuário.'
    );
  }

  const base = `clinicas/${clinicaId}/pacientes/${pacienteId}`;
  const [paciente, prontuario, agendamentos, consentimentos] = await Promise.all([
    db.doc(base).get(),
    db.collection(`${base}/prontuario`).orderBy('data', 'desc').get(),
    db.collection(`clinicas/${clinicaId}/agendamentos`).where('paciente_id', '==', pacienteId).get(),
    db
      .collection(`clinicas/${clinicaId}/consentimentos`)
      .where('paciente_id', '==', pacienteId)
      .get(),
  ]);

  if (!paciente.exists) throw new HttpsError('not-found', 'Paciente não encontrado.');

  await db.collection(`clinicas/${clinicaId}/auditoria`).add({
    uid,
    nome: token.name || token.email || uid,
    acao: 'exportou_dados_paciente',
    modulo: 'lgpd',
    paciente_id: pacienteId,
    detalhe: 'Exportação completa dos dados do titular.',
    severidade: 'critico',
    registrado_em: admin.firestore.FieldValue.serverTimestamp(),
  });

  const mapear = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    gerado_em: new Date().toISOString(),
    paciente: { id: paciente.id, ...paciente.data() },
    prontuario: mapear(prontuario),
    agendamentos: mapear(agendamentos),
    consentimentos: mapear(consentimentos),
  };
});

/**
 * Direito de eliminação (LGPD art. 18, VI), com o limite do art. 16, I:
 * dado cujo tratamento é obrigatório por lei não se apaga.
 *
 * Por isso a eliminação é seletiva: o cadastro pessoal é anonimizado e o prontuário
 * é PRESERVADO. A Resolução CFM 1.821/2007 exige guarda mínima de 20 anos do
 * prontuário — apagar seria trocar uma infração por outra. O vínculo com a pessoa
 * é que desaparece.
 */
exports.anonimizarPaciente = onCall(async (request) => {
  const uid = exigirLogin(request);
  const { clinicaId, pacienteId, motivo } = request.data || {};
  const token = request.auth.token || {};
  const papeis = Array.isArray(token.papeis) ? token.papeis : [];

  if (token.clinicaId !== clinicaId || !papeis.includes('admin_clinica')) {
    throw new HttpsError('permission-denied', 'Só o administrador da clínica pode fazer isso.');
  }
  if (!motivo) {
    throw new HttpsError('invalid-argument', 'Registre o motivo da solicitação do titular.');
  }

  const ref = db.doc(`clinicas/${clinicaId}/pacientes/${pacienteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Paciente não encontrado.');

  await ref.update({
    nome: `Titular anonimizado ${pacienteId.slice(0, 6)}`,
    cpf: admin.firestore.FieldValue.delete(),
    email: admin.firestore.FieldValue.delete(),
    telefone: admin.firestore.FieldValue.delete(),
    responsavel_nome: admin.firestore.FieldValue.delete(),
    endereco_cep: admin.firestore.FieldValue.delete(),
    endereco_logradouro: admin.firestore.FieldValue.delete(),
    endereco_numero: admin.firestore.FieldValue.delete(),
    endereco_complemento: admin.firestore.FieldValue.delete(),
    endereco_bairro: admin.firestore.FieldValue.delete(),
    foto_url: admin.firestore.FieldValue.delete(),
    data_nascimento: admin.firestore.FieldValue.delete(),
    ativo: false,
    anonimizado_em: new Date().toISOString(),
  });

  await db.collection(`clinicas/${clinicaId}/auditoria`).add({
    uid,
    nome: token.name || token.email || uid,
    acao: 'anonimizou_paciente',
    modulo: 'lgpd',
    paciente_id: pacienteId,
    detalhe: `Direito de eliminação exercido. Motivo: ${motivo}. Prontuário preservado por exigência de guarda legal.`,
    severidade: 'critico',
    registrado_em: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    observacao:
      'Cadastro anonimizado. O prontuário foi preservado porque a guarda é obrigatória por lei.',
  };
});
