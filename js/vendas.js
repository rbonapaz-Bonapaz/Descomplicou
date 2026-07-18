import { state, ref, setDoc, serverTimestamp, salesAgg, nomeAtualDoCliente, nomeChamado, numeroPedidoLabel, toast } from './state.js';
import { $, esc, money, pill, normStatusPag, norm, thSort, withFocusPreserved } from './utils.js';
import { whatsAppBtn } from './whatsapp.js';

const LABEL_STATUS_PAG = { pendente: 'Pendente', pago: 'Pago', parcial: 'Parcial' };
const COR_STATUS_PAG = { pendente: 'red', pago: 'green', parcial: 'orange' };
const TIP_STATUS_PAG = { pendente: 'Nenhum valor recebido ainda', pago: 'Valor recebido cobre o total do pedido', parcial: 'Só parte do valor foi recebida — falta receber o restante' };
function corStatusPag(v) { return COR_STATUS_PAG[normStatusPag(v)]; }
function labelStatusPag(v) { return LABEL_STATUS_PAG[normStatusPag(v)]; }
function tipStatusPag(v) { return TIP_STATUS_PAG[normStatusPag(v)]; }

function chips(tipo, vals) {
  return `<div class="chips">${vals.map(v =>
    `<button class="chip ${state.filters[tipo] === v[0] ? 'active' : ''}" onclick="App.setFilter('${tipo}','${v[0]}')">${v[1]}</button>`
  ).join('')}</div>`;
}

// Vendas com a linha de itens expandida (ver toggleVendaDetalhe) — só estado de tela, não persiste.
const vendasExpandidas = new Set();

export function toggleVendaDetalhe(id) {
  if (vendasExpandidas.has(id)) vendasExpandidas.delete(id);
  else vendasExpandidas.add(id);
  renderVendas();
}

// Sub-linha com os produtos e valores de uma venda, sem precisar abrir o carrinho inteiro.
// Exportada porque o Cliente 360 (clientes.js) reaproveita o mesmo detalhamento.
export function detalheVendaHtml(c) {
  const itens = c.itens || [];
  if (!itens.length) return '<small class="muted">Sem itens registrados.</small>';
  // Cada item em 2 linhas (nome em cima, preço embaixo) em vez de nome/preço lado a lado com
  // justify-content:space-between — no celular estreito o layout lado a lado sobrepunha o texto de
  // um item no do outro. Empilhado, o nome quebra naturalmente e o preço nunca colide.
  return itens.map(it => {
    const original = Number(it.precoOriginal || 0);
    const temDesconto = original > it.precoUnitario;
    const tags = [
      it.motivo && it.motivo !== 'Venda' ? pill(it.motivo, 'pink') : '',
      it.tipoEntrega === 'entrega_futura' && !it.entregue ? pill('entrega futura', 'orange') : '',
      temDesconto ? pill('-' + Math.round((1 - it.precoUnitario / original) * 100) + '%', 'green') : ''
    ].join('');
    // Quantidade 1 sem desconto: "un." e "total" são o mesmo número — mostra só uma vez. Com
    // desconto, o preço original riscado já vira a pílula "-X%" acima, então também não repete
    // aqui; só o total (ou "un. • total" quando há mais de 1 unidade) precisa aparecer.
    const precoLinha = it.quantidade > 1
      ? `${money(it.precoUnitario)} un. • <b>${money(it.precoUnitario * it.quantidade)}</b>`
      : `<b>${money(it.precoUnitario)}</b>`;
    return `<div class="venda-item">
      <div class="venda-item-nome">${it.quantidade}× ${it.kitNome ? `<small class="muted">🎁 ${esc(it.kitNome)}</small> ` : ''}${esc(it.produtoNome)} ${tags}</div>
      <div class="venda-item-preco">${precoLinha}</div>
    </div>`;
  }).join('');
}

export function renderVendas() {
  withFocusPreserved('qvendas', () => {
  const r = salesAgg(30);
  // Busca por cliente: filtra todas as listas (abertos, finalizados etc.) pelo nome atual do
  // cliente ou pelo nome salvo na época — objetivo é achar o pedido da pessoa rapidinho.
  const q = norm($('qvendas')?.value || '');
  let carrinhos = state.data.carrinhos;
  if (q) carrinhos = carrinhos.filter(c => norm(nomeAtualDoCliente(c.clienteId, c.clienteNome) + ' ' + (c.clienteNome || '')).includes(q));
  const abertos = carrinhos.filter(c => c.status === 'aberto');
  const finalizados = carrinhos.filter(c => c.status === 'finalizado' || c.status === 'parcial' || c.status === 'entregue');
  const futuras = carrinhos.filter(c => (c.status === 'parcial' || c.status === 'finalizado') && c.possuiEntregaFutura && c.itens?.some(i => i.tipoEntrega === 'entrega_futura' && !i.entregue));
  const cancelados = carrinhos.filter(c => c.status === 'cancelado');

  const f = state.filters.vendas;

  $('vendas').innerHTML = `
    <div class="cards">
      <div class="card"><span>Carrinhos pendentes</span><b>${abertos.length}</b></div>
      <div class="card"><span>Pedidos finalizados</span><b>${finalizados.length}</b></div>
      <div class="card"><span>Faturamento 30d</span><b>${money(r.fat)}</b></div>
      <div class="card"><span>Lucro 30d</span><b>${money(r.luc)}</b></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>Vendas e Carrinhos</h3>
        <button class="btn dark" onclick="App.openNovoCarrinho()">+ Novo carrinho</button>
      </div>
      <div class="toolbar">
        <input id="qvendas" placeholder="Buscar cliente..." oninput="App.renderVendas()" value="${esc($('qvendas')?.value || '')}">
      </div>
      ${chips('vendas', [['todos', 'Todos'], ['abertos', 'Carrinhos abertos'], ['finalizados', 'Finalizados'], ['futuras', 'Entregas futuras'], ['pgto_pendente', 'Pgto pendente'], ['cancelados', 'Cancelados']])}

      ${f === 'todos' || f === 'abertos' ? renderSection('🛒 Carrinhos abertos', abertos, true) : ''}
      ${f === 'todos' || f === 'finalizados' ? renderSection('✓ Pedidos finalizados', finalizados, false) : ''}
      ${f === 'futuras' ? renderSection('📦 Entregas futuras', futuras, false, true) : ''}
      ${f === 'pgto_pendente' ? renderSection('💰 Pagamento pendente', finalizados.filter(c => normStatusPag(c.statusPagamento) === 'pendente' || normStatusPag(c.statusPagamento) === 'parcial'), false) : ''}
      ${f === 'cancelados' ? renderSection('✗ Cancelados', cancelados, false) : ''}
    </div>`;
  });
}

// Ordena a lista de carrinhos/pedidos pela coluna clicada (state.filters.vendasSort, ex: "total_desc").
function ordenarVendas(items) {
  const [field, dir] = String(state.filters.vendasSort || '').split('_');
  if (!field) return items;
  const mul = dir === 'desc' ? -1 : 1;
  const val = c => {
    if (field === 'numero') return Number(c.numeroPedido || 0);
    if (field === 'itens') return (c.itens || []).length;
    if (field === 'total') return Number(c.totalPedido || 0);
    if (field === 'lucro') return Number(c.lucroTotal || 0);
    if (field === 'status') return norm(c.status || '');
    return norm(c.clienteNome || '');
  };
  return [...items].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  });
}

// Cor da pílula de status do pedido — mesma regra no desktop e no mobile.
function corStatusPedido(s) {
  return s === 'aberto' ? 'blue' : s === 'finalizado' || s === 'entregue' ? 'green' : s === 'parcial' ? 'orange' : 'red';
}

// Botões de ação de um pedido — HTML idêntico na tabela (desktop) e no cartão (mobile),
// então fica numa função só pra não sair de sincronia.
function vendaAcoesHtml(c, isAberto, showFutura) {
  const cli = state.data.clientes.find(cl => cl.id === c.clienteId);
  return `
    <button class="btn small" onclick="App.openCarrinho('${c.id}')">${isAberto ? '✏️ Abrir' : '👁️ Ver'}</button>
    ${!isAberto ? `<button class="btn small" onclick="App.gerarPdfCliente('${c.id}')">PDF Cliente</button>` : ''}
    ${!isAberto ? `<button class="btn small" onclick="App.gerarPdfInterno('${c.id}')">PDF Interno</button>` : ''}
    ${showFutura ? renderBtnEntregaFutura(c) : ''}
    ${(c.status === 'finalizado' || c.status === 'parcial') && !temEntregaFuturaPendente(c) ? `<button class="btn small" onclick="App.marcarPedidoEntregue('${c.id}')">📦 Entregue</button>` : ''}
    ${!isAberto && normStatusPag(c.statusPagamento) !== 'pago' ? `<button class="btn small" style="color:var(--success)" onclick="App.registrarPagamento('${c.id}')">💰 Registrar pagamento</button>` : ''}
    ${!isAberto && c.status !== 'cancelado' ? `<button class="btn small" onclick="App.reabrirCarrinho('${c.id}')">↩️ Reabrir</button>` : ''}
    ${!isAberto ? `<button class="btn small" style="color:var(--error)" onclick="App.excluirCarrinho('${c.id}')">🗑️ Excluir</button>` : ''}
    ${whatsAppBtn(cli?.whatsapp, isAberto ? 'resumoPedido' : 'posVenda', { nome: nomeChamado(c.clienteId, c.clienteNome), telefone: cli?.whatsapp, carrinho: c })}`;
}

// Cartão de um pedido (só aparece no celular, via .only-mobile) — informação essencial em destaque
// no topo (cliente + valor), detalhes secundários abaixo, e as ações agrupadas no rodapé. Substitui
// a tabela "achatada" em pares RÓTULO: valor que ficava gigante e ilegível no celular.
function vendaCardHtml(c, isAberto, showFutura) {
  const expandida = vendasExpandidas.has(c.id);
  const nItens = (c.itens || []).length;
  const temPgtoParcial = !isAberto && Number(c.totalPedido || 0) > 0;
  return `<div class="vcard">
    <div class="vcard-top">
      <span class="vcard-num">Nº ${numeroPedidoLabel(c)}</span>
      ${pill(c.status, corStatusPedido(c.status))}
    </div>
    <div class="vcard-cli cli-link" onclick="App.openCliente360('${c.clienteId}')">${esc(nomeAtualDoCliente(c.clienteId, c.clienteNome))}</div>
    <div class="vcard-rows">
      <div class="vcard-row"><span>${nItens} ${nItens === 1 ? 'item' : 'itens'}</span><b>${money(c.totalPedido)}</b></div>
      <div class="vcard-row"><span>Lucro</span><b>${money(c.lucroTotal)}</b></div>
      <div class="vcard-row"><span>Pgto</span><span class="vcard-pgto">${esc(c.pagamento || '-')} ${pill(labelStatusPag(c.statusPagamento), corStatusPag(c.statusPagamento), tipStatusPag(c.statusPagamento))}</span></div>
      ${temPgtoParcial ? `<div class="vcard-sub">${money(c.valorPago || 0)} de ${money(c.totalPedido)} recebido</div>` : ''}
    </div>
    <button class="btn small ghost vcard-toggle" onclick="App.toggleVendaDetalhe('${c.id}')">${expandida ? '▾ Ocultar itens' : `▸ Ver ${nItens} ${nItens === 1 ? 'item' : 'itens'}`}</button>
    ${expandida ? `<div class="vcard-itens">${detalheVendaHtml(c)}</div>` : ''}
    <div class="vcard-actions">${vendaAcoesHtml(c, isAberto, showFutura)}</div>
  </div>`;
}

function renderSection(titulo, items, isAberto, showFutura = false) {
  if (!items.length) return `<div style="margin-top:16px"><h4>${titulo}</h4><p class="muted">Nenhum item.</p></div>`;
  const sortKey = state.filters.vendasSort;
  const ordenados = ordenarVendas(items);

  const tabela = `<div class="table only-desktop"><table><thead><tr>
      ${thSort('Nº', 'numero', sortKey, 'vendasSort')}${thSort('Cliente', 'cliente', sortKey, 'vendasSort')}${thSort('Itens', 'itens', sortKey, 'vendasSort')}${thSort('Total', 'total', sortKey, 'vendasSort')}${thSort('Lucro', 'lucro', sortKey, 'vendasSort')}<th>Pgto</th>${thSort('Status', 'status', sortKey, 'vendasSort')}<th>Ações</th>
    </tr></thead><tbody>${ordenados.map(c => {
      const expandida = vendasExpandidas.has(c.id);
      return `<tr>
        <td><small class="muted">${numeroPedidoLabel(c)}</small></td>
        <td>
          <button class="btn small" style="padding:3px 8px;margin-right:6px" onclick="App.toggleVendaDetalhe('${c.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da venda'}">${expandida ? '▾' : '▸'}</button>
          <b class="cli-link" onclick="App.openCliente360('${c.clienteId}')">${esc(nomeAtualDoCliente(c.clienteId, c.clienteNome))}</b>
        </td>
        <td style="cursor:pointer" onclick="App.toggleVendaDetalhe('${c.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da venda'}">${(c.itens || []).length}</td>
        <td>${money(c.totalPedido)}</td>
        <td>${money(c.lucroTotal)}</td>
        <td>${esc(c.pagamento || '-')}<br><small>${pill(labelStatusPag(c.statusPagamento), corStatusPag(c.statusPagamento), tipStatusPag(c.statusPagamento))}</small>${!isAberto && Number(c.totalPedido || 0) > 0 ? `<br><small class="muted">${money(c.valorPago || 0)} de ${money(c.totalPedido)}</small>` : ''}</td>
        <td>${pill(c.status, corStatusPedido(c.status))}</td>
        <td>
          <div class="acoes-tabela">${vendaAcoesHtml(c, isAberto, showFutura)}</div>
        </td>
      </tr>${expandida ? `<tr><td colspan="8" style="background:#F7FAFC">${detalheVendaHtml(c)}</td></tr>` : ''}`;
    }).join('')}</tbody></table></div>`;

  const cartoes = `<div class="only-mobile vcards">${ordenados.map(c => vendaCardHtml(c, isAberto, showFutura)).join('')}</div>`;

  return `<div style="margin-top:16px"><h4>${titulo}</h4>${tabela}${cartoes}</div>`;
}

// Renumera TODOS os pedidos (não só os sem número) em ordem cronológica — idempotente, então pode
// rodar de novo sem problema. Renumerar tudo (em vez de só preencher os que faltam) evita um caso
// real de inconsistência: um pedido antigo sem número pode ter sido feito ANTES de um pedido novo
// que já ganhou número na hora da criação, o que bagunçaria a ordem/sequência por cliente se só
// completássemos os buracos.
export async function migrarNumeracaoPedidos() {
  // Ordem de FINALIZAÇÃO (fechamento da venda), não de criação do carrinho — um carrinho pode ficar
  // aberto dias antes de fechar, então criadoEm não reflete a ordem real das vendas. Carrinhos ainda
  // abertos (sem finalizadoEm) não têm venda concluída, então não entram na numeração.
  const todos = state.data.carrinhos
    .filter(c => c.finalizadoEm)
    .sort((a, b) => (a.finalizadoEm?.seconds ?? 0) - (b.finalizadoEm?.seconds ?? 0));
  if (!todos.length) return toast('Nenhum pedido finalizado para numerar.');
  if (!confirm(`Numerar/renumerar todos os ${todos.length} pedido(s) finalizado(s) em ordem de fechamento da venda? Números já existentes podem mudar para manter a ordem certa.`)) return;

  const porCliente = {};
  let feitos = 0;
  for (let i = 0; i < todos.length; i++) {
    const c = todos[i];
    const seq = (porCliente[c.clienteId] = (porCliente[c.clienteId] || 0) + 1);
    if (c.numeroPedido === i + 1 && c.sequenciaCliente === seq) continue;
    await setDoc(ref('carrinhos', c.id), { numeroPedido: i + 1, sequenciaCliente: seq }, { merge: true });
    feitos++;
  }
  window.App.refresh(feitos ? `${feitos} pedido(s) numerado(s)/atualizado(s)` : 'Numeração já estava correta para todos os pedidos.');
}

function renderBtnEntregaFutura(carr) {
  const pendentes = (carr.itens || []).filter(i => i.tipoEntrega === 'entrega_futura' && !i.entregue);
  if (!pendentes.length) return '';
  return pendentes.map((it, idx) => {
    const realIdx = (carr.itens || []).indexOf(it);
    return `<button class="btn small" onclick="App.marcarItemEntregue('${carr.id}',${realIdx})">📦 ${esc(it.produtoNome)}</button>`;
  }).join('');
}

// Um pedido com itens de entrega futura ainda pendentes não pode ser marcado como
// "entregue" de uma vez só — cada item precisa passar por marcarItemEntregue (que baixa
// o estoque individualmente e atualiza o status automaticamente quando todos concluírem).
function temEntregaFuturaPendente(carr) {
  return (carr.itens || []).some(i => i.tipoEntrega === 'entrega_futura' && !i.entregue);
}

export async function marcarPedidoEntregue(id) {
  await setDoc(ref('carrinhos', id), { status: 'entregue', atualizadoEm: serverTimestamp() }, { merge: true });
  window.App.refresh('Pedido marcado como entregue');
}

