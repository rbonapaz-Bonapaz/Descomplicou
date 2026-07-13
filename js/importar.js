import { state, toast } from './state.js';
import { $, esc, money, norm, pill } from './utils.js';
import { upsertProduto, mesclarLinhas } from './produtos.js';

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

// Painel de importação embutido no final da página de Produtos (não é mais uma página própria).
export function importPanelHtml() {
  return `<div class="panel">
    <h3>Importar produtos JSON</h3>
    <p class="muted">Produtos com mesmo código Farmasi serão atualizados, evitando duplicados.</p>
    <label class="btn pink">Selecionar JSON<input type="file" multiple accept=".json" style="display:none" onchange="App.readProductFiles(this.files)"></label>
    <br><br>
    <div class="drop" ondragover="event.preventDefault()" ondrop="event.preventDefault();App.readProductFiles(event.dataTransfer.files)">Arraste arquivos JSON aqui</div>
    <br><textarea id="jsonProdutos" placeholder="Ou cole o JSON..."></textarea>
    <br><br><button class="btn dark" onclick="App.previewImportProdutos()">Analisar</button>
  </div><div id="previewProdutos"></div>`;
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

export async function readProductFiles(files) {
  let all = [];
  for (const f of files) {
    try {
      all = all.concat(extractProdutos(JSON.parse(await f.text())));
    } catch (e) { toast(`Erro em ${f.name}: ${e.message}`); }
  }
  window.__produtosImport = dedupBatch(all);
  renderProductPreview(window.__produtosImport);
}

export function previewImportProdutos() {
  try {
    const arr = dedupBatch(extractProdutos(JSON.parse($('jsonProdutos').value)));
    if (!arr.length) return toast('Nenhum produto encontrado no JSON.');
    window.__produtosImport = arr;
    renderProductPreview(arr);
  } catch (e) { toast('Erro: ' + e.message); }
}

// Verifica se o produto já existe na base (por código, fallback nome normalizado)
function existente(p) {
  const cod = String(p.codigoFarmasi || '').trim();
  if (cod) return state.data.produtos.find(x => String(x.codigoFarmasi || '') === cod);
  return state.data.produtos.find(x => norm(x.nome) === norm(p.nome));
}

function renderProductPreview(arr) {
  if (!arr.length) {
    $('previewProdutos').innerHTML = '<div class="panel"><p class="muted">Nenhum produto para importar.</p></div>';
    return;
  }
  const novos = arr.filter(p => !existente(p)).length;
  const atualiza = arr.length - novos;
  $('previewProdutos').innerHTML = `<div class="panel">
    <div class="panel-head">
      <h3>Conferência (${arr.length})</h3>
      <div style="display:flex;gap:6px">${pill(novos + ' novos', 'green')}${pill(atualiza + ' atualizações', 'blue')}</div>
    </div>
    <p class="muted">Produtos existentes (mesmo código Farmasi) são atualizados, não duplicados. Edite qualquer campo abaixo antes de salvar, se precisar.</p>
    <div class="table"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Linha (informativo)</th><th>Original</th><th>Atual</th><th>Situação</th>
    </tr></thead><tbody>${arr.map((p, idx) => {
      const ex = existente(p);
      return `<tr>
        <td data-label="Produto"><input value="${esc(p.nome)}" onchange="App.editarItemImportProduto(${idx},'nome',this.value)"></td>
        <td data-label="Código"><input value="${esc(p.codigoFarmasi || '')}" onchange="App.editarItemImportProduto(${idx},'codigoFarmasi',this.value)"></td>
        <td data-label="Linha (informativo)" class="muted">${esc(p.linha)}</td>
        <td data-label="Original"><input value="${esc(p.precoOriginal || '')}" onchange="App.editarItemImportProduto(${idx},'precoOriginal',this.value)"></td>
        <td data-label="Atual"><input value="${esc(p.precoAtual || '')}" onchange="App.editarItemImportProduto(${idx},'precoAtual',this.value)"></td>
        <td data-label="Situação">${ex ? pill('Atualiza', 'blue') : pill('Novo', 'green')}</td>
      </tr>`;
    }).join('')}</tbody></table></div><br>
    <button class="btn dark" onclick="App.confirmImportProdutos()">Salvar ${arr.length} produto(s)</button>
  </div>`;
}

export function editarItemImportProduto(idx, campo, valor) {
  if (!window.__produtosImport?.[idx]) return;
  window.__produtosImport[idx][campo] = valor;
  renderProductPreview(window.__produtosImport);
}

export async function confirmImportProdutos() {
  // A linha não vem mais automática do arquivo importado — a consultora define suas próprias
  // linhas em Produtos → Linhas e atribui manualmente. Ignora o que o arquivo trouxe (a coluna
  // "Linha" na conferência é só informativa) pra não sobrescrever uma atribuição já feita.
  for (const p of window.__produtosImport || []) await upsertProduto({ ...p, linha: '' });
  window.App.refresh('Produtos importados');
}
