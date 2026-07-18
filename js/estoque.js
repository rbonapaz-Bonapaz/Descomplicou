import { state, SECTIONS, col, ref, db, prodById, showModal, closeModal, toast,
  runTransaction, serverTimestamp, doc, stockAgg, writeBatch, reservadoEmAberto, setDoc } from './state.js';
import { $, esc, money, parseMoney, today, norm, pill, sortWrapped, withFocusPreserved, sortBarHtml, sectionTabsHtml, searchPickerHtml, toggleHtml, toggleBareHtml, linhasDe, labelLinha, formatDateBR, porNome } from './utils.js';
import { trocasTabHtml } from './trocas.js';
import { preEncomendaTabHtml, btnAdicionarPreEncomenda } from './preencomenda.js';

const MOTIVOS_SAIDA = ['Brinde', 'Mostruário', 'Parceria', 'Consumo próprio', 'Troca', 'Perda', 'Ajuste'];
// Motivos em que faz sentido perguntar "para quem"/"onde ficou" o produto — pra depois dar pra
// consultora consultar quem recebeu cada brinde ou pra quem foi o mostruário, e não só o motivo genérico.
const MOTIVOS_COM_DESTINO = ['Brinde', 'Mostruário', 'Consumo próprio'];

// Liga/desliga "produto de pronta entrega" sozinho conforme o estoque fica positivo/zera — a menos
// que a consultora tenha definido manualmente "sem pronta entrega" (produtoProntaEntrega: false +
// prontaEntregaManual: true), caso em que a entrada de estoque respeita a escolha dela e não mexe
// (quem quiser ativar de volta faz isso explicitamente, ou passa pelo fluxo de pré-encomenda que
// pergunta antes). Zerar o estoque sempre desativa, independente de flag manual — não dá pra vender
// "pronta entrega" o que não existe mais fisicamente.
function updateProntaEntregaAuto(tx, pr, p, novoEstoque) {
  if (novoEstoque > 0 && p.produtoProntaEntrega !== true && !(p.prontaEntregaManual && p.produtoProntaEntrega === false)) {
    tx.update(pr, { produtoProntaEntrega: true });
  } else if (novoEstoque <= 0 && p.produtoProntaEntrega === true) {
    tx.update(pr, { produtoProntaEntrega: false });
  }
}

export async function entradaEstoque(produtoId, qtd, custo, motivo, origem = 'manual') {
  let novoEstoque = 0, novoCustoMedio = 0, novaProntaEntrega;
  await runTransaction(db, async tx => {
    const pr = ref('produtos', produtoId);
    const s = await tx.get(pr);
    if (!s.exists()) throw Error('Produto não encontrado');
    const p = s.data(), e = Number(p.estoqueAtual || 0), cm = Number(p.custoMedio || 0);
    const q = Number(qtd), c = Number(custo);
    const novo = e + q;
    const novoCM = novo > 0 ? ((e * cm) + (q * c)) / novo : 0;
    tx.update(pr, { estoqueAtual: novo, custoMedio: novoCM, ultimaEntrada: today() });
    updateProntaEntregaAuto(tx, pr, p, novo);
    if (novo > 0 && p.produtoProntaEntrega !== true && !(p.prontaEntregaManual && p.produtoProntaEntrega === false)) novaProntaEntrega = true;
    else if (novo <= 0 && p.produtoProntaEntrega === true) novaProntaEntrega = false;
    tx.set(doc(col('movimentacoesEstoque')), {
      produtoId, produtoNome: p.nome, tipo: 'entrada', motivo, origem,
      quantidade: q, estoqueAntes: e, estoqueDepois: novo,
      custoUnitario: c, custoMedioAntes: cm, custoMedioDepois: novoCM,
      valorFinanceiro: q * c, data: today(), criadoEm: serverTimestamp()
    });
    novoEstoque = novo;
    novoCustoMedio = novoCM;
  });
  // runTransaction, diferente de setDoc/addDoc, NÃO atualiza o cache local do Firestore na hora —
  // só quando o servidor confirma e o onSnapshot devolve a resposta, o que pode demorar um instante.
  // Sem este patch manual, uma tela que renderiza logo em seguida (ex: Pré-encomenda mostrando
  // "Estoque atual") ainda via o valor antigo até a próxima sincronização chegar, dando a falsa
  // impressão de que a atualização em tempo real tinha sido desativada.
  const idx = state.data.produtos.findIndex(x => x.id === produtoId);
  if (idx !== -1) {
    state.data.produtos[idx] = {
      ...state.data.produtos[idx], estoqueAtual: novoEstoque, custoMedio: novoCustoMedio, ultimaEntrada: today(),
      ...(novaProntaEntrega !== undefined ? { produtoProntaEntrega: novaProntaEntrega } : {})
    };
  }
  await converterEntregaFuturaAutomatico(produtoId, novoEstoque);
}

// Quando chega estoque novo, converte sozinho os itens "entrega futura" pendentes desse produto
// (em carrinhos e trocas abertos, mais antigos primeiro) — até onde o estoque novo der conta,
// descontando o que outros carrinhos/trocas já reservaram como pronta entrega. Carrinho ainda
// "aberto" só troca o tipo (a baixa acontece normalmente ao finalizar); carrinho já finalizado ou
// item de troca já entrega/dá baixa de verdade agora, na hora.
async function converterEntregaFuturaAutomatico(produtoId, novoEstoque) {
  let disponivel = novoEstoque - reservadoEmAberto(produtoId);
  if (disponivel <= 0) return;

  const candidatos = [];
  state.data.carrinhos.forEach(c => {
    if (!['aberto', 'parcial', 'finalizado'].includes(c.status)) return;
    (c.itens || []).forEach((item, idx) => {
      if (item.produtoId === produtoId && item.tipoEntrega === 'entrega_futura' && !item.entregue) {
        candidatos.push({ tipo: 'carrinho', carr: c, item, idx, data: c.criadoEm });
      }
    });
  });
  state.data.trocas.forEach(t => {
    if (t.status !== 'aberta' && t.status !== 'parcial') return;
    (t.itensSaida || []).forEach((item, idx) => {
      if (item.produtoId === produtoId && item.tipoEntrega === 'entrega_futura' && !item.processado) {
        candidatos.push({ tipo: 'troca', troca: t, item, idx, data: t.criadoEm });
      }
    });
  });
  candidatos.sort((a, b) => (a.data?.toMillis?.() || 0) - (b.data?.toMillis?.() || 0));

  for (const c of candidatos) {
    if (disponivel < Number(c.item.quantidade || 0)) break;

    if (c.tipo === 'carrinho') {
      const { carr, item, idx } = c;
      const novosItens = [...carr.itens];
      if (carr.status === 'aberto') {
        novosItens[idx] = { ...item, tipoEntrega: 'pronta_entrega' };
        await setDoc(ref('carrinhos', carr.id), {
          itens: novosItens, possuiEntregaFutura: novosItens.some(i => i.tipoEntrega === 'entrega_futura'),
          atualizadoEm: serverTimestamp()
        }, { merge: true });
      } else {
        try {
          await saidaEstoque(produtoId, item.quantidade, item.motivo || 'Venda', carr.id, item.totalItem);
        } catch (e) { continue; }
        novosItens[idx] = { ...item, tipoEntrega: 'pronta_entrega', entregue: true, baixouEstoque: true, dataEntrega: today() };
        const todosEntregues = novosItens.every(i => i.tipoEntrega !== 'entrega_futura' || i.entregue);
        await setDoc(ref('carrinhos', carr.id), {
          itens: novosItens, status: todosEntregues ? 'entregue' : carr.status, atualizadoEm: serverTimestamp()
        }, { merge: true });
      }
    } else {
      const { troca, item, idx } = c;
      try {
        await saidaEstoque(produtoId, item.quantidade, troca.parceira ? `Troca (${troca.parceira})` : 'Troca');
      } catch (e) { continue; }
      const novosSaida = [...(troca.itensSaida || [])];
      novosSaida[idx] = { ...item, processado: true };
      const tudoProcessado = [...novosSaida, ...(troca.itensEntrada || [])].every(i => i.tipoEntrega !== 'entrega_futura' || i.processado);
      await setDoc(ref('trocas', troca.id), {
        itensSaida: novosSaida, status: tudoProcessado ? 'finalizada' : 'parcial', atualizadoEm: serverTimestamp()
      }, { merge: true });
    }

    disponivel -= Number(c.item.quantidade || 0);
  }
}

export async function saidaEstoque(produtoId, qtd, motivo = 'Venda', vendaId = '', receita = 0, destinatario = '') {
  const geraLucro = motivo === 'Venda';
  let novoEstoque = 0, novaProntaEntrega;
  await runTransaction(db, async tx => {
    const pr = ref('produtos', produtoId);
    const s = await tx.get(pr);
    const p = s.data(), e = Number(p.estoqueAtual || 0), q = Number(qtd);
    if (e < q) throw Error('Estoque insuficiente');
    const c = Number(p.custoMedio || 0), novo = e - q;
    tx.update(pr, { estoqueAtual: novo, ultimaSaida: today() });
    updateProntaEntregaAuto(tx, pr, p, novo);
    if (novo > 0 && p.produtoProntaEntrega !== true && !(p.prontaEntregaManual && p.produtoProntaEntrega === false)) novaProntaEntrega = true;
    else if (novo <= 0 && p.produtoProntaEntrega === true) novaProntaEntrega = false;
    tx.set(doc(col('movimentacoesEstoque')), {
      produtoId, produtoNome: p.nome, tipo: 'saida', motivo,
      quantidade: q, estoqueAntes: e, estoqueDepois: novo,
      custoUnitario: c, valorFinanceiro: q * c, receita,
      vendaId, geraLucro, destinatario: destinatario || '', data: today(), criadoEm: serverTimestamp()
    });
    novoEstoque = novo;
  });
  // Mesmo patch manual de entradaEstoque (ver comentário lá) — runTransaction não atualiza o cache
  // local na hora, então sem isso a tela seguinte podia mostrar o estoque antigo por um instante.
  const idx = state.data.produtos.findIndex(x => x.id === produtoId);
  if (idx !== -1) {
    state.data.produtos[idx] = {
      ...state.data.produtos[idx], estoqueAtual: novoEstoque, ultimaSaida: today(),
      ...(novaProntaEntrega !== undefined ? { produtoProntaEntrega: novaProntaEntrega } : {})
    };
  }
}

// Fluxo interativo (1 produto por vez): quando a consultora tinha desativado manualmente a pronta
// entrega e o estoque está prestes a ficar positivo, pergunta antes de reativar — em vez de reverter
// a escolha dela sem avisar (entradaEstoque sozinho não mexe nesse caso, só pergunta quem chama isto).
export async function perguntarAtivarProntaEntrega(produtoId) {
  const p = prodById(produtoId);
  if (p && p.prontaEntregaManual && p.produtoProntaEntrega === false) {
    if (confirm(`"${p.nome}" está marcado manualmente como "sem pronta entrega". Ativar pronta entrega agora que vai chegar estoque?`)) {
      await setDoc(ref('produtos', p.id), { prontaEntregaManual: false }, { merge: true });
    }
  }
}

function chips(tipo, vals) {
  return `<div class="chips">${vals.map(v =>
    `<button class="chip ${state.filters[tipo] === v[0] ? 'active' : ''}" onclick="App.setFilter('${tipo}','${v[0]}')">${v[1]}</button>`
  ).join('')}</div>`;
}

// Pílula de status do item (separada dos botões: no cartão mobile fica numa linha própria, pra a
// grade de ações não a esticar pra largura de botão).
function stockStatusHtml(x) {
  return pill(x.semCusto ? 'Sem custo' : x.baixo ? 'Baixo' : 'OK',
    x.semCusto || x.baixo ? 'red' : 'green',
    x.semCusto ? 'Produto sem custo médio cadastrado — o lucro dele não entra certo nos relatórios' : x.baixo ? 'Estoque abaixo do mínimo configurado pra esse produto' : 'Estoque normal, acima do mínimo');
}

// Botões de ação do item de estoque (só botões, sem pílula) — vão na grade .vcard-actions no mobile.
function stockBotoesHtml(x) {
  return `
    ${btnAdicionarPreEncomenda(x.p.id)}
    <button class="btn small" onclick="App.openProdutoForm('${x.p.id}')" title="Editar">✏️</button>
    <button class="btn small" style="color:var(--error)" onclick="App.excluirProduto('${x.p.id}')" title="Excluir">🗑️</button>`;
}

// Desktop (.data-card): pílula e botões juntos, como no design original.
function stockAcoesHtml(x) {
  return `${stockStatusHtml(x)}${stockBotoesHtml(x)}`;
}

function stockCard(x) {
  return `<div class="data-card only-desktop">
    <img src="${esc(x.p.imagem || '')}" onerror="this.style.visibility='hidden'">
    <div><b class="cli-link" onclick="App.openProdutoForm('${x.p.id}')">${esc(x.p.nome)}</b>
      <div class="prod-tags"><span class="prod-tag">Código <b>${esc(x.p.codigoFarmasi || '-')}</b></span><span class="prod-tag">Linha <b>${esc(x.p.linha || '-')}</b></span></div>
    </div>
    <div class="metric"><small>Qtd</small><b>${x.est}</b>${reservadoEmAberto(x.p.id) > 0 ? `<br><span class="tag red" style="font-size:10px;padding:2px 6px" title="Reservado em carrinhos/trocas abertos">🛒 ${reservadoEmAberto(x.p.id)} reservado</span>` : ''}</div>
    <div class="metric"><small>Custo médio</small><b>${money(x.custo)}</b></div>
    <div class="metric"><small>Investido</small><b>${money(x.investido)}</b></div>
    <div class="metric"><small>${x.margem >= 0 ? 'Lucro potencial' : 'Prejuízo potencial'}</small><b style="color:${x.margem >= 0 ? 'var(--success)' : 'var(--error)'}">${money(x.lucroPot)} <span style="font-size:11px;font-weight:700">(${x.margem >= 0 ? '+' : '-'}${Math.abs(x.margem).toFixed(0)}%)</span></b></div>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${stockAcoesHtml(x)}</div>
  </div>
  <div class="vcard only-mobile">
    <div class="vcard-top" style="align-items:flex-start">
      <img src="${esc(x.p.imagem || '')}" onerror="this.style.visibility='hidden'" style="width:52px;height:52px;object-fit:contain;border-radius:12px;background:#fff;box-shadow:var(--ring);flex:0 0 auto">
      <div style="flex:1 1 auto;min-width:0">
        <div class="cli-link" style="font-size:17px;font-weight:800;overflow-wrap:break-word" onclick="App.openProdutoForm('${x.p.id}')">${esc(x.p.nome)}</div>
        <div class="prod-tags" style="margin-top:4px">
          <span class="prod-tag">Código <b>${esc(x.p.codigoFarmasi || '-')}</b></span>
          <span class="prod-tag">Linha <b>${esc(x.p.linha || '-')}</b></span>
        </div>
      </div>
    </div>
    <div class="vcard-rows">
      <div class="vcard-row"><span>Qtd</span><b>${x.est}${reservadoEmAberto(x.p.id) > 0 ? ` <span class="tag red" style="font-size:10px;padding:2px 6px" title="Reservado em carrinhos/trocas abertos">🛒 ${reservadoEmAberto(x.p.id)}</span>` : ''}</b></div>
      <div class="vcard-row"><span>Custo médio</span><b>${money(x.custo)}</b></div>
      <div class="vcard-row"><span>Investido</span><b>${money(x.investido)}</b></div>
      <div class="vcard-row"><span>${x.margem >= 0 ? 'Lucro potencial' : 'Prejuízo potencial'}</span><b style="color:${x.margem >= 0 ? 'var(--success)' : 'var(--error)'}">${money(x.lucroPot)} <span style="font-size:11px;font-weight:700">(${x.margem >= 0 ? '+' : '-'}${Math.abs(x.margem).toFixed(0)}%)</span></b></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${stockStatusHtml(x)}</div>
    <div class="vcard-actions">${stockBotoesHtml(x)}</div>
  </div>`;
}

// A busca principal do Estoque (qestoque) e a busca da Pré-encomenda (qPreEnc) convivem na mesma
// função de render, em abas diferentes — preserva foco/cursor de qualquer uma das duas que estiver
// ativa (mesmo padrão de FOCUS_IDS_PRODUTOS em produtos.js, que resolve o mesmo problema lá).
const FOCUS_IDS_ESTOQUE = ['qestoque', 'qPreEnc', 'qSemLucro'];
export function renderEstoque() {
  const idAtivo = FOCUS_IDS_ESTOQUE.find(id => document.activeElement?.id === id);
  const elAtivo = idAtivo ? document.getElementById(idAtivo) : null;
  const cursorPos = elAtivo ? elAtivo.selectionStart : null;
  renderEstoqueInner();
  if (idAtivo) {
    const el = document.getElementById(idAtivo);
    if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
  }
}

function renderEstoqueInner() {
    const s = stockAgg(), f = state.filters.estoque;
    let items = s.em;
    if (f === 'baixo') items = s.baixo;
    if (f === 'semcusto') items = s.sem;
    if (f === 'parados') items = s.parados;

    const linhaFiltro = state.filters.estoqueLinha || '';
    if (linhaFiltro) items = items.filter(x => linhasDe(x.p).includes(linhaFiltro));

    const q = norm($('qestoque')?.value || '');
    if (q) items = items.filter(x => norm(x.p.nome + ' ' + x.p.codigoFarmasi + ' ' + x.p.linha).includes(q));
    items = sortWrapped(items, state.filters.estoqueSort);

    const todasLinhas = Array.from(new Set(state.data.produtos.flatMap(linhasDe))).sort((a, b) => labelLinha(a).localeCompare(labelLinha(b), 'pt-BR'));

    const sec = state.section.estoque;
    let html = `
      <div class="cards">
        <div class="card"><span>Produtos em estoque</span><b>${s.em.length}</b></div>
        <div class="card"><span>Unidades</span><b>${s.un}</b></div>
        <div class="card"><span>Valor investido</span><b>${money(s.invest)}</b></div>
        <div class="card"><span>${s.pot >= 0 ? 'Lucro potencial' : 'Prejuízo potencial'}</span><b style="color:${s.pot >= 0 ? 'var(--success)' : 'var(--error)'}">${money(s.pot)} <span style="font-size:11px;font-weight:700">(${s.pot >= 0 ? '+' : '-'}${s.invest ? Math.abs(s.pot / s.invest * 100).toFixed(0) : 0}%)</span></b></div>
      </div>
      ${sectionTabsHtml('estoque', SECTIONS.estoque, sec)}`;

    if (sec === 'estoque') {
      html += `<div class="panel">
        <div class="panel-head">
          <h3>Visão do estoque</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn small" style="background:#EAF7EC;color:var(--success)" onclick="App.openEntradaManual()">+ Entrada</button>
            <button class="btn small pink" onclick="App.openSaidaManual()">− Saída</button>
            <button class="btn small" onclick="App.ativarProntaEntregaTodos()">✅ Ativar pronta entrega (em estoque)</button>
          </div>
        </div>
        <div class="toolbar">
          <input id="qestoque" placeholder="Buscar por nome ou código..." oninput="App.renderEstoque()" value="${esc($('qestoque')?.value || '')}">
          <select onchange="App.setFilter('estoqueLinha',this.value)" style="max-width:220px">
            <option value="">Todas as linhas</option>
            ${todasLinhas.map(l => `<option value="${esc(l)}" ${linhaFiltro === l ? 'selected' : ''}>${esc(labelLinha(l))}</option>`).join('')}
          </select>
        </div>
        ${sortBarHtml(state.filters.estoqueSort, 'estoqueSort')}
        ${chips('estoque', [['todos', 'Todos em estoque'], ['baixo', 'Estoque baixo'], ['semcusto', 'Sem custo'], ['parados', 'Parados']])}
        <div class="data-list">
          ${items.length ? items.map(x => stockCard(x)).join('') : '<p class="muted">Nenhum produto para este filtro.</p>'}
        </div>
      </div>`;
    }

    if (sec === 'semLucro') html += semLucroTabHtml();

    if (sec === 'importar') {
      html += `<div class="panel">
        <h3>Importar pedido Farmasi (PDF)</h3>
        <p class="muted">Selecione o PDF de "Detalhes do pedido" baixado do site da Farmasi. O sistema identifica os produtos do seu catálogo (por código ou nome), monta os kits automaticamente e preenche a quantidade/custo quando o valor está legível no PDF — confira tudo na tabela abaixo antes de confirmar.</p>
        <label class="btn pink">Selecionar PDF do pedido<input type="file" accept=".pdf" style="display:none" onchange="App.readPedidoPdf(this.files)"></label>
      </div>
      <div id="pedidoPreview"></div>`;
    }

    if (sec === 'trocas') html += trocasTabHtml();
    if (sec === 'preEncomenda') html += preEncomendaTabHtml();

    $('estoque').innerHTML = html;
}

// Lista de auditoria: toda saída de estoque que NÃO gera lucro (Brinde, Parceria, Consumo próprio,
// Perda, Ajuste, Troca) — pra a consultora conferir item a item se o motivo lançado em cada carrinho
// ou saída manual está certo (ex.: algo marcado "Consumo próprio" que na verdade foi uma venda).
function semLucroTabHtml() {
  const q = norm($('qSemLucro')?.value || '');
  let movs = (state.data.movimentacoesEstoque || []).filter(m => m.tipo === 'saida' && !m.geraLucro);

  const motivosPresentes = Array.from(new Set(movs.map(m => m.motivo || 'Outro'))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const motivoFiltro = state.filters.semLucroMotivo || '';
  if (motivoFiltro) movs = movs.filter(m => (m.motivo || 'Outro') === motivoFiltro);
  if (q) movs = movs.filter(m => norm((m.produtoNome || '') + ' ' + (m.destinatario || '')).includes(q));

  movs = [...movs].sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));

  const totalQtd = movs.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const totalValor = movs.reduce((s, m) => s + Number(m.valorFinanceiro || 0), 0);

  return `<div class="panel">
    <div class="panel-head"><h3>Saídas sem lucro (Brinde, Mostruário, Parceria, Consumo próprio, Perda, Ajuste, Troca)</h3></div>
    <p class="muted">Toda saída de estoque que não vem de uma venda — confira se o motivo lançado em cada uma está certo. Um item marcado errado aqui (ex.: "Consumo próprio" que era venda) infla essa lista e reduz o lucro que aparece nos relatórios. Em Brinde/Mostruário/Consumo próprio, a coluna "Para quem" mostra quem recebeu ou onde ficou o produto, quando informado.</p>
    <div class="cards">
      <div class="card"><span>Registros</span><b>${movs.length}</b></div>
      <div class="card"><span>Unidades saídas</span><b>${totalQtd}</b></div>
      <div class="card"><span>Custo envolvido</span><b>${money(totalValor)}</b></div>
    </div>
    <div class="toolbar">
      <input id="qSemLucro" placeholder="Buscar por produto ou para quem..." oninput="App.renderEstoque()" value="${esc($('qSemLucro')?.value || '')}">
    </div>
    <div class="chips">
      <button class="chip ${!motivoFiltro ? 'active' : ''}" onclick="App.setFilter('semLucroMotivo','')">Todos</button>
      ${motivosPresentes.map(m => `<button class="chip ${motivoFiltro === m ? 'active' : ''}" onclick="App.setFilter('semLucroMotivo','${esc(m)}')">${esc(m)}</button>`).join('')}
    </div>
    <div class="table-wrap only-desktop">
      <table class="table">
        <thead><tr><th>Data</th><th>Produto</th><th>Motivo</th><th>Para quem</th><th>Qtd</th><th>Custo</th><th>Origem</th></tr></thead>
        <tbody>
          ${movs.length ? movs.map(m => `<tr>
            <td>${esc(formatDateBR(m.data))}</td>
            <td>${esc(m.produtoNome || '-')}</td>
            <td>${pill(m.motivo || 'Outro', (m.motivo || '').startsWith('Troca') ? 'blue' : m.motivo === 'Brinde' ? 'pink' : m.motivo === 'Mostruário' ? 'orange' : m.motivo === 'Parceria' ? 'blue' : 'orange')}</td>
            <td>${esc(m.destinatario || '-')}</td>
            <td>${m.quantidade || 0}</td>
            <td>${Number(m.custoUnitario || 0) ? money(m.valorFinanceiro || 0) : '<span style="color:var(--error)">⚠️ sem custo</span>'}</td>
            <td>${esc(m.origem || (m.vendaId ? 'Carrinho' : 'Manual'))}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="muted">Nenhuma saída sem lucro para este filtro.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="only-mobile vcards">
      ${movs.length ? movs.map(m => `<div class="vcard">
        <div class="vcard-top">
          <span class="vcard-num">${esc(formatDateBR(m.data))}</span>
          ${pill(m.motivo || 'Outro', (m.motivo || '').startsWith('Troca') ? 'blue' : m.motivo === 'Brinde' ? 'pink' : m.motivo === 'Mostruário' ? 'orange' : m.motivo === 'Parceria' ? 'blue' : 'orange')}
        </div>
        <div class="vcard-cli" style="margin:6px 0 8px">${esc(m.produtoNome || '-')}</div>
        <div class="vcard-rows">
          ${m.destinatario ? `<div class="vcard-row"><span>Para quem</span><b>${esc(m.destinatario)}</b></div>` : ''}
          <div class="vcard-row"><span>Quantidade</span><b>${m.quantidade || 0}</b></div>
          <div class="vcard-row"><span>Custo</span><b>${Number(m.custoUnitario || 0) ? money(m.valorFinanceiro || 0) : '<span style="color:var(--error)">⚠️ sem custo</span>'}</b></div>
          <div class="vcard-row"><span>Origem</span><b>${esc(m.origem || (m.vendaId ? 'Carrinho' : 'Manual'))}</b></div>
        </div>
      </div>`).join('') : '<p class="muted">Nenhuma saída sem lucro para este filtro.</p>'}
    </div>
  </div>`;
}

// Ativa "pronta entrega" de uma vez para todos os produtos que têm estoque > 0 — evita ter que
// abrir produto por produto quando uma leva grande de itens fica sem essa flag (ex: importados
// antes da correção do bug de duplicidade no pedido).
export async function ativarProntaEntregaTodos() {
  const alvo = state.data.produtos.filter(p => Number(p.estoqueAtual || 0) > 0 && p.produtoProntaEntrega !== true);
  if (!alvo.length) return toast('Todos os produtos em estoque já estão como pronta entrega.');
  if (!confirm(`Ativar "pronta entrega" para ${alvo.length} produto(s) que estão em estoque?`)) return;
  for (let i = 0; i < alvo.length; i += 450) {
    const batch = writeBatch(db);
    alvo.slice(i, i + 450).forEach(p => batch.update(ref('produtos', p.id), { produtoProntaEntrega: true }));
    await batch.commit();
  }
  window.App.refresh(`${alvo.length} produto(s) marcados como pronta entrega`);
}

export function openEntradaManual() {
  const picker = searchPickerHtml('mProd', [...state.data.produtos].sort(porNome), p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | estoque ${p.estoqueAtual || 0}`);
  showModal(`<h3>Entrada de estoque</h3>
    <div class="grid">
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="mQtd" type="number" value="1"></div>
      <div class="field"><label>Custo unitário pago</label><input id="mCusto" placeholder="0,00"></div>
      <div class="field"><label>Motivo</label><input id="mMotivo" value="Compra"></div>
      <div class="field"><label>Preço médio (calculado)</label><input disabled value="Calculado automaticamente ao salvar"></div>
    </div>
    <p class="muted" style="margin:6px 0 0">Deixe o custo em <b>0</b> para itens recebidos como brinde da Farmasi — o preço médio é recalculado sozinho considerando todas as entradas.</p><br>
    <div class="panel" style="background:#F7FAFC;margin-top:4px">
      <p class="muted" style="margin:0 0 8px"><b>Comprou de outra consultora, não direto da Farmasi?</b> Preencha abaixo pra guardar de quem foi e se já pagou.</p>
      <div class="grid">
        <div class="field full"><label>Comprado de (opcional)</label><input id="mFornecedor" placeholder="Nome de quem vendeu pra você"></div>
        <div class="field full">${toggleHtml('mJaPaguei', true, '', 'Já paguei')}</div>
      </div>
    </div><br>
    <button class="btn dark" onclick="App.saveEntradaManual()">Lançar entrada</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function saveEntradaManual() {
  const p = prodById($('mProd').value);
  if (!p) return toast('Selecione um produto');
  const qtd = Number($('mQtd').value || 1);
  const custo = parseMoney($('mCusto').value || p.custoMedio || 0);
  try {
    await perguntarAtivarProntaEntrega(p.id);
    await entradaEstoque(p.id, qtd, custo, $('mMotivo').value);
    const fornecedor = ($('mFornecedor')?.value || '').trim();
    if (fornecedor) {
      const jaPaguei = !!$('mJaPaguei')?.checked;
      await setDoc(ref('despesas', 'forn_' + Date.now()), {
        tipo: 'fornecedor', pessoa: fornecedor, produtoId: p.id, produtoNome: p.nome,
        quantidade: qtd, valorTotal: custo * qtd, pago: jaPaguei, data: today(),
        criadoEm: serverTimestamp()
      });
    }
    closeModal();
    window.App.refresh(fornecedor ? `Entrada registrada — comprado de ${fornecedor}` : 'Entrada registrada');
  } catch (e) {
    toast('Erro ao registrar entrada: ' + e.message);
  }
}

// Rótulo do campo "para quem" varia conforme o motivo — deixa claro o que preencher em cada caso
// (a quem foi dado o brinde, onde ficou o mostruário, quem usou pro consumo próprio).
function labelDestinoSaida(motivo) {
  if (motivo === 'Brinde') return 'Para quem foi o brinde (opcional)';
  if (motivo === 'Mostruário') return 'Onde ficou o mostruário (opcional)';
  if (motivo === 'Consumo próprio') return 'Observação (opcional)';
  return '';
}

export function openSaidaManual() {
  const picker = searchPickerHtml('sProd', [...state.data.produtos].filter(p => Number(p.estoqueAtual || 0) > 0).sort(porNome), p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | estoque ${p.estoqueAtual || 0}`);
  const motivos = MOTIVOS_SAIDA.map(m => `<option value="${m}">${m}</option>`).join('');
  showModal(`<h3>Saída de estoque</h3>
    <p class="muted">Para vendas, use o carrinho. Aqui registre saídas por brinde, mostruário, parceria, consumo próprio, etc.</p>
    <div class="grid">
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="sQtd" type="number" value="1"></div>
      <div class="field"><label>Motivo</label><select id="sMotivo" onchange="App.atualizarCampoDestinoSaida()">${motivos}</select></div>
      <div class="field full" id="sDestinoField" style="${MOTIVOS_COM_DESTINO.includes(MOTIVOS_SAIDA[0]) ? '' : 'display:none'}">
        <label id="sDestinoLabel">${labelDestinoSaida(MOTIVOS_SAIDA[0])}</label>
        <input id="sDestino" placeholder="Ex: nome da cliente, feira, evento...">
      </div>
    </div><br>
    <div class="alert-box">⚠️ Saídas que não são vendas <b>não geram lucro</b> nos relatórios.</div><br>
    <button class="btn dark" onclick="App.saveSaidaManual()">Confirmar saída</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

// Mostra/esconde e atualiza o rótulo do campo "para quem" conforme o motivo selecionado — só faz
// sentido perguntar destino pra Brinde/Mostruário/Consumo próprio (Perda, Ajuste, Parceria, Troca não).
export function atualizarCampoDestinoSaida() {
  const motivo = $('sMotivo')?.value;
  const campo = $('sDestinoField');
  if (!campo) return;
  if (MOTIVOS_COM_DESTINO.includes(motivo)) {
    campo.style.display = '';
    $('sDestinoLabel').textContent = labelDestinoSaida(motivo);
  } else {
    campo.style.display = 'none';
  }
}

export async function saveSaidaManual() {
  const p = prodById($('sProd').value);
  if (!p) return toast('Selecione um produto');
  const q = Number($('sQtd').value || 1);
  if (Number(p.estoqueAtual || 0) < q) return toast('Estoque insuficiente');
  const motivo = $('sMotivo').value;
  const destino = MOTIVOS_COM_DESTINO.includes(motivo) ? ($('sDestino')?.value || '').trim() : '';
  try {
    await saidaEstoque(p.id, q, motivo, '', 0, destino);
    closeModal();
    window.App.refresh('Saída registrada');
  } catch (e) {
    toast('Erro ao registrar saída: ' + e.message);
  }
}

// --- Leitura do PDF "Detalhes do pedido" da Farmasi ---
// A fonte do PDF do site da Farmasi não mapeia certos glifos (dígitos 4/6/9, letra "a" etc.)
// pra nenhum caractere Unicode normal — eles saem como pontos de código de Área de Uso Privado
// (Private Use Area, ex. U+E02C), que a maioria dos ambientes não desenha (parecem "sumidos",
// mas o item de texto continua lá, só com conteúdo ilegível). Qualquer normalização de texto
// precisa tratar esses pontos de código como "glifo desconhecido", nunca como espaço real —
// virar espaço quebraria palavras em 2 tokens (ex.: "Calêndula" → "C" + "lendul").
function ehCodePointPUA(cp) {
  return (cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0xFFFFD) || (cp >= 0x100000 && cp <= 0x10FFFD);
}
// Item "vazio": string realmente vazia com largura>0 (glifo apagado) ou contendo só PUA.
function itemTemGlifoPerdido(item) {
  const str = item.str;
  if (!str) return (item.w || 0) > 0.5;
  return [...str].some(ch => ehCodePointPUA(ch.codePointAt(0)));
}
const MARK_GLIFO = String.fromCodePoint(1); // marcador de "glifo desconhecido" (preserva a posição na palavra)
function normFuzzyPdf(s) {
  return [...String(s || '')].map(ch => (ehCodePointPUA(ch.codePointAt(0)) ? MARK_GLIFO : ch)).join('')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(new RegExp(`[^a-z0-9${MARK_GLIFO}]`, 'g'), ' ');
}
// Cada caractere da palavra-alvo pode ter sido substituído pelo marcador na extração.
function fuzzyPalavraPdf(palavra) {
  return palavra.toLowerCase().split('').map(c => `(?:${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${MARK_GLIFO})`).join('');
}
function fuzzyFrasePdf(frase) {
  return frase.split(' ').map(fuzzyPalavraPdf).join('\\s+');
}
const RE_PDF_UNIDADES = new RegExp(fuzzyPalavraPdf('unidades'), 'i');
const RE_PDF_ESCONDER_DETALHES = new RegExp(fuzzyFrasePdf('esconder detalhes'), 'i');
const RE_PDF_QUANTIDADE_HDR = new RegExp('^\\s*' + fuzzyPalavraPdf('quantidade') + '\\s*$', 'i');
const RE_PDF_PONTOS = new RegExp(fuzzyPalavraPdf('pontos'), 'i');

// Acha o produto do catálogo cujo nome mais bate com o texto (tolerante a glifos perdidos) —
// exige que pelo menos 70% das "palavras" do nome cadastrado apareçam no texto do PDF.
function acharProdutoPorNomePdf(produtos, nomeBruto) {
  const alvo = normFuzzyPdf(nomeBruto).replace(/ +/g, ' ').trim();
  if (alvo.length < 5) return null;
  const tokensAlvo = new Set(alvo.split(' ').filter(Boolean));
  let melhor = null, melhorScore = 0;
  produtos.forEach(p => {
    const nomeP = normFuzzyPdf(p.nome).replace(/ +/g, ' ').trim();
    const tokensP = nomeP.split(' ').filter(t => t.length > 1);
    let bateu = 0;
    tokensP.forEach(t => {
      const re = new RegExp('^' + fuzzyPalavraPdf(t) + '$');
      if ([...tokensAlvo].some(ta => re.test(ta))) bateu++;
    });
    const score = tokensP.length ? bateu / tokensP.length : 0;
    if (score > melhorScore && score >= 0.7) { melhorScore = score; melhor = p; }
  });
  return melhor;
}

// Reconstrói o texto em "linhas visuais" a partir da posição (x,y) de cada fragmento — o pdf.js
// entrega os fragmentos na ordem interna do PDF, que NÃO segue a ordem visual das colunas
// (nome à esquerda, quantidade/preço/pontos à direita ficam entrelaçados na leitura crua).
async function extrairLinhasPdf(pdfjsLib, buf) {
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const linhas = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const porY = new Map();
    for (const it of content.items) {
      const y = Math.round(it.transform[5] / 4) * 4;
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y).push({ str: it.str, x: it.transform[4], w: it.width });
    }
    [...porY.keys()].sort((a, b) => b - a).forEach(y => {
      const itens = porY.get(y).sort((a, b) => a.x - b.x);
      const texto = itens.map(i => i.str).join('');
      linhas.push({ itens, texto, norm: normFuzzyPdf(texto), x: itens[0].x, y, page: pageNum });
    });
  }
  return linhas;
}

function lerQtdLinhaPdf(linha) {
  if (!RE_PDF_UNIDADES.test(linha.norm)) return null;
  const primeiro = linha.itens[0];
  if (!primeiro || itemTemGlifoPerdido(primeiro) || !/^\d+$/.test(primeiro.str)) return null;
  return parseInt(primeiro.str, 10);
}

// Só confia no valor se NENHUM item a partir do "R$" tiver glifo perdido — os dígitos 4/6/9
// podem ter sumido ali, e gravar um custo errado sem avisar é pior que não preencher nada.
function lerPrecoLinhaPdf(linha) {
  const idx = linha.itens.findIndex(it => it.str.includes('$'));
  if (idx < 0) return null;
  const resto = linha.itens.slice(idx);
  if (resto.some(it => itemTemGlifoPerdido(it))) return null;
  const m = resto.map(it => it.str).join('').match(/\$\s*([\d.,]+)/);
  return m ? parseMoney('R$' + m[1]) : null;
}

function precoRefProduto(p) { return Number(p.precoAtual || p.precoOriginal || 0); }

// Linhas de "status" (quantidade/preço/pontos) ficam na coluna direita da tabela do pedido —
// separadas do fluxo de nomes/kits (coluna esquerda) pelo CONTEÚDO (não pela posição x, já que
// a coluna de quantidade dos componentes de um kit ocupa a mesma faixa de x que o preço normal).
function ehLinhaStatusPdf(linha) {
  return RE_PDF_UNIDADES.test(linha.norm) || linha.texto.includes('$') || RE_PDF_PONTOS.test(linha.norm);
}

// Extrai produtos (com quantidade/custo, quando legíveis) e kits (com componentes ratados
// proporcionalmente ao preço de venda cadastrado, igual à montagem de kit da Pré-encomenda) a
// partir das linhas posicionadas do PDF do pedido Farmasi.
function extrairItensPdf(todasLinhas, produtos) {
  const linhas = todasLinhas.filter(l => l.texto.trim() && !ehLinhaStatusPdf(l));
  const direita = todasLinhas.filter(l => l.texto.trim() && ehLinhaStatusPdf(l));

  function achaProximo(y, page, leitor, maxDist = 60) {
    let melhor = null, melhorDist = Infinity;
    direita.forEach(l => {
      if (l.page !== page) return;
      const v = leitor(l);
      if (v == null) return;
      const d = Math.abs(l.y - y);
      if (d < melhorDist && d <= maxDist) { melhorDist = d; melhor = v; }
    });
    return melhor;
  }
  const precoProximo = (y, page) => achaProximo(y, page, lerPrecoLinhaPdf);
  const qtdProxima = (y, page) => achaProximo(y, page, lerQtdLinhaPdf) ?? 1;

  const resultado = [];
  let kitSeq = 0, i = 0, guard = 0;
  while (i < linhas.length) {
    if (++guard > 20000) break; // segurança contra loop infinito em PDFs muito fora do padrão
    const linha = linhas[i];
    let nomeBruto = linha.texto;
    let j = i + 1;
    let ehKit = false;
    if (j < linhas.length && RE_PDF_ESCONDER_DETALHES.test(linhas[j].norm)) {
      ehKit = true;
    } else if (j < linhas.length && linhas[j].x <= 160 && linhas[j].texto.trim() && !/^\d/.test(linhas[j].texto.trim())) {
      nomeBruto += ' ' + linhas[j].texto;
      j++;
      if (j < linhas.length && RE_PDF_ESCONDER_DETALHES.test(linhas[j].norm)) ehKit = true;
    }
    if (ehKit) {
      const linhaKit = linhas[j];
      j++;
      const precoKit = precoProximo(linhaKit.y, linhaKit.page);
      let k = j, safety = 0;
      while (k < linhas.length && !RE_PDF_QUANTIDADE_HDR.test(linhas[k].norm.trim())) {
        if (linhas[k].x <= 160 && linhas[k].texto.trim()) break;
        if (++safety > 20 || ++k >= linhas.length) break;
      }
      const componentes = [];
      if (k < linhas.length && RE_PDF_QUANTIDADE_HDR.test(linhas[k].norm.trim())) {
        k++;
        while (k < linhas.length && linhas[k].x > 160 && linhas[k].x < 360) {
          const nomeComp = linhas[k].texto.trim();
          const ultimo = linhas[k].itens[linhas[k].itens.length - 1];
          const qtdComp = ultimo && !itemTemGlifoPerdido(ultimo) && /^\d+$/.test(ultimo.str) ? parseInt(ultimo.str, 10) : 1;
          if (nomeComp) componentes.push({ nomeComp, quantidade: qtdComp });
          k++;
        }
      }
      i = Math.max(k, j + 1);
      if (componentes.length >= 2) {
        const validos = componentes
          .map(c => ({ ...c, produto: acharProdutoPorNomePdf(produtos, c.nomeComp) }))
          .filter(c => c.produto);
        if (validos.length) {
          kitSeq++;
          const kitId = 'pdfkit_' + kitSeq;
          const refs = validos.map(c => precoRefProduto(c.produto) * c.quantidade);
          const totalRef = refs.reduce((a, b) => a + b, 0);
          let somaDist = 0;
          validos.forEach((c, idx) => {
            const ultimoComp = idx === validos.length - 1;
            let valorItem = 0;
            if (precoKit != null && precoKit > 0) {
              valorItem = ultimoComp ? Math.round((precoKit - somaDist) * 100) / 100
                : Math.round(precoKit * (totalRef > 0 ? refs[idx] / totalRef : 1 / validos.length) * 100) / 100;
              somaDist += valorItem;
            }
            resultado.push({ nome: c.produto.nome, codigo: c.produto.codigoFarmasi || '', quantidade: c.quantidade, valorTotal: valorItem, kitId, kitNome: nomeBruto.trim() });
          });
        }
      }
      continue;
    }
    if (j < linhas.length && /^\d{5,}/.test(linhas[j].texto.trim())) j++;
    const produto = acharProdutoPorNomePdf(produtos, nomeBruto);
    if (produto) {
      const qtd = qtdProxima(linha.y, linha.page);
      const valorUnit = precoProximo(linha.y, linha.page);
      resultado.push({ nome: produto.nome, codigo: produto.codigoFarmasi || '', quantidade: qtd, valorTotal: valorUnit != null ? valorUnit * qtd : 0 });
    }
    i = j;
  }
  return resultado;
}

// Alguns bloqueadores de anúncios/extensões de privacidade bloqueiam CDNs específicos (o
// jsdelivr é um alvo comum). Tenta 3 CDNs em sequência antes de desistir.
const PDFJS_CDNS = [
  { lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs' },
  { lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs' },
  { lib: 'https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.min.mjs', worker: 'https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs' }
];

async function carregarPdfjs() {
  let ultimoErro;
  for (const cdn of PDFJS_CDNS) {
    try {
      const pdfjsLib = await import(cdn.lib);
      pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.worker;
      return pdfjsLib;
    } catch (e) { ultimoErro = e; }
  }
  throw new Error('Não foi possível carregar o leitor de PDF (bloqueador de anúncios/rede pode estar bloqueando os CDNs). Tente desativar extensões de bloqueio para este site, ou use o JSON.');
}

export async function readPedidoPdf(files) {
  if (!files || !files[0]) return;
  toast('Lendo PDF...');
  try {
    const pdfjsLib = await carregarPdfjs();
    const buf = await files[0].arrayBuffer();
    const linhas = await extrairLinhasPdf(pdfjsLib, buf);
    const itens = extrairItensPdf(linhas, state.data.produtos);
    if (!itens.length) return toast('Nenhum produto do seu catálogo foi identificado neste PDF. Cadastre os produtos antes ou use o JSON.');
    window.__pedidoEstoque = dedupPedido(itens);
    renderPedidoPreview();
    const kits = new Set(itens.filter(i => i.kitId).map(i => i.kitId)).size;
    toast(`${itens.length} produto(s) identificado(s)${kits ? ` (${kits} kit${kits > 1 ? 's' : ''} desmontado${kits > 1 ? 's' : ''} e rateado${kits > 1 ? 's' : ''})` : ''} — confira quantidades e custos antes de confirmar`);
  } catch (e) {
    toast('Erro ao ler o PDF: ' + e.message);
  }
}

// Mesma nota fiscal pode trazer o mesmo produto em mais de uma linha (comprado em momentos
// diferentes do pedido). Sem isso, cada linha virava um toggle "pronta entrega"/"monitorar"
// separado pro MESMO produto, e o último processado sobrescrevia o anterior de forma
// imprevisível — juntar numa linha só resolve e ainda deixa a quantidade/custo corretos.
function dedupPedido(itens) {
  const map = {};
  itens.forEach(i => {
    const key = i.codigo || norm(i.nome);
    if (map[key]) {
      map[key].quantidade += i.quantidade;
      map[key].valorTotal += i.valorTotal;
      if (!map[key].imagem && i.imagem) map[key].imagem = i.imagem;
    } else {
      map[key] = { ...i };
    }
  });
  return Object.values(map);
}

function achaProdutoExistente(i) {
  return state.data.produtos.find(p => (i.codigo && p.codigoFarmasi == i.codigo) || norm(p.nome) == norm(i.nome));
}

// Lê os valores atuais dos inputs da tabela de volta para window.__pedidoEstoque,
// para não perder edições ao remover uma linha ou re-renderizar.
function sincronizarPedidoInputs() {
  const itens = window.__pedidoEstoque || [];
  itens.forEach((i, k) => {
    if (!$('pedn_' + k)) return;
    i.nome = $('pedn_' + k).value;
    i.codigo = $('pedcod_' + k).value;
    i.quantidade = Number($('pedq_' + k).value || 1);
    i.custoUnitario = parseMoney($('pedc_' + k).value || 0);
    i.prontaEntrega = $('pedpe_' + k).checked;
    i.monitorar = $('pedmon_' + k).checked;
  });
}

export function removerLinhaPedido(k) {
  sincronizarPedidoInputs();
  window.__pedidoEstoque.splice(k, 1);
  renderPedidoPreview();
}

function renderPedidoPreview() {
  const items = window.__pedidoEstoque || [];
  const novos = items.filter(i => !achaProdutoExistente(i)).length;
  $('pedidoPreview').innerHTML = `<div class="panel">
    <div class="panel-head"><h3>Conferência (${items.length})</h3>
      <div style="display:flex;gap:6px">${pill(novos + ' novos', 'green')}${pill((items.length - novos) + ' existentes', 'blue')}</div></div>
    <p class="muted">Produtos existentes têm o estoque somado e o código preenchido/atualizado; novos são criados. O custo médio é recalculado. Edite nome/código se algo veio errado, ou remova a linha.</p>
    ${items.length ? `<div class="table table-scroll"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Situação</th><th>Qtd</th><th>Custo unitário</th><th>Preço de venda cadastrado</th><th>Pronta entrega</th><th>Monitorar</th><th></th>
    </tr></thead>
    <tbody>${items.map((i, k) => {
      const existente = achaProdutoExistente(i);
      const custoUnit = i.valorTotal ? i.valorTotal / i.quantidade : (i.custoUnitario || 0);
      const precoRef = existente ? Number(existente.precoAtual || existente.precoOriginal || 0) : 0;
      return `<tr>
      <td data-label="Produto"><input id="pedn_${k}" value="${esc(i.nome)}"></td>
      <td data-label="Código"><input id="pedcod_${k}" value="${esc(i.codigo || '')}"></td>
      <td data-label="Situação">${existente ? pill('Existente', 'blue') : pill('Novo', 'green')}</td>
      <td data-label="Qtd"><input id="pedq_${k}" type="number" value="${i.quantidade}"></td>
      <td data-label="Custo"><input id="pedc_${k}" value="${money(custoUnit)}"></td>
      <td data-label="Preço de venda cadastrado">${precoRef ? `${money(precoRef)}${precoRef > custoUnit ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">lucro</span>` : precoRef < custoUnit ? ` <span class="tag red" style="font-size:10px;padding:2px 6px">prejuízo</span>` : ''}` : '<span class="muted">-</span>'}</td>
      <td data-label="Pronta entrega">${toggleBareHtml('pedpe_' + k, i.prontaEntrega !== false)}</td>
      <td data-label="Monitorar">${toggleBareHtml('pedmon_' + k, i.monitorar !== false)}</td>
      <td><button class="btn small" style="color:var(--error)" onclick="App.removerLinhaPedido(${k})" title="Remover linha">✗</button></td>
    </tr>`;
    }).join('')}</tbody></table></div><br>
    <button class="btn dark" onclick="App.confirmPedidoEstoque()">Confirmar e alimentar estoque</button>` : '<p class="muted">Nenhum item restante — cole outro JSON.</p>'}
  </div>`;
}

export async function confirmPedidoEstoque() {
  sincronizarPedidoInputs();
  const itens = window.__pedidoEstoque || [];
  if (!itens.length) return toast('Nenhum item para importar');
  const { upsertProduto } = await import('./produtos.js');
  let ok = 0;
  try {
    for (const i of itens) {
      // Sempre passa pelo upsert (mesmo quando já existe) para garantir que o código
      // Farmasi seja preenchido/atualizado no produto — não só quando ele é criado.
      const id = await upsertProduto({
        nome: i.nome, codigoFarmasi: i.codigo, imagem: i.imagem,
        linha: achaProdutoExistente(i)?.linha || 'Sem linha',
        produtoProntaEntrega: i.prontaEntrega !== false,
        monitorarEstoqueBaixo: i.monitorar !== false
      });
      await entradaEstoque(id, i.quantidade || 1, i.custoUnitario || 0, 'Importação pedido Farmasi', 'pedido_farmasi');
      ok++;
    }
    window.__pedidoEstoque = null;
    await window.App.refresh(`${ok} produto(s) importado(s) e estoque atualizado`);
  } catch (e) {
    toast(`Erro ao importar (${ok}/${itens.length} item(ns) concluído(s) antes do erro): ${e.message}`);
    await window.App.refresh();
  }
}
