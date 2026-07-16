// Geração de texto de benefícios/descrição de produto via Gemini, usando a própria chave de API
// da consultora (BYOK — bring your own key). A chave fica salva só no perfil dela no Firestore
// (mesma isolação de dados do resto do app) e a chamada é feita direto do navegador pra API do
// Google — não passa por nenhum servidor nosso.
import { state } from './state.js';

const MODELO = 'gemini-2.0-flash';

// Erro 429 do Gemini cobre dois casos bem diferentes que a mensagem genérica "sem cota" confundia:
// limite de requisições por MINUTO (free tier: 15/min — passa sozinho, só esperar) e cota
// diária/do plano realmente esgotada (aí sim precisa esperar renovar ou trocar de chave/projeto).
// O corpo do erro traz um "quotaId" que diferencia os dois (ex: "...RequestsPerMinute..." vs
// "...RequestsPerDay..." ou sem menção a minuto). Loga o erro completo no console pra depuração.
function erroGemini(status, body) {
  console.error('[Gemini] Erro na chamada da API:', status, body);
  const msg = body?.error?.message || `Erro ${status}`;
  const raw = JSON.stringify(body?.error || {});
  if (status === 400 && /API key/i.test(msg)) return new Error('Chave do Gemini inválida — confira se copiou certinho em aistudio.google.com/apikey.');
  if (status === 403) return new Error('A chave do Gemini não tem permissão para essa API — confira se a "Generative Language API" está ativada no projeto dessa chave em aistudio.google.com/apikey.');
  if (status === 429) {
    if (/PerMinute/i.test(raw)) {
      // Marcador que as telas usam pra travar o botão com contagem regressiva em vez de deixar
      // clicar de novo na hora — cada clique repetido durante o minuto de espera é mais uma
      // requisição que soma na mesma cota e só atrasa ainda mais (não é a chave que está errada).
      const e = new Error('Limite de requisições por minuto do Gemini atingido (plano gratuito permite poucas por minuto) — a chave está certa, é só esperar cerca de 1 minuto.');
      e.tipoGemini = 'limite_por_minuto';
      return e;
    }
    return new Error('Sua chave do Gemini está sem cota disponível (limite diário ou do plano esgotado). Aguarde a renovação (geralmente 24h) ou crie uma chave em um projeto novo em aistudio.google.com/apikey.');
  }
  if (status >= 500) return new Error('O Gemini está indisponível no momento (erro no servidor do Google) — tente novamente em instantes.');
  return new Error(msg);
}

export async function gerarBeneficios(nomeProduto, linha = '') {
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');
  if (!nomeProduto?.trim()) throw new Error('Preencha o nome do produto antes de gerar.');

  const prompt = `Escreva uma descrição curta de benefícios (no máximo 2 frases, linguagem de vendas, sem emojis, sem markdown) para o produto de cosmético/beleza "${nomeProduto}"${linha ? ` da linha "${linha}"` : ''}, destinada a um catálogo de vendas de consultora de beleza. Responda só com o texto da descrição, sem aspas.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw erroGemini(r.status, body);
  }
  const data = await r.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!texto) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
  return texto;
}

// Interpretação de pedido falado/digitado em texto livre (Ações Rápidas → "Adicionar por voz") —
// mesma chave BYOK acima. A IA só extrai a intenção (cliente citada + produtos com quantidade);
// o casamento com o catálogo/cliente reais da consultora é feito localmente depois, por
// normalização de texto — evita mandar o catálogo inteiro no prompt e a IA "inventar" um produto
// que não existe no cadastro dela.
export async function interpretarPedidoDeVenda(texto) {
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');
  if (!texto?.trim()) throw new Error('Digite ou fale o pedido antes de interpretar.');

  const prompt = `Extraia de um pedido de venda falado por uma consultora de cosméticos o nome da cliente e os produtos com quantidade. Frase: "${texto.replace(/"/g, "'")}"

Responda SOMENTE em JSON válido, neste formato exato:
{"cliente":"nome da cliente mencionada, ou vazio se não citou","itens":[{"produto":"nome do produto como foi dito, sem marca nem tamanho de embalagem","quantidade":numero}]}

Se a quantidade não for dita, use 1. Não invente produtos que não foram citados na frase.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw erroGemini(r.status, body);
  }
  const data = await r.json();
  const texto2 = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!texto2) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
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
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');
  if (!texto?.trim()) throw new Error('Cole ou digite as taxas antes de interpretar.');

  const prompt = `Extraia taxas de uma tabela de operadora de cartão (maquininha/gateway), com valores separados por dois grupos de bandeira: "visaMaster" (Visa/Mastercard) e "eloAmex" (Elo/Amex ou Elo sozinho). Texto:
"""
${texto.replace(/"""/g, "'")}
"""

Responda SOMENTE em JSON válido, neste formato exato (use null nos campos que não aparecerem no texto, não invente valor):
{"prazoRecebimentoDias":numero_ou_null,"taxaDebito":{"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},"taxaCredito":[{"parcelas":1,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":2,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":3,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":4,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":5,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":6,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":7,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":8,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":9,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":10,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":11,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null},{"parcelas":12,"visaMaster":numero_ou_null,"eloAmex":numero_ou_null}]}

"Crédito à vista" conta como parcelas=1. Números são percentuais (ex: "1,37%" vira 1.37). Se o texto só tiver uma coluna de bandeira (sem separar grupos), use o mesmo valor pros dois grupos.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw erroGemini(r.status, body);
  }
  const data = await r.json();
  const texto2 = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!texto2) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
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
  const apiKey = (state.profile?.geminiApiKey || '').trim();
  if (!apiKey) throw new Error('Cadastre sua chave do Gemini em Minha Conta primeiro.');

  const nomeNegocio = state.profile?.nomeNegocio || 'sua loja';
  const prompt = `Você é o assistente de vendas de ${nomeNegocio}, uma consultora de vendas Farmasi. Com base no histórico de compras do cliente e nas informações enviadas abaixo, escreva uma mensagem de WhatsApp curta (no máximo 4 frases), amigável e persuasiva. Use um tom de voz profissional, porém próximo. Nunca invente produtos que não foram mencionados no contexto. Inclua uma chamada para ação (CTA) no final. Responda só com o texto da mensagem, sem aspas, sem markdown.

Contexto do cliente:
${contexto}`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw erroGemini(r.status, body);
  }
  const data = await r.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!texto) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
  return texto;
}
