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
    if (/PerMinute/i.test(raw)) return new Error('Limite de requisições por minuto do Gemini atingido (plano gratuito permite poucas por minuto) — espere cerca de 1 minuto e tente de novo, não precisa trocar de chave.');
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
