// Geração de texto de benefícios/descrição de produto via Gemini, usando a própria chave de API
// da consultora (BYOK — bring your own key). A chave fica salva só no perfil dela no Firestore
// (mesma isolação de dados do resto do app) e a chamada é feita direto do navegador pra API do
// Google — não passa por nenhum servidor nosso.
import { state } from './state.js';

// Modelos em ordem de preferência, do mais novo pro mais antigo. Motivo de ser uma LISTA e não um
// modelo fixo: o Google aposenta modelos antigos cortando a cota gratuita deles pra perto de zero
// — foi o que derrubou o 'gemini-2.0-flash' fixo que usávamos: a chave continuava válida e
// funcionava em apps que usam modelos novos, mas aqui TODA chamada voltava 429 "limite por
// minuto", mesmo a primeira do dia (a cota é POR MODELO, não por chave). 'gemini-flash-latest' é
// o apelido oficial que o Google mantém apontando pro flash mais recente — imune a aposentadoria.
const MODELOS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
// Qual modelo respondeu por último nesta sessão — as próximas chamadas começam direto por ele,
// sem re-testar os que falharam a cada clique.
let modeloAtivo = null;

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
      return new Error(`Cota DIÁRIA esgotada nesta chave para os modelos do Gemini que o app tenta usar (o limite diário do plano gratuito é por modelo). Aguarde a renovação (24h) ou use outra chave. [${quotaId || 'quota'}]`);
    }
    // Não é a chave errada: é o limite por minuto (ou tokens/min) do free tier — passa sozinho.
    // O cooldown das telas usa `segundosEspera` (número real do Google) em vez de fixar 60s.
    const espera = retrySeg > 0 ? retrySeg : 30;
    const e = new Error(`Limite de requisições por minuto do Gemini atingido — a chave está certa, é só aguardar ${espera}s. (Reenviamos automaticamente ${MAX_TENTATIVAS}x antes de mostrar isso.) [${quotaId || 'RequestsPerMinute'}]`);
    e.tipoGemini = 'limite_por_minuto';
    e.segundosEspera = espera;
    return e;
  }
  if (status === 404) return new Error('Nenhum dos modelos do Gemini que o app tenta usar está disponível nessa chave (o Google aposenta modelos antigos de tempos em tempos). Avise o suporte do CRM pra atualizar a lista de modelos.');
  if (status >= 500) return new Error('O Gemini está indisponível no momento (erro no servidor do Google) — tente novamente em instantes.');
  return new Error(msg);
}

// Chamada única e centralizada ao Gemini, com DOIS níveis de resiliência:
// 1. Fallback de modelo — tenta cada modelo de MODELOS na ordem; 404 (aposentado) ou 429 com
//    espera longa (cota daquele modelo esgotada) passam pro próximo. O que responder vira o
//    modeloAtivo da sessão, então as chamadas seguintes vão direto nele.
// 2. Retry por modelo — 429/503 com espera curta (rajada transitória) reenvia até 3x respeitando
//    o retryDelay do Google, sem incomodar a consultora.
// Erros de chave (400/403) interrompem tudo na hora: trocar de modelo não conserta chave.
async function chamarGemini(prompt, { json = false } = {}) {
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');

  const corpo = { contents: [{ parts: [{ text: prompt }] }] };
  if (json) corpo.generationConfig = { responseMimeType: 'application/json' };

  const candidatos = modeloAtivo ? [modeloAtivo, ...MODELOS.filter(m => m !== modeloAtivo)] : [...MODELOS];
  let ultimoErroBody = null, ultimoStatus = 0;

  for (const modelo of candidatos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      let r;
      try {
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      } catch (e) {
        throw new Error('Sem conexão com a API do Gemini — verifique a internet e tente de novo.');
      }
      if (r.ok) {
        const data = await r.json();
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!texto) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
        if (modeloAtivo !== modelo) console.info('[Gemini] Modelo em uso nesta sessão:', modelo);
        modeloAtivo = modelo;
        return texto;
      }
      ultimoErroBody = await r.json().catch(() => ({}));
      ultimoStatus = r.status;
      console.warn(`[Gemini] ${modelo} respondeu ${r.status}:`, ultimoErroBody?.error?.message || '(sem mensagem)');

      // Chave inválida/sem permissão não depende do modelo — não adianta tentar outro.
      if (r.status === 400 || r.status === 403) throw erroGemini(r.status, ultimoErroBody);
      // 404 = este modelo foi aposentado/não existe nessa chave — próximo da lista.
      if (r.status === 404) break;

      const reenviavel = r.status === 429 || r.status === 503;
      const { retrySeg } = r.status === 429 ? extrairInfoQuota(ultimoErroBody) : { retrySeg: 2 };
      // Espera curta (≤4s) = rajada: reenvia no mesmo modelo. Espera longa = cota DESTE modelo
      // esgotada: quebra pro próximo modelo da lista em vez de travar a consultora esperando.
      if (!reenviavel || tentativa === MAX_TENTATIVAS || retrySeg > 4) break;
      await sleep((retrySeg > 0 ? retrySeg : tentativa) * 1000);
    }
  }
  throw erroGemini(ultimoStatus, ultimoErroBody);
}

export async function gerarBeneficios(nomeProduto, linha = '') {
  if (!nomeProduto?.trim()) throw new Error('Preencha o nome do produto antes de gerar.');
  const prompt = `Escreva uma descrição curta de benefícios (no máximo 2 frases, linguagem de vendas, sem emojis, sem markdown) para o produto de cosmético/beleza "${nomeProduto}"${linha ? ` da linha "${linha}"` : ''}, destinada a um catálogo de vendas de consultora de beleza. Responda só com o texto da descrição, sem aspas.`;
  return chamarGemini(prompt);
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
