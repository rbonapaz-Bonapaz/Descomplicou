// Geração de texto de benefícios/descrição de produto via Gemini, usando a própria chave de API
// da consultora (BYOK — bring your own key). A chave fica salva só no perfil dela no Firestore
// (mesma isolação de dados do resto do app) e a chamada é feita direto do navegador pra API do
// Google — não passa por nenhum servidor nosso.
import { state } from './state.js';

const MODELO = 'gemini-2.0-flash';

// Quantas vezes reenviar automaticamente quando o Gemini devolve 429/503 antes de desistir e
// mostrar erro. O free tier costuma responder 429 já na PRIMEIRA chamada de uma "rajada" (burst)
// e aceitar a segunda poucos segundos depois — é por isso que a mesma chave "funciona em outros
// apps": eles reenviam sozinhos por baixo dos panos. Nosso código antigo não reenviava, então
// jogava o 429 transitório direto na tela como se fosse cota esgotada.
const MAX_TENTATIVAS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Puxa do corpo do erro 429 o quotaId (QUAL cota bateu — por minuto, por dia, tokens etc.) e o
// retryDelay que o próprio Google sugere. Assim a mensagem e o cooldown usam o número real em vez
// de um "60s" chutado, e o console mostra exatamente qual limite está sendo atingido.
function extrairInfoQuota(body) {
  const detalhes = body?.error?.details || [];
  const quota = detalhes.find(d => String(d['@type'] || '').includes('QuotaFailure'));
  const retry = detalhes.find(d => String(d['@type'] || '').includes('RetryInfo'));
  const quotaId = quota?.violations?.[0]?.quotaId || '';
  const retrySeg = retry?.retryDelay ? Math.ceil(parseFloat(String(retry.retryDelay).replace('s', ''))) || 0 : 0;
  return { quotaId, retrySeg };
}

function erroGemini(status, body) {
  console.error('[Gemini] Erro na chamada da API:', status, body);
  const msg = body?.error?.message || `Erro ${status}`;
  const raw = JSON.stringify(body?.error || {});
  if (status === 400 && /API key/i.test(msg)) return new Error('Chave do Gemini inválida — confira se copiou certinho em aistudio.google.com/apikey.');
  if (status === 403) return new Error('A chave do Gemini não tem permissão para essa API — confira se a "Generative Language API" está ativada no projeto dessa chave em aistudio.google.com/apikey.');
  if (status === 429) {
    const { quotaId, retrySeg } = extrairInfoQuota(body);
    console.error('[Gemini] Cota atingida:', quotaId || '(sem quotaId)', '· retryDelay:', retrySeg + 's');
    if (/PerDay/i.test(quotaId) || /PerDay/i.test(raw)) {
      return new Error(`Cota DIÁRIA do modelo ${MODELO} esgotada nesta chave (limite por dia do plano gratuito). Outros modelos/projetos da mesma chave continuam funcionando — a cota é por modelo. Aguarde a renovação (24h) ou use outra chave. [${quotaId || 'quota'}]`);
    }
    // Não é a chave errada: é o limite por minuto (ou tokens/min) do free tier — passa sozinho.
    // O cooldown das telas usa `segundosEspera` (número real do Google) em vez de fixar 60s.
    const espera = retrySeg > 0 ? retrySeg : 30;
    const e = new Error(`Limite de requisições por minuto do Gemini atingido — a chave está certa, é só aguardar ${espera}s. (Reenviamos automaticamente ${MAX_TENTATIVAS}x antes de mostrar isso.) [${quotaId || 'RequestsPerMinute'}]`);
    e.tipoGemini = 'limite_por_minuto';
    e.segundosEspera = espera;
    return e;
  }
  if (status >= 500) return new Error('O Gemini está indisponível no momento (erro no servidor do Google) — tente novamente em instantes.');
  return new Error(msg);
}

// Chamada única e centralizada ao Gemini, com retry automático em 429/503. Substitui os 4 blocos
// de fetch que estavam duplicados (um por função) — agora todas ganham o retry de graça. Reenvia
// só quando o retryDelay sugerido é curto (rajada transitória); se o Google pede uma espera longa
// (cota real de minuto/dia), não fica travando a tela — devolve o erro pra UI mostrar o cooldown.
async function chamarGemini(prompt, { json = false } = {}) {
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const corpo = { contents: [{ parts: [{ text: prompt }] }] };
  if (json) corpo.generationConfig = { responseMimeType: 'application/json' };

  let ultimoErroBody = null, ultimoStatus = 0;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (r.ok) {
      const data = await r.json();
      const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!texto) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
      return texto;
    }
    ultimoErroBody = await r.json().catch(() => ({}));
    ultimoStatus = r.status;
    // Só vale reenviar em 429/503; e só se ainda houver tentativa e a espera sugerida for curta
    // (≤ ~4s = rajada transitória). Espera longa é cota real — sai do loop e mostra o cooldown.
    const reenviavel = r.status === 429 || r.status === 503;
    const { retrySeg } = r.status === 429 ? extrairInfoQuota(ultimoErroBody) : { retrySeg: 2 };
    if (!reenviavel || tentativa === MAX_TENTATIVAS || retrySeg > 4) break;
    await sleep((retrySeg > 0 ? retrySeg : tentativa) * 1000);
  }
  throw erroGemini(ultimoStatus, ultimoErroBody);
}

export async function gerarBeneficios(nomeProduto, linha = '') {
  if (!nomeProduto?.trim()) throw new Error('Preencha o nome do produto antes de gerar.');
  const prompt = `Escreva uma descrição curta de benefícios (no máximo 2 frases, linguagem de vendas, sem emojis, sem markdown) para o produto de cosmético/beleza "${nomeProduto}"${linha ? ` da linha "${linha}"` : ''}, destinada a um catálogo de vendas de consultora de beleza. Responda só com o texto da descrição, sem aspas.`;
  return chamarGemini(prompt);
}

// Interpretação de pedido falado/digitado em texto livre (Ações Rápidas → "Adicionar por voz") —
// mesma chave BYOK acima. A IA só extrai a intenção (cliente citada + produtos com quantidade);
// o casamento com o catálogo/cliente reais da consultora é feito localmente depois, por
// normalização de texto — evita mandar o catálogo inteiro no prompt e a IA "inventar" um produto
// que não existe no cadastro dela.
export async function interpretarPedidoDeVenda(texto) {
  if (!texto?.trim()) throw new Error('Digite ou fale o pedido antes de interpretar.');

  const prompt = `Extraia de um pedido de venda falado por uma consultora de cosméticos o nome da cliente e os produtos com quantidade. Frase: "${texto.replace(/"/g, "'")}"

Responda SOMENTE em JSON válido, neste formato exato:
{"cliente":"nome da cliente mencionada, ou vazio se não citou","itens":[{"produto":"nome do produto como foi dito, sem marca nem tamanho de embalagem","quantidade":numero}]}

Se a quantidade não for dita, use 1. Não invente produtos que não foram citados na frase.`;

  const texto2 = await chamarGemini(prompt, { json: true });
  let obj;
  try { obj = JSON.parse(texto2); } catch (e) { throw new Error('Não consegui interpretar a resposta da IA — tente reformular o pedido.'); }
  const itens = Array.isArray(obj.itens) ? obj.itens
    .map(i => ({ produto: String(i.produto || '').trim(), quantidade: Math.max(1, Number(i.quantidade) || 1) }))
    .filter(i => i.produto) : [];
  return { cliente: String(obj.cliente || '').trim(), itens };
}

// Interpretação de tabela de taxas de operadora de cartão (Minha Conta → Pagamento → Operadoras)
// — a consultora cola o texto copiado do app da maquininha (débito, crédito à vista, 2x a 12x,
// por bandeira) e a IA devolve só os números que reconheceu, sem inventar o que não veio no texto.
// Preenche os campos do formulário; quem confirma e grava é a consultora ao clicar "Salvar".
export async function interpretarTaxasOperadora(texto) {
  if (!texto?.trim()) throw new Error('Cole ou digite as taxas antes de interpretar.');

  const prompt = `Extraia taxas de uma tabela de operadora de cartão (maquininha/gateway), com valores separados por dois grupos de bandeira: "visaMaster" (Visa/Mastercard) e "eloAmex" (Elo/Amex ou Elo sozinho). Texto:
"""
${texto.replace(/"""/g, "'")}
"""

Responda SOMENTE em JSON válido, neste formato exato (use null nos campos que não aparecerem no texto, não invente valor):
{"prazoRecebimentoDias":numero_ou_null,"taxaDebito":{"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},"taxaCredito":[{"parcelas":1,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":2,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":3,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":4,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":5,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":6,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":7,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":8,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":9,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":10,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":11,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":12,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null}]}

"Crédito à vista" conta como parcelas=1. Números são percentuais (ex: "1,37%" vira 1.37). Se o texto só tiver uma coluna de bandeira (sem separar grupos), use o mesmo valor pros dois grupos.`;

  const texto2 = await chamarGemini(prompt, { json: true });
  let obj;
  try { obj = JSON.parse(texto2); } catch (e) { throw new Error('Não consegui interpretar a resposta da IA — tente colar o texto de outra forma.'); }
  const numOrNull = v => (v === null || v === undefined || v === '') ? null : Number(v);
  return {
    prazoRecebimentoDias: numOrNull(obj.prazoRecebimentoDias),
    taxaDebito: { visaMaster: numOrNull(obj.taxaDebito?.visaMaster), eloAmex: numOrNull(obj.taxaDebito?.eloAmex) },
    taxaCredito: Array.from({ length: 12 }, (_, i) => {
      const linha = Array.isArray(obj.taxaCredito) ? obj.taxaCredito.find(l => Number(l.parcelas) === i + 1) : null;
      return { parcelas: i + 1, visaMaster: numOrNull(linha?.visaMaster), eloAmex: numOrNull(linha?.eloAmex) };
    })
  };
}

// Copiloto de vendas (Cliente 360 → "Gerar Sugestão de Abordagem") — mesma chave BYOK acima.
// Recebe o contexto já compilado (histórico, tags, gatilhos) e devolve um rascunho de mensagem
// de WhatsApp pronto pra revisar/editar antes de enviar.
export async function gerarSugestaoAbordagem(contexto) {
  const nomeNegocio = state.profile?.nomeNegocio || 'sua loja';
  const prompt = `Você é o assistente de vendas de ${nomeNegocio}, uma consultora de vendas Farmasi. Com base no histórico de compras do cliente e nas informações enviadas abaixo, escreva uma mensagem de WhatsApp curta (no máximo 4 frases), amigável e persuasiva. Use um tom de voz profissional, porém próximo. Nunca invente produtos que não foram mencionados no contexto. Inclua uma chamada para ação (CTA) no final. Responda só com o texto da mensagem, sem aspas, sem markdown.

Contexto do cliente:
${contexto}`;
  return chamarGemini(prompt);
}
