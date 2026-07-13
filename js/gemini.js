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
