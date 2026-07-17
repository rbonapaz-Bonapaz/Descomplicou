import { state, auth, db, ADMINS, titles, col, toast, showModal, closeModal, minimizarModal, restaurarModal,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, getDoc, getDocs, setDoc, doc, serverTimestamp, planoInfo, onSnapshot
} from './state.js';
import { $, esc, filtrarSearchPicker, formatDateBR, porGenero } from './utils.js';

import { renderDashboard, renderLeadsBanner, renderDatasComemorativas } from './dashboard.js';
import { abrirOperadoraForm, salvarOperadora, excluirOperadora, semearInfinitePay, atualizarOperadoraComIA } from './operadoras.js';
import { renderClientes, openClienteForm, saveCliente, openCliente360, marcarContatado, excluirCliente, toggleHistoricoVenda,
  gerarSugestaoAbordagemCliente, copiarSugestaoAbordagem, enviarSugestaoAbordagem, removerInteresseCliente } from './clientes.js';
import { renderAgenda, openAgendamentoForm, saveAgendamento, editarAgendamento, updateAgendamento,
  concluirAgendamento, confirmarConclusao, cancelarAgendamento, reagendarAgendamento,
  confirmarReagendamento, removerAgendamento, importarDoGoogleAgenda,
  abrirMapaDoCampo, abrirMapaAgendamento, preencherLocalDoCliente, toggleAgendamentoTitulo } from './agenda.js';
import { renderVendas, marcarPedidoEntregue, toggleVendaDetalhe, migrarNumeracaoPedidos } from './vendas.js';
import { renderEstoque, openEntradaManual, saveEntradaManual, openSaidaManual, saveSaidaManual,
  readPedidoPdf, confirmPedidoEstoque, removerLinhaPedido,
  ativarProntaEntregaTodos } from './estoque.js';
import { abrirNovaTroca, confirmarNovaTroca, openTroca, adicionarItemTroca, removerItemTroca,
  finalizarTroca, marcarItemTrocaProcessado, cancelarTroca, preencherValorTrocaSaida,
  preencherNomeParceira, editarParceiraTroca, salvarParceiraTroca, excluirTroca,
  toggleTrocaOpt, salvarTroca, toggleTrocaDetalhe, reabrirTroca } from './trocas.js';
import { renderProdutos, openProdutoForm, saveProduto, excluirProduto, excluirTodosProdutos, sincronizarBaseColetiva,
  editarItemBaseColetiva, removerItemBaseColetiva, confirmarBaseColetiva, gerarBeneficiosProduto,
  autoSincronizarBaseColetiva, exportarProdutosJson, corrigirLinhaImportadoPedido, corrigirLinhasDuplicadas, filtrarLinhaBaseColetiva,
  atualizarLinhasProdutoForm, adicionarLinhaCustom, removerLinhaCustom, selecionarLinhaParaAtribuir,
  filtrarLinhaAssoc, toggleProdutoNaLinha, sincronizarLinhasColetivas } from './produtos.js';
import { adicionarPreEncomenda, atualizarItemPreEncomenda, removerPreEncomenda,
  marcarComoPedido, voltarParaComprar, confirmarChegada, abrirModalBrinde, confirmarBrinde,
  openKitForm, adicionarProdutoKit, removerProdutoKit, confirmarKit, removerKitCompleto,
  registrarFreteFarmasi, removerFreteFarmasi, registrarDespesa, removerDespesa } from './preencomenda.js';
import { renderCatalogo, selectAllCatalogLines, clearCatalogLines, previewCatalogo, printCatalogo,
  excluirTodoCatalogo, toggleOcultarAtual, toggleBeneficiosPdf } from './catalogo.js';
import { renderRelatorios } from './relatorios.js';
import { renderPerfil, savePerfil, zerarMeusDados, toggleBaseColetiva, carregarFotoPerfil, removerFotoPerfil,
  conectarGoogleAgendaUI, desconectarGoogleAgendaUI, salvarGeminiKey,
  apagarEstoque, apagarClientes, apagarVendas, excluirMinhaConta, copiarLinkIndicacao, salvarConfigRelatorios,
  relSecaoDragStart, relSecaoDrop, salvarSecaoRelatorioAtiva, exportarBackupCompleto, restaurarEstoqueDoBackup, restaurarBackupCompleto,
  adicionarDataComemorativa, removerDataComemorativa, editarDataComemorativa, cancelarEdicaoDataComemorativa } from './perfil.js';
import { renderAdmin, carregarConsultoras, editarConsultora, salvarConsultora, salvarConfigPlanos, salvarConfigIpca, marcarIpcaAplicado, togglePromocaoIndicacao,
  readCatalogoMestreFiles, importarCatalogoMestreTexto, confirmarImportCatalogoMestre, editarItemImportMestre, limparCatalogoMestre,
  filtrarCatalogoMestre, editarProdutoMestre, salvarProdutoMestre, excluirProdutoMestre,
  adicionarLinhaColetiva, removerLinhaColetiva, aprovarSugestaoBeneficio, rejeitarSugestaoBeneficio } from './admin.js';
import { openNovoCarrinho, confirmarNovoCarrinho, openCarrinho, openCarrinhoForCliente,
  openCarrinhoDoCliente, preencherPrecoItem, adicionarItemCarrinho, removerItemCarrinho,
  toggleEntregaItem, toggleCarrinhoOpt, salvarCarrinhoOpt, finalizarCarrinho, cancelarCarrinho,
  marcarItemEntregue, enviarResumoWhatsApp, enviarLinkPagamento, marcarRetornoFeito, reabrirCarrinho, excluirCarrinho,
  registrarPagamento, confirmarPagamento, atualizarCalcPagamento, aplicarDescontoPedido,
  aplicarCreditoPagamento, abrirCheckoutInfinitePay, copiarLinkInfinitePay, fecharModalCheckoutInfinitePay, cobrarPorAproximacao } from './carrinho.js';
import { sendWhatsApp } from './whatsapp.js';
import { gerarPdfCliente, gerarPdfInterno } from './pdf-pedido.js';
import { switchLoginTab, loginEmail, cadastrarEmail, resetPassword, alterarSenha, criarSenhaGoogle, precisaCriarSenhaGoogle } from './auth.js';
import { biometriaDisponivel, temBiometriaAtiva, ativarBiometria, desativarBiometria, desbloquearBiometria } from './biometria.js';
import { renderEventos, openNovoEvento, confirmarNovoEvento, copiarLinkEvento, excluirEvento,
  toggleListasEvento, atualizarListasEvento, vincularCliente, confirmarVinculo, filtrarClientesVinculo,
  confirmarVinculoSelecionado, abrirNovoClienteDeLista, transformarEmCarrinho, marcarInteresseDaLista,
  enviarWhatsappEvento, confirmarEnvioWhatsapp, abrirEditarEvento, confirmarEditarEvento, gerarQrCodeEvento,
  marcarLeadsVistos, aoMudarTodoCatalogo, aplicarDescontoTodos, marcarLeadTratado, atualizarPrecosEvento } from './eventos.js';
import { renderSobre } from './sobre.js';

// --- Auth ---
$('btnLogin').onclick = async () => {
  const p = new GoogleAuthProvider();
  try { await signInWithPopup(auth, p); }
  catch (e) { if (e.code === 'auth/popup-blocked') await signInWithRedirect(auth, p); else toast(e.message); }
};
$('btnLogout').onclick = () => { teardownListeners(); signOut(auth); };
$('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
getRedirectResult(auth).catch(() => {});

function logoutFromLock() {
  $('bioLock').classList.add('hidden');
  $('planoLock').classList.add('hidden');
  teardownListeners();
  signOut(auth);
}

// Bloqueia o acesso quando o plano está vencido ou a conta foi suspensa pela admin — antes disso
// o vencimento era só um aviso informativo, não impedia o uso. Admin nunca é bloqueada pelo
// próprio plano, para poder sempre entrar e corrigir a situação de outras contas.
function checkBloqueioPlano() {
  if (state.profile.role === 'admin') return false;
  const suspenso = state.profile.status === 'suspenso';
  const pi = planoInfo();
  if (!suspenso && !pi.vencido) return false;

  $('planoLockTitulo').textContent = suspenso ? 'Acesso suspenso' : 'Plano vencido';
  $('planoLockMsg').textContent = suspenso
    ? 'Sua conta foi suspensa pela administração. Fale com o suporte para regularizar.'
    : `Seu plano venceu${pi.premiumAte ? ' em ' + formatDateBR(pi.premiumAte) : ''}. Renove para continuar usando o CRM.`;
  $('planoLockLink').innerHTML = state.profile.linkPagamento
    ? `<a class="btn dark" style="width:100%;margin-top:14px" href="${esc(state.profile.linkPagamento)}" target="_blank" rel="noopener">Renovar agora</a>`
    : '';
  return true;
}

async function tentarDesbloqueio() {
  const ok = await desbloquearBiometria();
  if (ok) {
    $('bioLock').classList.add('hidden');
    $('app').classList.remove('hidden');
  } else {
    toast('Não foi possível confirmar sua biometria');
  }
}

onAuthStateChanged(auth, async u => {
  $('loading').classList.add('hidden');
  if (!u) {
    teardownListeners();
    $('login').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('bioLock').classList.add('hidden');
    return;
  }
  state.user = u;
  $('login').classList.add('hidden');
  await ensureProfile();
  setupUI();
  await loadAll();
  renderAll();
  setupListeners();

  if (checkBloqueioPlano()) {
    $('planoLock').classList.remove('hidden');
    $('bioLock').classList.add('hidden');
    $('senhaLock').classList.add('hidden');
    $('app').classList.add('hidden');
  } else if (precisaCriarSenhaGoogle()) {
    $('senhaLock').classList.remove('hidden');
    $('bioLock').classList.add('hidden');
    $('app').classList.add('hidden');
  } else if (temBiometriaAtiva(u.uid)) {
    $('bioLock').classList.remove('hidden');
    $('app').classList.add('hidden');
  } else {
    $('app').classList.remove('hidden');
  }

  checkAutoSyncBaseColetiva();
});

// Roda no máximo 1x por dia (só quando a consultora abre o CRM depois do horário escolhido —
// não existe "segundo plano" num app sem servidor, então não sincroniza com o app fechado).
async function checkAutoSyncBaseColetiva() {
  const p = state.profile;
  if (!p?.usaBaseColetiva || !p?.baseColetivaAutoSync) return;
  const agora = new Date();
  const ultima = p.baseColetivaUltimaSincronizacao?.toDate ? p.baseColetivaUltimaSincronizacao.toDate() : null;
  if (ultima && ultima.toDateString() === agora.toDateString()) return;
  const [h, m] = (p.baseColetivaAutoSyncHora || '08:00').split(':').map(Number);
  const alvo = new Date(agora); alvo.setHours(h || 0, m || 0, 0, 0);
  if (agora < alvo) return;
  await autoSincronizarBaseColetiva();
  await refresh('Base coletiva sincronizada automaticamente');
}

// --- Navigation ---
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => goto(b.dataset.page));

function goto(p) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  $(p).classList.add('active');
  $('eyebrow').textContent = titles[p]?.[2] || '';
  $('title').textContent = titles[p]?.[0] || p;
  $('subtitle').textContent = titles[p]?.[1] || '';
}

// Captura o "?ref=uid" da URL de indicação assim que a página carrega (antes do login terminar)
// e guarda em localStorage — sobrevive ao redirect/popup do Google, que troca a URL. Só é
// consumido uma vez, na criação do perfil (ensureProfile), e depois é sempre limpo.
(function capturarIndicacao() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) localStorage.setItem('indicadoPorUid', ref);
})();

// --- Profile ---
async function ensureProfile() {
  const r = doc(db, 'users', state.user.uid);
  const s = await getDoc(r);
  if (!s.exists()) {
    // Indicação só conta se o código não for o da própria pessoa (evita autoindicação). Não dá
    // pra checar aqui se o uid de quem indicou realmente existe — as regras do Firestore não
    // deixam ler o doc de outro usuário antes do próprio doc existir. Essa checagem acontece
    // depois, na hora da recompensa (salvarConsultora em admin.js), quando o admin já tem
    // permissão de leitura ampla — se o uid for inválido, simplesmente nenhuma recompensa sai.
    const indicadoPorUid = localStorage.getItem('indicadoPorUid');
    const indicacaoValida = (indicadoPorUid && indicadoPorUid !== state.user.uid) ? indicadoPorUid : '';
    localStorage.removeItem('indicadoPorUid');

    state.profile = {
      nome: state.user.displayName || '', email: state.user.email || '',
      role: ADMINS.includes((state.user.email || '').toLowerCase()) ? 'admin' : 'user',
      plano: 'teste', nomeNegocio: 'CRM de Vendas', whatsapp: '', instagram: '',
      linkLoja: '', tituloCatalogo: 'Catálogo Inteligente',
      subtituloCatalogo: 'GESTÃO DE PRODUTOS + PDF',
      rodapeCatalogo: 'Fale comigo para fazer seu pedido', mensagemPadrao: '',
      ...(indicacaoValida ? { indicadoPorUid: indicacaoValida } : {})
    };
    await setDoc(r, { ...state.profile, criadoEm: serverTimestamp() });
  } else {
    state.profile = s.data();
  }
  await setDoc(r, { ultimoLogin: serverTimestamp() }, { merge: true });
}

// Deriva as iniciais do logo a partir do nome do negócio (ex: "Rodrigo PRO" -> "RP").
function initials(nome) {
  const palavras = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return 'CV';
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

function setupUI() {
  $('uname').textContent = state.profile?.nome || state.user.displayName || porGenero(state.profile?.genero, { f: 'Consultora', m: 'Consultor', x: 'Consultor(a)' });
  $('uemail').textContent = state.user.email || '';
  $('photo').src = state.profile.fotoPerfil || state.user.photoURL || '';
  $('brandName').textContent = state.profile.nomeNegocio || 'CRM de Vendas';
  $('sideLogo').textContent = initials(state.profile.nomeNegocio);
  document.querySelectorAll('.admin-only').forEach(e =>
    e.classList.toggle('hidden', state.profile.role !== 'admin')
  );
}

// --- Data ---
let _unsubscribes = [];
let _renderDebounce = null;

function setupListeners() {
  teardownListeners();
  for (const n of Object.keys(state.data)) {
    const unsub = onSnapshot(col(n), snap => {
      state.data[n] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!_renderDebounce) {
        _renderDebounce = setTimeout(() => { _renderDebounce = null; renderAll(); }, 80);
      }
    });
    _unsubscribes.push(unsub);
  }
}

function teardownListeners() {
  _unsubscribes.forEach(fn => fn());
  _unsubscribes = [];
}

async function loadAll() {
  for (const n of Object.keys(state.data)) {
    const s = await getDocs(col(n));
    state.data[n] = s.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  try {
    const cfg = await getDoc(doc(db, 'config', 'planos'));
    if (cfg.exists()) state.config = { ...state.config, ...cfg.data() };
  } catch (e) { /* config global pode não existir ainda ou sem permissão até deploy das regras */ }
}

async function refresh(m = '') {
  await loadAll();
  renderAll();
  setupUI();
  if (m) toast(m);
}

function renderAll() {
  renderDashboard();
  renderClientes();
  renderAgenda();
  renderVendas();
  renderEstoque();
  renderProdutos();
  renderCatalogo();
  renderRelatorios();
  renderPerfil();
  renderAdmin();
  renderEventos();
  renderSobre();
}

function setFilter(tipo, val) {
  state.filters[tipo] = val;
  if (tipo === 'prod' || tipo === 'prodSort' || tipo === 'prodLinha') renderProdutos();
  else if (tipo === 'estoque' || tipo === 'estoqueSort' || tipo === 'estoqueLinha') renderEstoque();
  else if (tipo === 'vendas' || tipo === 'vendasSort') renderVendas();
  else renderRelatorios();
}

const RENDER_BY_PAGE = { admin: () => renderAdmin(), perfil: () => renderPerfil(), produtos: () => renderProdutos(), estoque: () => renderEstoque(), catalogo: () => renderCatalogo(), sobre: () => renderSobre() };

function setSection(pagina, secao) {
  state.section[pagina] = secao;
  RENDER_BY_PAGE[pagina]?.();
}

// --- Global API ---
window.App = {
  goto, setFilter, setSection, closeModal, minimizarModal, restaurarModal, refresh, filtrarSearchPicker,
  // Auth
  switchLoginTab, loginEmail, cadastrarEmail, resetPassword, alterarSenha, criarSenhaGoogle,
  tentarDesbloqueio, logoutFromLock,
  biometriaDisponivel, temBiometriaAtiva, ativarBiometria, desativarBiometria,
  // Clientes
  renderClientes, openClienteForm, saveCliente, openCliente360, marcarContatado, excluirCliente, toggleHistoricoVenda,
  gerarSugestaoAbordagemCliente, copiarSugestaoAbordagem, enviarSugestaoAbordagem, removerInteresseCliente,
  // Agenda
  openAgendamentoForm, saveAgendamento, editarAgendamento, updateAgendamento,
  concluirAgendamento, confirmarConclusao, cancelarAgendamento,
  reagendarAgendamento, confirmarReagendamento, removerAgendamento, importarDoGoogleAgenda,
  abrirMapaDoCampo, abrirMapaAgendamento, preencherLocalDoCliente, toggleAgendamentoTitulo,
  // Operadoras de cartão
  abrirOperadoraForm, salvarOperadora, excluirOperadora, semearInfinitePay, atualizarOperadoraComIA,
  // Carrinho
  openNovoCarrinho, confirmarNovoCarrinho, openCarrinho, openCarrinhoForCliente,
  openCarrinhoDoCliente, preencherPrecoItem, adicionarItemCarrinho, removerItemCarrinho,
  toggleEntregaItem, toggleCarrinhoOpt, salvarCarrinhoOpt, finalizarCarrinho, cancelarCarrinho,
  marcarItemEntregue, enviarResumoWhatsApp, enviarLinkPagamento, marcarRetornoFeito, reabrirCarrinho, excluirCarrinho,
  registrarPagamento, confirmarPagamento, atualizarCalcPagamento, aplicarDescontoPedido,
  aplicarCreditoPagamento, abrirCheckoutInfinitePay, copiarLinkInfinitePay, fecharModalCheckoutInfinitePay, cobrarPorAproximacao,
  // Vendas
  renderVendas, marcarPedidoEntregue, toggleVendaDetalhe, migrarNumeracaoPedidos,
  // Estoque
  renderEstoque, openEntradaManual, saveEntradaManual, openSaidaManual, saveSaidaManual,
  readPedidoPdf, confirmPedidoEstoque, removerLinhaPedido,
  ativarProntaEntregaTodos,
  // Pré-encomenda
  adicionarPreEncomenda, atualizarItemPreEncomenda, removerPreEncomenda,
  marcarComoPedido, voltarParaComprar, confirmarChegada, abrirModalBrinde, confirmarBrinde,
  openKitForm, adicionarProdutoKit, removerProdutoKit, confirmarKit, removerKitCompleto,
  registrarFreteFarmasi, removerFreteFarmasi, registrarDespesa, removerDespesa,
  // Trocas
  abrirNovaTroca, confirmarNovaTroca, openTroca, adicionarItemTroca, removerItemTroca,
  finalizarTroca, marcarItemTrocaProcessado, cancelarTroca, preencherValorTrocaSaida,
  preencherNomeParceira, editarParceiraTroca, salvarParceiraTroca, excluirTroca,
  toggleTrocaOpt, salvarTroca, toggleTrocaDetalhe, reabrirTroca,
  // Produtos
  renderProdutos, openProdutoForm, saveProduto, excluirProduto, excluirTodosProdutos, sincronizarBaseColetiva,
  editarItemBaseColetiva, removerItemBaseColetiva, confirmarBaseColetiva, gerarBeneficiosProduto, exportarProdutosJson, corrigirLinhaImportadoPedido, corrigirLinhasDuplicadas, filtrarLinhaBaseColetiva,
  atualizarLinhasProdutoForm, adicionarLinhaCustom, removerLinhaCustom, selecionarLinhaParaAtribuir, filtrarLinhaAssoc, toggleProdutoNaLinha, sincronizarLinhasColetivas,
  // Catálogo
  selectAllCatalogLines, clearCatalogLines, previewCatalogo, printCatalogo, excluirTodoCatalogo,
  toggleOcultarAtual, toggleBeneficiosPdf,
  // Relatórios
  renderRelatorios,
  // Perfil
  renderPerfil, savePerfil, zerarMeusDados, toggleBaseColetiva, carregarFotoPerfil, removerFotoPerfil,
  conectarGoogleAgendaUI, desconectarGoogleAgendaUI, salvarGeminiKey,
  apagarEstoque, apagarClientes, apagarVendas, excluirMinhaConta, copiarLinkIndicacao, salvarConfigRelatorios,
  relSecaoDragStart, relSecaoDrop, salvarSecaoRelatorioAtiva, exportarBackupCompleto, restaurarEstoqueDoBackup, restaurarBackupCompleto,
  adicionarDataComemorativa, removerDataComemorativa, editarDataComemorativa, cancelarEdicaoDataComemorativa,
  // Admin
  carregarConsultoras, editarConsultora, salvarConsultora, salvarConfigPlanos, salvarConfigIpca, marcarIpcaAplicado, togglePromocaoIndicacao,
  readCatalogoMestreFiles, importarCatalogoMestreTexto, confirmarImportCatalogoMestre, editarItemImportMestre, limparCatalogoMestre,
  filtrarCatalogoMestre, editarProdutoMestre, salvarProdutoMestre, excluirProdutoMestre,
  adicionarLinhaColetiva, removerLinhaColetiva, aprovarSugestaoBeneficio, rejeitarSugestaoBeneficio,
  // WhatsApp
  sendWhatsApp,
  // PDF Pedido
  gerarPdfCliente, gerarPdfInterno,
  // Eventos
  renderEventos, openNovoEvento, confirmarNovoEvento, copiarLinkEvento, excluirEvento,
  toggleListasEvento, atualizarListasEvento, vincularCliente, confirmarVinculo, filtrarClientesVinculo,
  confirmarVinculoSelecionado, abrirNovoClienteDeLista, transformarEmCarrinho, marcarInteresseDaLista,
  enviarWhatsappEvento, confirmarEnvioWhatsapp, abrirEditarEvento, confirmarEditarEvento, gerarQrCodeEvento,
  marcarLeadsVistos, renderLeadsBanner, renderDatasComemorativas, aoMudarTodoCatalogo, aplicarDescontoTodos, marcarLeadTratado, atualizarPrecosEvento,
  // Sobre
  renderSobre
};

// Sinaliza visualmente qualquer ação assíncrona disparada por um clique (evita a sensação de "travou"
// nas telas que fazem chamadas ao Firestore sem feedback próprio). Envolve toda função async do App
// automaticamente: mostra a barra no topo enquanto a Promise está pendente.
let busyCount = 0;
function setBusy(ativo) {
  busyCount = Math.max(0, busyCount + (ativo ? 1 : -1));
  $('busyBar').classList.toggle('active', busyCount > 0);
}
Object.keys(window.App).forEach(k => {
  const fn = window.App[k];
  if (typeof fn !== 'function') return;
  window.App[k] = function (...args) {
    const result = fn.apply(this, args);
    if (result && typeof result.then === 'function') {
      setBusy(true);
      return result.finally(() => setBusy(false));
    }
    return result;
  };
});
