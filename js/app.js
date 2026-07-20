import { state, auth, db, ADMINS, titles, col, toast, showModal, closeModal, minimizarModal, restaurarModal,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, getDoc, getDocs, setDoc, doc, serverTimestamp, planoInfo, onSnapshot
} from './state.js';
import { $, esc, filtrarSearchPicker, escolherSearchPicker, fecharSearchPicker, formatDateBR, porGenero, toggleColapsavel, aplicarTemaPersonalizado } from './utils.js';

import { renderDashboard, renderLeadsBanner, renderDatasComemorativas } from './dashboard.js';
import { abrirOperadoraForm, salvarOperadora, excluirOperadora, semearInfinitePay, atualizarOperadoraComIA, definirOperadoraPadrao } from './operadoras.js';
import { renderClientes, openClienteForm, saveCliente, openCliente360, marcarContatado, excluirCliente, toggleHistoricoVenda,
  gerarSugestaoAbordagemCliente, copiarSugestaoAbordagem, enviarSugestaoAbordagem, removerInteresseCliente } from './clientes.js';
import { renderAgenda, openAgendamentoForm, saveAgendamento, editarAgendamento, updateAgendamento,
  concluirAgendamento, confirmarConclusao, cancelarAgendamento, reagendarAgendamento,
  confirmarReagendamento, removerAgendamento, importarDoGoogleAgenda,
  abrirMapaDoCampo, abrirMapaAgendamento, preencherLocalDoCliente, toggleAgendamentoTitulo } from './agenda.js';
import { renderVendas, marcarPedidoEntregue, toggleVendaDetalhe, migrarNumeracaoPedidos } from './vendas.js';
import { renderEstoque, openEntradaManual, saveEntradaManual, openSaidaManual, saveSaidaManual,
  readPedidoPdf, confirmPedidoEstoque, removerLinhaPedido,
  ativarProntaEntregaTodos, atualizarCampoDestinoSaida, abrirCarrinhosComProdutoReservado } from './estoque.js';
import { abrirNovaTroca, confirmarNovaTroca, openTroca, adicionarItemTroca, removerItemTroca,
  finalizarTroca, marcarItemTrocaProcessado, cancelarTroca, preencherValorTrocaSaida, preencherValorTrocaEntrada,
  preencherNomeParceira, editarParceiraTroca, salvarParceiraTroca, excluirTroca,
  toggleTrocaOpt, salvarTroca, toggleTrocaDetalhe, reabrirTroca, togglePendenteDevolucao } from './trocas.js';
import { renderProdutos, openProdutoForm, saveProduto, excluirProduto, excluirTodosProdutos, sincronizarBaseColetiva,
  editarItemBaseColetiva, removerItemBaseColetiva, confirmarBaseColetiva, gerarBeneficiosProduto,
  autoSincronizarBaseColetiva, exportarProdutosJson, corrigirLinhaImportadoPedido, corrigirLinhasDuplicadas, migrarPrecoVendaAntigo, filtrarLinhaBaseColetiva,
  atualizarLinhasProdutoForm, adicionarLinhaCustom, removerLinhaCustom, editarLinhaCustom, selecionarLinhaParaAtribuir,
  filtrarLinhaAssoc, toggleProdutoNaLinha, sincronizarLinhasColetivas, abrirHistoricoPrecos, marcarProdutosEditadosComoConferidos,
  abrirConferenciaPorHorario, atualizarConferenciaPorHorario, confirmarConferenciaPorHorario } from './produtos.js';
import { adicionarPreEncomenda, atualizarItemPreEncomenda, removerPreEncomenda,
  marcarComoPedido, marcarKitComoPedido, voltarParaComprar, confirmarChegada, atualizarTotalPreEncomenda, iniciarNovoPedidoCompra, renomearPedidoCompra, togglePedidoCompraExpandido, definirPedidoCompraAtivo, encerrarPedidoCompra, reabrirPedidoCompra, excluirPedidoCompra, abrirModalBrinde, confirmarBrinde,
  openKitForm, adicionarProdutoKit, removerProdutoKit, confirmarKit, removerKitCompleto,
  registrarFreteFarmasi, removerFreteFarmasi, registrarDespesa, removerDespesa,
  marcarFornecedorPago, marcarFornecedorPendente, removerFornecedor,
  adicionarCompraFornecedor, iniciarCompraFornecedor, abrirCompraFornecedor,
  adicionarItemCompraFornecedor, removerItemCompraFornecedor, lancarEntradaItemFornecedor, abrirCarrinhosComEntregaFutura } from './preencomenda.js';
import { renderCatalogo, selectAllCatalogLines, clearCatalogLines, previewCatalogo, printCatalogo,
  excluirTodoCatalogo, toggleOcultarAtual, toggleBeneficiosPdf } from './catalogo.js';
import { renderRelatorios, exportarProdutosVendidosCSV, exportarClientesCSV, gerarPdfRelatorio } from './relatorios.js';
import { renderPerfil, savePerfil, zerarMeusDados, toggleBaseColetiva, carregarFotoPerfil, removerFotoPerfil,
  carregarLogoNegocio, removerLogoNegocio, atualizarPreviewPix,
  conectarGoogleAgendaUI, desconectarGoogleAgendaUI, salvarGeminiKey,
  apagarEstoque, apagarClientes, apagarVendas, excluirMinhaConta, copiarLinkIndicacao, salvarConfigRelatorios,
  relSecaoDragStart, relSecaoDrop, salvarSecaoRelatorioAtiva, exportarBackupCompleto, restaurarEstoqueDoBackup, restaurarBackupCompleto,
  adicionarDataComemorativa, removerDataComemorativa, editarDataComemorativa, cancelarEdicaoDataComemorativa,
  previewTema, sincronizarCorHex, restaurarTemaPadrao } from './perfil.js';
import { renderAdmin, carregarConsultoras, editarConsultora, salvarConsultora, salvarConfigPlanos, salvarConfigIpca, marcarIpcaAplicado, togglePromocaoIndicacao,
  readCatalogoMestreFiles, importarCatalogoMestreTexto, confirmarImportCatalogoMestre, editarItemImportMestre, limparCatalogoMestre,
  filtrarCatalogoMestre, editarProdutoMestre, salvarProdutoMestre, excluirProdutoMestre,
  adicionarLinhaColetiva, removerLinhaColetiva, aprovarSugestaoBeneficio, rejeitarSugestaoBeneficio } from './admin.js';
import { openNovoCarrinho, confirmarNovoCarrinho, openCarrinho, openCarrinhoForCliente,
  openCarrinhoDoCliente, preencherPrecoItem, adicionarItemCarrinho, removerItemCarrinho,
  toggleEntregaItem, toggleCarrinhoOpt, salvarCarrinhoOpt, finalizarCarrinho, cancelarCarrinho,
  marcarItemEntregue, enviarResumoWhatsApp, enviarLinkPagamento, marcarRetornoFeito, reabrirCarrinho, excluirCarrinho,
  registrarPagamento, confirmarPagamento, atualizarCalcPagamento, aplicarDescontoPedido,
  aplicarCreditoPagamento, abrirCheckoutInfinitePay, copiarLinkInfinitePay, fecharModalCheckoutInfinitePay, copiarCodigoPix, ordenarItensCarrinhoUI } from './carrinho.js';
import { sendWhatsApp, enviarWhatsAppAuto, toggleWaAutomatico } from './whatsapp.js';
import { gerarPdfCliente, gerarPdfInterno } from './pdf-pedido.js';
import { renderResultadosBusca, fecharResultadosBusca } from './buscaGlobal.js';
import { switchLoginTab, loginEmail, cadastrarEmail, resetPassword, alterarSenha, criarSenhaGoogle, precisaCriarSenhaGoogle } from './auth.js';
import { biometriaDisponivel, temBiometriaAtiva, ativarBiometria, desativarBiometria, desbloquearBiometria } from './biometria.js';
import { renderEventos, openNovoEvento, confirmarNovoEvento, copiarLinkEvento, excluirEvento,
  toggleListasEvento, atualizarListasEvento, vincularCliente, confirmarVinculo, filtrarClientesVinculo,
  confirmarVinculoSelecionado, abrirNovoClienteDeLista, transformarEmCarrinho, marcarInteresseDaLista,
  enviarWhatsappEvento, confirmarEnvioWhatsapp, abrirEditarEvento, confirmarEditarEvento, gerarQrCodeEvento,
  marcarLeadsVistos, aoMudarTodoCatalogo, aplicarDescontoTodos, marcarLeadTratado, atualizarPrecosEvento } from './eventos.js';
import { renderSobre, abrirManualWeb } from './sobre.js';

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

    // Se foi compartilhado link com ?showManual=true, abre o manual automaticamente
    if (localStorage.getItem('abrirManualNoCarregamento')) {
      localStorage.removeItem('abrirManualNoCarregamento');
      // Pequeno delay pra garantir que a página está totalmente pronta
      setTimeout(() => abrirManualWeb(), 500);
    }
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
document.querySelectorAll('#nav button, #bottomNav button').forEach(b => b.onclick = () => goto(b.dataset.page));

// Menu lateral recolhível — útil quando uma janela minimizada (modalMinBar) ou outra parte da tela
// fica espremida pelo menu. Fica só com os ícones, sem nomes das telas. Estado persiste entre
// sessões (localStorage) porque, se a consultora prefere o menu recolhido, faz sentido continuar
// assim ao voltar depois, não resetar a cada carregamento.
function aplicarSidebarColapsada(colapsada) {
  document.querySelector('.app')?.classList.toggle('side-collapsed', colapsada);
  const btn = $('sideToggle');
  if (btn) { btn.textContent = colapsada ? '›' : '‹'; btn.title = colapsada ? 'Expandir menu' : 'Recolher menu'; }
}
function toggleSidebar() {
  const colapsada = !document.querySelector('.app')?.classList.contains('side-collapsed');
  localStorage.setItem('sideColapsada', colapsada ? '1' : '0');
  aplicarSidebarColapsada(colapsada);
}
aplicarSidebarColapsada(localStorage.getItem('sideColapsada') === '1');

// Busca global: fecha o dropdown de resultados ao clicar fora do campo/lista.
document.addEventListener('click', e => {
  if (!e.target.closest('.busca-global')) fecharResultadosBusca();
});

function goto(p) {
  paginaAtiva = p;
  document.querySelectorAll('#nav button, #bottomNav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  $(p).classList.add('active');
  RENDER_PAGE[p]?.(); // lazy render: desenha a tela de destino agora, com os dados atuais
  $('eyebrow').textContent = titles[p]?.[2] || '';
  $('title').textContent = titles[p]?.[0] || p;
  $('subtitle').textContent = titles[p]?.[1] || '';
  window.scrollTo({ top: 0 }); // no celular, trocar de página deve voltar ao topo do conteúdo
  // O menu de cima é uma fileira horizontal que rola de lado (mobile) — sem isso, clicar num botão
  // fora da parte visível deixava ele "sumido" fora da tela depois do clique, dando sensação de
  // salto/desalinhamento. Centraliza sozinho o botão ativo dentro da fileira.
  // Rola só o próprio menu (nav.scrollLeft), nunca a página — scrollIntoView() foi trocado por isso
  // porque seu eixo "block" podia arrastar a página inteira verticalmente como efeito colateral
  // (mais perceptível em botões distantes no menu, tipo Admin, que precisam de mais rolagem
  // horizontal): sobrava um espaço em branco no topo da tela só nessas páginas.
  const navAtivo = document.querySelector('#nav button.active');
  if (navAtivo) {
    const navEl = navAtivo.parentElement;
    const alvo = navAtivo.offsetLeft - (navEl.clientWidth - navAtivo.clientWidth) / 2;
    navEl.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' });
  }
}

// Captura o "?ref=uid" da URL de indicação assim que a página carrega (antes do login terminar)
// e guarda em localStorage — sobrevive ao redirect/popup do Google, que troca a URL. Só é
// consumido uma vez, na criação do perfil (ensureProfile), e depois é sempre limpo.
(function capturarIndicacao() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) localStorage.setItem('indicadoPorUid', ref);
})();

// Detecta se foi compartilhado um link para abrir o manual automaticamente (?showManual=true)
// Depois que carregar (onAuthStateChanged), abre o manual em uma aba nova
(function detectarAberturaManual() {
  if (new URLSearchParams(location.search).get('showManual') === 'true') {
    localStorage.setItem('abrirManualNoCarregamento', 'true');
  }
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
  document.title = state.profile.nomeNegocio || 'Descomplicou';
  aplicarTemaPersonalizado(state.profile);
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
      // serverTimestamps:'estimate' evita que campos como atualizadoEm fiquem null enquanto o
      // Firestore ainda não confirmou a escrita no servidor (write pendente) — sem isso, telas que
      // dependem desses campos (ex: conferência de estoque por horário) perdiam temporariamente
      // itens recém-salvos até a próxima atualização do snapshot confirmar o valor real.
      state.data[n] = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
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
  // Todas as coleções (+ a config global) são buscadas EM PARALELO, não uma de cada vez — na
  // abertura, o tempo total passa a ser o da coleção mais lenta, não a soma das 13 idas ao servidor
  // em fila. É o maior ganho de agilidade na inicialização, sem mudar nada do que é carregado.
  const nomes = Object.keys(state.data);
  // A config global entra no MESMO lote paralelo das coleções (getDoc protegido pra não derrubar o
  // lote se ela não existir/sem permissão) — assim nada espera na fila de ninguém.
  const cfgPromise = getDoc(doc(db, 'config', 'planos')).catch(() => null);
  const [resultados, cfg] = await Promise.all([
    Promise.all(nomes.map(n => getDocs(col(n)))),
    cfgPromise
  ]);
  nomes.forEach((n, i) => {
    state.data[n] = resultados[i].docs.map(d => ({ id: d.id, ...d.data() }));
  });
  if (cfg && cfg.exists()) state.config = { ...state.config, ...cfg.data() };
}

// NÃO re-lê o banco (loadAll) a cada chamada — os onSnapshot de setupListeners já mantêm
// state.data atualizado em tempo real (inclusive preço/estoque/quantidade), e o Firestore aplica
// a mutação no cache local + dispara o listener correspondente ANTES do próprio setDoc/addDoc
// resolver, então por aqui os dados já estão frescos. loadAll() só roda uma vez, no login inicial
// (onAuthStateChanged) — chamá-lo de novo em toda ação (~100 pontos do app chamam refresh) fazia o
// app reler as 12 coleções inteiras à toa, inflando muito a cota de leituras do Firestore.
function refresh(m = '') {
  renderAll();
  setupUI();
  if (m) toast(m);
}

// Mapa página -> função que desenha aquela tela. Fonte única usada tanto pela navegação (goto) quanto
// pelo setSection e pelas re-renderizações em tempo real.
const RENDER_PAGE = {
  dashboard: renderDashboard, clientes: renderClientes, agenda: renderAgenda, vendas: renderVendas,
  estoque: renderEstoque, produtos: renderProdutos, catalogo: renderCatalogo, relatorios: renderRelatorios,
  perfil: renderPerfil, admin: renderAdmin, eventos: renderEventos, sobre: renderSobre
};

// Qual página está visível agora. Começa no Painel (é a que já vem com class "active" no HTML).
let paginaAtiva = 'dashboard';

// LAZY RENDER: em vez de desenhar as 12 telas de uma vez na abertura (e a cada mudança de dados),
// desenha SÓ a que está visível. As outras são desenhadas sob demanda quando você navega até elas
// (em goto), sempre com os dados atuais. Ganho no primeiro "desenho" da tela, principalmente em
// contas com muitos clientes/produtos. A correção é garantida porque: (a) navegar re-desenha a tela
// de destino com o estado atual; (b) qualquer mudança de dado (onSnapshot/refresh) re-desenha a tela
// ativa; (c) os sub-renders isolados (banner de leads, datas) têm guarda pra DOM ausente.
function renderAll() {
  RENDER_PAGE[paginaAtiva]?.();
}

function setFilter(tipo, val) {
  state.filters[tipo] = val;
  if (tipo === 'prod' || tipo === 'prodSort' || tipo === 'prodLinha') renderProdutos();
  else if (tipo === 'estoque' || tipo === 'estoqueSort' || tipo === 'estoqueLinha' || tipo === 'semLucroMotivo' || tipo === 'preEncomendaSort') renderEstoque();
  else if (tipo === 'vendas' || tipo === 'vendasSort') renderVendas();
  else if (tipo === 'clientesSort') renderClientes();
  else renderRelatorios();
}

function setSection(pagina, secao) {
  state.section[pagina] = secao;
  RENDER_PAGE[pagina]?.();
}

// --- Global API ---
window.App = {
  goto, setFilter, setSection, closeModal, minimizarModal, restaurarModal, refresh, filtrarSearchPicker, escolherSearchPicker, fecharSearchPicker, toggleSidebar,
  renderResultadosBusca, fecharResultadosBusca,
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
  abrirOperadoraForm, salvarOperadora, excluirOperadora, semearInfinitePay, atualizarOperadoraComIA, definirOperadoraPadrao,
  // Carrinho
  openNovoCarrinho, confirmarNovoCarrinho, openCarrinho, openCarrinhoForCliente,
  openCarrinhoDoCliente, preencherPrecoItem, adicionarItemCarrinho, removerItemCarrinho,
  toggleEntregaItem, toggleCarrinhoOpt, salvarCarrinhoOpt, finalizarCarrinho, cancelarCarrinho,
  marcarItemEntregue, enviarResumoWhatsApp, enviarLinkPagamento, marcarRetornoFeito, reabrirCarrinho, excluirCarrinho,
  registrarPagamento, confirmarPagamento, atualizarCalcPagamento, aplicarDescontoPedido,
  aplicarCreditoPagamento, abrirCheckoutInfinitePay, copiarLinkInfinitePay, fecharModalCheckoutInfinitePay, copiarCodigoPix, ordenarItensCarrinhoUI,
  // Vendas
  renderVendas, marcarPedidoEntregue, toggleVendaDetalhe, migrarNumeracaoPedidos,
  // Estoque
  renderEstoque, openEntradaManual, saveEntradaManual, openSaidaManual, saveSaidaManual,
  atualizarCampoDestinoSaida, abrirCarrinhosComProdutoReservado,
  readPedidoPdf, confirmPedidoEstoque, removerLinhaPedido,
  ativarProntaEntregaTodos,
  // Pré-encomenda
  adicionarPreEncomenda, atualizarItemPreEncomenda, removerPreEncomenda,
  marcarComoPedido, marcarKitComoPedido, voltarParaComprar, confirmarChegada, atualizarTotalPreEncomenda, iniciarNovoPedidoCompra, renomearPedidoCompra, togglePedidoCompraExpandido, definirPedidoCompraAtivo, encerrarPedidoCompra, reabrirPedidoCompra, excluirPedidoCompra, abrirModalBrinde, confirmarBrinde,
  openKitForm, adicionarProdutoKit, removerProdutoKit, confirmarKit, removerKitCompleto,
  registrarFreteFarmasi, removerFreteFarmasi, registrarDespesa, removerDespesa, marcarFornecedorPago, marcarFornecedorPendente, removerFornecedor,
  adicionarCompraFornecedor, iniciarCompraFornecedor, abrirCompraFornecedor,
  adicionarItemCompraFornecedor, removerItemCompraFornecedor, lancarEntradaItemFornecedor, abrirCarrinhosComEntregaFutura,
  // Trocas
  abrirNovaTroca, confirmarNovaTroca, openTroca, adicionarItemTroca, removerItemTroca,
  finalizarTroca, marcarItemTrocaProcessado, cancelarTroca, preencherValorTrocaSaida, preencherValorTrocaEntrada,
  preencherNomeParceira, editarParceiraTroca, salvarParceiraTroca, excluirTroca,
  toggleTrocaOpt, salvarTroca, toggleTrocaDetalhe, reabrirTroca, togglePendenteDevolucao,
  // Produtos
  renderProdutos, openProdutoForm, saveProduto, excluirProduto, excluirTodosProdutos, sincronizarBaseColetiva,
  editarItemBaseColetiva, removerItemBaseColetiva, confirmarBaseColetiva, gerarBeneficiosProduto, exportarProdutosJson, corrigirLinhaImportadoPedido, corrigirLinhasDuplicadas, migrarPrecoVendaAntigo, filtrarLinhaBaseColetiva,
  atualizarLinhasProdutoForm, adicionarLinhaCustom, removerLinhaCustom, editarLinhaCustom, selecionarLinhaParaAtribuir, filtrarLinhaAssoc, toggleProdutoNaLinha, sincronizarLinhasColetivas, abrirHistoricoPrecos, marcarProdutosEditadosComoConferidos,
  abrirConferenciaPorHorario, atualizarConferenciaPorHorario, confirmarConferenciaPorHorario,
  // Catálogo
  selectAllCatalogLines, clearCatalogLines, previewCatalogo, printCatalogo, excluirTodoCatalogo,
  toggleOcultarAtual, toggleBeneficiosPdf,
  // Relatórios
  renderRelatorios, exportarProdutosVendidosCSV, exportarClientesCSV, gerarPdfRelatorio, toggleColapsavel,
  // Perfil
  renderPerfil, savePerfil, zerarMeusDados, toggleBaseColetiva, carregarFotoPerfil, removerFotoPerfil,
  carregarLogoNegocio, removerLogoNegocio, atualizarPreviewPix,
  conectarGoogleAgendaUI, desconectarGoogleAgendaUI, salvarGeminiKey,
  apagarEstoque, apagarClientes, apagarVendas, excluirMinhaConta, copiarLinkIndicacao, salvarConfigRelatorios,
  relSecaoDragStart, relSecaoDrop, salvarSecaoRelatorioAtiva, exportarBackupCompleto, restaurarEstoqueDoBackup, restaurarBackupCompleto,
  adicionarDataComemorativa, removerDataComemorativa, editarDataComemorativa, cancelarEdicaoDataComemorativa,
  previewTema, sincronizarCorHex, restaurarTemaPadrao,
  // Admin
  carregarConsultoras, editarConsultora, salvarConsultora, salvarConfigPlanos, salvarConfigIpca, marcarIpcaAplicado, togglePromocaoIndicacao,
  readCatalogoMestreFiles, importarCatalogoMestreTexto, confirmarImportCatalogoMestre, editarItemImportMestre, limparCatalogoMestre,
  filtrarCatalogoMestre, editarProdutoMestre, salvarProdutoMestre, excluirProdutoMestre,
  adicionarLinhaColetiva, removerLinhaColetiva, aprovarSugestaoBeneficio, rejeitarSugestaoBeneficio,
  // WhatsApp
  sendWhatsApp, enviarWhatsAppAuto, toggleWaAutomatico,
  // PDF Pedido
  gerarPdfCliente, gerarPdfInterno,
  // Eventos
  renderEventos, openNovoEvento, confirmarNovoEvento, copiarLinkEvento, excluirEvento,
  toggleListasEvento, atualizarListasEvento, vincularCliente, confirmarVinculo, filtrarClientesVinculo,
  confirmarVinculoSelecionado, abrirNovoClienteDeLista, transformarEmCarrinho, marcarInteresseDaLista,
  enviarWhatsappEvento, confirmarEnvioWhatsapp, abrirEditarEvento, confirmarEditarEvento, gerarQrCodeEvento,
  marcarLeadsVistos, renderLeadsBanner, renderDatasComemorativas, aoMudarTodoCatalogo, aplicarDescontoTodos, marcarLeadTratado, atualizarPrecosEvento,
  // Sobre
  renderSobre, abrirManualWeb
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
