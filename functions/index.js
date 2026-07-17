// Cloud Functions do CRM Descomplicou — únicas duas peças que precisam rodar fora do navegador:
// 1) criarCheckoutInfinitePay: gera o link/QR Code de cobrança (a API da InfinitePay não libera
//    CORS pra chamar direto do navegador, então isso precisa passar por um servidor).
// 2) webhookInfinitePay: recebe a confirmação de pagamento da InfinitePay (webhook — só o servidor
//    deles pode chamar essa URL, o navegador da consultora nunca fica sabendo em tempo real sem
//    isso) e atualiza o carrinho no Firestore.
//
// Endpoint conferido em 17/07/2026 (busca cruzada, dois exemplos independentes de integração real
// batendo no mesmo endpoint) — a API não é autenticada por chave, é vinculada ao "handle" (@usuário)
// da conta InfinitePay mandado no corpo de cada requisição. IMPORTANTE: o webhook_url NÃO precisa
// ser cadastrado em nenhum painel da InfinitePay — ele vai dentro do corpo desta mesma chamada
// (campo webhook_url logo abaixo), a cada link de cobrança criado.
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

admin.initializeApp();
const db = admin.firestore();

// Token só nosso (gerado por você, não é segredo da InfinitePay) — vai como query string na URL
// que passamos como webhook_url pra InfinitePay chamar de volta. Sem ele, qualquer um que
// descobrisse a URL do webhook poderia forjar uma confirmação de pagamento falsa. Configure com:
//   firebase functions:secrets:set WEBHOOK_TOKEN
const WEBHOOK_TOKEN = defineSecret('WEBHOOK_TOKEN');

// Credenciais da WhatsApp Cloud API (Meta) — token de acesso permanente do System User e o ID do
// número de telefone da conta WhatsApp Business (WABA). NUNCA vão pro navegador: ficam só aqui no
// servidor. Configure com:
//   firebase functions:secrets:set WHATSAPP_TOKEN
//   firebase functions:secrets:set WHATSAPP_PHONE_ID
const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_ID = defineSecret('WHATSAPP_PHONE_ID');
const WHATSAPP_API_VERSION = 'v21.0';

const INFINITEPAY_CHECKOUT_URL = 'https://api.checkout.infinitepay.io/links';

// Higienização do handle — replace GLOBAL de "@"/"$" (em qualquer posição, não só no início) em vez
// de substring/corte por posição: um .substring(1) cego decepava a primeira letra real de handles
// que não começavam com esses símbolos (ex: "fabiula-mariano" virava "abiula-mariano" e a InfinitePay
// devolvia 404 "usuário não encontrado" mesmo com o handle certo). Replace global nunca corta letra
// nenhuma: só remove os símbolos específicos, de onde quer que apareçam. Minúsculo porque a
// InfinitePay trata handle como case-insensitive internamente, mas cadastro com maiúscula já causou
// divergência de "usuário não encontrado" em conta real.
function limparHandleInfinitePay(raw) {
  return String(raw || '').replace(/[@$]/g, '').trim().toLowerCase();
}

// CPF/CNPJ só com dígitos — a InfinitePay (como qualquer API que valida documento) rejeita se vier
// com pontuação (., -, /). Reaproveitado tanto no payload do checkout quanto em qualquer outro lugar
// que precise mandar o documento pra API.
function limparDocumento(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// Gera o link/QR Code de cobrança pra um carrinho já existente. Chamado do navegador via
// httpsCallable — o SDK do Firebase já manda o token de auth da consultora, então dá pra validar
// que o carrinho pertence a ela antes de gastar uma chamada com a InfinitePay.
exports.criarCheckoutInfinitePay = onCall({ region: 'southamerica-east1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login de novo antes de gerar a cobrança.');

  const { carrinhoId } = request.data || {};
  if (!carrinhoId) throw new HttpsError('invalid-argument', 'Informe o carrinho.');

  const carrinhoRef = db.doc(`users/${uid}/carrinhos/${carrinhoId}`);
  const [carrinhoSnap, perfilSnap] = await Promise.all([
    carrinhoRef.get(),
    db.doc(`users/${uid}`).get()
  ]);
  if (!carrinhoSnap.exists) throw new HttpsError('not-found', 'Carrinho não encontrado.');
  const carrinho = carrinhoSnap.data();
  const perfil = perfilSnap.data() || {};

  const handle = limparHandleInfinitePay(perfil.infinitePayHandle);
  if (!handle) throw new HttpsError('failed-precondition', 'Cadastre seu handle (@usuário) da InfinitePay em Minha Conta → Pagamento antes de gerar cobranças.');

  const total = Number(carrinho.totalPedido || 0);
  if (total <= 0) throw new HttpsError('failed-precondition', 'Este carrinho não tem valor a cobrar.');

  const itens = (carrinho.itens || []).map(it => ({
    quantity: Math.max(1, Number(it.quantidade || 1)),
    price: Math.round(Number(it.precoUnitario || 0) * 100), // InfinitePay trabalha em centavos
    description: String(it.produtoNome || 'Produto').slice(0, 250)
  }));
  // Segurança: se por qualquer motivo a soma dos itens não bater com o total do carrinho
  // (desconto do pedido, arredondamento), cobra o total como item único — nunca cobra menos do
  // que o carrinho vale, nem mais.
  const somaItens = itens.reduce((s, i) => s + i.price * i.quantity, 0);
  const itensParaCobranca = somaItens === Math.round(total * 100)
    ? itens
    : [{ quantity: 1, price: Math.round(total * 100), description: `Pedido — ${carrinho.clienteNome || 'cliente'}` }];

  const appOrigin = 'https://rbonapaz-bonapaz.github.io/Descomplicou';
  const webhookUrl = `https://southamerica-east1-crm-consultora-de-beleza.cloudfunctions.net/webhookInfinitePay?token=${encodeURIComponent(WEBHOOK_TOKEN.value())}`;
  const documento = limparDocumento(perfil.infinitePayDoc);

  const payload = {
    handle,
    redirect_url: appOrigin,
    webhook_url: webhookUrl,
    order_nsu: `${uid}_${carrinhoId}`, // usamos pra reencontrar o carrinho quando o webhook chega
    items: itensParaCobranca,
    customer: (carrinho.clienteNome || documento) ? {
      ...(carrinho.clienteNome ? { name: String(carrinho.clienteNome).slice(0, 120) } : {}),
      ...(documento ? { document: documento } : {})
    } : undefined
  };

  // DEBUG (item 13-C): o corpo exato que sai pra InfinitePay — não aparece no DevTools do navegador
  // porque essa chamada roda no servidor (Cloud Function), não no browser da consultora (a API da
  // InfinitePay não libera CORS pra chamar direto do navegador). Pra ver este log: Firebase Console
  // → Functions → criarCheckoutInfinitePay → Registros, ou `firebase functions:log`.
  logger.info('PAYLOAD ENVIADO (InfinitePay):', payload);

  let resposta;
  try {
    resposta = await fetch(INFINITEPAY_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    logger.error('Falha de rede ao chamar a InfinitePay', e);
    throw new HttpsError('unavailable', 'Não consegui falar com a InfinitePay agora — tente de novo em instantes.');
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.error('ERRO INFINITEPAY:', resposta.status, corpoErro, 'handle usado:', handle, 'payload:', payload);
    // 404 pode ser handle inexistente/errado OU o recurso "Checkout Integrado" ainda não ativado
    // na conta InfinitePay do usuário (confirmado via documentação pública da InfinitePay) — a
    // mensagem cobre os dois casos, já que o handle em si já passou pela sanitização acima.
    if (resposta.status === 404) {
      throw new HttpsError('not-found', 'A InfinitePay recusou com "não encontrado" (404). Confira 2 coisas: 1) o handle cadastrado nas configurações está exatamente igual ao @usuário do app InfinitePay (sem espaços/erros de digitação); 2) o recurso "Checkout Integrado" está ativado na sua conta InfinitePay (ajuda.infinitepay.io tem o passo a passo). Detalhe técnico nos registros da função.');
    }
    throw new HttpsError('internal', `A InfinitePay recusou a cobrança (${resposta.status}) — confira se o handle está certo e ativo. Detalhe técnico nos registros da função.`);
  }

  const dados = await resposta.json();
  // Nomes de campo assumidos pela doc pública — se a InfinitePay mudar o formato, ajuste aqui.
  const url = dados.url || dados.checkout_url || dados.link;
  const slug = dados.slug || dados.invoice_slug || dados.id;
  if (!url) {
    logger.error('Resposta da InfinitePay sem URL de checkout', dados);
    throw new HttpsError('internal', 'A InfinitePay não retornou o link de cobrança — confira os logs da função.');
  }

  await carrinhoRef.set({
    infinitePay: {
      status: 'pendente',
      url,
      slug: slug || '',
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    },
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { url, slug };
});

// Webhook público — só a InfinitePay deveria chamar esta URL. Validamos com WEBHOOK_TOKEN (nosso,
// configurado na hora de registrar o webhook na InfinitePay) porque a doc pública do Checkout não
// documenta assinatura própria de payload; sem essa checagem, qualquer um que descobrisse a URL
// poderia forjar uma confirmação de pagamento falsa.
exports.webhookInfinitePay = onRequest({ region: 'southamerica-east1', secrets: [WEBHOOK_TOKEN] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (req.query.token !== WEBHOOK_TOKEN.value()) {
    logger.warn('Webhook InfinitePay recebido com token inválido');
    return res.status(401).send('Token inválido');
  }

  const corpo = req.body || {};
  logger.info('Webhook InfinitePay recebido', corpo);

  // order_nsu foi montado como "{uid}_{carrinhoId}" na criação do checkout — separa de volta.
  const orderNsu = String(corpo.order_nsu || '');
  const [uid, carrinhoId] = orderNsu.split('_');
  if (!uid || !carrinhoId) {
    logger.error('Webhook sem order_nsu reconhecível', orderNsu);
    return res.status(200).send('ok'); // 200 pra InfinitePay não ficar reenviando um evento que nunca vamos conseguir tratar
  }

  const pago = corpo.paid === true || String(corpo.status || '').toLowerCase() === 'paid' || Number(corpo.paid_amount || 0) > 0;
  if (!pago) {
    logger.info('Webhook recebido mas pagamento ainda não confirmado — ignorando', carrinhoId);
    return res.status(200).send('ok');
  }

  const carrinhoRef = db.doc(`users/${uid}/carrinhos/${carrinhoId}`);
  const snap = await carrinhoRef.get();
  if (!snap.exists) {
    logger.error('Webhook aponta pra carrinho inexistente', uid, carrinhoId);
    return res.status(200).send('ok');
  }
  const carrinho = snap.data();
  if (carrinho.infinitePay?.status === 'pago') {
    return res.status(200).send('ok'); // já processado — InfinitePay pode reenviar o mesmo evento
  }

  const valorPago = Number(corpo.paid_amount || corpo.amount || 0) / 100 || Number(carrinho.totalPedido || 0);
  const pagamentos = [...(carrinho.pagamentos || []), {
    valor: valorPago,
    forma: 'InfinitePay (checkout online)',
    data: new Date().toISOString().slice(0, 10),
    observacoes: `Confirmado via webhook — NSU ${corpo.transaction_nsu || corpo.invoice_slug || ''}`
  }];
  const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);

  // update() (não set com merge) porque precisamos sobrescrever só os campos DENTRO de
  // infinitePay sem apagar url/slug já gravados na criação do checkout — set({merge:true}) trata
  // "infinitePay.status" como nome de campo literal (com ponto), não como caminho aninhado.
  await carrinhoRef.update({
    infinitePay: { ...(carrinho.infinitePay || {}), status: 'pago', pagoEm: admin.firestore.FieldValue.serverTimestamp() },
    pagamentos,
    valorPago: totalPago,
    statusPagamento: totalPago >= Number(carrinho.totalPedido || 0) - 0.01 ? 'pago' : 'parcial',
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info('Carrinho atualizado com pagamento InfinitePay', uid, carrinhoId, valorPago);
  return res.status(200).send('ok');
});

// Normaliza telefone pro formato que a Meta exige: só dígitos, com DDI 55 (Brasil) na frente.
function normalizarTelefoneWhats(tel) {
  const n = String(tel || '').replace(/\D/g, '');
  if (!n) return '';
  return n.startsWith('55') ? n : '55' + n;
}

// Envia uma mensagem de WhatsApp pela API oficial da Meta (Cloud API), usando um TEMPLATE já
// aprovado. Chamado do navegador via httpsCallable — o token da Meta nunca sai do servidor.
//
// IMPORTANTE (regra da Meta): mensagens iniciadas pela empresa (as que a automação dispara) SÓ
// podem usar templates pré-aprovados no painel da Meta. Texto livre só é permitido dentro da janela
// de 24h depois que a cliente mandou mensagem primeiro — por isso este envio é sempre por template.
//
// request.data espera:
//   { to, templateName, languageCode?, bodyParams? }
//   - to:           telefone da cliente (com ou sem DDI/DDD — a gente normaliza)
//   - templateName: nome exato do template aprovado na Meta (ex: "aniversario_cliente")
//   - languageCode: código de idioma do template (padrão "pt_BR")
//   - bodyParams:   lista de strings pra preencher as variáveis {{1}}, {{2}}... do corpo do template
exports.enviarWhatsAppTemplate = onCall(
  { region: 'southamerica-east1', secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_ID] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Faça login de novo antes de enviar.');

    const token = WHATSAPP_TOKEN.value();
    const phoneId = WHATSAPP_PHONE_ID.value();
    if (!token || !phoneId) {
      throw new HttpsError('failed-precondition', 'A WhatsApp Cloud API ainda não foi configurada (token/ID do número). Veja docs/whatsapp-cloud-api.md.');
    }

    const { to, templateName, languageCode, bodyParams } = request.data || {};
    const destino = normalizarTelefoneWhats(to);
    if (!destino) throw new HttpsError('invalid-argument', 'Telefone da cliente inválido.');
    if (!templateName) throw new HttpsError('invalid-argument', 'Informe o nome do template aprovado.');

    const params = Array.isArray(bodyParams) ? bodyParams : [];
    const components = params.length
      ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p ?? '') })) }]
      : [];

    const corpo = {
      messaging_product: 'whatsapp',
      to: destino,
      type: 'template',
      template: {
        name: String(templateName),
        language: { code: languageCode || 'pt_BR' },
        ...(components.length ? { components } : {})
      }
    };

    let resposta;
    try {
      resposta = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
    } catch (e) {
      logger.error('Falha de rede ao chamar a WhatsApp Cloud API', e);
      throw new HttpsError('unavailable', 'Não consegui falar com o WhatsApp agora — tente de novo em instantes.');
    }

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const msgErro = dados?.error?.message || `HTTP ${resposta.status}`;
      logger.error('WhatsApp Cloud API recusou o envio', resposta.status, dados);
      throw new HttpsError('internal', `O WhatsApp recusou o envio: ${msgErro}`);
    }

    const messageId = dados?.messages?.[0]?.id || '';
    logger.info('WhatsApp enviado via Cloud API', uid, destino, templateName, messageId);
    return { ok: true, messageId };
  }
);
