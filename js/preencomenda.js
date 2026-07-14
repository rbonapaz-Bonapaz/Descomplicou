import { state, ref, setDoc, deleteDoc, serverTimestamp, prodById, toast, showModal, closeModal } from './state.js';
import { $, esc, money, parseMoney, searchPickerHtml, today, formatDateBR } from './utils.js';
import { entradaEstoque, perguntarAtivarProntaEntrega } from './estoque.js';

// Cada produto pode ter até 2 registros independentes na pré-encomenda — um pra "a comprar"
// (id `${produtoId}_pendente`) e outro pra "aguardando chegada" (id `${produtoId}_pedido`).
// São documentos separados de propósito: antes eram um único doc por produto, e marcar "já
// pedido" só trocava o status desse doc — daí um novo clique em "Pré-encomendar" (pra comprar
// MAIS depois de já ter pedido antes) achava o mesmo doc (agora com status "pedido") e somava
// ali, inflando "chegando" com quantidade que na verdade ainda não foi comprada.
const idPendente = produtoId => `${produtoId}_pendente`;
const idPedido = produtoId => `${produtoId}_pedido`;

// Soma, em tempo real, quantas unidades de um produto estão "presas" em carrinhos abertos/parciais
// como entrega futura (venda já feita, mas ainda sem estoque pra entregar) — nunca fica desatualizado
// porque não é salvo, é calculado direto de state.data.carrinhos a cada render.
function reservadoEmCarrinhos(produtoId) {
  return state.data.carrinhos
    .filter(c => c.status === 'aberto' || c.status === 'parcial' || c.status === 'finalizado')
    .reduce((s, c) => s + (c.itens || [])
      .filter(i => i.produtoId === produtoId && i.tipoEntrega === 'entrega_futura' && !i.entregue)
      .reduce((s2, i) => s2 + Number(i.quantidade || 0), 0), 0);
}

// Adiciona um produto à lista "a comprar". Se já tiver algo pendente desse produto, soma a
// quantidade em cima (funciona como um contador) sem nunca mexer nas observações já escritas —
// e sem tocar num eventual registro "chegando" do mesmo produto (são independentes agora).
export async function adicionarPreEncomenda(produtoId, origem = 'manual', incremento = 1) {
  const id = idPendente(produtoId);
  const jaExiste = state.data.preEncomenda.find(x => x.id === id);
  const inc = Math.max(1, Number(incremento || 1));
  if (jaExiste) {
    await setDoc(ref('preEncomenda', id), { quantidade: Number(jaExiste.quantidade || 0) + inc }, { merge: true });
    window.App.refresh(`Pré-encomenda: ${jaExiste.produtoNome} agora com ${Number(jaExiste.quantidade || 0) + inc} na lista`);
    return;
  }
  const p = prodById(produtoId);
  if (!p) return;
  await setDoc(ref('preEncomenda', id), {
    produtoId, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
    quantidade: inc, observacoes: '', origem, status: 'pendente', criadoEm: serverTimestamp()
  });
  window.App.refresh('Adicionado à pré-encomenda');
}

export async function atualizarItemPreEncomenda(itemId, campo, valor) {
  await setDoc(ref('preEncomenda', itemId), { [campo]: valor }, { merge: true });
}

export async function removerPreEncomenda(itemId) {
  await deleteDoc(ref('preEncomenda', itemId));
  window.App.refresh('Removido da pré-encomenda');
}

// Move (soma) a quantidade do registro "a comprar" pro registro "aguardando chegada" do mesmo
// produto — cria o registro de chegada se ainda não existir, ou soma nele se já existir (ex:
// segunda leva pedida antes da primeira chegar). O preço unitário informado acompanha, sem
// sobrescrever um preço que já estivesse lá se o novo vier vazio.
export async function marcarComoPedido(itemId) {
  const pendente = state.data.preEncomenda.find(x => x.id === itemId);
  if (!pendente) return;
  const destino = idPedido(pendente.produtoId);
  const jaChegando = state.data.preEncomenda.find(x => x.id === destino);
  await setDoc(ref('preEncomenda', destino), {
    produtoId: pendente.produtoId, produtoNome: pendente.produtoNome, codigoFarmasi: pendente.codigoFarmasi || '',
    quantidade: Number(jaChegando?.quantidade || 0) + Number(pendente.quantidade || 0),
    precoUnitario: pendente.precoUnitario || jaChegando?.precoUnitario || '',
    observacoes: jaChegando?.observacoes || pendente.observacoes || '',
    origem: pendente.origem, status: 'pedido',
    criadoEm: jaChegando?.criadoEm || serverTimestamp()
  }, { merge: true });
  await deleteDoc(ref('preEncomenda', itemId));
  window.App.refresh('Marcado como pedido — aguardando chegada');
}

// Caminho inverso: volta (soma) a quantidade de "aguardando chegada" pra "a comprar".
export async function voltarParaComprar(itemId) {
  const pedido = state.data.preEncomenda.find(x => x.id === itemId);
  if (!pedido) return;
  const destino = idPendente(pedido.produtoId);
  const jaNaLista = state.data.preEncomenda.find(x => x.id === destino);
  await setDoc(ref('preEncomenda', destino), {
    produtoId: pedido.produtoId, produtoNome: pedido.produtoNome, codigoFarmasi: pedido.codigoFarmasi || '',
    quantidade: Number(jaNaLista?.quantidade || 0) + Number(pedido.quantidade || 0),
    precoUnitario: jaNaLista?.precoUnitario || pedido.precoUnitario || '',
    observacoes: jaNaLista?.observacoes || pedido.observacoes || '',
    origem: pedido.origem, status: 'pendente',
    criadoEm: jaNaLista?.criadoEm || serverTimestamp()
  }, { merge: true });
  await deleteDoc(ref('preEncomenda', itemId));
  window.App.refresh('Voltou para "A comprar"');
}

// Confirma que o produto chegou: dá entrada no estoque com a quantidade e o custo realmente
// pagos, ativa pronta entrega automaticamente (perguntando antes se a consultora tinha desativado
// manualmente), e remove o item da pré-encomenda (seu ciclo termina aqui). Se vier menos do que o
// pedido (faltou item), a diferença fica de fora do estoque — a consultora pode adicionar de
// novo à pré-encomenda se precisar completar depois.
export async function confirmarChegada(itemId) {
  const item = state.data.preEncomenda.find(x => x.id === itemId);
  if (!item) return;
  const qtd = Number($(`chQtd_${itemId}`)?.value || item.quantidade || 1);
  const custo = parseMoney($(`chCusto_${itemId}`)?.value || 0);
  if (qtd <= 0) return toast('Informe uma quantidade maior que zero');
  try {
    await perguntarAtivarProntaEntrega(item.produtoId);
    await entradaEstoque(item.produtoId, qtd, custo, item.origem === 'brinde' ? 'Brinde Farmasi' : 'Compra', 'pre_encomenda');
  } catch (e) { return toast('Erro ao dar entrada no estoque: ' + e.message); }
  await deleteDoc(ref('preEncomenda', itemId));
  window.App.refresh(`${item.produtoNome}: entrada de ${qtd} un. registrada no estoque`);
}

// Adiciona um brinde recebido da Farmasi (não estava na pré-encomenda) direto na lista de
// "aguardando chegada" — quando confirmar a chegada, o custo padrão é 0 (mas pode editar). Se já
// houver um registro de chegada desse produto, soma a quantidade em vez de duplicar.
export function abrirModalBrinde() {
  const picker = searchPickerHtml('bdProd', state.data.produtos, p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''}`);
  showModal(`<h3>🎁 Adicionar brinde recebido</h3>
    <p class="muted">Produtos que a Farmasi manda de brinde conforme o valor do pedido — dá entrada no estoque com custo zero.</p>
    <div class="grid">
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="bdQtd" type="number" min="1" value="1"></div>
    </div><br>
    <button class="btn dark" onclick="App.confirmarBrinde()">Adicionar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarBrinde() {
  const produtoId = $('bdProd')?.value;
  const p = prodById(produtoId);
  if (!p) return toast('Selecione um produto');
  const qtd = Math.max(1, Number($('bdQtd')?.value || 1));
  const id = idPedido(produtoId);
  const jaChegando = state.data.preEncomenda.find(x => x.id === id);
  await setDoc(ref('preEncomenda', id), {
    produtoId, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
    quantidade: Number(jaChegando?.quantidade || 0) + qtd,
    precoUnitario: jaChegando?.precoUnitario || '', observacoes: jaChegando?.observacoes || '',
    origem: 'brinde', status: 'pedido', criadoEm: jaChegando?.criadoEm || serverTimestamp()
  }, { merge: true });
  closeModal();
  window.App.refresh('Brinde adicionado — confirme a chegada pra atualizar o estoque');
}

// Botão reutilizável em Produtos/Estoque — cada clique soma +1 na pré-encomenda (funciona como
// contador). Mostra ao lado quantos desse produto ainda estão "a comprar" ("X na lista") e/ou
// quantos já foram pedidos e estão a caminho ("X chegando") — em linhas separadas, já que agora
// são dois registros distintos e podem coexistir sem conflito.
export function btnAdicionarPreEncomenda(produtoId) {
  const naLista = Number(state.data.preEncomenda.find(x => x.id === idPendente(produtoId))?.quantidade || 0);
  const chegando = Number(state.data.preEncomenda.find(x => x.id === idPedido(produtoId))?.quantidade || 0);
  const badges = `${naLista > 0 ? `<span class="tag blue" title="Ainda precisa comprar">${naLista} na lista</span>` : ''}${chegando > 0 ? `<span class="tag orange" title="Já pedido, aguardando chegar">${chegando} chegando</span>` : ''}`;
  return `<button class="btn small" onclick="App.adicionarPreEncomenda('${produtoId}','manual',1)" title="Adicionar à pré-encomenda">📋 Pré-encomendar</button>${badges ? `<div style="display:flex;flex-direction:column;gap:2px">${badges}</div>` : ''}`;
}

// --- KITs da Farmasi (ex: 3 produtos que somam R$290 pelo site por R$185) ---
// Kit é o que a CONSULTORA compra da Farmasi, não o que vende ao cliente. Montar um kit aqui
// adiciona os componentes na lista "A comprar" com o custo unitário previsto já rateado
// proporcionalmente ao preço de referência de cada um — quando o pedido chegar, esse custo
// alimenta o custo médio do estoque.
let kitTemp = { nome: '', valor: '', itens: [] };

function precoReferencia(p) {
  return Number(p.precoOriginal || 0) || Number(p.precoAtual || 0) || Number(p.precoVenda || 0);
}

export function openKitForm(manterComposicao = false) {
  if (!manterComposicao) kitTemp = { nome: '', valor: '', itens: [] };

  const picker = searchPickerHtml('kitProd', state.data.produtos,
    p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | ref: ${money(precoReferencia(p))}`);

  const totalRef = kitTemp.itens.reduce((s, it) => {
    const p = prodById(it.produtoId);
    return s + (p ? precoReferencia(p) * it.quantidade : 0);
  }, 0);
  const valorKit = parseMoney(kitTemp.valor);

  const linhas = kitTemp.itens.map((it, idx) => {
    const p = prodById(it.produtoId);
    if (!p) return '';
    const refTotal = precoReferencia(p) * it.quantidade;
    const proporcional = totalRef > 0 ? valorKit * refTotal / totalRef : (kitTemp.itens.length ? valorKit / kitTemp.itens.length : 0);
    return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--line)">
      <span>${it.quantidade}× ${esc(p.nome)} <small class="muted">(ref: ${money(refTotal)})</small></span>
      <span style="white-space:nowrap">${valorKit > 0 ? `custo <b>${money(it.quantidade ? proporcional / it.quantidade : 0)}</b>/un. ` : ''}<button class="btn small" style="color:var(--error)" onclick="App.removerProdutoKit(${idx})">✗</button></span>
    </div>`;
  }).join('');

  showModal(`<h3>🎁 Montar kit Farmasi</h3>
    <p class="muted">Kit que você vai comprar no site da Farmasi. O valor pago é distribuído entre os produtos na proporção do preço de referência — o custo previsto de cada um entra na lista "A comprar" e vira custo médio quando chegar. Valor R$ 0,00 = kit de brinde (custo zero).</p>
    <div class="grid">
      <div class="field"><label>Nome do kit</label><input id="kitNome" value="${esc(kitTemp.nome)}" placeholder="Ex: Kit Nutriplus"></div>
      <div class="field"><label>Valor pago pelo kit</label><input id="kitValor" value="${esc(kitTemp.valor)}" placeholder="Ex: 185,00"></div>
      <div class="field full"><label>Produto</label>${picker}</div>
      <div class="field"><label>Quantidade</label><input id="kitQtd" type="number" value="1" min="1"></div>
    </div>
    <br><button class="btn small dark" onclick="App.adicionarProdutoKit()">+ Incluir no kit</button>
    ${kitTemp.itens.length ? `<div class="panel" style="background:#F7FAFC;margin-top:12px">
      <h4 style="margin:0 0 6px">Composição (${kitTemp.itens.length}) — referência total: ${money(totalRef)}</h4>
      ${linhas}
      ${valorKit > 0 && totalRef > 0 ? `<p class="muted" style="margin:8px 0 0">Economia do kit: ${money(totalRef - valorKit)} (${Math.round((1 - valorKit / totalRef) * 100)}% sobre a referência)</p>` : ''}
    </div>` : ''}
    <br>
    <button class="btn dark" onclick="App.confirmarKit()">Adicionar à lista "A comprar"</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

function guardarCamposKit() {
  kitTemp.nome = $('kitNome')?.value ?? kitTemp.nome;
  kitTemp.valor = $('kitValor')?.value ?? kitTemp.valor;
}

export function adicionarProdutoKit() {
  const p = prodById($('kitProd')?.value);
  if (!p) return toast('Selecione um produto');
  const qtd = Math.max(1, Number($('kitQtd')?.value || 1));
  guardarCamposKit();
  const existente = kitTemp.itens.find(it => it.produtoId === p.id);
  if (existente) existente.quantidade += qtd;
  else kitTemp.itens.push({ produtoId: p.id, quantidade: qtd });
  openKitForm(true);
}

export function removerProdutoKit(idx) {
  guardarCamposKit();
  kitTemp.itens.splice(idx, 1);
  openKitForm(true);
}

export async function confirmarKit() {
  guardarCamposKit();
  if (kitTemp.itens.length < 2) return toast('Inclua pelo menos 2 produtos no kit');
  const valorKit = parseMoney(kitTemp.valor);
  const kitNome = (kitTemp.nome || '').trim() || 'Kit';

  const totalRef = kitTemp.itens.reduce((s, it) => s + precoReferencia(prodById(it.produtoId)) * it.quantidade, 0);
  let somaDistribuida = 0;

  for (let i = 0; i < kitTemp.itens.length; i++) {
    const it = kitTemp.itens[i];
    const p = prodById(it.produtoId);
    if (!p) continue;
    const refTotal = precoReferencia(p) * it.quantidade;
    // Rateio proporcional à referência (ou igualitário se nenhum componente tem preço); o último
    // item recebe o resíduo do arredondamento para a soma bater exatamente com o valor do kit.
    const ultimo = i === kitTemp.itens.length - 1;
    const custoTotalItem = valorKit <= 0.004 ? 0
      : ultimo ? Math.round((valorKit - somaDistribuida) * 100) / 100
      : Math.round((totalRef > 0 ? valorKit * refTotal / totalRef : valorKit / kitTemp.itens.length) * 100) / 100;
    somaDistribuida += custoTotalItem;
    const custoUnit = it.quantidade ? custoTotalItem / it.quantidade : 0;

    // Mesmo padrão do adicionarPreEncomenda: soma no registro "a comprar" se já existir. O custo
    // rateado do kit vai no preço unitário previsto (pré-preenche o custo na hora da chegada).
    const id = idPendente(p.id);
    const jaExiste = state.data.preEncomenda.find(x => x.id === id);
    const obsKit = `Kit: ${kitNome}`;
    await setDoc(ref('preEncomenda', id), {
      produtoId: p.id, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
      quantidade: Number(jaExiste?.quantidade || 0) + it.quantidade,
      precoUnitario: money(custoUnit),
      observacoes: jaExiste?.observacoes ? (jaExiste.observacoes.includes(obsKit) ? jaExiste.observacoes : `${jaExiste.observacoes} | ${obsKit}`) : obsKit,
      origem: 'kit', status: 'pendente',
      criadoEm: jaExiste?.criadoEm || serverTimestamp()
    }, { merge: true });
  }

  kitTemp = { nome: '', valor: '', itens: [] };
  closeModal();
  window.App.refresh(`Kit "${kitNome}" adicionado à lista "A comprar"`);
}

// --- Frete pago à Farmasi (despesa simples, decidido em 14/07/2026) ---
// Registrado na coleção "despesas" e descontado do lucro líquido nos Relatórios.
export async function registrarFreteFarmasi() {
  const valor = parseMoney($('freteValor')?.value);
  if (valor <= 0) return toast('Informe o valor do frete');
  const data = $('freteData')?.value || today();
  await setDoc(ref('despesas', 'frete_' + Date.now()), {
    tipo: 'frete_farmasi', valor, data,
    observacoes: $('freteObs')?.value || '', criadoEm: serverTimestamp()
  });
  window.App.refresh(`Frete de ${money(valor)} registrado`);
}

export async function removerFreteFarmasi(id) {
  if (!confirm('Remover este registro de frete?')) return;
  await deleteDoc(ref('despesas', id));
  window.App.refresh('Registro de frete removido');
}

function fretePanelHtml() {
  const fretes = (state.data.despesas || [])
    .filter(x => x.tipo === 'frete_farmasi')
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const total = fretes.reduce((s, x) => s + Number(x.valor || 0), 0);
  return `<div class="panel">
    <div class="panel-head">
      <h3>🚚 Frete pago à Farmasi</h3>
      ${fretes.length ? `<span class="muted">Total registrado: <b>${money(total)}</b></span>` : ''}
    </div>
    <p class="muted">Registre o frete de cada pedido feito no site da Farmasi — entra como despesa e é descontado do lucro líquido nos Relatórios.</p>
    <div class="toolbar">
      <input id="freteValor" placeholder="Valor (ex: 25,90)" style="max-width:160px">
      <input id="freteData" type="date" value="${today()}" style="max-width:170px">
      <input id="freteObs" placeholder="Observação (ex: pedido de julho)">
      <button class="btn dark small" onclick="App.registrarFreteFarmasi()">+ Registrar</button>
    </div>
    ${fretes.length ? `<div class="table" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Valor</th><th>Observação</th><th></th></tr></thead><tbody>
      ${fretes.map(f => `<tr>
        <td data-label="Data">${formatDateBR(f.data)}</td>
        <td data-label="Valor">${money(f.valor)}</td>
        <td data-label="Observação">${esc(f.observacoes || '-')}</td>
        <td><button class="btn small" style="color:var(--error)" onclick="App.removerFreteFarmasi('${f.id}')">🗑️</button></td>
      </tr>`).join('')}
    </tbody></table></div>` : ''}
  </div>`;
}

export function preEncomendaTabHtml() {
  const itens = state.data.preEncomenda;
  const aComprar = itens.filter(it => it.status !== 'pedido');
  const aguardando = itens.filter(it => it.status === 'pedido');
  return `<div class="panel">
    <div class="panel-head">
      <h3>Pré-encomenda</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <p class="muted" style="margin:0">O que você precisa comprar no site da Farmasi — código à mão pra facilitar o pedido.</p>
        <button class="btn small pink" onclick="App.openKitForm()">🎁 Montar kit</button>
      </div>
    </div>
    ${!itens.length ? '<p class="muted">Nenhum produto na pré-encomenda. Adicione pela tela de Produtos, Estoque (itens com estoque baixo), monte um kit aqui, ou automaticamente quando vender algo sem estoque no carrinho.</p>' : `
    <h4 style="margin:16px 0 8px">A comprar (${aComprar.length})</h4>
    ${!aComprar.length ? '<p class="muted">Nada pendente de compra.</p>' : `
    <div class="table"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Estoque atual</th><th>Reservado (carrinhos)</th><th>Comprar</th><th>Preço unit.</th><th>Observações</th><th>Origem</th><th>Ações</th>
    </tr></thead><tbody>${aComprar.map(it => {
      const p = prodById(it.produtoId);
      const reservado = reservadoEmCarrinhos(it.produtoId);
      return `<tr>
        <td data-label="Produto"><div style="display:flex;align-items:center;gap:8px">${p?.imagem ? `<img src="${esc(p.imagem)}" style="width:32px;height:32px;object-fit:contain;border-radius:8px;background:#F3F6FA" onerror="this.style.visibility='hidden'">` : ''}${esc(it.produtoNome)}</div></td>
        <td data-label="Código">${esc(it.codigoFarmasi || '-')}</td>
        <td data-label="Estoque atual">${p ? Number(p.estoqueAtual || 0) : '-'}</td>
        <td data-label="Reservado">${reservado > 0 ? `<span style="color:var(--error);font-weight:900">${reservado}</span>` : '0'}</td>
        <td data-label="Comprar"><input type="number" min="1" style="width:80px" value="${Number(it.quantidade || 1)}" onchange="App.atualizarItemPreEncomenda('${it.id}','quantidade',Number(this.value))"></td>
        <td data-label="Preço unit."><input style="width:90px" placeholder="0,00" value="${it.precoUnitario ? esc(it.precoUnitario) : ''}" onchange="App.atualizarItemPreEncomenda('${it.id}','precoUnitario',this.value)"></td>
        <td data-label="Observações"><input value="${esc(it.observacoes || '')}" placeholder="Ex: cor, tamanho..." onchange="App.atualizarItemPreEncomenda('${it.id}','observacoes',this.value)"></td>
        <td data-label="Origem">${pillOrigem(it.origem)}</td>
        <td data-label="Ações"><div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn small" style="color:var(--success)" onclick="App.marcarComoPedido('${it.id}')">✅ Pedido</button>
          <button class="btn small" style="color:var(--error)" onclick="App.removerPreEncomenda('${it.id}')">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`}

    <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 8px">
      <h4 style="margin:0">Pedido — aguardando chegada (${aguardando.length})</h4>
      <button class="btn small" onclick="App.abrirModalBrinde()">🎁 Adicionar brinde</button>
    </div>
    ${!aguardando.length ? '<p class="muted">Nada aguardando chegada.</p>' : `
    <p class="muted" style="margin:0 0 10px">Quando os produtos chegarem, confira a quantidade e o preço pago e confirme — isso dá entrada no estoque automaticamente.</p>
    <div class="table"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Pedido</th><th>Qtd recebida</th><th>Custo unit. pago</th><th>Origem</th><th>Ações</th>
    </tr></thead><tbody>${aguardando.map(it => {
      const p = prodById(it.produtoId);
      return `<tr>
        <td data-label="Produto"><div style="display:flex;align-items:center;gap:8px">${p?.imagem ? `<img src="${esc(p.imagem)}" style="width:32px;height:32px;object-fit:contain;border-radius:8px;background:#F3F6FA" onerror="this.style.visibility='hidden'">` : ''}${esc(it.produtoNome)}</div></td>
        <td data-label="Código">${esc(it.codigoFarmasi || '-')}</td>
        <td data-label="Pedido">${Number(it.quantidade || 1)}</td>
        <td data-label="Qtd recebida"><input id="chQtd_${it.id}" type="number" min="1" style="width:80px" value="${Number(it.quantidade || 1)}"></td>
        <td data-label="Custo unit. pago"><input id="chCusto_${it.id}" placeholder="0,00" value="${it.precoUnitario ? esc(it.precoUnitario) : ''}"></td>
        <td data-label="Origem">${pillOrigem(it.origem)}</td>
        <td data-label="Ações"><div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn small dark" onclick="App.confirmarChegada('${it.id}')">📦 Confirmar chegada</button>
          <button class="btn small" onclick="App.voltarParaComprar('${it.id}')" title="Voltar pra 'A comprar'">↩️</button>
          <button class="btn small" style="color:var(--error)" onclick="App.removerPreEncomenda('${it.id}')">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`}
    `}
  </div>${fretePanelHtml()}`;
}

function pillOrigem(o) {
  const map = { manual: ['Manual', 'blue'], estoque_baixo: ['Estoque baixo', 'orange'], carrinho_sem_estoque: ['Venda sem estoque', 'red'], brinde: ['Brinde Farmasi', 'green'], kit: ['Kit Farmasi', 'pink'] };
  const [label, cor] = map[o] || ['Manual', 'blue'];
  return `<span class="tag ${cor}">${label}</span>`;
}
