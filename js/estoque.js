import { state, SECTIONS, col, ref, db, prodById, showModal, closeModal, toast,
  runTransaction, serverTimestamp, doc, stockAgg, writeBatch, reservadoEmAberto, setDoc } from './state.js';
import { $, esc, money, parseMoney, today, norm, pill, sortWrapped, withFocusPreserved, sortBarHtml, sectionTabsHtml, searchPickerHtml, toggleBareHtml, linhasDe, labelLinha } from './utils.js';
import { trocasTabHtml } from './trocas.js';
import { preEncomendaTabHtml, btnAdicionarPreEncomenda } from './preencomenda.js';

const MOTIVOS_SAIDA = ['Brinde', 'Parceria', 'Consumo próprio', 'Troca', 'Perda', 'Ajuste'];

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
  let novoEstoque = 0;
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
    tx.set(doc(col('movimentacoesEstoque')), {
      produtoId, produtoNome: p.nome, tipo: 'entrada', motivo, origem,
      quantidade: q, estoqueAntes: e, estoqueDepois: novo,
      custoUnitario: c, custoMedioAntes: cm, custoMedioDepois: novoCM,
      valorFinanceiro: q * c, data: today(), criadoEm: serverTimestamp()
    });
    novoEstoque = novo;
  });
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

export async function saidaEstoque(produtoId, qtd, motivo = 'Venda', vendaId = '', receita = 0) {
  const geraLucro = motivo === 'Venda';
  await runTransaction(db, async tx => {
    const pr = ref('produtos', produtoId);
    const s = await tx.get(pr);
    const p = s.data(), e = Number(p.estoqueAtual || 0), q = Number(qtd);
    if (e < q) throw Error('Estoque insuficiente');
    const c = Number(p.custoMedio || 0), novo = e - q;
    tx.update(pr, { estoqueAtual: novo, ultimaSaida: today() });
    updateProntaEntregaAuto(tx, pr, p, novo);
    tx.set(doc(col('movimentacoesEstoque')), {
      produtoId, produtoNome: p.nome, tipo: 'saida', motivo,
      quantidade: q, estoqueAntes: e, estoqueDepois: novo,
      custoUnitario: c, valorFinanceiro: q * c, receita,
      vendaId, geraLucro, data: today(), criadoEm: serverTimestamp()
    });
  });
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

function stockCard(x) {
  return `<div class="data-card">
    <img src="${esc(x.p.imagem || '')}" onerror="this.style.visibility='hidden'">
    <div><b class="cli-link" onclick="App.openProdutoForm('${x.p.id}')">${esc(x.p.nome)}</b>
      <div class="prod-tags"><span class="prod-tag">Código <b>${esc(x.p.codigoFarmasi || '-')}</b></span><span class="prod-tag">Linha <b>${esc(x.p.linha || '-')}</b></span></div>
    </div>
    <div class="metric"><small>Qtd</small><b>${x.est}</b>${reservadoEmAberto(x.p.id) > 0 ? `<br><span class="tag red" style="font-size:10px;padding:2px 6px" title="Reservado em carrinhos/trocas abertos">🛒 ${reservadoEmAberto(x.p.id)} reservado</span>` : ''}</div>
    <div class="metric"><small>Custo médio</small><b>${money(x.custo)}</b></div>
    <div class="metric"><small>Investido</small><b>${money(x.investido)}</b></div>
    <div class="metric"><small>Lucro potencial</small><b>${money(x.lucroPot)} <span class="muted" style="font-size:11px;font-weight:700">(${x.margem >= 0 ? '' : '-'}${Math.abs(x.margem).toFixed(0)}%)</span></b></div>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
      ${pill(x.semCusto ? 'Sem custo' : x.baixo ? 'Baixo' : 'OK',
        x.semCusto || x.baixo ? 'red' : 'green',
        x.semCusto ? 'Produto sem custo médio cadastrado — o lucro dele não entra certo nos relatórios' : x.baixo ? 'Estoque abaixo do mínimo configurado pra esse produto' : 'Estoque normal, acima do mínimo')}
      ${btnAdicionarPreEncomenda(x.p.id)}
      <button class="btn small" onclick="App.openProdutoForm('${x.p.id}')" title="Editar">✏️</button>
      <button class="btn small" style="color:var(--error)" onclick="App.excluirProduto('${x.p.id}')" title="Excluir">🗑️</button>
    </div>
  </div>`;
}

// A busca principal do Estoque (qestoque) e a busca da Pré-encomenda (qPreEnc) convivem na mesma
// função de render, em abas diferentes — preserva foco/cursor de qualquer uma das duas que estiver
// ativa (mesmo padrão de FOCUS_IDS_PRODUTOS em produtos.js, que resolve o mesmo problema lá).
const FOCUS_IDS_ESTOQUE = ['qestoque', 'qPreEnc'];
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
        <div class="card"><span>Lucro potencial</span><b>${money(s.pot)} <span class="muted" style="font-size:11px;font-weight:700">(${s.invest ? (s.pot / s.invest * 100).toFixed(0) : 0}%)</span></b></div>
      </div>
      ${sectionTabsHtml('estoque', SECTIONS.estoque, sec)}`;

    if (sec === 'estoque') {
      html += `<div class="panel">
        <div class="panel-head">
          <h3>Visão do estoque</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn dark small" onclick="App.openEntradaManual()">+ Entrada</button>
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

    if (sec === 'importar') {
      html += `<div class="panel">
        <h3>Importar pedido/estoque</h3>
        <p class="muted">Cole ou selecione um JSON de pedido para alimentar o estoque e atualizar o custo médio.</p>
        <label class="btn pink">Selecionar JSON pedido<input type="file" accept=".json" style="display:none" onchange="App.readPedidoFile(this.files)"></label>
        <br><br><textarea id="pedidoJson" placeholder="Ou cole o JSON do pedido..."></textarea>
        <br><br><button class="btn dark" onclick="App.previewPedidoEstoque()">Analisar pedido</button>
        <hr style="margin:20px 0;border:0;border-top:1px solid var(--line)">
        <h3>Ou importar PDF do pedido Farmasi</h3>
        <p class="muted">Selecione o PDF de "Detalhes do pedido" baixado do site da Farmasi. O sistema identifica os produtos do seu catálogo que aparecem no PDF (por código ou nome) — a quantidade de cada um entra como 1 e pode ser ajustada na conferência abaixo antes de confirmar.</p>
        <label class="btn pink">Selecionar PDF do pedido<input type="file" accept=".pdf" style="display:none" onchange="App.readPedidoPdf(this.files)"></label>
      </div>
      <div id="pedidoPreview"></div>`;
    }

    if (sec === 'trocas') html += trocasTabHtml();
    if (sec === 'preEncomenda') html += preEncomendaTabHtml();

    $('estoque').innerHTML = html;
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
  const picker = searchPickerHtml('mProd', state.data.produtos, p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | estoque ${p.estoqueAtual || 0}`);
  showModal(`<h3>Entrada de estoque</h3>
    <div class="grid">
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="mQtd" type="number" value="1"></div>
      <div class="field"><label>Custo unitário pago</label><input id="mCusto" placeholder="0,00"></div>
      <div class="field"><label>Motivo</label><input id="mMotivo" value="Compra"></div>
      <div class="field"><label>Preço médio (calculado)</label><input disabled value="Calculado automaticamente ao salvar"></div>
    </div>
    <p class="muted" style="margin:6px 0 0">Deixe o custo em <b>0</b> para itens recebidos como brinde da Farmasi — o preço médio é recalculado sozinho considerando todas as entradas.</p><br>
    <button class="btn dark" onclick="App.saveEntradaManual()">Lançar entrada</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function saveEntradaManual() {
  const p = prodById($('mProd').value);
  if (!p) return toast('Selecione um produto');
  try {
    await perguntarAtivarProntaEntrega(p.id);
    await entradaEstoque(p.id, Number($('mQtd').value || 1), parseMoney($('mCusto').value || p.custoMedio || 0), $('mMotivo').value);
    closeModal();
    window.App.refresh('Entrada registrada');
  } catch (e) {
    toast('Erro ao registrar entrada: ' + e.message);
  }
}

export function openSaidaManual() {
  const picker = searchPickerHtml('sProd', state.data.produtos.filter(p => Number(p.estoqueAtual || 0) > 0), p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | estoque ${p.estoqueAtual || 0}`);
  const motivos = MOTIVOS_SAIDA.map(m => `<option value="${m}">${m}</option>`).join('');
  showModal(`<h3>Saída de estoque</h3>
    <p class="muted">Para vendas, use o carrinho. Aqui registre saídas por brinde, parceria, consumo próprio, etc.</p>
    <div class="grid">
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="sQtd" type="number" value="1"></div>
      <div class="field"><label>Motivo</label><select id="sMotivo">${motivos}</select></div>
    </div><br>
    <div class="alert-box">⚠️ Saídas que não são vendas <b>não geram lucro</b> nos relatórios.</div><br>
    <button class="btn dark" onclick="App.saveSaidaManual()">Confirmar saída</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function saveSaidaManual() {
  const p = prodById($('sProd').value);
  if (!p) return toast('Selecione um produto');
  const q = Number($('sQtd').value || 1);
  if (Number(p.estoqueAtual || 0) < q) return toast('Estoque insuficiente');
  try {
    await saidaEstoque(p.id, q, $('sMotivo').value);
    closeModal();
    window.App.refresh('Saída registrada');
  } catch (e) {
    toast('Erro ao registrar saída: ' + e.message);
  }
}

export async function readPedidoFile(files) {
  if (files && files[0]) { $('pedidoJson').value = await files[0].text(); previewPedidoEstoque(); }
}

// Casa o texto extraído do PDF do pedido Farmasi contra o catálogo já cadastrado.
// O PDF do site da Farmasi usa uma fonte com glifos sem mapeamento de texto — na extração,
// certos caracteres (ex: "a", dígitos "4"/"6"/"9") viram ESPAÇO ("1002167" sai "10021 7",
// "Tuna" sai "Tun "). Por isso o casamento tolera curingas: um espaço no texto pode valer por
// 1 caractere do alvo, com limite de curingas por match. Quando um mesmo trecho casa com mais
// de um código do catálogo (ex: "100135 " casa com 1001355 E 1001356), ninguém leva por código
// — esses produtos só entram se o NOME casar. Cada produto identificado entra com quantidade 1;
// a consultora ajusta na tabela de conferência antes de confirmar — nada é gravado sem revisão.
function normPdfTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' '); // NÃO colapsa espaços — cada glifo perdido é 1 curinga
}
function normPdfAlvo(s) {
  return normPdfTexto(s).replace(/ +/g, ' ').trim();
}

// Posições onde 'alvo' casa em 'texto': espaço do texto = curinga de 1 caractere (até
// maxCuringas); espaço do alvo consome 0+ espaços do texto; exige fronteira não alfanumérica.
function posicoesComCuringa(texto, alvo, maxCuringas) {
  const n = texto.length, m = alvo.length;
  const alnum = ch => (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
  const posicoes = [];
  outer: for (let i = 0; i < n; i++) {
    if (texto[i] !== alvo[0] && texto[i] !== ' ') continue;
    let ti = i, curingas = 0;
    for (let j = 0; j < m; j++) {
      const c = alvo[j];
      if (c === ' ') {
        while (ti < n && texto[ti] === ' ') ti++;
        continue;
      }
      if (ti >= n) continue outer;
      const t = texto[ti];
      if (t === c) { ti++; continue; }
      if (t === ' ' && ++curingas <= maxCuringas) { ti++; continue; }
      continue outer;
    }
    const antes = i > 0 ? texto[i - 1] : ' ';
    const depois = ti < n ? texto[ti] : ' ';
    if (!alnum(antes) && !alnum(depois)) posicoes.push(i);
  }
  return posicoes;
}

function matchPedidoPdfComCatalogo(textoBruto) {
  const texto = normPdfTexto(textoBruto);
  const produtos = state.data.produtos;

  // 1ª passada: códigos — cada posição do texto pode ser reivindicada por vários códigos
  const reivindicacoes = {};
  const posPorProduto = {};
  produtos.forEach(p => {
    const cod = normPdfAlvo(String(p.codigoFarmasi || ''));
    if (cod.length < 5) return;
    const pos = posicoesComCuringa(texto, cod, Math.max(1, Math.floor(cod.length * 0.35)));
    if (pos.length) {
      posPorProduto[p.id] = pos;
      pos.forEach(i => (reivindicacoes[i] = reivindicacoes[i] || []).push(p.id));
    }
  });
  const encontrados = {};
  produtos.forEach(p => {
    const pos = posPorProduto[p.id] || [];
    if (pos.some(i => reivindicacoes[i].length === 1)) encontrados[p.id] = p;
  });
  // 2ª passada: nome (pra quem não entrou por código)
  produtos.forEach(p => {
    if (encontrados[p.id]) return;
    const nomeN = normPdfAlvo(p.nome);
    if (nomeN.length > 4 &&
        posicoesComCuringa(texto, nomeN, Math.max(2, Math.floor(nomeN.replace(/ /g, '').length * 0.4))).length) {
      encontrados[p.id] = p;
    }
  });
  return Object.values(encontrados).map(p => ({ nome: p.nome, codigo: p.codigoFarmasi || '', quantidade: 1 }));
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
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Junta os fragmentos SEM separador (o pdf.js quebra palavras em vários itens) — só
      // quebra de linha real (hasEOL) vira '\n'. Glifos perdidos já vêm como itens de espaço.
      texto += content.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('') + '\n';
    }
    const itens = matchPedidoPdfComCatalogo(texto);
    if (!itens.length) return toast('Nenhum produto do seu catálogo foi identificado neste PDF. Cadastre os produtos antes ou use o JSON.');
    window.__pedidoEstoque = itens;
    renderPedidoPreview();
    toast(`${itens.length} produto(s) identificado(s) no PDF — confira as quantidades antes de confirmar`);
  } catch (e) {
    toast('Erro ao ler o PDF: ' + e.message);
  }
}

// Um item de pedido, vindo em vários formatos possíveis, para {nome, codigo, quantidade, valorTotal, imagem}
function normalizePedidoItem(i, mult = 1) {
  const qtd = Number(i.quantidade || i.qtd || 1) * mult;
  const valorTotal = Number(
    i.valorTotalNumero != null ? i.valorTotalNumero
    : i.valorTotal != null ? parseMoney(i.valorTotal)
    : (i.valorUnitarioNumero != null ? i.valorUnitarioNumero : parseMoney(i.valorUnitario || 0)) * (Number(i.quantidade || 1))
  ) || 0;
  return {
    nome: String(i.produto || i.nome || i.name || '').trim(),
    codigo: String(i.codigo || i.codigoFarmasi || i.code || '').trim(),
    quantidade: qtd,
    valorTotal,
    imagem: String(i.imagem || i.image || '').trim()
  };
}

// Aceita: array puro de itens (bookmarklet pedido), {itens:[...]} ou combos com itensInternos
function normalizePedido(obj) {
  const arr = Array.isArray(obj) ? obj : (obj.itens || obj.produtos || []);
  const itens = arr.flatMap(i =>
    i.itensInternos
      ? i.itensInternos.map(x => normalizePedidoItem(x, Number(i.quantidade || 1)))
      : [normalizePedidoItem(i)]
  ).filter(i => i.nome);
  return dedupPedido(itens);
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
    ${items.length ? `<div class="table"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Situação</th><th>Qtd</th><th>Custo unitário</th><th>Preço de venda cadastrado</th><th>Pronta entrega</th><th>Monitorar</th><th></th>
    </tr></thead>
    <tbody>${items.map((i, k) => {
      const existente = achaProdutoExistente(i);
      const custoUnit = i.valorTotal ? i.valorTotal / i.quantidade : (i.custoUnitario || 0);
      const precoRef = existente ? Number(existente.precoVenda || existente.precoAtual || existente.precoOriginal || 0) : 0;
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

export function previewPedidoEstoque() {
  try {
    const obj = JSON.parse($('pedidoJson').value);
    window.__pedidoEstoque = normalizePedido(obj);
    renderPedidoPreview();
  } catch (e) { toast('JSON inválido: ' + e.message); }
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
