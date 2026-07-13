import { state, ref, setDoc, deleteDoc, serverTimestamp, prodById, toast, showModal, closeModal } from './state.js';
import { $, esc, money, parseMoney, searchPickerHtml } from './utils.js';
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

export function preEncomendaTabHtml() {
  const itens = state.data.preEncomenda;
  const aComprar = itens.filter(it => it.status !== 'pedido');
  const aguardando = itens.filter(it => it.status === 'pedido');
  return `<div class="panel">
    <div class="panel-head">
      <h3>Pré-encomenda</h3>
      <p class="muted" style="margin:0">O que você precisa comprar no site da Farmasi — código à mão pra facilitar o pedido.</p>
    </div>
    ${!itens.length ? '<p class="muted">Nenhum produto na pré-encomenda. Adicione pela tela de Produtos, Estoque (itens com estoque baixo) ou automaticamente quando vender algo sem estoque no carrinho.</p>' : `
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
  </div>`;
}

function pillOrigem(o) {
  const map = { manual: ['Manual', 'blue'], estoque_baixo: ['Estoque baixo', 'orange'], carrinho_sem_estoque: ['Venda sem estoque', 'red'], brinde: ['Brinde Farmasi', 'green'] };
  const [label, cor] = map[o] || ['Manual', 'blue'];
  return `<span class="tag ${cor}">${label}</span>`;
}
