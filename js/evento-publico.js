// Página pública do catálogo de evento — não usa auth, não depende de state.js/app.js
// (que assumem uma consultora logada). Instância própria do Firebase.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);
// Produto pode pertencer a mais de uma linha ("Linha A, Linha B" quando mesclado na importação) —
// trata como tags em vez de valor único, senão cada combinação vira um filtro próprio e polui a tela.
const linhasDe = p => String(p.linha || 'Sem linha').split(',').map(s => s.trim()).filter(Boolean);
const LINHA_LABELS = {
  'cuidados cabelo': 'Cuidados com o Cabelo',
  'cuidados pele': 'Cuidados com a Pele',
  'cuidados pessoais': 'Cuidados Pessoais'
};
function labelLinha(l) {
  const raw = String(l || 'Sem linha').trim();
  const friendly = LINHA_LABELS[norm(raw)];
  if (friendly) return friendly;
  return raw.replace(/-/g, ' ').split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
}
function descontoPercent(original, atual) {
  const o = Number(original || 0), a = Number(atual || 0);
  if (!o || !a || o <= a) return 0;
  return Math.round((1 - a / o) * 100);
}

const params = new URLSearchParams(location.search);
const eventoId = params.get('id');

let evento = null;
let wishlist = [];
let linhaAtiva = 'todas';

function formatDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).split('-');
  return `${dd}/${m}/${y}`;
}

// Nome usado nas mensagens para a visitante — prioriza o nome da pessoa, depois o do negócio.
function nomeInfluencer() {
  const pp = evento?.perfilPublico || {};
  if (pp.nome || pp.nomeNegocio) return pp.nome || pp.nomeNegocio;
  if (pp.genero === 'Masculino') return 'o consultor';
  if (pp.genero === 'Feminino') return 'a consultora';
  return 'o(a) consultor(a)';
}

function showExpirado(mensagem) {
  $('loading').classList.add('hidden');
  if (mensagem) $('evExpirado').querySelector('p').textContent = mensagem;
  $('evExpirado').classList.remove('hidden');
}

async function init() {
  if (!eventoId) return showExpirado();
  let snap;
  try {
    snap = await getDoc(doc(db, 'eventosPublicos', eventoId));
  } catch (e) {
    return showExpirado();
  }
  if (!snap.exists()) return showExpirado();
  evento = snap.data();
  if (evento.ativo === false) return showExpirado();

  const agora = new Date();
  if (evento.vigenciaInicio || evento.vigenciaFim) {
    if (evento.vigenciaInicio && agora < new Date(evento.vigenciaInicio)) {
      return showExpirado('Este link ainda não está disponível. Volte mais tarde!');
    }
    if (evento.vigenciaFim && agora > new Date(evento.vigenciaFim)) {
      return showExpirado();
    }
  } else if (evento.validade && evento.validade < today()) {
    return showExpirado();
  }
  render();
}

function render() {
  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('evTitulo').textContent = evento.nome || 'Catálogo do evento';
  $('evSubtitulo').textContent = evento.data ? `Evento em ${formatDate(evento.data)}` : 'Promoções especiais';
  renderHeaderFooter();
  renderFiltros();
  renderGrid();
}

// Mesma lógica do logo dinâmico do CRM (iniciais do nome do negócio) — troca o "CV" genérico
// pelas iniciais reais da consultora, em vez de mostrar uma sigla sem significado pra visitante.
function iniciais(nome) {
  const palavras = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return 'CV';
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

function renderHeaderFooter() {
  const pp = evento.perfilPublico || {};
  const nome = pp.nomeNegocio || pp.nome || '';
  if (nome) $('evTitulo').textContent = evento.nome ? `${evento.nome}` : nome;
  if ($('evLogo')) $('evLogo').textContent = iniciais(nome);

  const links = [];
  if (pp.instagram) {
    const handle = String(pp.instagram).replace(/^@/, '');
    links.push(`<a href="https://instagram.com/${esc(handle)}" target="_blank" rel="noopener">📷 @${esc(handle)}</a>`);
  }
  if (pp.linkLoja) links.push(`<a href="${esc(pp.linkLoja)}" target="_blank" rel="noopener">🔗 Nosso site</a>`);
  if (pp.whatsapp) links.push(`<a href="https://wa.me/55${esc(String(pp.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  $('evHeaderLinks').innerHTML = links.join('');

  $('evFooter').innerHTML = nome
    ? `<b>${esc(nome)}</b><br>${esc(pp.instagram ? '@' + String(pp.instagram).replace(/^@/, '') : '')}`
    : '';
}

function renderFiltros() {
  const linhas = [...new Set((evento.produtos || []).flatMap(linhasDe))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const descontos = evento.descontosPorLinha || {};
  $('evFiltros').innerHTML = `<button class="chip ${linhaAtiva === 'todas' ? 'active' : ''}" data-l="todas">Todas</button>` +
    linhas.map(l => {
      const d = Number(descontos[l] || 0);
      return `<button class="chip ${linhaAtiva === l ? 'active' : ''}" data-l="${esc(l)}">${esc(labelLinha(l))}${d > 0 ? ` <span class="ev-desconto-tag">-${d}%</span>` : ''}</button>`;
    }).join('');
  $('evFiltros').querySelectorAll('button').forEach(b => b.onclick = () => { linhaAtiva = b.dataset.l; renderFiltros(); renderGrid(); });
}

function itemKey(p) { return (p.codigoFarmasi || '') + '|' + p.nome; }

function renderGrid() {
  const q = norm($('evBusca').value);
  let itens = evento.produtos || [];
  if (linhaAtiva !== 'todas') itens = itens.filter(p => linhasDe(p).includes(linhaAtiva));
  if (q) itens = itens.filter(p => norm(p.nome + ' ' + p.codigoFarmasi).includes(q));

  $('evGrid').innerHTML = itens.length ? itens.map(p => {
    const naLista = wishlist.some(w => itemKey(w) === itemKey(p));
    const temDesconto = p.precoOriginal && p.precoComDesconto && p.precoOriginal !== p.precoComDesconto;
    const pronta = Number(p.prontaEntrega || 0);
    return `<div class="catalog-card">
      ${p.imagem ? `<img src="${esc(p.imagem)}">` : ''}
      <b>${esc(p.nome)}</b>
      <span>Código: ${esc(p.codigoFarmasi || '-')}</span>
      ${p.beneficios ? `<span class="catalog-benef">${esc(p.beneficios)}</span>` : ''}
      ${p.prontaEntrega != null ? `<span class="ev-estoque-tag ${pronta > 0 ? 'ev-estoque-ok' : 'ev-estoque-zero'}">${pronta > 0 ? `${pronta} em pronta entrega` : 'Sob encomenda'}</span>` : ''}
      <div class="price-pair">${temDesconto
        ? `<del>De: ${money(p.precoOriginal)}</del><strong>Por: ${money(p.precoComDesconto)} <span class="ev-desconto-tag">-${descontoPercent(p.precoOriginal, p.precoComDesconto)}%</span></strong>`
        : `<strong>${money(p.precoComDesconto || p.precoOriginal)}</strong>`}</div>
      <button class="btn ${naLista ? 'dark' : 'pink'} small ev-card-btn" data-key="${esc(itemKey(p))}">${naLista ? '✓ Na minha lista' : '♥ Quero esse'}</button>
    </div>`;
  }).join('') : '<p class="muted">Nenhum produto encontrado.</p>';

  $('evGrid').querySelectorAll('button[data-key]').forEach(btn => {
    btn.onclick = () => toggleWishlist(btn.dataset.key);
  });
  updateWishBar();
}

function toggleWishlist(key) {
  const idx = wishlist.findIndex(w => itemKey(w) === key);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
  } else {
    const p = (evento.produtos || []).find(x => itemKey(x) === key);
    if (p) wishlist.push({
      codigoFarmasi: p.codigoFarmasi || '', nome: p.nome, linha: p.linha || '',
      precoOriginal: Number(p.precoOriginal || p.precoComDesconto || 0),
      precoComDesconto: Number(p.precoComDesconto || p.precoOriginal || 0)
    });
  }
  renderGrid();
}

// Resumo em tempo real: valor original somado x valor que a visitante realmente vai pagar,
// com a economia em destaque — reforça a percepção de oportunidade enquanto ela seleciona.
function updateWishBar() {
  $('evCount').textContent = wishlist.length;
  $('evWishBar').classList.toggle('hidden', wishlist.length === 0);
  if (!wishlist.length) return;

  const totalOriginal = wishlist.reduce((s, w) => s + Number(w.precoOriginal || 0), 0);
  const totalPagar = wishlist.reduce((s, w) => s + Number(w.precoComDesconto || 0), 0);
  const economia = totalOriginal - totalPagar;

  $('evResumo').innerHTML = economia > 0.004
    ? `<del>${money(totalOriginal)}</del> <strong>${money(totalPagar)}</strong> <span class="ev-wish-economia">você economiza ${money(economia)} (-${descontoPercent(totalOriginal, totalPagar)}%)</span>`
    : `<strong>${money(totalPagar)}</strong>`;
}

$('evBusca').oninput = renderGrid;

$('evBtnEnviar').onclick = () => {
  showModal(`<h3>Enviar minha lista</h3>
    <p class="muted">${wishlist.length} produto(s) selecionado(s): ${esc(wishlist.map(w => w.nome).join(', '))}</p>
    <div class="grid">
      <div class="field full"><label>Nome completo</label><input id="wNome" placeholder="Seu nome completo"></div>
      <div class="field"><label>Data de aniversário (dia/mês/ano)</label><input id="wNascimento" placeholder="Ex: 15/05/1990"></div>
      <div class="field"><label>WhatsApp (opcional)</label><input id="wWhats" placeholder="(11) 99999-9999"></div>
      <div class="field full"><label>Você já é cliente de ${esc(nomeInfluencer())}?</label>
        <select id="wJaCliente">
          <option value="nao">Ainda não sou cliente</option>
          <option value="sim">Já sou cliente</option>
        </select>
      </div>
    </div><br>
    <button class="btn dark" id="wConfirmar">Enviar lista</button>
    <button class="btn ghost" onclick="closeModal()">Cancelar</button>`);
  $('wConfirmar').onclick = enviarLista;
};

async function enviarLista() {
  const nome = $('wNome').value.trim();
  const whats = $('wWhats').value.trim();
  const nascimento = $('wNascimento').value.trim();
  if (!nome) return toast('Informe seu nome completo');
  const btn = $('wConfirmar');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'eventosPublicos', eventoId, 'listasDesejo'), {
      nomeVisitante: nome, whatsapp: whats, nascimento,
      jaCliente: $('wJaCliente').value === 'sim',
      produtosDesejados: wishlist,
      criadoEm: serverTimestamp()
    });
    wishlist = [];
    renderGrid();
    showModal(`<h3>Lista enviada! 🎉</h3><p>Obrigada, ${esc(nome)}! ${esc(nomeInfluencer())} vai entrar em contato com você em breve.</p><br><button class="btn dark" onclick="closeModal()">Fechar</button>`);
  } catch (e) {
    btn.disabled = false;
    toast('Erro ao enviar: ' + e.message);
  }
}

function showModal(h) { $('modalCard').innerHTML = h; $('modal').classList.remove('hidden'); }
window.closeModal = () => $('modal').classList.add('hidden');
function toast(m) { const t = $('toast'); t.textContent = m; t.className = 'show'; setTimeout(() => t.className = '', 2600); }
$('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

// Tamanho da letra do catálogo é ajustável pela visitante (útil em telas pequenas) e fica
// salvo no aparelho para as próximas visitas ao mesmo link.
const FONT_MIN = 0.85, FONT_MAX = 1.6, FONT_STEP = 0.1;
function aplicarFontScale(v) {
  document.documentElement.style.setProperty('--ev-font-scale', v);
  localStorage.setItem('evFontScale', v);
}
function ajustarFonte(delta) {
  const atual = Number(localStorage.getItem('evFontScale') || 1);
  const novo = Math.min(FONT_MAX, Math.max(FONT_MIN, +(atual + delta).toFixed(2)));
  aplicarFontScale(novo);
}
aplicarFontScale(Number(localStorage.getItem('evFontScale') || 1));
$('evFontMais').onclick = () => ajustarFonte(FONT_STEP);
$('evFontMenos').onclick = () => ajustarFonte(-FONT_STEP);

init();
