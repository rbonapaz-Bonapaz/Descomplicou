import { state, ref, setDoc, serverTimestamp, salesAgg, nomeAtualDoCliente, nomeChamado } from './state.js';
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
  return itens.map(it => {
    const original = Number(it.precoOriginal || 0);
    const temDesconto = original > it.precoUnitario;
    const tags = [
      it.motivo && it.motivo !== 'Venda' ? pill(it.motivo, 'pink') : '',
      it.tipoEntrega === 'entrega_futura' && !it.entregue ? pill('entrega futura', 'orange') : '',
      temDesconto ? pill('-' + Math.round((1 - it.precoUnitario / original) * 100) + '%', 'green') : ''
    ].join('');
    return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:5px 0;border-bottom:1px dashed var(--line)">
      <span>${it.quantidade}× ${it.kitNome ? `<small class="muted">🎁 ${esc(it.kitNome)}</small> ` : ''}${esc(it.produtoNome)} ${tags}</span>
      <span style="white-space:nowrap">${temDesconto ? `<del class="muted">${money(original)}</del> ` : ''}${money(it.precoUnitario)} un. • <b>${money(it.precoUnitario * it.quantidade)}</b></span>
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

function renderSection(titulo, items, isAberto, showFutura = false) {
  if (!items.length) return `<div style="margin-top:16px"><h4>${titulo}</h4><p class="muted">Nenhum item.</p></div>`;
  const sortKey = state.filters.vendasSort;

  return `<div style="margin-top:16px"><h4>${titulo}</h4>
    <div class="table"><table><thead><tr>
      ${thSort('Cliente', 'cliente', sortKey, 'vendasSort')}${thSort('Itens', 'itens', sortKey, 'vendasSort')}${thSort('Total', 'total', sortKey, 'vendasSort')}${thSort('Lucro', 'lucro', sortKey, 'vendasSort')}<th>Pgto</th>${thSort('Status', 'status', sortKey, 'vendasSort')}<th>Ações</th>
    </tr></thead><tbody>${ordenarVendas(items).map(c => {
      const cli = state.data.clientes.find(cl => cl.id === c.clienteId);
      const expandida = vendasExpandidas.has(c.id);
      return `<tr>
        <td data-label="Cliente">
          <button class="btn small" style="padding:3px 8px;margin-right:6px" onclick="App.toggleVendaDetalhe('${c.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da venda'}">${expandida ? '▾' : '▸'}</button>
          <b class="cli-link" onclick="App.openCliente360('${c.clienteId}')">${esc(nomeAtualDoCliente(c.clienteId, c.clienteNome))}</b>
        </td>
        <td data-label="Itens" style="cursor:pointer" onclick="App.toggleVendaDetalhe('${c.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da venda'}">${(c.itens || []).length}</td>
        <td data-label="Total">${money(c.totalPedido)}</td>
        <td data-label="Lucro">${money(c.lucroTotal)}</td>
        <td data-label="Pgto">${esc(c.pagamento || '-')}<br><small>${pill(labelStatusPag(c.statusPagamento), corStatusPag(c.statusPagamento), tipStatusPag(c.statusPagamento))}</small>${!isAberto && Number(c.totalPedido || 0) > 0 ? `<br><small class="muted">${money(c.valorPago || 0)} de ${money(c.totalPedido)}</small>` : ''}</td>
        <td data-label="Status">${pill(c.status, c.status === 'aberto' ? 'blue' : c.status === 'finalizado' || c.status === 'entregue' ? 'green' : c.status === 'parcial' ? 'orange' : 'red')}</td>
        <td data-label="Ações">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn small" onclick="App.openCarrinho('${c.id}')">${isAberto ? '✏️ Abrir' : '👁️ Ver'}</button>
            ${!isAberto ? `<button class="btn small" onclick="App.gerarPdfCliente('${c.id}')">PDF Cliente</button>` : ''}
            ${!isAberto ? `<button class="btn small" onclick="App.gerarPdfInterno('${c.id}')">PDF Interno</button>` : ''}
            ${showFutura ? renderBtnEntregaFutura(c) : ''}
            ${(c.status === 'finalizado' || c.status === 'parcial') && !temEntregaFuturaPendente(c) ? `<button class="btn small" onclick="App.marcarPedidoEntregue('${c.id}')">📦 Entregue</button>` : ''}
            ${!isAberto && normStatusPag(c.statusPagamento) !== 'pago' ? `<button class="btn small" style="color:var(--success)" onclick="App.registrarPagamento('${c.id}')">💰 Registrar pagamento</button>` : ''}
            ${!isAberto && c.status !== 'cancelado' ? `<button class="btn small" onclick="App.reabrirCarrinho('${c.id}')">↩️ Reabrir</button>` : ''}
            ${!isAberto ? `<button class="btn small" style="color:var(--error)" onclick="App.excluirCarrinho('${c.id}')">🗑️ Excluir</button>` : ''}
            ${whatsAppBtn(cli?.whatsapp, isAberto ? 'resumoPedido' : 'posVenda', { nome: nomeChamado(c.clienteId, c.clienteNome), telefone: cli?.whatsapp, carrinho: c })}
          </div>
        </td>
      </tr>${expandida ? `<tr><td colspan="7" data-label="Itens da venda" style="background:#F7FAFC">${detalheVendaHtml(c)}</td></tr>` : ''}`;
    }).join('')}</tbody></table></div></div>`;
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

