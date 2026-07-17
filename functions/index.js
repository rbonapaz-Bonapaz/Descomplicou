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

const INFINITEPAY_CHECKOUT_URL = 'https://api.checkout.infinitepay.io/links';

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

  const handle = (perfil.infinitePayHandle || '').trim().replace(/^[\$@]+/, '');
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

  let resposta;
  try {
    resposta = await fetch(INFINITEPAY_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle,
        redirect_url: appOrigin,
        webhook_url: webhookUrl,
        order_nsu: `${uid}_${carrinhoId}`, // usamos pra reencontrar o carrinho quando o webhook chega
        items: itensParaCobranca,
        customer: carrinho.clienteNome ? { name: String(carrinho.clienteNome).slice(0, 120) } : undefined
      })
    });
  } catch (e) {
    logger.error('Falha de rede ao chamar a InfinitePay', e);
    throw new HttpsError('unavailable', 'Não consegui falar com a InfinitePay agora — tente de novo em instantes.');
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.error('InfinitePay recusou o checkout', resposta.status, corpoErro);
    throw new HttpsError('internal', `A InfinitePay recusou a cobrança (${resposta.status}) — confira se o handle está certo e ativo.`);
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
