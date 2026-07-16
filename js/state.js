import { firebaseConfig, ADMIN_EMAILS } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential, linkWithCredential,
  reauthenticateWithPopup, deleteUser } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, runTransaction, writeBatch, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { $, daysSince, inPeriod, today } from './utils.js';

const fb = initializeApp(firebaseConfig);
export const auth = getAuth(fb);
export const db = getFirestore(fb);

export { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential, linkWithCredential,
  reauthenticateWithPopup, deleteUser };
export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, runTransaction, writeBatch, onSnapshot };

export const ADMINS = ADMIN_EMAILS;

export const state = {
  user: null,
  profile: null,
  filters: { prod: 'todos', estoque: 'todos', rel: '30', vendas: 'todos', prodSort: 'nome_asc', estoqueSort: 'nome_asc', vendasSort: '', prodLinha: '', relProdSort: '', estoqueLinha: '' },
  data: { clientes: [], produtos: [], vendas: [], carrinhos: [], agendamentos: [], movimentacoesEstoque: [], catalogos: [], eventos: [], trocas: [], preEncomenda: [], despesas: [], operadoras: [] },
  config: { limiteTeste: 5, limiteGratuito: 10, precoMensal: 0, precoSemestral: 0, precoAnual: 0 },
  // Aba ativa (por página) nas telas divididas em seções — ver SECTIONS abaixo.
  section: { admin: 'consultoras', perfil: 'conta', produtos: 'produtos', estoque: 'estoque', catalogo: 'montar', sobre: 'dados' }
};

// Páginas longas divididas em abas: página -> [[chave, rótulo], ...]. A primeira é a aba padrão.
export const SECTIONS = {
  admin: [['consultoras', 'Consultoras'], ['financeiro', 'Financeiro'], ['catalogoMestre', 'Catálogo mestre'], ['planos', 'Planos']],
  perfil: [['conta', 'Conta'], ['pagamento', 'Pagamento'], ['plano', 'Meu plano'], ['baseColetiva', 'Base coletiva'], ['relatorios', 'Relatórios'], ['seguranca', 'Segurança']],
  produtos: [['produtos', 'Produtos'], ['linhas', 'Linhas']],
  estoque: [['estoque', 'Estoque'], ['importar', 'Importar pedido'], ['trocas', 'Trocas'], ['preEncomenda', 'Pré-encomenda']],
  catalogo: [['montar', 'Montar catálogo']],
  sobre: [['dados', 'Dados do sistema'], ['novidades', 'Novidades'], ['manual', 'Manual']]
};

// [título, subtítulo, rótulo do grupo exibido acima do título no topo da página]
export const titles = {
  dashboard: ['Painel Inicial', 'Visão geral da consultoria', 'Seu dia hoje'],
  catalogo: ['Catálogo', 'Filtros, preços e QR Code', 'Catálogo Farmasi'],
  clientes: ['Clientes', 'Relacionamento e contatos', 'Operação'],
  agenda: ['Agenda', 'Atendimentos e follow-ups', 'Operação'],
  vendas: ['Vendas / Carrinhos', 'Carrinhos pendentes e pedidos finalizados', 'Operação'],
  estoque: ['Estoque', 'Controle inteligente de produtos disponíveis', 'Operação'],
  produtos: ['Produtos', 'Base única e preços', 'Operação'],
  importar: ['Importar JSON', 'Produtos Farmasi', 'Operação'],
  relatorios: ['Relatórios', 'Vendas, estoque, produtos, clientes e agenda', 'Gestão'],
  perfil: ['Minha Conta', 'Personalização', 'Gestão'],
  admin: ['Admin', 'Gestão de planos', 'Gestão'],
  eventos: ['Catálogo de Eventos', 'Links públicos e listas de desejo', 'Catálogo Farmasi'],
  sobre: ['Sobre', 'Dados do sistema, novidades e manual', 'Gestão']
};

export function path(...p) { return ['users', state.user.uid, ...p]; }
export function col(n) { return collection(db, ...path(n)); }
export function ref(n, id) { return doc(db, ...path(n, id)); }

export function toast(m) {
  const t = $('toast'); t.textContent = m; t.className = 'show';
  setTimeout(() => t.className = '', 2600);
}

// Toda janela ganha um botão de minimizar: esconde o modal sem perder o conteúdo, deixando uma
// barrinha flutuante pra restaurar — dá pra navegar pelo resto do sistema no meio de um carrinho/
// troca/formulário e voltar exatamente de onde parou. Abrir outra janela substitui a minimizada
// (uma janela por vez — os dados de carrinho/troca já são salvos a cada mudança, nada se perde).
export function showModal(h) {
  $('modalCard').innerHTML = `<button class="modal-min" title="Minimizar — continue navegando e volte depois" onclick="App.minimizarModal()">─</button>` + h;
  $('modal').classList.remove('hidden');
  $('modalMinBar')?.classList.add('hidden');
}

export function closeModal() {
  $('modal').classList.add('hidden');
  $('modalMinBar')?.classList.add('hidden');
}

export function minimizarModal() {
  $('modal').classList.add('hidden');
  $('modalMinBar')?.classList.remove('hidden');
}

export function restaurarModal() {
  $('modal').classList.remove('hidden');
  $('modalMinBar')?.classList.add('hidden');
}

export function prodById(id) { return state.data.produtos.find(p => p.id === id); }
export function cliById(id) { return state.data.clientes.find(c => c.id === id); }
export function nomeAtualDoCliente(clienteId, fallback) { return cliById(clienteId)?.nome || fallback || 'Cliente'; }
// Como a consultora deve chamar o cliente nas mensagens de WhatsApp: o apelido cadastrado
// ("Fabiula de Oliveira – Fabi") soa mais próximo que o nome completo formal.
export function nomeChamado(clienteId, fallback) {
  const c = cliById(clienteId);
  return (c?.apelido || c?.nome || fallback || 'Cliente').trim();
}
export function carrinhoById(id) { return state.data.carrinhos.find(c => c.id === id); }

// --- Numeração de pedido: número sequencial global + sufixo -01/-02 exclusivo do cliente ---
// (ex: "1042-01" na 1ª compra dela, "1043-02" seria de outro cliente, "1050-02" seria a 2ª
// compra da mesma cliente do 1042). Só a consultora vê o sufixo — é pra ela acompanhar quantas
// vezes aquele cliente já comprou, sem precisar contar manualmente.
export function proximoNumeroPedido() {
  return state.data.carrinhos.reduce((max, c) => Math.max(max, Number(c.numeroPedido || 0)), 0) + 1;
}
export function proximaSequenciaCliente(clienteId) {
  return state.data.carrinhos.filter(c => c.clienteId === clienteId && c.numeroPedido).length + 1;
}
export function numeroPedidoLabel(carr) {
  if (!carr?.numeroPedido) return '-';
  return `${carr.numeroPedido}-${String(carr.sequenciaCliente || 1).padStart(2, '0')}`;
}

// Configurável por consultora em Minha Conta (padrão 30 dias caso ela nunca tenha ajustado).
export function diasContatoFrio() {
  return Number(state.profile?.diasContatoFrio || 30);
}

export function lastBuy(c) {
  return state.data.vendas.filter(v => v.clienteId === c.id)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0]?.data || c.ultimaCompra || '';
}

export function lastSaleDate(p) {
  return state.data.vendas.filter(v => v.produtoId === p.id || v.produtoNome === p.nome)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0]?.data || '';
}

export function productMetrics(p) {
  // Se ainda não tem preço de venda definido, estima o lucro potencial pelo preço original de
  // tabela em vez de mostrar prejuízo (comprou mais barato que o preço original = tem lucro a ganhar).
  const venda = Number(p.precoVenda || p.precoAtual || p.precoOriginal || 0);
  const custo = Number(p.custoMedio || 0);
  const est = Number(p.estoqueAtual || 0);
  const monitorar = p.monitorarEstoqueBaixo !== false;
  const pronta = p.produtoProntaEntrega !== false;
  return {
    venda, custo, est,
    investido: est * custo,
    lucroUnit: venda - custo,
    lucroPot: est * (venda - custo),
    // Sem preço de venda cadastrado mas com custo > 0, a margem "0%" passaria a falsa impressão
    // de que está zerado — -100% deixa claro que hoje não tem preço pra cobrir esse custo.
    margem: venda ? ((venda - custo) / venda) * 100 : (custo ? -100 : 0),
    promo: Number(p.precoOriginal || 0) > Number(p.precoAtual || p.precoVenda || 0),
    baixo: monitorar && pronta && est > 0 && est <= Number(p.estoqueMinimo || 1),
    semCusto: est > 0 && !custo
  };
}

export function salesAgg(days = 30) {
  const vendas = state.data.vendas.filter(v => inPeriod(v.data, days));
  const prod = {}, cli = {}, pay = {};
  let fat = 0, luc = 0, custo = 0, itens = 0, lucReal = 0, custoCartaoTotal = 0;
  vendas.forEach(v => {
    const q = Number(v.quantidade || 1), r = Number(v.receita || v.totalPedido || 0);
    const l = Number(v.lucroTotal || 0), c = Number(v.custoTotal || 0);
    // Vendas antigas (antes do cálculo de taxa de cartão) não têm lucroReal gravado — nesse caso
    // assume-se lucro real = lucro bruto (sem custo de cartão conhecido) em vez de zerar o histórico.
    const lr = v.lucroReal != null ? Number(v.lucroReal) : l;
    fat += r; luc += l; custo += c; itens += q; lucReal += lr; custoCartaoTotal += Number(v.custoCartao || 0);
    // Um doc de "venda" representa o PEDIDO inteiro (pode ter vários produtos diferentes), não um
    // produto só — por isso o ranking por produto usa os itens do carrinho original, não o próprio
    // doc da venda (que nunca teve produtoId/produtoNome; sem isso todo pedido virava um "Pedido"
    // genérico no ranking, escondendo qual produto de fato vendeu/lucrou mais).
    const carr = state.data.carrinhos.find(cc => cc.id === v.carrinhoId);
    (carr?.itens || []).forEach(it => {
      const pk = it.produtoId || it.produtoNome;
      if (!pk) return;
      prod[pk] = prod[pk] || { nome: it.produtoNome || 'Produto removido', q: 0, rec: 0, luc: 0 };
      prod[pk].q += Number(it.quantidade || 0);
      prod[pk].rec += Number(it.totalItem || 0);
      prod[pk].luc += Number(it.lucroTotal || 0);
    });
    const ck = v.clienteId || v.clienteNome;
    cli[ck] = cli[ck] || { nome: v.clienteNome, q: 0, rec: 0, luc: 0 };
    cli[ck].q++; cli[ck].rec += r; cli[ck].luc += l;
    pay[v.pagamento || 'Não informado'] = (pay[v.pagamento || 'Não informado'] || 0) + r;
  });
  const top5 = (o, k) => Object.values(o).sort((a, b) => b[k] - a[k]).slice(0, 5);
  const top = (o, k) => top5(o, k)[0];
  return {
    vendas, fat, luc, custo, itens, lucReal, custoCartaoTotal,
    ticket: vendas.length ? fat / vendas.length : 0,
    margem: fat ? (luc / fat) * 100 : 0,
    margemReal: fat ? (lucReal / fat) * 100 : 0,
    prod, cli, pay,
    topVend: top(prod, 'q'), topLucProd: top(prod, 'luc'),
    topFatProd: top(prod, 'rec'),
    topCliFreq: top(cli, 'q'), topCliLuc: top(cli, 'luc'), topCliRec: top(cli, 'rec'),
    top5Vend: top5(prod, 'q'), top5LucProd: top5(prod, 'luc'), top5FatProd: top5(prod, 'rec'),
    top5CliFreq: top5(cli, 'q'), top5CliLuc: top5(cli, 'luc'), top5CliRec: top5(cli, 'rec')
  };
}

// Totais do período imediatamente anterior (mesma quantidade de dias), só para comparar
// crescimento/queda — sem "all" pois não faz sentido comparar "tudo" com "o período antes de tudo".
export function salesAggAnterior(days) {
  if (days === 'all') return null;
  const n = Number(days);
  const hoje = new Date(today());
  const fim = new Date(hoje); fim.setDate(fim.getDate() - n);
  const inicio = new Date(fim); inicio.setDate(inicio.getDate() - n + 1);
  const fimISO = fim.toISOString().slice(0, 10), inicioISO = inicio.toISOString().slice(0, 10);
  const vendas = state.data.vendas.filter(v => v.data >= inicioISO && v.data <= fimISO);
  const fat = vendas.reduce((s, v) => s + Number(v.receita || v.totalPedido || 0), 0);
  const lucReal = vendas.reduce((s, v) => s + Number(v.lucroReal != null ? v.lucroReal : v.lucroTotal || 0), 0);
  return { fat, lucReal, vendas: vendas.length };
}

// % de variação entre dois valores — usado para mostrar "+18%" ou "-5%" ao lado dos indicadores.
export function variacao(atual, anterior) {
  if (!anterior) return atual > 0 ? null : 0;
  return ((atual - anterior) / anterior) * 100;
}

// Faturamento por dia dentro do período, para o gráfico de tendência. Limita a 30 pontos mesmo
// em períodos maiores/"tudo" para o gráfico não ficar ilegível.
export function salesTrend(days) {
  const n = days === 'all' ? 30 : Math.min(Number(days), 90);
  const hoje = new Date(today());
  const pontos = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const vendasDia = state.data.vendas.filter(v => v.data === iso);
    const fat = vendasDia.reduce((s, v) => s + Number(v.receita || v.totalPedido || 0), 0);
    pontos.push({ data: iso, fat });
  }
  return pontos;
}

export function stockAgg() {
  const ps = state.data.produtos.map(p => ({ p, ...productMetrics(p) }));
  const em = ps.filter(x => x.est > 0);
  const baixo = em.filter(x => x.baixo);
  const sem = em.filter(x => x.semCusto);
  const parados = em.filter(x => daysSince(lastSaleDate(x.p)) >= 90);
  const invest = em.reduce((s, x) => s + x.investido, 0);
  const pot = em.reduce((s, x) => s + x.lucroPot, 0);
  const un = em.reduce((s, x) => s + x.est, 0);
  return { ps, em, baixo, sem, parados, invest, pot, un, saude: sem.length || parados.length || baixo.length ? 'Atenção' : 'Boa' };
}

export function agendaAgg(days) {
  const a = state.data.agendamentos.filter(x => inPeriod(x.data, days));
  const realizados = a.filter(x => x.status === 'realizado');
  const comVenda = realizados.filter(x => x.gerouVenda);
  return {
    total: a.length,
    realizados: realizados.length,
    cancelados: a.filter(x => x.status === 'cancelado').length,
    pendentes: a.filter(x => (x.status || 'agendado') === 'agendado').length,
    reagendados: a.filter(x => x.status === 'reagendado').length,
    taxaComparecimento: a.length ? (realizados.length / a.length) * 100 : 0,
    conversaoVenda: realizados.length ? (comVenda.length / realizados.length) * 100 : 0
  };
}

export function openCarrinhosForClient(clienteId) {
  return state.data.carrinhos.filter(c => c.clienteId === clienteId && c.status === 'aberto');
}

// Quantas unidades de um produto já estão comprometidas em carrinhos/trocas abertos como "pronta
// entrega" ainda não baixada do estoque de verdade — sem contar isso, dois carrinhos/trocas abertos
// ao mesmo tempo podiam "vender"/"trocar" a mesma última unidade em estoque duas vezes. Itens de
// "entrega futura" ficam de fora de propósito: eles ainda não têm estoque reservado, é exatamente
// o que a conversão automática de estoque (estoque.js) resolve quando chega estoque novo.
// `excluirCarrinhoId`/`excluirTrocaId` deixam de fora o próprio carrinho/troca que está sendo
// editado no momento (os itens que ele mesmo já tem não devem contar contra ele).
export function reservadoEmAberto(produtoId, excluirCarrinhoId = '', excluirTrocaId = '') {
  const emCarrinhos = state.data.carrinhos
    .filter(c => c.status === 'aberto' && c.id !== excluirCarrinhoId)
    .reduce((s, c) => s + (c.itens || [])
      .filter(i => i.produtoId === produtoId && i.tipoEntrega === 'pronta_entrega' && !i.baixouEstoque)
      .reduce((s2, i) => s2 + Number(i.quantidade || 0), 0), 0);
  const emTrocas = state.data.trocas
    .filter(t => (t.status === 'aberta' || t.status === 'parcial') && t.id !== excluirTrocaId)
    .reduce((s, t) => s + (t.itensSaida || [])
      .filter(i => i.produtoId === produtoId && i.tipoEntrega === 'pronta_entrega' && !i.processado)
      .reduce((s2, i) => s2 + Number(i.quantidade || 0), 0), 0);
  return emCarrinhos + emTrocas;
}

// Estoque de verdade menos o que já está reservado em outros carrinhos/trocas abertos.
export function estoqueDisponivel(produtoId, excluirCarrinhoId = '', excluirTrocaId = '') {
  const p = prodById(produtoId);
  const atual = Number(p?.estoqueAtual || 0);
  return Math.max(0, atual - reservadoEmAberto(produtoId, excluirCarrinhoId, excluirTrocaId));
}

// Situação do plano da consultora logada: uso do limite de clientes no teste/gratuito, vencimento etc.
export function planoInfo() {
  const p = state.profile || {};
  const plano = p.plano || 'teste';
  const isTeste = plano === 'teste';
  const isGratuito = plano === 'gratuito';
  const limiteTeste = Number(state.config.limiteTeste ?? 5);
  const limiteGratuito = Number(state.config.limiteGratuito ?? 10);
  const limite = isGratuito ? limiteGratuito : limiteTeste;
  // Algumas contas no gratuito recebem a versão completa (ex: parcerias) — a admin libera
  // "limiteIlimitado" por consultora, sem precisar mudar o limite global do plano.
  const ilimitado = !!p.limiteIlimitado;
  const clientesUsados = state.data.clientes.length;
  const atingiuLimite = !ilimitado && (isTeste || isGratuito) && clientesUsados >= limite;
  const hoje = new Date().toISOString().slice(0, 10);
  // Teste e gratuito nunca "vencem" por data — só os planos pagos, e só o campo 'vencido' explícito os marca de vez.
  const vencido = plano === 'vencido' || (p.premiumAte && p.premiumAte < hoje && !isTeste && !isGratuito);
  // Dias até o vencimento (só faz sentido pra plano pago com data e ainda não vencido) — usado
  // pro alerta de "faltam X dias" no Painel Inicial.
  const diasParaVencer = (!isTeste && !isGratuito && !vencido && p.premiumAte)
    ? Math.ceil((new Date(p.premiumAte) - new Date(hoje)) / 86400000) : null;
  return { plano, isTeste, isGratuito, ilimitado, limiteTeste, limiteGratuito, limite, clientesUsados, atingiuLimite, vencido, premiumAte: p.premiumAte || '', diasParaVencer };
}
