import { state, SECTIONS, col, addDoc, serverTimestamp, setDoc, ref, toast, writeBatch, db } from './state.js';
import { $, esc, money, today, norm, withFocusPreserved, sectionTabsHtml, linhasDe, descontoPercent, labelLinha, logoNegocioHtml } from './utils.js';

// Estado do catálogo. ocultarPrecoAtual => mostra só o preço original (PDF "Preços originais").
let ocultarPrecoAtual = false;
let mostrarBeneficiosPdf = true;

function lineCounts() {
  const m = {};
  state.data.produtos.filter(p => p.ativoCatalogo !== false).forEach(p => {
    linhasDe(p).forEach(l => { m[l] = (m[l] || 0) + 1; });
  });
  return m;
}

function selectedLines() {
  return Array.from(document.querySelectorAll('#catFilters input:checked')).map(i => i.value);
}

export function renderCatalogo() {
  const counts = lineCounts();
  const linhas = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const totalCatalogo = Object.values(counts).reduce((s, n) => s + n, 0);
  const sec = state.section.catalogo;

  let html = sectionTabsHtml('catalogo', SECTIONS.catalogo, sec);

  if (sec === 'montar') {
    html += `<div class="catalog-layout">
      <aside class="filter-box">
        <div class="filter-head">
          <span>FILTROS PDF</span>
          <span class="filter-actions">
            <button onclick="App.selectAllCatalogLines()">TODOS</button>
            <button onclick="App.clearCatalogLines()">LIMPAR</button>
          </span>
        </div>
        <div id="catFilters" class="filter-list">
          ${linhas.length ? linhas.map(l => `<label class="filter-line">
            <span class="toggle-switch small"><input type="checkbox" checked value="${esc(l)}" onchange="App.previewCatalogo()"><span class="toggle-track"></span></span>
            ${esc(labelLinha(l))}<span class="line-count">${counts[l]}</span>
          </label>`).join('') : '<p class="muted" style="padding:8px 20px">Importe produtos para aparecerem as linhas.</p>'}
        </div>
        <div class="price-options">
          <div class="price-options-title">PREÇOS NO PDF</div>
          <button class="btn ${ocultarPrecoAtual ? 'ghost' : 'pink'} small" style="width:100%" onclick="App.toggleOcultarAtual()">
            ${ocultarPrecoAtual ? '👁 Mostrar preço atual' : '🙈 Ocultar preço atual'}
          </button>
          <p class="muted" style="font-size:11px;margin:8px 0 0">${ocultarPrecoAtual
            ? 'PDF mostrará apenas o preço original.'
            : 'PDF mostrará "De/Por" (original riscado + atual).'}</p>
        </div>
        <div class="price-options">
          <div class="price-options-title">BENEFÍCIOS NO PDF</div>
          <button class="btn ${mostrarBeneficiosPdf ? 'pink' : 'ghost'} small" style="width:100%" onclick="App.toggleBeneficiosPdf()">
            ${mostrarBeneficiosPdf ? '👁 Mostrando benefícios' : '🙈 Ocultando benefícios'}
          </button>
        </div>
        <div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:8px">
          <button class="btn dark" style="width:100%" onclick="App.printCatalogo()">▧ GERAR CATÁLOGO PDF</button>
          <button class="btn ghost" style="width:100%;font-size:12px;color:var(--error)" onclick="App.excluirTodoCatalogo()">Excluir todo catálogo</button>
        </div>
      </aside>
      <section>
        <div class="panel">
          <h3>Prévia por linhas selecionadas</h3>
          <p class="muted">Cabeçalho, rodapé e QR Code vêm de "Minha Conta". Apenas produtos com "Ativo no catálogo".</p>
          <div class="toolbar">
            <input id="qcatalogo" placeholder="Buscar por nome ou código..." oninput="App.previewCatalogo()" value="${esc($('qcatalogo')?.value || '')}">
          </div>
          <div id="catPrev"></div>
        </div>
      </section>
    </div>`;
  }

  $('catalogo').innerHTML = html;
  if (sec === 'montar') previewCatalogo();
}

export function toggleOcultarAtual() {
  ocultarPrecoAtual = !ocultarPrecoAtual;
  renderCatalogo();
}

export function toggleBeneficiosPdf() {
  mostrarBeneficiosPdf = !mostrarBeneficiosPdf;
  renderCatalogo();
}

export function selectAllCatalogLines() {
  document.querySelectorAll('#catFilters input').forEach(i => i.checked = true);
  previewCatalogo();
}

export function clearCatalogLines() {
  document.querySelectorAll('#catFilters input').forEach(i => i.checked = false);
  previewCatalogo();
}

// Agrupa produtos ativos por linha, deduplicando por código (fallback nome+linha)
function catalogProductsByLine() {
  const lines = selectedLines(), seen = new Set(), out = {};
  state.data.produtos.filter(p => p.ativoCatalogo !== false).forEach(p => {
    linhasDe(p).forEach(l => {
      if (!lines.includes(l)) return;
      const key = (p.codigoFarmasi || (p.nome || '').toLowerCase().trim()) + '|' + l;
      if (seen.has(key)) return;
      seen.add(key);
      (out[l] = out[l] || []).push(p);
    });
  });
  return out;
}

// Preço na prévia/tela (usa valores numéricos do produto)
function priceHtml(p) {
  const o = Number(p.precoOriginal || 0), a = Number(p.precoAtual || 0);
  if (ocultarPrecoAtual) return `<div class="price-pair"><strong>${money(o || a)}</strong></div>`;
  if (o && a && o !== a) {
    const pct = descontoPercent(o, a);
    return `<div class="price-pair"><del>De: ${money(o)}</del><strong>Por: ${money(a)}</strong>${pct ? ` <span class="tag green">-${pct}%</span>` : ''}</div>`;
  }
  return `<div class="price-pair"><strong>${money(a || o)}</strong></div>`;
}

export function previewCatalogo() {
  withFocusPreserved('qcatalogo', () => {
    const g = catalogProductsByLine();
    const q = norm($('qcatalogo')?.value || '');
    const linhas = Object.keys(g).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const html = linhas.map(l => {
      const itens = q ? g[l].filter(p => norm(p.nome + ' ' + p.codigoFarmasi).includes(q)) : g[l];
      if (!itens.length) return '';
      return `<h4>${esc(labelLinha(l))} (${itens.length}${q ? ' de ' + g[l].length : ''})</h4><div class="catalog-grid">${itens.slice(0, 12).map(p =>
        `<div class="catalog-card">${p.imagem ? `<img src="${esc(p.imagem)}">` : ''}
          <b>${esc(p.nome)}</b><span>Código: ${esc(p.codigoFarmasi || '-')}</span>${mostrarBeneficiosPdf && p.beneficios ? `<span class="catalog-benef">${esc(p.beneficios)}</span>` : ''}${priceHtml(p)}</div>`
      ).join('')}</div>`;
    }).join('');
    $('catPrev').innerHTML = html || (linhas.length ? '<p class="muted">Nenhum produto encontrado para essa busca.</p>' : '<p class="muted">Selecione pelo menos uma linha.</p>');
  });
}

function qrData() {
  const p = state.profile || {};
  if (p.linkLoja) return p.linkLoja;
  const n = String(p.whatsapp || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n.startsWith('55') ? n : '55' + n}` : location.href;
}

function qrUrl() {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=1&data=${encodeURIComponent(qrData())}`;
}

// Preço no PDF (strings originais "R$..." quando disponíveis, senão formata numérico)
function pdfPrice(p) {
  const oNum = Number(p.precoOriginal || 0), aNum = Number(p.precoAtual || 0);
  const o = money(oNum || aNum), a = money(aNum || oNum);
  if (ocultarPrecoAtual) return `<div class="cat-price"><strong>${o}</strong></div>`;
  if (oNum && aNum && oNum !== aNum) {
    const pct = descontoPercent(oNum, aNum);
    return `<div class="cat-price"><del>De: ${o}</del><strong>Por: ${a}${pct ? ` <span class="cat-discount">-${pct}%</span>` : ''}</strong></div>`;
  }
  return `<div class="cat-price"><strong>${a}</strong></div>`;
}

function pdfCard(p, showBenef) {
  return `<div class="cat-item">${p.imagem ? `<img src="${esc(p.imagem)}">` : '<div class="no-img">Sem imagem</div>'}
    <div class="cat-name">${esc(p.nome)}</div>
    <div class="cat-code">Código: ${esc(p.codigoFarmasi || '-')}</div>
    ${showBenef && p.beneficios ? `<div class="cat-benef">${esc(p.beneficios)}</div>` : ''}
    ${pdfPrice(p)}</div>`;
}

// Engine de densidade: escolhe colunas/tamanho e itens por página conforme o total da linha.
function densityFor(n) {
  if (n <= 20) return { cls: 'd-comfy', first: 20, next: 24 };
  if (n <= 28) return { cls: 'd-med7', first: 28, next: 28 };
  if (n <= 40) return { cls: 'd-dense8', first: 40, next: 40 };
  const rem = n % 40;
  if (rem > 0 && rem < 5) return { cls: 'd-med8', first: 32, next: 32 };
  return { cls: 'd-dense8', first: 40, next: 40 };
}

function pageHtml(items, title, density) {
  const p = state.profile || {};
  return `<section class="cat-page ${density}">
    <header class="cat-header">
      <div class="cat-brand">${esc(p.tituloCatalogo ?? 'Catálogo Inteligente')}</div>
      <div class="cat-sub">${esc(p.subtituloCatalogo ?? 'GESTÃO DE PRODUTOS + PDF')}</div>
      <div class="cat-consult">${esc(p.nomeNegocio || 'CRM de Vendas')}<br>${esc(p.nome || '')}${p.whatsapp ? `<br>📱 ${esc(p.whatsapp)}` : ''}${p.instagram ? `<br>📷 @${esc(String(p.instagram).replace(/^@/, ''))}` : ''}</div>
    </header>
    <main class="cat-content">
      <h2 class="cat-line-title">${esc(title)}</h2>
      <div class="cat-grid">${items.map(it => pdfCard(it, mostrarBeneficiosPdf && density === 'd-comfy')).join('')}</div>
    </main>
    <footer class="cat-footer">
      ${logoNegocioHtml(p, 'pdf-foot-logo cat-foot-logo')}
      <div class="cat-foot-text"><b>${esc(p.nomeNegocio || 'CRM de Vendas')}</b><br>${esc(p.rodapeCatalogo ?? 'Fale comigo para fazer seu pedido')}<br>${esc(p.linkLoja || qrData())}</div>
      <img class="cat-qr" src="${qrUrl()}">
    </footer>
  </section>`;
}

export async function printCatalogo() {
  const g = catalogProductsByLine();
  const lines = Object.keys(g).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!lines.length) return toast('Selecione ao menos uma linha');

  const pages = [];
  lines.forEach(l => {
    const arr = g[l];
    const d = densityFor(arr.length);
    const titulo = labelLinha(l);
    pages.push(pageHtml(arr.slice(0, d.first), titulo, d.cls));
    for (let i = d.first; i < arr.length; i += d.next)
      pages.push(pageHtml(arr.slice(i, i + d.next), titulo + ' - continuação', d.cls));
  });

  $('printArea').innerHTML = pages.join('');
  await addDoc(col('catalogos'), {
    data: today(), linhas: lines, qr: qrData(),
    ocultarPrecoAtual, mostrarPrecoAtual: !ocultarPrecoAtual,
    quantidadeProdutos: lines.reduce((s, l) => s + g[l].length, 0),
    criadoEm: serverTimestamp()
  });

  // Espera imagens carregarem antes de imprimir (evita PDF sem fotos)
  const imgs = Array.from(document.querySelectorAll('#printArea img'));
  const pending = imgs.filter(im => !im.complete);
  if (!pending.length) return setTimeout(() => window.print(), 250);
  let done = false, left = pending.length;
  const go = () => { if (!done) { done = true; window.print(); } };
  pending.forEach(im => { im.onload = im.onerror = () => { if (--left <= 0) go(); }; });
  setTimeout(go, 1800);
}

export async function excluirTodoCatalogo() {
  if (!confirm('Remover todos os produtos do catálogo?\nIsso NÃO apaga os produtos, apenas os remove da geração do PDF.')) return;
  for (let i = 0; i < state.data.produtos.length; i += 450) {
    const batch = writeBatch(db);
    state.data.produtos.slice(i, i + 450).forEach(p => batch.update(ref('produtos', p.id), { ativoCatalogo: false }));
    await batch.commit();
  }
  window.App.refresh('Catálogo limpo. Produtos mantidos no sistema.');
}
