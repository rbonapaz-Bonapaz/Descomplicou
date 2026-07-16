// Página pública do catálogo de evento — não usa auth, não depende de state.js/app.js
// (que assumem uma consultora logada). Instância própria do Firebase.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, onSnapshot, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { norm, linhasDe, labelLinha } from './utils.js';

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);
const WA_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-3px;flex:0 0 auto"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M12.004 4.6c-4.087 0-7.4 3.313-7.4 7.4 0 1.301.34 2.577.986 3.7L4.6 19.4l3.8-.997a7.37 7.37 0 0 0 3.604.94h.003c4.087 0 7.4-3.313 7.4-7.4s-3.313-7.343-7.403-7.343zm0 13.53a6.1 6.1 0 0 1-3.113-.85l-.223-.132-2.318.608.619-2.26-.146-.232a6.12 6.12 0 0 1-.94-3.264c0-3.38 2.75-6.13 6.13-6.13 3.38 0 6.13 2.75 6.13 6.13 0 3.38-2.75 6.13-6.14 6.13z"/><path fill="#fff" d="M15.188 13.746c-.163-.082-.965-.476-1.115-.53-.15-.055-.259-.082-.368.082-.109.163-.42.53-.516.639-.095.109-.19.123-.353.041-.163-.082-.688-.254-1.311-.809-.485-.432-.812-.966-.907-1.129-.095-.163-.01-.251.072-.333.074-.073.163-.19.245-.285.082-.096.109-.164.163-.273.055-.109.027-.204-.014-.286-.041-.082-.368-.885-.504-1.212-.133-.319-.269-.276-.368-.28h-.313c-.109 0-.286.041-.436.204-.15.163-.572.559-.572 1.363 0 .803.586 1.579.667 1.688.082.109 1.153 1.76 2.793 2.467.39.168.694.269.931.344.391.124.747.107 1.03.065.314-.047.965-.395 1.101-.777.136-.382.136-.708.095-.777-.041-.068-.15-.109-.313-.191z"/></svg>`;
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
  try {
    onSnapshot(doc(db, 'eventosPublicos', eventoId), (snap) => {
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
    }, (e) => {
      return showExpirado();
    });
  } catch (e) {
    return showExpirado();
  }
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
  if ($('evLogo')) {
    if (pp.foto) {
      $('evLogo').innerHTML = `<img src="${esc(pp.foto)}" alt="${esc(nome)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.textContent='${esc(iniciais(nome))}'">`;
    } else {
      $('evLogo').textContent = iniciais(nome);
    }
  }

  const links = [];
  if (pp.instagram) {
    const handle = String(pp.instagram).replace(/^@/, '');
    links.push(`<a href="https://instagram.com/${esc(handle)}" target="_blank" rel="noopener">📷 @${esc(handle)}</a>`);
  }
  if (pp.linkLoja) links.push(`<a href="${esc(pp.linkLoja)}" target="_blank" rel="noopener">🔗 Nosso site</a>`);
  if (pp.whatsapp) links.push(`<a href="https://wa.me/55${esc(String(pp.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">${WA_ICON} WhatsApp</a>`);
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

  // Cada evento decide o que aparece na vitrine (preço/benefícios/estoque) — configurado pela
  // consultora ao criar/editar o evento; padrão true pra eventos criados antes desse recurso.
  const mostrarPrecos = evento.mostrarPrecos !== false;
  const mostrarBeneficios = evento.mostrarBeneficios !== false;
  const mostrarEstoque = evento.mostrarEstoque !== false;

  $('evGrid').innerHTML = itens.length ? itens.map(p => {
    const naLista = wishlist.some(w => itemKey(w) === itemKey(p));
    const temDesconto = p.precoOriginal && p.precoComDesconto && p.precoOriginal !== p.precoComDesconto;
    const pronta = Number(p.prontaEntrega || 0);
    return `<div class="catalog-card">
      ${p.imagem ? `<img src="${esc(p.imagem)}">` : ''}
      <b>${esc(p.nome)}</b>
      <span>Código: ${esc(p.codigoFarmasi || '-')}</span>
      ${mostrarBeneficios && p.beneficios ? `<span class="catalog-benef">${esc(p.beneficios)}</span>` : ''}
      ${mostrarEstoque && p.prontaEntrega != null ? `<span class="ev-estoque-tag ${pronta > 0 ? 'ev-estoque-ok' : 'ev-estoque-zero'}">${pronta > 0 ? `${pronta} em pronta entrega` : 'Sob encomenda'}</span>` : ''}
      ${mostrarPrecos ? `<div class="price-pair">${temDesconto
        ? `<del>De: ${money(p.precoOriginal)}</del><strong>Por: ${money(p.precoComDesconto)} <span class="ev-desconto-tag">-${descontoPercent(p.precoOriginal, p.precoComDesconto)}%</span></strong>`
        : `<strong>${money(p.precoComDesconto || p.precoOriginal)}</strong>`}</div>` : ''}
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
      <div class="field full"><label>Como você gosta de ser chamado(a)?</label><input id="wApelido" placeholder="Ex: Fabiula de Oliveira – Fabi"></div>
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
  const apelido = $('wApelido').value.trim();
  const whats = $('wWhats').value.trim();
  const nascimento = $('wNascimento').value.trim();
  if (!nome) return toast('Informe seu nome completo');
  const btn = $('wConfirmar');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'eventosPublicos', eventoId, 'listasDesejo'), {
      nomeVisitante: nome, apelido, whatsapp: whats, nascimento,
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
