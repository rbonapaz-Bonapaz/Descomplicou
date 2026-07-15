// Geração de texto de benefícios/descrição de produto via Gemini, usando a própria chave de API
// da consultora (BYOK — bring your own key). A chave fica salva só no perfil dela no Firestore
// (mesma isolação de dados do resto do app) e a chamada é feita direto do navegador pra API do
// Google — não passa por nenhum servidor nosso.
import { state } from './state.js';

const MODELO = 'gemini-2.0-flash';

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
    const msg = body?.error?.message || `Erro ${r.status}`;
    if (r.status === 400 && /API key/i.test(msg)) throw new Error('Chave do Gemini inválida.');
    if (r.status === 429 || /quota/i.test(msg)) {
      throw new Error('Sua chave do Gemini está sem cota disponível. Crie uma chave nova em um projeto novo em aistudio.google.com/apikey e substitua em Minha Conta.');
    }
    throw new Error(msg);
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
    const msg = body?.error?.message || `Erro ${r.status}`;
    if (r.status === 400 && /API key/i.test(msg)) throw new Error('Chave do Gemini inválida.');
    if (r.status === 429 || /quota/i.test(msg)) {
      throw new Error('Sua chave do Gemini está sem cota disponível. Crie uma chave nova em um projeto novo em aistudio.google.com/apikey e substitua em Minha Conta.');
    }
    throw new Error(msg);
  }
  const data = await r.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!texto) throw new Error('O Gemini não retornou nenhum texto — tente de novo.');
  return texto;
}
