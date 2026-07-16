import { norm } from './utils.js';
import { mesclarLinhas } from './produtos.js';

// Deriva a linha a partir da URL de origem (ex: .../product-list/maquiagem?... -> "Maquiagem")
function lineFromUrl(u) {
  try {
    const m = decodeURIComponent(String(u || '')).match(/product-list\/([^/?#]+)/i);
    if (!m) return '';
    const s = m[1].replace(/\+/g, ' ').replace(/-/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  } catch (e) { return ''; }
}

function isBadLine(l) {
  const s = String(l || '').trim();
  return !s || /^br$/i.test(s) || /^sem linha$/i.test(s);
}

// Normaliza um produto vindo do JSON do bookmarklet, aceitando variações de nome de campo.
function normProd(p, fallback = '') {
  let linha = String(p.linha || p.category || '').trim();
  if (isBadLine(linha)) linha = fallback || lineFromUrl(p.origem || p.url) || 'Sem linha';
  let atual = p.precoAtual || p.currentPrice || p.preco || p.price || p.valorUnitarioNumero || p.valorUnitario || '';
  let original = p.precoOriginal || p.originalPrice || p.oldPrice || '';
  // Se só houver um preço, usa o mesmo nos dois lugares
  if (!original && atual) original = atual;
  if (!atual && original) atual = original;
  return {
    nome: String(p.nome || p.produto || p.name || '').trim(),
    codigoFarmasi: String(p.codigo || p.codigoFarmasi || p.code || '').trim(),
    linha,
    precoOriginal: original,
    precoAtual: atual,
    imagem: String(p.imagem || p.image || p.img || '').trim(),
    beneficios: String(p.beneficios || p.descricao || p.beneficio || '').trim()
  };
}

// Extrai e normaliza os produtos de um objeto JSON (array puro ou {linha, url, produtos:[...]})
export function extractProdutos(obj) {
  const fallback = (!isBadLine(obj?.linha) ? obj.linha : '') || lineFromUrl(obj?.url) || '';
  const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.produtos) ? obj.produtos : []);
  return arr.map(p => normProd(p, fallback)).filter(p => p.nome);
}

// Remove duplicados dentro do lote por codigoFarmasi (fallback nome). Se o mesmo produto
// aparece em linhas diferentes (ex: Skincare e Kits), combina as linhas em vez de duplicar.
export function dedupBatch(items) {
  const map = {};
  items.forEach(p => {
    const key = p.codigoFarmasi || norm(p.nome);
    if (map[key]) map[key] = { ...map[key], ...p, linha: mesclarLinhas(map[key].linha, p.linha) };
    else map[key] = p;
  });
  return Object.values(map);
}

