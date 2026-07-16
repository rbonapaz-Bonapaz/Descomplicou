import { state, col, ref, db, showModal, closeModal, toast, setDoc, addDoc, deleteDoc,
  serverTimestamp, cliById, prodById, runTransaction, doc, estoqueDisponivel, reservadoEmAberto,
  proximoNumeroPedido, proximaSequenciaCliente } from './state.js';
import { $, esc, money, parseMoney, today, pill, normStatusPag, searchPickerHtml, formatDateBR, addDias, toggleHtml, toggleBareHtml, porGenero } from './utils.js';
import { saidaEstoque, entradaEstoque } from './estoque.js';
import { adicionarPreEncomenda } from './preencomenda.js';
import { WA_ICON } from './whatsapp.js';
import { taxaOperadora, operadoraById } from './operadoras.js';

const MOTIVOS_ITEM = ['Venda', 'Brinde', 'Parceria', 'Consumo próprio'];
const motivoColor = m => m === 'Venda' ? 'green' : m === 'Brinde' ? 'pink' : m === 'Parceria' ? 'blue' : 'orange';

// Calcula o valor da parcela. Se o cliente assume os juros, aplica juros simples
// (taxa % ao mês configurada no perfil) sobre o número de parcelas além da primeira.
export function calcParcelas(total, parcelas, jurosPor, taxaJurosCartao) {
  const n = Math.max(1, Number(parcelas || 1));
  const taxa = Number(taxaJurosCartao || 0) / 100;
  const totalComJuros = (jurosPor === 'cliente' && n > 1) ? total * (1 + taxa * (n - 1)) : total;
  return { n, totalComJuros, valorParcela: totalComJuros / n };
}

// Decide automaticamente quem assume o juro do parcelamento, conforme as regras configuradas
// pela consultora em Minha Conta → Pagamento: até X parcelas ela assume; acima disso, ou quando
// o pedido é menor que o valor mínimo configurado, o juro fica por conta da cliente.
export function jurosAutomatico(totalPedido, parcelas, perfil) {
  const n = Math.max(1, Number(parcelas || 1));
  if (n <= 1) return 'vendedor';
  const limite = Number(perfil?.limiteParcelasSemJuros ?? 3);
  const minimo = Number(perfil?.valorMinimoParcelamento || 0);
  if (minimo > 0 && Number(totalPedido || 0) < minimo) return 'cliente';
  return n <= limite ? 'vendedor' : 'cliente';
}

// Custo real da maquininha/link de pagamento, descontado do lucro: taxa da transação (% + tarifa
// fixa) sempre que é Cartão/Link, mais o juro do parcelamento quando é a CONSULTORA quem assume
// (jurosPor 'vendedor') — nesse caso o cliente paga o valor cheio, mas a operadora desconta o juro
// dela no repasse. Quando o juro é do cliente, ele já paga a diferença, então não pesa no lucro dela.
// Débito nunca parcela e usa uma taxa própria (normalmente mais baixa que a de crédito).
export function calcCustoCartao(totalPedido, pagamento, parcelas, jurosPor, perfil, cartaoTipo = 'Crédito', operadoraId = '', bandeiraGrupo = '') {
  const ehCartao = pagamento === 'Cartão' || pagamento === 'Link de pagamento';
  if (!ehCartao || !totalPedido) return { taxaTransacao: 0, custoJuros: 0, total: 0 };
  const ehDebito = pagamento === 'Cartão' && cartaoTipo === 'Débito';
  const n = ehDebito ? 1 : Math.max(1, Number(parcelas || 1));

  // Com operadora cadastrada, a taxa da tabela já é "tudo incluso" (a própria InfinitePay diz:
  // "taxas únicas sobre a venda, já com antecipação de todas as parcelas incluída") — não soma
  // juro de parcelamento por cima, senão contaria o mesmo custo duas vezes.
  const taxaTabela = operadoraId ? taxaOperadora(operadoraId, bandeiraGrupo, ehDebito, n) : null;
  if (taxaTabela != null) {
    const taxaTransacao = totalPedido * (taxaTabela / 100);
    return { taxaTransacao, custoJuros: 0, total: taxaTransacao };
  }

  const taxaBase = Number((ehDebito ? perfil?.taxaBaseDebito : perfil?.taxaBaseTransacao) || 0) / 100;
  const tarifaFixa = Number((ehDebito ? perfil?.tarifaFixaDebito : perfil?.tarifaFixaTransacao) || 0);
  const taxaTransacao = totalPedido * taxaBase + tarifaFixa;
  const taxaJuros = Number(perfil?.taxaJurosCartao || 0) / 100;
  const custoJuros = (!ehDebito && (jurosPor || 'vendedor') === 'vendedor' && n > 1) ? totalPedido * taxaJuros * (n - 1) : 0;
  return { taxaTransacao, custoJuros, total: taxaTransacao + custoJuros };
}

function operadoraBandeiraHtml(id, carr) {
  if (!state.data.operadoras.length) return '';
  return `<div class="field"><label>Operadora</label>
      <select id="cOperadora" onchange="App.salvarCarrinhoOpt('${id}',true)">
        <option value="">— Taxa padrão (Minha Conta) —</option>
        ${state.data.operadoras.map(o => `<option value="${o.id}" ${carr.cartaoOperadoraId === o.id ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Bandeira</label>
      <select id="cBandeira" onchange="App.salvarCarrinhoOpt('${id}',true)">
        <option value="visaMaster" ${carr.cartaoBandeiraGrupo !== 'eloAmex' ? 'selected' : ''}>Visa / Mastercard</option>
        <option value="eloAmex" ${carr.cartaoBandeiraGrupo === 'eloAmex' ? 'selected' : ''}>Elo / Amex</option>
      </select>
    </div>`;
}

function prazoRecebimentoHtml(carr) {
  if (!carr.cartaoOperadoraId) return '';
  const op = operadoraById(carr.cartaoOperadoraId);
  if (!op) return '';
  const dias = Number(op.prazoRecebimentoDias || 1);
  return `<p class="muted" style="margin:4px 0 0">💰 Recebe da ${esc(op.nome)} em ${dias} dia${dias === 1 ? '' : 's'} útil${dias === 1 ? '' : 'eis'}</p>`;
}

function parcelamentoHtml(id, carr) {
  if (carr.pagamento !== 'Cartão' && carr.pagamento !== 'Link de pagamento') return '';
  const cfg = state.profile || {};
  const ehDebito = carr.pagamento === 'Cartão' && carr.cartaoTipo === 'Débito';

  const tipoCartaoHtml = carr.pagamento === 'Cartão' ? `<div class="field"><label>Tipo</label>
    <select id="cCartaoTipo" onchange="App.salvarCarrinhoOpt('${id}',true)">
      <option value="Crédito" ${carr.cartaoTipo !== 'Débito' ? 'selected' : ''}>Crédito</option>
      <option value="Débito" ${carr.cartaoTipo === 'Débito' ? 'selected' : ''}>Débito</option>
    </select>
  </div>` : '';

  if (ehDebito) {
    const custoCartao = calcCustoCartao(carr.totalPedido || 0, carr.pagamento, 1, 'vendedor', cfg, 'Débito', carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo);
    return `<div class="panel" style="background:#F7FAFC;margin-top:12px">
      <h4 style="margin:0 0 8px">Cartão de débito</h4>
      <div class="grid">${tipoCartaoHtml}${operadoraBandeiraHtml(id, carr)}</div>
      <p class="muted" style="margin:8px 0 0">Débito é sempre à vista, sem parcelamento.</p>
      ${custoCartao.total > 0 ? `<p class="muted" style="margin:4px 0 0">Custo estimado da maquininha: <b style="color:var(--error)">${money(custoCartao.total)}</b> — sai do seu lucro</p>` : ''}
      ${prazoRecebimentoHtml(carr)}
    </div>`;
  }

  const maxParcelas = Number(cfg.maxParcelas || 12);
  const opts = Array.from({ length: maxParcelas }, (_, i) => i + 1);
  const jurosPor = jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, cfg);
  const { valorParcela, totalComJuros } = calcParcelas(carr.totalPedido || 0, carr.parcelas || 1, jurosPor, cfg.taxaJurosCartao);
  const custoCartao = calcCustoCartao(carr.totalPedido || 0, carr.pagamento, carr.parcelas || 1, jurosPor, cfg, 'Crédito', carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo);
  const minimo = Number(cfg.valorMinimoParcelamento || 0);
  return `<div class="panel" style="background:#F7FAFC;margin-top:12px">
    <h4 style="margin:0 0 8px">Parcelamento</h4>
    <div class="grid">
      ${tipoCartaoHtml}
      <div class="field"><label>Parcelas</label>
        <select id="cParcelas" onchange="App.salvarCarrinhoOpt('${id}',true)">
          ${opts.map(n => `<option value="${n}" ${(carr.parcelas || 1) === n ? 'selected' : ''}>${n}x</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Quem assume os juros?</label>
        <div style="padding-top:10px">${pill(jurosPor === 'vendedor' ? porGenero(cfg.genero, { f: 'Consultora', m: 'Consultor', x: 'Consultor(a)' }) : 'Cliente', jurosPor === 'vendedor' ? 'blue' : 'orange')}<span class="muted" style="font-size:12px;margin-left:6px">(definido automaticamente pelas suas regras em Minha Conta)</span></div>
      </div>
      ${operadoraBandeiraHtml(id, carr)}
    </div>
    ${minimo > 0 && (carr.parcelas || 1) > 1 && (carr.totalPedido || 0) < minimo ? `<p class="muted" style="margin:4px 0 0;color:var(--error)">Pedido abaixo de ${money(minimo)} — juro do parcelamento sempre por conta da cliente.</p>` : ''}
    <p class="muted" style="margin:8px 0 0">${carr.parcelas > 1 ? `${carr.parcelas}x de ${money(valorParcela)}` : 'À vista'}${jurosPor === 'cliente' && carr.parcelas > 1 ? ` — total com juros: ${money(totalComJuros)}` : ''}</p>
    ${custoCartao.total > 0 ? `<p class="muted" style="margin:4px 0 0">Custo estimado da maquininha: <b style="color:var(--error)">${money(custoCartao.total)}</b> (taxa ${money(custoCartao.taxaTransacao)}${custoCartao.custoJuros > 0 ? ` + juro parcelamento ${money(custoCartao.custoJuros)}` : ''}) — sai do seu lucro</p>` : ''}
    ${prazoRecebimentoHtml(carr)}
  </div>`;
}

export function openCarrinhoForCliente(clienteId) {
  const aberto = state.data.carrinhos.find(c => c.clienteId === clienteId && c.status === 'aberto');
  if (aberto) {
    openCarrinho(aberto.id);
  } else {
    criarCarrinho(clienteId);
  }
}

async function criarCarrinho(clienteId) {
  const c = cliById(clienteId);
  if (!c) return toast('Cliente não encontrado');
  const r = await addDoc(col('carrinhos'), {
    clienteId: c.id, clienteNome: c.nome,
    status: 'aberto', pagamento: '', statusPagamento: 'pendente',
    mostrarSemEstoque: false,
    itens: [], totalPedido: 0, custoTotal: 0, lucroTotal: 0,
    possuiEntregaFutura: false, observacoes: '',
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  });
  await window.App.refresh('Carrinho criado');
  openCarrinho(r.id);
}

export function openNovoCarrinho() {
  const cliOpts = state.data.clientes.map(c =>
    `<option value="${c.id}">${esc(c.nome)}</option>`
  ).join('');
  showModal(`<h3>Novo Carrinho</h3>
    <div class="field"><label>Cliente</label><select id="ncCli">${cliOpts}</select></div><br>
    <button class="btn dark" onclick="App.confirmarNovoCarrinho()">Criar carrinho</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarNovoCarrinho() {
  const clienteId = $('ncCli').value;
  closeModal();
  await criarCarrinho(clienteId);
}

export function openCarrinho(id) {
  const carr = state.data.carrinhos.find(c => c.id === id);
  if (!carr) return toast('Carrinho não encontrado');
  if (carr.status !== 'aberto') return openCarrinhoView(carr);

  const itens = carr.itens || [];
  const mostrarSem = carr.mostrarSemEstoque;
  const creditoDisponivel = carr.clienteId ? creditoDoCliente(carr.clienteId) : 0;
  const creditoAplicado = carr.usarCreditos ? Math.min(creditoDisponivel, carr.totalPedido || 0) : 0;

  // Disponível de verdade = estoque real menos tudo que já está reservado em qualquer carrinho
  // aberto (incluindo este) e em trocas em andamento — evita comprometer mais do que existe,
  // seja adicionando o mesmo produto duas vezes neste carrinho ou vendendo em carrinhos diferentes.
  const prods = state.data.produtos.filter(p => mostrarSem || estoqueDisponivel(p.id) > 0);
  const prodPicker = searchPickerHtml('ciProd', prods,
    p => {
      const disp = estoqueDisponivel(p.id);
      const reservadoOutros = reservadoEmAberto(p.id, id);
      return `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | disp: ${disp}${reservadoOutros > 0 ? ` (${reservadoOutros} em outros carrinhos)` : ''} | ${money(p.precoVenda || p.precoAtual || 0)}`;
    },
    'App.preencherPrecoItem()');

  showModal(`<div class="carrinho-modal">
    <h3>🛒 Carrinho — ${esc(carr.clienteNome)}</h3>

    ${Number(carr.valorPago || 0) > 0.004 ? `<div class="panel" style="background:#FFF7E6;border:1px solid #F5C453;margin-bottom:12px">
      <b>⚠️ Este pedido já teve ${money(carr.valorPago)} pago anteriormente</b> (carrinho reaberto).
      O pagamento foi preservado — ao finalizar de novo, o status é recalculado sozinho contra o total atual.
      ${Number(carr.valorPago || 0) - Number(carr.totalPedido || 0) > 0.004
        ? `<br><span style="color:var(--error);font-weight:900">Valor pago é maior que o total atual em ${money(Number(carr.valorPago) - Number(carr.totalPedido || 0))} — considere guardar o excedente como crédito do cliente ou estornar.</span>`
        : ''}
    </div>` : ''}

    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px">
      ${toggleHtml('cMostrarSem', mostrarSem, `App.toggleCarrinhoOpt('${id}','mostrarSemEstoque',this.checked)`, 'Mostrar itens sem estoque',
        '<span class="info-ico" tabindex="0">ⓘ<span class="info-tip">Libera escolher produtos sem estoque disponível. Ao adicionar um deles, o item entra sozinho como "entrega futura" e não baixa o estoque até você marcar como entregue.</span></span>')}
    </div>

    <div class="panel" style="background:#FFF9F5">
      <h4 style="margin:0 0 8px">Adicionar item</h4>
      <div class="grid">
        <div class="field full"><label>Produto</label>${prodPicker}</div>
        <div class="field"><label>Motivo</label>
          <select id="ciMotivo" onchange="App.preencherPrecoItem()">
            ${MOTIVOS_ITEM.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Quantidade</label><input id="ciQtd" type="number" value="1" min="1"></div>
        <div class="field"><label>Preço unitário</label><input id="ciPreco"></div>
      </div>
      <p class="muted" id="ciMotivoInfo" style="margin:6px 0 0"></p>
      <br><button class="btn dark small" onclick="App.adicionarItemCarrinho('${id}')">+ Adicionar ao carrinho</button>
    </div>

    <div class="panel" style="margin-top:12px">
      <h4>Itens do carrinho (${itens.length})</h4>
      ${itens.length ? `<div class="table"><table><thead><tr>
        <th>Produto</th><th>Motivo</th><th>Qtd</th><th>Original</th><th>Preço Unit.</th><th>Desconto</th><th>Total</th><th>Entrega</th><th>Quando</th><th></th>
      </tr></thead><tbody>${itens.map((it, idx) => {
        const original = Number(it.precoOriginal || it.precoUnitario || 0);
        const temDesconto = original > it.precoUnitario;
        const percentDesc = temDesconto ? Math.round((1 - it.precoUnitario / original) * 100) : 0;
        // Status do estoque (Pronta/Futura) é sobre o produto — independe da decisão do consultor.
        // Exclui as reservas deste próprio carrinho pra não contar o item contra ele mesmo.
        const temEstoqueAgora = estoqueDisponivel(it.produtoId, id) >= it.quantidade;
        return `<tr>
        <td data-label="Produto">${it.kitNome ? `<small class="muted">🎁 ${esc(it.kitNome)}</small><br>` : ''}${esc(it.produtoNome)}</td>
        <td data-label="Motivo">${pill(it.motivo || 'Venda', motivoColor(it.motivo || 'Venda'))}</td>
        <td data-label="Qtd">${it.quantidade}</td>
        <td data-label="Original">${temDesconto ? `<del>${money(original)}</del>` : '-'}</td>
        <td data-label="Preço">${money(it.precoUnitario)}</td>
        <td data-label="Desconto">${temDesconto ? pill('-' + percentDesc + '%', 'green') : '-'}</td>
        <td data-label="Total">${money(it.totalItem)}</td>
        <td data-label="Entrega" title="Status do produto no estoque">${pill(temEstoqueAgora ? 'Pronta' : 'Futura', temEstoqueAgora ? 'green' : 'orange')}</td>
        <td data-label="Quando"><div style="display:flex;align-items:center;gap:6px" title="Decisão do consultor: mesmo com estoque, pode ficar pendente de entrega pra outro momento">
          ${toggleBareHtml('entrItem_' + idx, it.tipoEntrega !== 'entrega_futura', `App.toggleEntregaItem('${id}',${idx},this.checked)`)}
          <small class="muted" style="white-space:nowrap">${it.tipoEntrega === 'entrega_futura' ? 'Depois' : 'Agora'}</small>
        </div></td>
        <td><button class="btn small" onclick="App.removerItemCarrinho('${id}',${idx})" title="Remover item">✗</button></td>
      </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">Carrinho vazio.</p>'}
    </div>

    <div class="cards" style="margin-top:12px">
      <div class="card"><span>Total original</span><b>${money(itens.reduce((s, i) => s + Number(i.precoOriginal || i.precoUnitario || 0) * i.quantidade, 0))}</b></div>
      ${(carr.descontoPedidoValor || 0) > 0.004 ? `<div class="card"><span>Desconto do pedido</span><b style="color:var(--success)">− ${money(carr.descontoPedidoValor)}</b></div>` : ''}
      <div class="card"><span>Total a cobrar</span><b>${money(carr.totalPedido || 0)}</b></div>
      <div class="card"><span>Desconto por item</span><b>${money(itens.reduce((s, i) => s + (Number(i.precoOriginal || i.precoUnitario || 0) - i.precoUnitario) * i.quantidade, 0))}</b></div>
      <div class="card"><span>Lucro real (após taxas)</span><b>${money((carr.lucroTotal || 0) - calcCustoCartao(carr.totalPedido || 0, carr.pagamento, carr.parcelas, jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, state.profile), state.profile, carr.cartaoTipo, carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo).total)}</b></div>
    </div>

    <div class="grid" style="margin-top:12px">
      <div class="field"><label>Pagamento</label>
        <select id="cPag" onchange="App.salvarCarrinhoOpt('${id}',true)">
          <option ${carr.pagamento === '' ? 'selected' : ''}>A combinar</option>
          <option ${carr.pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
          <option ${carr.pagamento === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
          <option ${carr.pagamento === 'Cartão' ? 'selected' : ''}>Cartão</option>
          <option ${carr.pagamento === 'Link de pagamento' ? 'selected' : ''}>Link de pagamento</option>
        </select>
      </div>
      <div class="field"><label>Desconto no pedido (opcional)</label>
        <div style="display:flex;gap:8px;max-width:100%">
          <input id="cDescontoValor" placeholder="Ex: 10" value="${carr.descontoPedido?.valor ?? ''}" style="flex:1;min-width:0" onblur="App.aplicarDescontoPedido('${id}')">
          <select id="cDescontoTipo" style="flex:0 0 72px;width:72px" onchange="App.aplicarDescontoPedido('${id}')">
            <option value="percent" ${(!carr.descontoPedido || carr.descontoPedido.tipo === 'percent') ? 'selected' : ''}>%</option>
            <option value="valor" ${carr.descontoPedido?.tipo === 'valor' ? 'selected' : ''}>R$</option>
          </select>
        </div>
        <span class="muted" style="font-size:12px">Sobre o pedido inteiro (ex: 10% na primeira compra), além dos descontos por item. O total a cobrar recalcula sozinho.</span>
      </div>
      ${creditoDisponivel > 0.004 ? `<div class="field"><label>Créditos do cliente</label>
        ${toggleHtml('cUsarCreditos', !!carr.usarCreditos, `App.toggleCarrinhoOpt('${id}','usarCreditos',this.checked)`, `Usar ${money(Math.min(creditoDisponivel, carr.totalPedido || 0))} em créditos`)}
        <span class="muted" style="font-size:12px">${esc(carr.clienteNome)} tem ${money(creditoDisponivel)} guardados de pagamentos anteriores.</span>
      </div>` : ''}
      <div class="field"><label>Valor recebido agora</label>
        <input id="cValorRecebido" value="${money(carr.valorPago > 0 ? carr.valorPago : Math.max(0, (carr.totalPedido || 0) - creditoAplicado))}">
        <span class="muted" style="font-size:12px">Vem preenchido com o ${creditoAplicado > 0.004 ? 'que falta após os créditos' : 'total'} — deixe menor se for receber só parte agora (sinal). Vira pendente/parcial/pago sozinho ao finalizar.</span>
      </div>
      <div class="field"><label>Retorno em quantos dias? (opcional)</label>
        <input id="cRetornoDias" type="number" min="0" placeholder="Ex: 7" value="${carr.retornoDias || ''}" onblur="App.salvarCarrinhoOpt('${id}',true)">
      </div>
      <div class="field full"><label>Observações</label><textarea id="cObs" onblur="App.salvarCarrinhoOpt('${id}')">${esc(carr.observacoes || '')}</textarea></div>
    </div>
    ${carr.dataRetorno ? `<p class="muted" style="margin-top:-6px">🔔 Retorno agendado para ${formatDateBR(carr.dataRetorno)}. Vai aparecer no Painel Inicial nessa data.</p>` : ''}

    ${parcelamentoHtml(id, carr)}

    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn dark" onclick="App.finalizarCarrinho('${id}')">✓ Finalizar venda</button>
      <button class="btn small" onclick="App.salvarCarrinhoOpt('${id}');App.closeModal();App.refresh('Carrinho salvo')">💾 Salvar</button>
      <button class="btn small green-btn" onclick="App.enviarResumoWhatsApp('${id}')">${WA_ICON} Enviar pedido</button>
      ${state.profile?.linkPagamento ? `<button class="btn small green-btn" onclick="App.enviarLinkPagamento('${id}')">💳 Enviar link de pagamento</button>` : ''}
      <button class="btn small" style="color:var(--error)" onclick="App.cancelarCarrinho('${id}')">✗ Cancelar</button>
      <button class="btn ghost" onclick="App.closeModal()">Fechar</button>
    </div>
  </div>`);

  preencherPrecoItem();
}

function openCarrinhoView(carr) {
  const itens = carr.itens || [];
  const venda = state.data.vendas.find(v => v.carrinhoId === carr.id);
  const lucroReal = venda ? venda.lucroReal : carr.lucroTotal - calcCustoCartao(carr.totalPedido, carr.pagamento, carr.parcelas, jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, state.profile), state.profile, carr.cartaoTipo, carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo).total;
  showModal(`<h3>Pedido — ${esc(carr.clienteNome)}</h3>
    <div class="cards">
      <div class="card"><span>Status</span><b>${pill(carr.status, carr.status === 'finalizado' ? 'green' : carr.status === 'cancelado' ? 'red' : 'blue')}</b></div>
      ${(carr.descontoPedidoValor || 0) > 0.004 ? `<div class="card"><span>Desconto do pedido</span><b style="color:var(--success)">− ${money(carr.descontoPedidoValor)}</b></div>` : ''}
      <div class="card"><span>Total</span><b>${money(carr.totalPedido)}</b></div>
      <div class="card"><span>Lucro real (após taxas)</span><b>${money(lucroReal)}</b></div>
      <div class="card"><span>Pagamento</span><b>${esc(carr.pagamento || '-')}</b></div>
    </div>
    <div class="table" style="margin-top:12px"><table><thead><tr>
      <th>Produto</th><th>Motivo</th><th>Qtd</th><th>Original</th><th>Preço</th><th>Desconto</th><th>Total</th><th>Entrega</th>
    </tr></thead><tbody>${itens.map(it => {
      const original = Number(it.precoOriginal || it.precoUnitario || 0);
      const temDesconto = original > it.precoUnitario;
      const percentDesc = temDesconto ? Math.round((1 - it.precoUnitario / original) * 100) : 0;
      return `<tr>
      <td data-label="Produto">${it.kitNome ? `<small class="muted">🎁 ${esc(it.kitNome)}</small><br>` : ''}${esc(it.produtoNome)}</td>
      <td data-label="Motivo">${pill(it.motivo || 'Venda', motivoColor(it.motivo || 'Venda'))}</td>
      <td data-label="Qtd">${it.quantidade}</td>
      <td data-label="Original">${temDesconto ? `<del>${money(original)}</del>` : '-'}</td>
      <td data-label="Preço">${money(it.precoUnitario)}</td>
      <td data-label="Desconto">${temDesconto ? pill('-' + percentDesc + '%', 'green') : '-'}</td>
      <td data-label="Total">${money(it.totalItem)}</td>
      <td data-label="Entrega">${pill(it.tipoEntrega === 'entrega_futura' ? (it.entregue ? 'Entregue' : 'Futura') : 'Pronta',
        it.tipoEntrega === 'entrega_futura' ? (it.entregue ? 'green' : 'orange') : 'green')}</td>
    </tr>`;
    }).join('')}</tbody></table></div>
    ${carr.status !== 'cancelado' ? pagamentoResumoHtml(carr) : ''}
    ${carr.observacoes ? `<p class="muted" style="margin-top:8px">${esc(carr.observacoes)}</p>` : ''}
    <br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
}

// Decide o status de pagamento sozinho a partir do valor efetivamente recebido — evita ficar
// desatualizado por esquecimento de mudar um select manual.
export function statusPagamentoAuto(totalPedido, valorPago) {
  const vp = Number(valorPago || 0), tp = Number(totalPedido || 0);
  if (vp <= 0.004) return 'pendente';
  if (vp >= tp - 0.004) return 'pago';
  return 'parcial';
}

function pagamentoResumoHtml(carr) {
  const pago = Number(carr.valorPago || 0);
  const total = Number(carr.totalPedido || 0);
  const restante = Math.max(0, total - pago);
  const pagamentos = carr.pagamentos || [];
  return `<div class="panel" style="background:#F7FAFC;margin-top:12px">
    <div class="panel-head">
      <h4 style="margin:0">Gestão de pagamento</h4>
      ${pill(labelStatusPagLocal(statusPagamentoAuto(total, pago)), corStatusPagLocal(statusPagamentoAuto(total, pago)), tipStatusPagLocal(statusPagamentoAuto(total, pago)))}
    </div>
    <div class="cards">
      <div class="card"><span>Recebido</span><b>${money(pago)}</b></div>
      <div class="card"><span>Restante</span><b style="color:${restante > 0.004 ? 'var(--error)' : 'inherit'}">${money(restante)}</b></div>
      ${carr.clienteId && creditoDoCliente(carr.clienteId) > 0.004 ? `<div class="card"><span>Créditos do cliente</span><b style="color:var(--success)">${money(creditoDoCliente(carr.clienteId))}</b></div>` : ''}
    </div>
    ${pagamentos.length ? `<div class="table" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Observação</th></tr></thead><tbody>
      ${pagamentos.map(p => `<tr><td data-label="Data">${formatDateBR(p.data)}</td><td data-label="Valor">${money(p.valor)}</td><td data-label="Forma">${esc(p.forma || '-')}${p.cartaoTipo ? ` (${esc(p.cartaoTipo)}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''})` : ''}</td><td data-label="Observação">${esc(p.observacoes || '-')}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    ${restante > 0.004 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn dark small" onclick="App.registrarPagamento('${carr.id}')">💰 Registrar pagamento recebido</button>
      ${state.profile?.linkPagamento ? `<button class="btn small green-btn" onclick="App.enviarLinkPagamento('${carr.id}')">💳 Enviar link de pagamento</button>` : ''}
    </div>` : ''}
  </div>`;
}

const LABEL_STATUS_PAG_LOCAL = { pendente: 'Pendente', pago: 'Pago', parcial: 'Parcial' };
const COR_STATUS_PAG_LOCAL = { pendente: 'red', pago: 'green', parcial: 'orange' };
const TIP_STATUS_PAG_LOCAL = { pendente: 'Nenhum valor recebido ainda', pago: 'Valor recebido cobre o total do pedido', parcial: 'Só parte do valor foi recebida — falta receber o restante' };
function labelStatusPagLocal(v) { return LABEL_STATUS_PAG_LOCAL[v]; }
function corStatusPagLocal(v) { return COR_STATUS_PAG_LOCAL[v]; }
function tipStatusPagLocal(v) { return TIP_STATUS_PAG_LOCAL[v]; }

// --- Créditos do cliente ---
// Excedente de pagamento pode virar crédito guardado no cadastro do cliente (campo "credito"),
// usável nas próximas compras — tanto no fechamento do carrinho quanto num pagamento posterior.
export function creditoDoCliente(clienteId) {
  return Math.round(Number(cliById(clienteId)?.credito || 0) * 100) / 100;
}

async function ajustarCreditoCliente(clienteId, delta) {
  if (!clienteId || Math.abs(delta) < 0.005) return;
  const novo = Math.round(Math.max(0, creditoDoCliente(clienteId) + delta) * 100) / 100;
  await setDoc(ref('clientes', clienteId), { credito: novo }, { merge: true });
  const c = cliById(clienteId);
  if (c) c.credito = novo;
}

// Pergunta se o excedente recebido vira crédito do cliente. Devolve o valor guardado (0 se a
// consultora preferir não guardar — aí o excedente fica só registrado como pagamento a mais).
async function perguntarExcedenteComoCredito(clienteId, clienteNome, excedente) {
  if (!clienteId || excedente < 0.005) return 0;
  const guardar = confirm(`Você recebeu ${money(excedente)} a MAIS que o valor devido.\n\nGuardar esse valor como crédito para ${clienteNome}?\nO crédito fica no cadastro e pode ser usado nas próximas compras.`);
  if (!guardar) return 0;
  await ajustarCreditoCliente(clienteId, excedente);
  return excedente;
}

// Abre o formulário pra registrar um pagamento recebido (total ou parcial) de um pedido já
// finalizado. Já vem preenchido com o valor restante — deixa como está pra quitar de uma vez,
// ou edita pra registrar só um sinal/parte.
export function registrarPagamento(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const restante = Math.max(0, Number(carr.totalPedido || 0) - Number(carr.valorPago || 0));
  const creditoDisponivel = carr.clienteId ? creditoDoCliente(carr.clienteId) : 0;
  showModal(`<h3>Registrar pagamento</h3>
    <p class="muted">Total do pedido: ${money(carr.totalPedido)} — já recebido: ${money(carr.valorPago || 0)} — restante: ${money(restante)}</p>
    ${creditoDisponivel > 0.004 ? `<div class="field" style="margin-bottom:8px">
      ${toggleHtml('pgUsarCreditos', false, `App.aplicarCreditoPagamento('${carrinhoId}',this.checked)`, `Usar créditos do cliente (${money(Math.min(creditoDisponivel, restante))} de ${money(creditoDisponivel)} disponíveis)`)}
    </div>` : ''}
    <div class="grid">
      <div class="field"><label>Valor recebido agora</label><input id="pgValor" value="${money(restante)}" onchange="App.atualizarCalcPagamento('${carrinhoId}')"></div>
      <div class="field"><label>Forma</label>
        <select id="pgForma" onchange="App.atualizarCalcPagamento('${carrinhoId}')">
          <option ${carr.pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
          <option ${carr.pagamento === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
          <option ${carr.pagamento === 'Cartão' ? 'selected' : ''}>Cartão</option>
          <option ${carr.pagamento === 'Link de pagamento' ? 'selected' : ''}>Link de pagamento</option>
        </select>
      </div>
      <div class="field"><label>Data</label><input id="pgData" type="date" value="${today()}"></div>
      <div class="field full"><label>Observação</label><input id="pgObs" placeholder="Ex: sinal, quitação, entrega parcial..."></div>
    </div>
    <div id="pgCartaoWrap" class="grid hidden" style="margin-top:8px">
      <div class="field"><label>Tipo</label>
        <select id="pgCartaoTipo" onchange="App.atualizarCalcPagamento('${carrinhoId}')">
          <option value="Crédito">Crédito</option>
          <option value="Débito">Débito</option>
        </select>
      </div>
      <div class="field" id="pgParcelasWrap"><label>Parcelas</label>
        <select id="pgParcelas" onchange="App.atualizarCalcPagamento('${carrinhoId}')">
          ${Array.from({ length: Number(state.profile?.maxParcelas || 12) }, (_, i) => i + 1).map(n => `<option value="${n}">${n}x</option>`).join('')}
        </select>
      </div>
    </div>
    <p id="pgCalc" class="muted" style="margin-top:8px"></p><br>
    <button class="btn dark" onclick="App.confirmarPagamento('${carrinhoId}')">Registrar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
  atualizarCalcPagamento(carrinhoId);
}

// Marcar/desmarcar "usar créditos" no pagamento posterior: ajusta o campo de valor em dinheiro
// para o que falta depois de aplicar os créditos (a consultora pode editar depois, claro).
export function aplicarCreditoPagamento(carrinhoId, usar) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr || !$('pgValor')) return;
  const restante = Math.max(0, Number(carr.totalPedido || 0) - Number(carr.valorPago || 0));
  const credito = usar ? Math.min(creditoDoCliente(carr.clienteId), restante) : 0;
  $('pgValor').value = money(Math.max(0, restante - credito));
  atualizarCalcPagamento(carrinhoId);
}

// Mostra/esconde Tipo (Débito/Crédito) e Parcelas conforme a forma escolhida, e calcula na hora o
// custo estimado da maquininha pra esse pagamento — mesma lógica usada no carrinho na hora da venda.
export function atualizarCalcPagamento(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  const forma = $('pgForma')?.value;
  const ehCartao = forma === 'Cartão';
  $('pgCartaoWrap')?.classList.toggle('hidden', !ehCartao);
  const tipo = $('pgCartaoTipo')?.value || 'Crédito';
  const ehDebito = tipo === 'Débito';
  if ($('pgParcelasWrap')) $('pgParcelasWrap').style.display = ehDebito ? 'none' : '';
  if (!ehCartao) { if ($('pgCalc')) $('pgCalc').textContent = ''; return; }

  const valor = parseMoney($('pgValor')?.value || 0);
  const parcelas = ehDebito ? 1 : Number($('pgParcelas')?.value || 1);
  const jurosPor = ehDebito ? 'vendedor' : jurosAutomatico(valor, parcelas, state.profile);
  const custo = calcCustoCartao(valor, 'Cartão', parcelas, jurosPor, state.profile, tipo, carr?.cartaoOperadoraId, carr?.cartaoBandeiraGrupo);
  if ($('pgCalc')) {
    $('pgCalc').textContent = custo.total > 0
      ? `Custo estimado da maquininha: ${money(custo.total)} (taxa ${money(custo.taxaTransacao)}${custo.custoJuros > 0 ? ` + juro parcelamento ${money(custo.custoJuros)}` : ''}) — sai do seu lucro`
      : '';
  }
}

export async function confirmarPagamento(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const restante = Math.max(0, Number(carr.totalPedido || 0) - Number(carr.valorPago || 0));
  const creditoUsado = $('pgUsarCreditos')?.checked && carr.clienteId
    ? Math.round(Math.min(creditoDoCliente(carr.clienteId), restante) * 100) / 100 : 0;
  let valor = parseMoney($('pgValor').value);
  if (valor <= 0 && creditoUsado < 0.005) return toast('Informe um valor maior que zero');
  const dataPg = $('pgData').value || today();

  // Excedente (créditos + dinheiro acima do restante) pode virar crédito novo pro cliente.
  const excedente = Math.round((creditoUsado + valor - restante) * 100) / 100;
  const creditoGerado = excedente > 0.004 ? await perguntarExcedenteComoCredito(carr.clienteId, carr.clienteNome, excedente) : 0;
  if (creditoGerado > 0.004) valor = Math.round((valor - creditoGerado) * 100) / 100;
  await ajustarCreditoCliente(carr.clienteId, -creditoUsado);

  const forma = $('pgForma').value;
  const ehCartao = forma === 'Cartão';
  const cartaoTipo = ehCartao ? ($('pgCartaoTipo')?.value || 'Crédito') : '';
  const parcelas = ehCartao && cartaoTipo === 'Crédito' ? Number($('pgParcelas')?.value || 1) : 1;
  const jurosPor = ehCartao ? (cartaoTipo === 'Débito' ? 'vendedor' : jurosAutomatico(valor, parcelas, state.profile)) : 'vendedor';
  const custoCartao = ehCartao && valor > 0.004 ? calcCustoCartao(valor, 'Cartão', parcelas, jurosPor, state.profile, cartaoTipo, carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo).total : 0;

  const pagamentos = [...(carr.pagamentos || [])];
  if (creditoUsado > 0.004) pagamentos.push({ valor: creditoUsado, forma: 'Créditos do cliente', data: dataPg, observacoes: 'Créditos do cadastro usados' });
  if (valor > 0.004) pagamentos.push({
    valor, forma, data: dataPg,
    observacoes: ($('pgObs').value.trim() + (creditoGerado > 0.004 ? ` (${money(creditoGerado)} guardado como crédito)` : '')).trim(),
    ...(ehCartao ? { cartaoTipo, parcelas, custoCartao } : {})
  });
  const valorPago = Number(carr.valorPago || 0) + creditoUsado + valor;
  const statusPagamento = statusPagamentoAuto(carr.totalPedido, valorPago);
  await setDoc(ref('carrinhos', carrinhoId), { pagamentos, valorPago, statusPagamento, atualizadoEm: serverTimestamp() }, { merge: true });

  // Se esse pedido já tem uma venda registrada (foi finalizado antes), atualiza o custo de cartão
  // e o lucro real dela com o custo desse pagamento — assim os Relatórios refletem a taxa/juro de
  // verdade cobrados quando o pagamento pendente finalmente foi recebido no cartão.
  if (custoCartao > 0) {
    const venda = state.data.vendas.find(v => v.carrinhoId === carrinhoId);
    if (venda) {
      const novoCustoCartao = Number(venda.custoCartao || 0) + custoCartao;
      const novoLucroReal = Number(venda.lucroTotal || 0) - novoCustoCartao;
      await setDoc(ref('vendas', venda.id), {
        custoCartao: novoCustoCartao, lucroReal: novoLucroReal,
        margemReal: venda.totalPedido ? (novoLucroReal / venda.totalPedido) * 100 : 0
      }, { merge: true });
    }
  }

  closeModal();
  window.App.refresh(`Pagamento de ${money(creditoUsado + valor)} registrado${creditoUsado > 0.004 ? ` (${money(creditoUsado)} em créditos)` : ''}`);
}

export function preencherPrecoItem() {
  const p = prodById($('ciProd')?.value);
  const motivo = $('ciMotivo')?.value || 'Venda';
  const isVenda = motivo === 'Venda';
  if ($('ciPreco')) {
    $('ciPreco').value = isVenda ? money(p?.precoVenda || p?.precoAtual || 0) : money(0);
    $('ciPreco').disabled = !isVenda;
  }
  if ($('ciMotivoInfo')) {
    $('ciMotivoInfo').textContent = isVenda
      ? ''
      : `Item de "${motivo}" não gera receita nem lucro nos relatórios, mas baixa do estoque normalmente.`;
  }
}

export async function adicionarItemCarrinho(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const p = prodById($('ciProd').value);
  if (!p) return toast('Selecione um produto');
  const qtd = Number($('ciQtd').value || 1);
  const motivo = $('ciMotivo')?.value || 'Venda';
  const isVenda = motivo === 'Venda';
  const preco = isVenda ? parseMoney($('ciPreco').value) : 0;
  // Desconta tudo que já está reservado em QUALQUER carrinho aberto (incluindo este) e em trocas
  // em andamento — sem isso, dois carrinhos abertos ao mesmo tempo podiam vender a mesma última
  // unidade em estoque, cada um achando que ainda tinha disponível.
  const estoque = estoqueDisponivel(p.id);

  // Sem estoque suficiente, o item entra sozinho como "entrega futura" — não baixa o estoque até
  // ser marcado como entregue (mesmo comportamento das trocas). Nenhuma confirmação extra é
  // necessária: escolher um produto sem estoque já exige ativar "Mostrar itens sem estoque" antes.
  const tipoEntrega = estoque < qtd ? 'entrega_futura' : 'pronta_entrega';

  const custoMedio = Number(p.custoMedio || 0);
  // precoOriginal só serve de referência visual (tabela "de/por"); não afeta nenhum cálculo de lucro.
  const precoOriginal = Number(p.precoOriginal || 0) || preco;
  const item = {
    produtoId: p.id, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
    quantidade: qtd, precoUnitario: preco, precoOriginal, totalItem: preco * qtd,
    custoMedioUsado: custoMedio, custoTotal: custoMedio * qtd,
    lucroTotal: isVenda ? (preco * qtd) - (custoMedio * qtd) : 0,
    motivo, geraLucro: isVenda,
    tipoEntrega, baixouEstoque: false
  };

  const itens = [...(carr.itens || []), item];
  const totais = calcTotais(itens, carr.descontoPedido);

  await setDoc(ref('carrinhos', carrinhoId), {
    ...totais, itens,
    possuiEntregaFutura: itens.some(i => i.tipoEntrega === 'entrega_futura'),
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  // Vendeu sem ter em estoque: entra sozinha na lista de pré-encomenda (Estoque → Pré-encomenda),
  // sem sobrescrever se a consultora já tiver colocado esse produto lá manualmente.
  if (tipoEntrega === 'entrega_futura') await adicionarPreEncomenda(p.id, 'carrinho_sem_estoque', qtd - estoque);

  await window.App.refresh();
  openCarrinho(carrinhoId);
}

// A entrega de cada item é escolha da consultora: mesmo com estoque, um item pode ficar pra
// entregar em outro momento (vira "entrega futura" e o pedido finaliza como parcial — a entrega
// é confirmada depois pelo botão 📦 em Vendas). O caminho contrário exige estoque disponível:
// não dá pra prometer entrega agora do que não existe. Item de "entrega futura" não reserva
// estoque, então a checagem contra estoqueDisponivel() já conta tudo certo.
export async function toggleEntregaItem(carrinhoId, idx, entregarAgora) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  const it = carr?.itens?.[idx];
  if (!it) return;
  // Exclui as reservas do próprio carrinho da conta — senão o item, já reservado por ele mesmo
  // quando "pronta_entrega", contaria contra si na hora de tentar religar.
  const disp = estoqueDisponivel(it.produtoId, carrinhoId);
  if (entregarAgora && disp < it.quantidade) {
    toast(`Sem estoque disponível pra entregar "${it.produtoNome}" agora (disponível: ${disp} de ${it.quantidade}).`);
    openCarrinho(carrinhoId);
    return;
  }
  it.tipoEntrega = entregarAgora ? 'pronta_entrega' : 'entrega_futura';
  if (entregarAgora) delete it.entregue;
  await setDoc(ref('carrinhos', carrinhoId), {
    itens: carr.itens,
    possuiEntregaFutura: carr.itens.some(i => i.tipoEntrega === 'entrega_futura'),
    atualizadoEm: serverTimestamp()
  }, { merge: true });
  await window.App.refresh();
  openCarrinho(carrinhoId);
}

export async function removerItemCarrinho(carrinhoId, idx) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  let itens = [...(carr.itens || [])];
  const alvo = itens[idx];
  // Item de kit não sai sozinho: o valor foi rateado entre os componentes, então remover um só
  // deixaria os outros com preços que não fazem sentido — remove o kit inteiro.
  if (alvo?.kitId) {
    if (!confirm(`"${alvo.produtoNome}" faz parte do kit "${alvo.kitNome}". Remover o kit inteiro do carrinho?`)) return;
    itens = itens.filter(i => i.kitId !== alvo.kitId);
  } else {
    itens.splice(idx, 1);
  }
  const totais = calcTotais(itens, carr.descontoPedido);

  await setDoc(ref('carrinhos', carrinhoId), {
    ...totais, itens,
    possuiEntregaFutura: itens.some(i => i.tipoEntrega === 'entrega_futura'),
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  await window.App.refresh();
  openCarrinho(carrinhoId);
}

// Valor em R$ do desconto sobre o pedido inteiro ({tipo:'percent'|'valor', valor}), limitado
// ao subtotal — um desconto fixo maior que o pedido não pode deixar o total negativo.
function valorDescontoPedido(subtotal, d) {
  if (!d || !Number(d.valor)) return 0;
  const calc = d.tipo === 'percent' ? subtotal * Number(d.valor) / 100 : Number(d.valor);
  return Math.min(Math.max(calc, 0), subtotal);
}

// totalPedido é sempre o valor líquido (após desconto do pedido) — é ele que alimenta status de
// pagamento, venda, relatórios, PDF e WhatsApp. O desconto concedido sai direto do lucro.
function calcTotais(itens, descontoPedido) {
  const subtotalPedido = itens.reduce((s, i) => s + i.totalItem, 0);
  const descontoPedidoValor = valorDescontoPedido(subtotalPedido, descontoPedido);
  return {
    subtotalPedido,
    descontoPedidoValor,
    totalPedido: subtotalPedido - descontoPedidoValor,
    custoTotal: itens.reduce((s, i) => s + i.custoTotal, 0),
    lucroTotal: itens.reduce((s, i) => s + i.lucroTotal, 0) - descontoPedidoValor
  };
}

// Desconto sobre o pedido inteiro (ex: 10% na primeira compra), além dos descontos por item.
// Recalcula na hora o total a cobrar e o lucro; trocar itens depois reaplica o mesmo desconto.
export async function aplicarDescontoPedido(id) {
  const carr = state.data.carrinhos.find(c => c.id === id);
  if (!carr) return;
  const tipo = $('cDescontoTipo')?.value || 'percent';
  const bruto = tipo === 'percent'
    ? Number(String($('cDescontoValor')?.value || '').replace(',', '.'))
    : parseMoney($('cDescontoValor')?.value);
  const valor = Math.max(0, tipo === 'percent' ? Math.min(bruto || 0, 100) : (bruto || 0));
  const descontoPedido = valor > 0 ? { tipo, valor } : null;
  const totais = calcTotais(carr.itens || [], descontoPedido);
  await setDoc(ref('carrinhos', id), { descontoPedido, ...totais, atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh();
  openCarrinho(id);
}

export async function toggleCarrinhoOpt(id, campo, valor) {
  await setDoc(ref('carrinhos', id), { [campo]: valor, atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh();
  openCarrinho(id);
}

export async function salvarCarrinhoOpt(id, reabrir = false) {
  const updates = { atualizadoEm: serverTimestamp() };
  if ($('cPag')) updates.pagamento = $('cPag').value;
  if ($('cCartaoTipo')) updates.cartaoTipo = $('cCartaoTipo').value;
  if ($('cOperadora')) updates.cartaoOperadoraId = $('cOperadora').value;
  if ($('cBandeira')) updates.cartaoBandeiraGrupo = $('cBandeira').value;
  if ($('cObs')) updates.observacoes = $('cObs').value;
  if ($('cParcelas')) {
    const parcelas = Number($('cParcelas').value);
    updates.parcelas = parcelas;
    const totalAtual = state.data.carrinhos.find(c => c.id === id)?.totalPedido || 0;
    updates.jurosPor = jurosAutomatico(totalAtual, parcelas, state.profile);
  }
  if ($('cRetornoDias')) {
    const dias = Number($('cRetornoDias').value || 0);
    updates.retornoDias = dias;
    updates.dataRetorno = dias > 0 ? addDias(today(), dias) : '';
    if (dias > 0) updates.retornoFeito = false;
  }
  await setDoc(ref('carrinhos', id), updates, { merge: true });
  if (reabrir) {
    await window.App.refresh();
    openCarrinho(id);
  }
}

export async function finalizarCarrinho(id) {
  const carr = state.data.carrinhos.find(c => c.id === id);
  if (!carr || !carr.itens?.length) return toast('Carrinho vazio');

  await salvarCarrinhoOpt(id);

  for (const item of carr.itens) {
    if (item.tipoEntrega === 'pronta_entrega' && !item.baixouEstoque) {
      try {
        await saidaEstoque(item.produtoId, item.quantidade, item.motivo || 'Venda', id, item.totalItem);
        item.baixouEstoque = true;
      } catch (e) {
        toast(`Erro ao baixar estoque de ${item.produtoNome}: ${e.message}`);
        return;
      }
    }
  }

  const temFutura = carr.itens.some(i => i.tipoEntrega === 'entrega_futura');
  const status = temFutura ? 'parcial' : 'finalizado';

  const pagamentoFinal = carr.pagamento || $('cPag')?.value || '';
  // O select de status na tela do carrinho é só o "plano" antes de finalizar. Se a consultora já
  // marcou um valor recebido menor que o total ali (deixou parte pendente), isso inicializa o
  // valor pago — daí em diante quem controla o valor pago/restante é o registro de pagamentos
  // (gestão de pagamento parcial). Só inicializa na PRIMEIRA finalização: se o carrinho já tem
  // pagamentos registrados (ex: foi reaberto e está sendo finalizado de novo), o valor pago não é
  // zerado nem reiniciado — só o status é recalculado contra o total atual (ver bloco abaixo).
  const jaTinhaPagamento = (carr.pagamentos && carr.pagamentos.length) || Number(carr.valorPago || 0) > 0.004;
  let updatesPagamento = {};
  let statusFinal = normStatusPag(carr.statusPagamento);
  if (jaTinhaPagamento) {
    // Carrinho reaberto com pagamento preservado: o status não fica "congelado" no valor antigo —
    // recalcula contra o total atual (itens podem ter mudado entre a reabertura e agora). Se o
    // valor já pago passar do novo total, avisa o excedente pra tratativa manual (crédito/estorno)
    // em vez de decidir sozinho.
    const totalP = Number(carr.totalPedido || 0);
    const valorPago = Number(carr.valorPago || 0);
    statusFinal = statusPagamentoAuto(totalP, valorPago);
    updatesPagamento = { statusPagamento: statusFinal };
    const excedente = Math.round((valorPago - totalP) * 100) / 100;
    if (excedente > 0.004) {
      toast(`⚠️ Valor já pago (${money(valorPago)}) é maior que o novo total (${money(totalP)}) — excedente de ${money(excedente)}. Guarde como crédito do cliente ou registre um estorno.`);
    }
  } else {
    const totalP = Number(carr.totalPedido || 0);
    let dinheiro = $('cValorRecebido') ? parseMoney($('cValorRecebido').value) : totalP;

    // Créditos do cliente entram primeiro (se a consultora ativou o toggle); o dinheiro cobre o
    // resto. Excedente da soma pode virar crédito novo — pergunta antes de guardar.
    const creditoUsado = carr.usarCreditos && carr.clienteId
      ? Math.round(Math.min(creditoDoCliente(carr.clienteId), totalP) * 100) / 100 : 0;
    const excedente = Math.round((creditoUsado + dinheiro - totalP) * 100) / 100;
    const creditoGerado = excedente > 0.004 ? await perguntarExcedenteComoCredito(carr.clienteId, carr.clienteNome, excedente) : 0;
    if (creditoGerado > 0.004) dinheiro = Math.round((dinheiro - creditoGerado) * 100) / 100;
    await ajustarCreditoCliente(carr.clienteId, -creditoUsado);

    const valorPago = Math.round((creditoUsado + dinheiro) * 100) / 100;
    const pagamentos = [];
    if (creditoUsado > 0.004) pagamentos.push({ valor: creditoUsado, forma: 'Créditos do cliente', data: today(), observacoes: 'Créditos do cadastro usados no fechamento' });
    if (dinheiro > 0.004) pagamentos.push({ valor: dinheiro, forma: pagamentoFinal || 'Não informado', data: today(), observacoes: creditoGerado > 0.004 ? `Pagamento no fechamento da venda (${money(creditoGerado)} guardado como crédito)` : 'Pagamento no fechamento da venda' });
    statusFinal = statusPagamentoAuto(totalP, valorPago);
    updatesPagamento = { valorPago, statusPagamento: statusFinal, pagamentos, usarCreditos: false };
  }

  // Usa a regra automática calculada agora, não o carr.jurosPor salvo — esse campo só é gravado
  // quando a consultora mexe manualmente na parcela, então podia ficar desatualizado (ex: "vendedor"
  // por padrão) e cobrar o juro do parcelamento dela mesmo quando a regra diz que é do cliente.
  const jurosPorFinal = jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, state.profile);

  // Número do pedido é atribuído aqui (na finalização), não na criação do carrinho — reflete a
  // ordem real das vendas, já que um carrinho pode ficar aberto muito tempo antes de fechar. Se o
  // carrinho já tem número (reaberto e finalizado de novo), mantém o mesmo.
  const numeracao = carr.numeroPedido
    ? {}
    : { numeroPedido: proximoNumeroPedido(), sequenciaCliente: proximaSequenciaCliente(carr.clienteId) };

  await setDoc(ref('carrinhos', id), {
    status, itens: carr.itens,
    possuiEntregaFutura: temFutura,
    jurosPor: jurosPorFinal,
    ...numeracao,
    ...updatesPagamento,
    finalizadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  }, { merge: true });

  const custoCartao = calcCustoCartao(carr.totalPedido, pagamentoFinal, carr.parcelas, jurosPorFinal, state.profile, carr.cartaoTipo, carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo).total;
  const lucroReal = carr.lucroTotal - custoCartao;

  await addDoc(col('vendas'), {
    carrinhoId: id, clienteId: carr.clienteId, clienteNome: carr.clienteNome,
    data: today(), receita: carr.totalPedido, totalPedido: carr.totalPedido,
    subtotalPedido: carr.subtotalPedido ?? carr.totalPedido,
    descontoPedidoValor: carr.descontoPedidoValor || 0,
    custoTotal: carr.custoTotal, lucroTotal: carr.lucroTotal,
    custoCartao, lucroReal,
    margem: carr.totalPedido ? ((carr.lucroTotal) / carr.totalPedido) * 100 : 0,
    margemReal: carr.totalPedido ? (lucroReal / carr.totalPedido) * 100 : 0,
    quantidade: carr.itens.reduce((s, i) => s + i.quantidade, 0),
    pagamento: pagamentoFinal,
    statusPagamento: statusFinal,
    possuiEntregaFutura: temFutura,
    criadoEm: serverTimestamp()
  });

  if (carr.clienteId) {
    await setDoc(ref('clientes', carr.clienteId), {
      ultimaCompra: today(), ultimoContato: today()
    }, { merge: true });
  }

  closeModal();
  window.App.refresh('Venda finalizada!');
}

export async function cancelarCarrinho(id) {
  if (!confirm('Cancelar este carrinho?')) return;
  await setDoc(ref('carrinhos', id), { status: 'cancelado', atualizadoEm: serverTimestamp() }, { merge: true });
  closeModal();
  window.App.refresh('Carrinho cancelado');
}

// Reverte um carrinho finalizado/parcial de volta para "aberto": devolve ao estoque qualquer
// item que já tenha sido baixado e apaga o registro de venda gerado (recriado do zero ao
// refinalizar, com números atualizados), para permitir corrigir um pedido finalizado por engano.
// O pagamento (valorPago/pagamentos) é PRESERVADO — nunca apagado — pra manter a confiabilidade
// dos relatórios e do histórico de crédito do cliente; o banner no topo do carrinho aberto avisa
// o valor já pago, e finalizarCarrinho recalcula o status contra o total atual ao refinalizar.
export async function reabrirCarrinho(id) {
  const carr = state.data.carrinhos.find(c => c.id === id);
  if (!carr) return;
  const temPagamento = Number(carr.valorPago || 0) > 0.004;
  let aviso = 'Reabrir este carrinho? Os itens já baixados voltam ao estoque e a venda registrada será removida.';
  if (temPagamento) {
    aviso += `\n\nEste pedido já tem ${money(carr.valorPago)} pago — isso é MANTIDO (não é apagado). Ao finalizar de novo, o status de pagamento é recalculado sozinho contra o total atual.`;
  }
  if (!confirm(aviso)) return;

  for (const item of carr.itens || []) {
    if (item.baixouEstoque) {
      try {
        await entradaEstoque(item.produtoId, item.quantidade, item.custoMedioUsado || 0, 'Ajuste', 'reabertura');
      } catch (e) { toast(`Erro ao devolver estoque de ${item.produtoNome}: ${e.message}`); }
      item.baixouEstoque = false;
      item.entregue = false;
      delete item.dataEntrega;
    }
  }

  const vendasDoCarrinho = state.data.vendas.filter(v => v.carrinhoId === id);
  for (const v of vendasDoCarrinho) await deleteDoc(ref('vendas', v.id));

  await setDoc(ref('carrinhos', id), {
    status: 'aberto', itens: carr.itens, possuiEntregaFutura: false,
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  window.App.refresh(temPagamento ? `Carrinho reaberto — pagamento de ${money(carr.valorPago)} preservado` : 'Carrinho reaberto');
}

export async function excluirCarrinho(id) {
  if (!confirm('Excluir este carrinho definitivamente? Esta ação não pode ser desfeita.')) return;
  await deleteDoc(ref('carrinhos', id));
  window.App.refresh('Carrinho excluído');
}

export async function marcarItemEntregue(carrinhoId, idx) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const item = carr.itens[idx];
  if (!item || item.tipoEntrega !== 'entrega_futura' || item.entregue) return;

  try {
    await saidaEstoque(item.produtoId, item.quantidade, item.motivo || 'Venda', carrinhoId, item.totalItem);
  } catch (e) {
    return toast(`Estoque insuficiente para ${item.produtoNome}`);
  }

  item.entregue = true;
  item.baixouEstoque = true;
  item.dataEntrega = today();

  const todosEntregues = carr.itens.every(i => i.tipoEntrega !== 'entrega_futura' || i.entregue);

  await setDoc(ref('carrinhos', carrinhoId), {
    itens: carr.itens,
    status: todosEntregues ? 'entregue' : carr.status,
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  window.App.refresh(todosEntregues ? 'Pedido totalmente entregue!' : 'Item marcado como entregue');
}

export function enviarResumoWhatsApp(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const cli = cliById(carr.clienteId);
  if (!cli?.whatsapp) return toast('Cliente sem WhatsApp');
  window.App.sendWhatsApp('resumoPedido', { nome: cli.apelido || carr.clienteNome, telefone: cli.whatsapp, carrinho: carr });
}

// Envia o link de pagamento configurado em Minha Conta → Pagamento, junto do valor que falta
// receber (ou o total, se ainda nada foi pago) — só aparece quando a consultora cadastrou um link.
export function enviarLinkPagamento(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  const link = state.profile?.linkPagamento;
  if (!link) return toast('Cadastre um link de pagamento em Minha Conta → Pagamento primeiro.');
  const cli = cliById(carr.clienteId);
  if (!cli?.whatsapp) return toast('Cliente sem WhatsApp');
  const valor = Math.max(0, Number(carr.totalPedido || 0) - Number(carr.valorPago || 0));
  window.App.sendWhatsApp('linkPagamento', { nome: cli.apelido || carr.clienteNome, telefone: cli.whatsapp, link, valor });
}

export function openCarrinhoDoCliente(clienteId) {
  const aberto = state.data.carrinhos.find(c => c.clienteId === clienteId && c.status === 'aberto');
  if (aberto) openCarrinho(aberto.id);
}

export async function marcarRetornoFeito(id) {
  await setDoc(ref('carrinhos', id), { retornoFeito: true, atualizadoEm: serverTimestamp() }, { merge: true });
  window.App.refresh('Retorno marcado como feito');
}
