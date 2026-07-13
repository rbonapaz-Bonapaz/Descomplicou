import { state, salesAgg, salesAggAnterior, salesTrend, variacao, stockAgg, agendaAgg, lastBuy, diasContatoFrio } from './state.js';
import { $, esc, money, daysSince, pill, normStatusPag, inPeriod, lineChartSvg, thSort, norm } from './utils.js';
import { recommendations } from './dashboard.js';

// Badge de variação % ao lado de um indicador, comparado com o período anterior equivalente.
function variacaoBadge(atual, anterior) {
  const v = variacao(atual, anterior);
  if (v == null) return '';
  const cor = v > 0 ? 'green' : v < 0 ? 'red' : 'gray';
  const seta = v > 0 ? '▲' : v < 0 ? '▼' : '—';
  return ` <span class="tag ${cor}" style="font-size:10px;padding:2px 6px">${seta} ${Math.abs(v).toFixed(0)}%</span>`;
}

function chips(tipo, vals) {
  return `<div class="chips">${vals.map(v =>
    `<button class="chip ${state.filters[tipo] === v[0] ? 'active' : ''}" onclick="App.setFilter('${tipo}','${v[0]}')">${v[1]}</button>`
  ).join('')}</div>`;
}

// Lista compacta "top 5" recolhível: título com o #1 em destaque + <details> com o restante do ranking.
function rankList(titulo, arr, valFn) {
  if (!arr.length) return `<div class="list-item"><div><b>${titulo}</b><small>-</small></div><span class="tag gray">-</span></div>`;
  const [primeiro, ...resto] = arr;
  return `<details class="rank-list">
    <summary><b>${titulo}</b><small>${esc(primeiro.nome)}</small><span class="tag green">${valFn(primeiro)}</span></summary>
    ${resto.length ? `<ol>${resto.map(x => `<li>${esc(x.nome)}<span>${valFn(x)}</span></li>`).join('')}</ol>` : ''}
  </details>`;
}

export function renderRelatorios() {
  const d = state.filters.rel;
  const r = salesAgg(d), s = stockAgg(), ag = agendaAgg(d);

  const pedidosPgtoPendente = state.data.carrinhos.filter(c =>
    (c.status === 'finalizado' || c.status === 'parcial' || c.status === 'entregue') &&
    (normStatusPag(c.statusPagamento) === 'pendente' || normStatusPag(c.statusPagamento) === 'parcial')
  );

  const clientesSemCompra = state.data.clientes.filter(c => !lastBuy(c));
  const clientesFrios = state.data.clientes.filter(c => daysSince(lastBuy(c) || c.ultimoContato) >= diasContatoFrio());

  // Novas clientes no período, por canal de origem (evento, indicação, Instagram etc.) — mostra
  // onde vale mais a pena investir tempo/dinheiro captando gente nova.
  const clientesNoPeriodo = state.data.clientes.filter(c => {
    const iso = c.criadoEm?.toDate ? c.criadoEm.toDate().toISOString().slice(0, 10) : null;
    return iso && inPeriod(iso, d);
  });
  const origemCounts = {};
  clientesNoPeriodo.forEach(c => {
    const o = c.origem || 'Não informado';
    origemCounts[o] = (origemCounts[o] || 0) + 1;
  });
  const totalNovas = clientesNoPeriodo.length;
  const origemList = Object.entries(origemCounts).sort((a, b) => b[1] - a[1]);
  const pctOrigem = n => totalNovas ? ((n / totalNovas) * 100).toFixed(0) : 0;

  const allCli = Object.values(r.cli).sort((a, b) => b.rec - a.rec);
  const vipThreshold = allCli.length >= 10 ? allCli[Math.floor(allCli.length * 0.1)]?.rec || 0 : 0;
  const vips = allCli.filter(c => c.rec >= vipThreshold && vipThreshold > 0);

  const prodPorEstoque = state.data.produtos.filter(p => Number(p.estoqueAtual || 0) > 0)
    .map(p => ({ nome: p.nome, valor: Number(p.estoqueAtual || 0) * Number(p.custoMedio || 0) }))
    .sort((a, b) => b.valor - a.valor).slice(0, 5);

  const trocas = state.data.trocas || [];
  const tr = {
    total: trocas.length,
    pendentes: trocas.filter(t => t.status === 'aberta' || t.status === 'parcial').length,
    finalizadas: trocas.filter(t => t.status === 'finalizada').length,
    itensSaida: trocas.reduce((s, t) => s + (t.itensSaida || []).length, 0),
    itensEntrada: trocas.reduce((s, t) => s + (t.itensEntrada || []).length, 0),
    valorSaida: trocas.reduce((s, t) => s + Number(t.valorSaida || 0), 0),
    valorEntrada: trocas.reduce((s, t) => s + Number(t.valorEntrada || 0), 0)
  };

  // Consolidado de lucro líquido: lucro real das vendas (já descontada a taxa de cartão) menos o
  // custo de saídas de estoque que não são venda (brinde/parceria/consumo próprio/perda/ajuste) —
  // itens que saem do estoque sem gerar receita. Trocas ficam de fora: é troca de produto por
  // produto, não dinheiro, então não entra na conta de lucro líquido em R$.
  const custoSaidasNaoVenda = (state.data.movimentacoesEstoque || [])
    .filter(m => m.tipo === 'saida' && !m.geraLucro && !String(m.motivo || '').startsWith('Troca') && inPeriod(m.data, d))
    .reduce((s, m) => s + Number(m.valorFinanceiro || 0), 0);
  const lucroLiquido = r.lucReal - custoSaidasNaoVenda;

  // Saídas de estoque que não são venda, agrupadas por motivo (Brinde, Parceria, Consumo próprio,
  // Perda, Ajuste) — trocas ficam de fora daqui porque já têm o próprio painel "Trocas" acima.
  const saidasPorMotivo = {};
  (state.data.movimentacoesEstoque || [])
    .filter(m => m.tipo === 'saida' && !m.geraLucro && !String(m.motivo || '').startsWith('Troca') && inPeriod(m.data, d))
    .forEach(m => {
      const k = m.motivo || 'Outro';
      saidasPorMotivo[k] = saidasPorMotivo[k] || { qtd: 0, valor: 0 };
      saidasPorMotivo[k].qtd += Number(m.quantidade || 0);
      saidasPorMotivo[k].valor += Number(m.valorFinanceiro || 0);
    });
  const saidasList = Object.entries(saidasPorMotivo).sort((a, b) => b[1].valor - a[1].valor);

  // Relatório completo por produto (não só top 5): todos os produtos com venda no período,
  // ordenável por qualquer coluna clicando no cabeçalho.
  const produtosVendidos = Object.values(r.prod).map(x => ({ ...x, precoMedio: x.q ? x.rec / x.q : 0 }));
  const relProdSort = state.filters.relProdSort || '';
  const [rpField, rpDir] = relProdSort.split('_');
  const rpMul = rpDir === 'desc' ? -1 : 1;
  const rpVal = x => rpField === 'q' ? x.q : rpField === 'rec' ? x.rec : rpField === 'luc' ? x.luc : rpField === 'precoMedio' ? x.precoMedio : norm(x.nome);
  if (rpField) produtosVendidos.sort((a, b) => { const va = rpVal(a), vb = rpVal(b); return va < vb ? -1 * rpMul : va > vb ? 1 * rpMul : 0; });
  else produtosVendidos.sort((a, b) => b.q - a.q);

  const anterior = salesAggAnterior(d);
  const trend = salesTrend(d);

  $('relatorios').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Período dos relatórios</h3></div>
      ${chips('rel', [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Tudo']])}
    </div>

    <div class="panel">
      <h3>Lucro líquido consolidado</h3>
      <p class="muted">Lucro real das vendas, já descontando taxa de cartão e o custo de brindes/parcerias/consumo/perdas — o número mais próximo do que realmente sobra no bolso.</p>
      <div class="pedido-totais" style="width:100%;margin:10px 0 0">
        <div class="pedido-total-line"><span>Lucro real das vendas</span><b>${money(r.lucReal)}</b></div>
        <div class="pedido-total-line"><span>Custo de brindes/perdas/consumo</span><b style="color:var(--error)">- ${money(custoSaidasNaoVenda)}</b></div>
        <div class="pedido-total-line" style="font-size:11pt;border-top:1px solid var(--line);padding-top:6px;margin-top:4px"><span><b>Lucro líquido</b></span><b>${money(lucroLiquido)}</b></div>
      </div>
      ${tr.total ? `<p class="muted" style="margin-top:10px">🔁 Trocas no total: diferença de valor de ${money(tr.valorEntrada - tr.valorSaida)} (produto por produto, não soma ao lucro líquido em R$).</p>` : ''}
    </div>

    <div class="panel">
      <h3>Tendência de faturamento</h3>
      <p class="muted">Faturamento por dia${d === 'all' || Number(d) > 30 ? ' (últimos 30 dias)' : ''}.</p>
      ${lineChartSvg(trend)}
    </div>

    <div class="cards">
      <div class="card clickable" onclick="App.goto('vendas')"><span>Faturamento</span><b>${money(r.fat)}${anterior ? variacaoBadge(r.fat, anterior.fat) : ''}</b></div>
      <div class="card clickable" onclick="App.goto('vendas')"><span>Lucro bruto</span><b>${money(r.luc)}</b></div>
      <div class="card clickable" onclick="App.goto('vendas')"><span>Lucro real (após taxas de cartão)</span><b>${money(r.lucReal)}${anterior ? variacaoBadge(r.lucReal, anterior.lucReal) : ''}</b></div>
      <div class="card clickable" onclick="App.goto('perfil');App.setSection('perfil','pagamento')"><span>Custo de cartão/maquininha</span><b>${money(r.custoCartaoTotal)}</b></div>
      <div class="card clickable" onclick="App.goto('estoque')"><span>Custo produtos vendidos</span><b>${money(r.custo)}</b></div>
      <div class="card clickable" onclick="App.goto('vendas')"><span>Margem real</span><b>${r.margemReal.toFixed(1)}%</b></div>
      <div class="card clickable" onclick="App.goto('vendas')"><span>Ticket médio</span><b>${money(r.ticket)}</b></div>
      <div class="card clickable" onclick="App.goto('relatorios');document.getElementById('relPorProduto')?.scrollIntoView({behavior:'smooth'})"><span>Unidades vendidas</span><b>${r.itens}</b></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Novas clientes por origem</h3></div>
      <p class="muted">De onde vieram as clientes cadastradas no período — ajuda a saber onde vale mais investir tempo captando gente nova.</p>
      ${totalNovas ? `<div class="list" style="margin-top:8px">${origemList.map(([o, n]) => `
        <div class="list-item clickable" onclick="App.goto('clientes')">
          <div><b>${esc(o)}</b>${o === 'Evento' ? '<small>Cadastradas pela lista de desejos de eventos</small>' : ''}</div>
          <span class="tag ${o === 'Evento' ? 'green' : 'blue'}">${n} (${pctOrigem(n)}%)</span>
        </div>`).join('')}</div>` : '<p class="muted" style="margin-top:8px">Nenhuma cliente nova nesse período.</p>'}
    </div>

    <div class="report-grid">
      <div class="panel">
        <h3>Produtos</h3>
        <div class="list">
          ${rankList('Mais vendido', r.top5Vend, x => x.q + ' un.')}
          ${rankList('Mais lucrativo', r.top5LucProd, x => money(x.luc))}
          ${rankList('Maior faturamento', r.top5FatProd, x => money(x.rec))}
          ${rankList('Maior valor em estoque', prodPorEstoque, x => money(x.valor))}
          <div class="list-item clickable" onclick="App.goto('estoque');App.setFilter('estoque','baixo')"><div><b>Estoque baixo</b><small>Produtos para repor</small></div><span class="tag orange">${s.baixo.length}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque');App.setFilter('estoque','parados')"><div><b>Parados (90+ dias)</b><small>Sem venda</small></div><span class="tag pink">${s.parados.length}</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Estoque</h3>
        <div class="list">
          <div class="list-item clickable" onclick="App.goto('estoque')"><div><b>Valor investido</b><small>${s.un} unidades em estoque</small></div><span class="tag blue">${money(s.invest)}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque')"><div><b>Lucro potencial</b><small>Se vender pelo preço atual</small></div><span class="tag green">${money(s.pot)} (${s.invest ? (s.pot / s.invest * 100).toFixed(0) : 0}%)</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque')"><div><b>Saúde do estoque</b><small>Baixo, parado e sem custo</small></div><span class="tag ${s.saude === 'Boa' ? 'green' : 'orange'}">${s.saude}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque');App.setFilter('estoque','semcusto')"><div><b>Sem custo médio</b><small>Corrigir antes de vender</small></div><span class="tag orange">${s.sem.length}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque');App.setFilter('estoque','baixo')"><div><b>Sugestões de reposição</b><small>Produtos abaixo do mínimo</small></div><span class="tag orange">${s.baixo.length}</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Clientes</h3>
        <div class="list">
          ${rankList('Mais assídua', r.top5CliFreq, x => x.q + ' compras')}
          ${rankList('Mais lucrativa', r.top5CliLuc, x => money(x.luc))}
          ${rankList('Maior faturamento', r.top5CliRec, x => money(x.rec))}
          <div class="list-item clickable" onclick="App.goto('clientes')"><div><b>Clientes VIP</b><small>Top 10% por faturamento</small></div><span class="tag green">${vips.length}</span></div>
          <div class="list-item clickable" onclick="App.goto('clientes')"><div><b>Clientes frios</b><small>${diasContatoFrio()}+ dias sem contato</small></div><span class="tag orange">${clientesFrios.length}</span></div>
          <div class="list-item clickable" onclick="App.goto('clientes')"><div><b>Sem compra</b><small>Nunca compraram</small></div><span class="tag pink">${clientesSemCompra.length}</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Agenda</h3>
        <div class="list">
          <div class="list-item clickable" onclick="App.goto('agenda')"><div><b>Agendamentos</b><small>No período</small></div><span class="tag blue">${ag.total}</span></div>
          <div class="list-item clickable" onclick="App.goto('agenda')"><div><b>Realizados</b><small>Concluídos</small></div><span class="tag green">${ag.realizados}</span></div>
          <div class="list-item clickable" onclick="App.goto('agenda')"><div><b>Pendentes</b><small>Não concluídos</small></div><span class="tag orange">${ag.pendentes}</span></div>
          <div class="list-item clickable" onclick="App.goto('agenda')"><div><b>Cancelados</b></div><span class="tag pink">${ag.cancelados}</span></div>
          <div class="list-item"><div><b>Taxa comparecimento</b></div><span class="tag blue">${ag.taxaComparecimento.toFixed(0)}%</span></div>
          <div class="list-item"><div><b>Conversão em venda</b></div><span class="tag green">${ag.conversaoVenda.toFixed(0)}%</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Pagamentos</h3>
        <div class="list">
          ${Object.entries(r.pay).map(([k, v]) => `<div class="list-item clickable" onclick="App.goto('vendas')"><div><b>${esc(k)}</b></div><span class="tag blue">${money(v)}</span></div>`).join('') || '<p class="muted">Sem vendas no período.</p>'}
          ${pedidosPgtoPendente.length ? `<div class="list-item clickable" onclick="App.goto('vendas')"><div><b>Pedidos com pgto pendente</b></div><span class="tag orange">${pedidosPgtoPendente.length}</span></div>` : ''}
        </div>
      </div>

      <div class="panel">
        <h3>Trocas</h3>
        <div class="list">
          <div class="list-item clickable" onclick="App.goto('estoque');App.setSection('estoque','trocas')"><div><b>Total de trocas</b></div><span class="tag blue">${tr.total}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque');App.setSection('estoque','trocas')"><div><b>Em andamento / pendentes</b></div><span class="tag orange">${tr.pendentes}</span></div>
          <div class="list-item clickable" onclick="App.goto('estoque');App.setSection('estoque','trocas')"><div><b>Finalizadas</b></div><span class="tag green">${tr.finalizadas}</span></div>
          <div class="list-item"><div><b>Valor total saído</b><small>${tr.itensSaida} item(ns)</small></div><span class="tag pink">${money(tr.valorSaida)}</span></div>
          <div class="list-item"><div><b>Valor total recebido</b><small>${tr.itensEntrada} item(ns)</small></div><span class="tag green">${money(tr.valorEntrada)}</span></div>
          <div class="list-item"><div><b>Diferença</b><small>Recebido - saído</small></div><span class="tag ${tr.valorEntrada - tr.valorSaida >= 0 ? 'green' : 'pink'}">${money(tr.valorEntrada - tr.valorSaida)}</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Saídas de estoque (sem venda)</h3>
        <p class="muted" style="margin:0 0 8px">Brinde, parceria, consumo próprio, perda e ajuste — o que sai do estoque sem virar receita.</p>
        <div class="list">
          ${saidasList.length ? saidasList.map(([motivo, x]) => `<div class="list-item clickable" onclick="App.goto('estoque')"><div><b>${esc(motivo)}</b><small>${x.qtd} un.</small></div><span class="tag orange">${money(x.valor)}</span></div>`).join('') : '<p class="muted">Nenhuma saída sem venda nesse período.</p>'}
        </div>
      </div>

      <div class="panel">
        <h3>Recomendações automáticas</h3>
        <div class="list">${recommendations().join('') || '<p class="muted">Nenhuma recomendação crítica.</p>'}</div>
      </div>
    </div>

    <div class="panel" id="relPorProduto">
      <h3>Relatório completo por produto</h3>
      <p class="muted">Todos os produtos vendidos no período — clique no cabeçalho pra ordenar.</p>
      ${produtosVendidos.length ? `<div class="table"><table><thead><tr>
        ${thSort('Produto', 'nome', relProdSort, 'relProdSort')}
        ${thSort('Qtd vendida', 'q', relProdSort, 'relProdSort')}
        ${thSort('Preço médio', 'precoMedio', relProdSort, 'relProdSort')}
        ${thSort('Faturamento', 'rec', relProdSort, 'relProdSort')}
        ${thSort('Lucro', 'luc', relProdSort, 'relProdSort')}
      </tr></thead><tbody>${produtosVendidos.map(x => `<tr>
        <td data-label="Produto">${esc(x.nome)}</td>
        <td data-label="Qtd vendida">${x.q}</td>
        <td data-label="Preço médio">${money(x.precoMedio)}</td>
        <td data-label="Faturamento">${money(x.rec)}</td>
        <td data-label="Lucro">${money(x.luc)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum produto vendido nesse período.</p>'}
    </div>`;
}
