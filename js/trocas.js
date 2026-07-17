// Troca de produtos com outra consultora/influencer (ex: café por goma): funciona como um
// "carrinho" dividido em duas listas — produtos que saem do seu estoque e produtos que entram —
// cada item com valor unitário e podendo ser pronta entrega (processa na hora) ou entrega futura
// (fica pendente até você marcar como entregue/recebido). Não gera receita nem lucro nos relatórios.
import { state, col, ref, showModal, closeModal, toast, setDoc, addDoc, deleteDoc, serverTimestamp, prodById, cliById, estoqueDisponivel, reservadoEmAberto } from './state.js';
import { $, esc, money, parseMoney, pill, searchPickerHtml, toggleHtml } from './utils.js';
import { entradaEstoque, saidaEstoque } from './estoque.js';

function motivoTroca(t) {
  return t.parceira ? `Troca (${t.parceira})` : 'Troca';
}

function calcValor(itens) {
  return (itens || []).reduce((s, i) => s + Number(i.valorTotal || 0), 0);
}

// Busca a parceira entre as clientes já cadastradas (evita nome digitado diferente a cada troca,
// o que bagunçaria qualquer relatório por parceira no futuro) — com opção de texto livre pra
// quando ela ainda não é uma cliente cadastrada no CRM.
function parceiraPickerHtml(parceiraAtual = '') {
  const opcoes = [{ id: '', nome: '— Nenhuma / não está na lista —' }, ...state.data.clientes];
  const picker = searchPickerHtml('trParceiraId', opcoes, c => c.nome, 'App.preencherNomeParceira()');
  return `<div class="field full"><label>Parceira (busque uma cliente já cadastrada)</label>${picker}</div>
    <div class="field full"><label>Ou digite o nome (se não for cliente cadastrada)</label><input id="trParceiraNome" placeholder="Ex: @outraconsultora" value="${esc(parceiraAtual)}"></div>`;
}

export function preencherNomeParceira() {
  const c = cliById($('trParceiraId')?.value);
  if ($('trParceiraNome')) $('trParceiraNome').value = c ? c.nome : '';
}

export function abrirNovaTroca() {
  showModal(`<h3>🔁 Nova troca</h3>
    <div class="grid">${parceiraPickerHtml()}</div><br>
    <button class="btn dark" onclick="App.confirmarNovaTroca()">Iniciar troca</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarNovaTroca() {
  const cliente = cliById($('trParceiraId')?.value);
  const parceira = cliente ? cliente.nome : ($('trParceiraNome')?.value.trim() || '');
  const r = await addDoc(col('trocas'), {
    parceira, parceiraClienteId: cliente?.id || '', status: 'aberta',
    itensSaida: [], itensEntrada: [], valorSaida: 0, valorEntrada: 0,
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  });
  await window.App.refresh();
  openTroca(r.id);
}

export function editarParceiraTroca(trocaId) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  showModal(`<h3>Editar parceira da troca</h3>
    <div class="grid">${parceiraPickerHtml(t.parceira)}</div><br>
    <button class="btn dark" onclick="App.salvarParceiraTroca('${trocaId}')">Salvar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function salvarParceiraTroca(trocaId) {
  const cliente = cliById($('trParceiraId')?.value);
  const parceira = cliente ? cliente.nome : ($('trParceiraNome')?.value.trim() || '');
  await setDoc(ref('trocas', trocaId), { parceira, parceiraClienteId: cliente?.id || '', atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh('Parceira atualizada');
}

export async function excluirTroca(trocaId) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  const temProcessados = [...(t.itensSaida || []), ...(t.itensEntrada || [])].some(i => i.processado);
  if (!confirm(`Excluir esta troca${t.parceira ? ' com ' + t.parceira : ''}?${temProcessados ? '\nAtenção: itens já processados (baixa/entrada já feita no estoque) NÃO são revertidos automaticamente.' : ''}`)) return;
  await deleteDoc(ref('trocas', trocaId));
  closeModal();
  window.App.refresh('Troca excluída');
}

// Valor do item na troca = SEMPRE o preço atual do produto; sem preço atual, cai pro preço
// original (pedido da consultora). A consultora ainda pode editar o valor na mão depois.
function valorTrocaProduto(p) {
  return Number(p?.precoAtual || p?.precoOriginal || 0);
}

export function preencherValorTrocaSaida() {
  const p = prodById($('trProdSai')?.value);
  if ($('trValorSai') && p) $('trValorSai').value = money(valorTrocaProduto(p));
  // Sem estoque disponível pra entregar agora, já deixa selecionado "entrega futura" — evita
  // que a consultora tente confirmar "pronta entrega" e leve o toast de estoque insuficiente.
  if ($('trEntregaSai') && p) {
    $('trEntregaSai').value = estoqueDisponivel(p.id) > 0 ? 'pronta_entrega' : 'entrega_futura';
  }
}

// Mesma regra do lado que entra: ao escolher um produto já cadastrado, traz o preço atual (ou o
// original, se não houver atual). Produto novo (id vazio, digitado à mão) não tem preço a puxar —
// deixa o campo em branco pra consultora informar.
export function preencherValorTrocaEntrada() {
  const p = prodById($('trProdEntra')?.value);
  if ($('trValorEntra')) $('trValorEntra').value = p ? money(valorTrocaProduto(p)) : '';
}

function itemRowHtml(trocaId, lado, item, idx) {
  const pendente = item.tipoEntrega === 'entrega_futura' && !item.processado;
  const entregaLabel = item.tipoEntrega === 'entrega_futura' ? (item.processado ? (lado === 'saida' ? 'Entregue' : 'Recebido') : 'Futura') : 'Pronta';
  const entregaCor = item.tipoEntrega === 'entrega_futura' ? (item.processado ? 'green' : 'orange') : 'green';
  return `<tr>
    <td data-label="Produto">${esc(item.produtoNome)}</td>
    <td data-label="Qtd">${item.quantidade}</td>
    <td data-label="Valor unit.">${money(item.valorUnitario)}</td>
    <td data-label="Total">${money(item.valorTotal)}</td>
    <td data-label="Entrega">${pill(entregaLabel, entregaCor)}</td>
    <td data-label="">${pendente ? `<button class="btn small" onclick="App.marcarItemTrocaProcessado('${trocaId}','${lado}',${idx})">✓ ${lado === 'saida' ? 'Dar baixa' : 'Deu entrada'}</button>` : ''}
      <button class="btn small" style="color:var(--error)" onclick="App.removerItemTroca('${trocaId}','${lado}',${idx})" title="Remover item da troca">✗</button></td>
  </tr>`;
}

function ladoTableHtml(trocaId, lado, itens) {
  if (!itens.length) return '<p class="muted">Nenhum item ainda.</p>';
  const cor = lado === 'saida' ? '#EAF0F5' : '#EAF7EC';
  return `<div class="table" style="background:${cor}"><table><thead><tr>
    <th>Produto</th><th>Qtd</th><th>Valor unit.</th><th>Total</th><th>Entrega</th><th></th>
  </tr></thead><tbody>${itens.map((it, idx) => itemRowHtml(trocaId, lado, it, idx)).join('')}</tbody></table></div>`;
}

export function openTroca(id) {
  const t = state.data.trocas.find(x => x.id === id);
  if (!t) return;
  const itensSaida = t.itensSaida || [], itensEntrada = t.itensEntrada || [];
  const aberta = t.status === 'aberta' || t.status === 'parcial';
  const podeAdicionar = t.status === 'aberta';
  const mostrarSem = t.mostrarSemEstoque;
  const pickerSai = searchPickerHtml('trProdSai', state.data.produtos.filter(p => mostrarSem || estoqueDisponivel(p.id) > 0),
    p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | disp: ${estoqueDisponivel(p.id)} | ${money(p.precoVenda || p.precoAtual || 0)}`, 'App.preencherValorTrocaSaida()');
  const pickerEntra = searchPickerHtml('trProdEntra',
    [{ id: '', nome: '— Produto novo (digite o nome abaixo) —' }, ...state.data.produtos],
    p => p.id ? `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''}` : p.nome, 'App.preencherValorTrocaEntrada()');

  const statusLabel = { aberta: 'Em andamento', parcial: 'Parcial (pendências)', finalizada: 'Finalizada', cancelada: 'Cancelada' }[t.status] || t.status;
  const statusCor = t.status === 'finalizada' ? 'green' : t.status === 'cancelada' ? 'red' : t.status === 'parcial' ? 'orange' : 'blue';

  showModal(`<div class="carrinho-modal">
    <h3>🔁 Troca ${t.parceira ? 'com ' + esc(t.parceira) : ''}</h3>
    ${pill(statusLabel, statusCor)}

    <h4 style="margin:14px 0 8px;color:var(--gold)">📤 Produtos que saem (seu estoque)</h4>
    ${ladoTableHtml(id, 'saida', itensSaida)}
    ${podeAdicionar ? `<div class="panel" style="background:#F7FAFC;margin-top:10px">
      <div style="margin-bottom:10px">${toggleHtml('trMostrarSem', mostrarSem, `App.toggleTrocaOpt('${id}','mostrarSemEstoque',this.checked)`, 'Mostrar itens sem estoque',
        '<span class="info-ico" tabindex="0">ⓘ<span class="info-tip">Libera escolher produtos sem estoque disponível — use "Vou entregar depois" nesses: a baixa acontece sozinha quando chegar estoque.</span></span>')}</div>
      <div class="grid">
        <div class="field full"><label>Produto</label>${pickerSai}</div>
        <div class="field"><label>Quantidade</label><input id="trQtdSai" type="number" value="1"></div>
        <div class="field"><label>Valor unitário</label><input id="trValorSai" placeholder="0,00"></div>
        <div class="field"><label>Entrega</label>
          <select id="trEntregaSai">
            <option value="pronta_entrega">Já vou entregar agora</option>
            <option value="entrega_futura">Vou entregar depois</option>
          </select>
        </div>
      </div>
      <button class="btn dark small" style="margin-top:8px" onclick="App.adicionarItemTroca('${id}','saida')">+ Adicionar</button>
    </div>` : ''}

    <h4 style="margin:18px 0 8px;color:var(--success)">📥 Produtos que entram (recebidos)</h4>
    ${ladoTableHtml(id, 'entrada', itensEntrada)}
    ${podeAdicionar ? `<div class="panel" style="background:#F7FAFC;margin-top:10px">
      <div class="grid">
        <div class="field full"><label>Produto</label>${pickerEntra}</div>
        <div class="field full"><label>Produto novo? Digite o nome (só se não achou na busca acima)</label><input id="trNomeEntra" placeholder="Ex: Goma de mascar"></div>
        <div class="field"><label>Código Farmasi (opcional)</label><input id="trCodigoEntra"></div>
        <div class="field"><label>Quantidade</label><input id="trQtdEntra" type="number" value="1"></div>
        <div class="field"><label>Valor unitário (opcional)</label><input id="trValorEntra" placeholder="0,00"></div>
        <div class="field"><label>Entrega</label>
          <select id="trEntregaEntra">
            <option value="pronta_entrega">Já recebi agora</option>
            <option value="entrega_futura">Vou receber depois</option>
          </select>
        </div>
      </div>
      <button class="btn dark small" style="margin-top:8px" onclick="App.adicionarItemTroca('${id}','entrada')">+ Adicionar</button>
    </div>` : ''}

    ${(() => {
      const vSaida = Number(t.valorSaida || 0), vEntrada = Number(t.valorEntrada || 0);
      const diff = vEntrada - vSaida;
      const pct = vSaida > 0.004 ? (diff / vSaida) * 100 : (diff > 0.004 ? 100 : 0);
      const cor = diff > 0.004 ? 'var(--success)' : diff < -0.004 ? 'var(--error)' : 'var(--text)';
      return `<div class="cards" style="margin-top:16px">
        <div class="card" style="background:#EAF0F5"><span>Total saída</span><b>${money(vSaida)}</b></div>
        <div class="card" style="background:#EAF7EC"><span>Total entrada</span><b>${money(vEntrada)}</b></div>
        <div class="card"><span>${diff > 0.004 ? 'Lucro' : diff < -0.004 ? 'Prejuízo' : 'Diferença'}</span><b style="color:${cor}">${money(Math.abs(diff))}${Math.abs(diff) > 0.004 ? ` (${diff > 0 ? '+' : '-'}${Math.abs(pct).toFixed(0)}%)` : ''}</b></div>
      </div>`;
    })()}

    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      ${t.status === 'aberta' ? `<button class="btn dark" onclick="App.finalizarTroca('${id}')">✓ Finalizar troca</button>
        <button class="btn" onclick="App.salvarTroca('${id}')">💾 Salvar</button>
        <button class="btn small" style="color:var(--error)" onclick="App.cancelarTroca('${id}')">✗ Cancelar</button>` : ''}
      ${t.status === 'finalizada' || t.status === 'parcial' ? `<button class="btn" onclick="App.reabrirTroca('${id}')" title="Estorna os lançamentos de estoque já processados e volta a troca para 'Em andamento'">↩️ Reabrir troca</button>` : ''}
      <button class="btn small" onclick="App.editarParceiraTroca('${id}')">✏️ Editar parceira</button>
      <button class="btn small" style="color:var(--error)" onclick="App.excluirTroca('${id}')">🗑️ Excluir troca</button>
      <button class="btn ghost" onclick="App.closeModal()">Fechar</button>
    </div>
  </div>`, { wide: true });
}

export async function toggleTrocaOpt(id, campo, valor) {
  await setDoc(ref('trocas', id), { [campo]: valor, atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh();
  openTroca(id);
}

// Os itens já são gravados a cada adição — este botão é a forma explícita de "guardar e sair"
// sem finalizar a troca (que baixa/entra estoque). Só confirma a persistência e fecha a janela.
export async function salvarTroca(id) {
  await setDoc(ref('trocas', id), { atualizadoEm: serverTimestamp() }, { merge: true });
  closeModal();
  window.App.refresh('Troca salva — continue depois quando quiser');
}

export async function adicionarItemTroca(trocaId, lado) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  let item;

  if (lado === 'saida') {
    const p = prodById($('trProdSai').value);
    if (!p) return toast('Selecione o produto que sai');
    const qtd = Number($('trQtdSai').value || 1);
    const tipoEntregaSai = $('trEntregaSai').value;
    // A checagem de estoque só bloqueia entrega "pronta" — igual ao carrinho de vendas, "vou
    // entregar depois" é justamente a opção pra quando ainda não tem o produto em mãos. Quando
    // chegar estoque novo, a baixa desse item pendente acontece sozinha (converterEntregaFuturaAutomatico).
    if (tipoEntregaSai === 'pronta_entrega') {
      // Desconta tudo que já está reservado em carrinhos abertos e trocas em andamento (incluindo
      // esta mesma troca) — mesma proteção do carrinho de vendas, pra não comprometer mais do que
      // existe de fato em estoque, seja nesta troca ou em qualquer outro carrinho/troca aberto.
      const disponivel = estoqueDisponivel(p.id);
      if (disponivel < qtd) {
        const reservado = reservadoEmAberto(p.id, '', trocaId);
        return toast(reservado > 0
          ? `Estoque insuficiente: ${reservado} unidade(s) já reservada(s) em outro carrinho/troca aberto.`
          : 'Estoque insuficiente');
      }
    }
    const valorUnitario = parseMoney($('trValorSai').value) || valorTrocaProduto(p);
    item = {
      produtoId: p.id, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
      quantidade: qtd, valorUnitario, valorTotal: valorUnitario * qtd,
      tipoEntrega: tipoEntregaSai, processado: false
    };
  } else {
    // Prioriza o produto escolhido na busca (mesma experiência do lado "saem"); o campo de texto
    // livre fica só pra produto que ainda não existe no cadastro — nesse caso é criado na hora.
    const existente = prodById($('trProdEntra')?.value);
    let produtoId, nome, codigo;
    if (existente) {
      produtoId = existente.id; nome = existente.nome; codigo = existente.codigoFarmasi || '';
    } else {
      nome = $('trNomeEntra').value.trim();
      if (!nome) return toast('Escolha um produto na busca ou digite o nome de um produto novo');
      codigo = $('trCodigoEntra').value.trim() || '';
      const { upsertProduto } = await import('./produtos.js');
      produtoId = await upsertProduto({ nome, codigoFarmasi: codigo });
    }
    const qtd = Number($('trQtdEntra').value || 1);
    const valorUnitario = parseMoney($('trValorEntra').value || 0);
    item = {
      produtoId, produtoNome: nome, codigoFarmasi: codigo,
      quantidade: qtd, valorUnitario, valorTotal: valorUnitario * qtd,
      tipoEntrega: $('trEntregaEntra').value, processado: false
    };
  }

  const campo = lado === 'saida' ? 'itensSaida' : 'itensEntrada';
  const valorCampo = lado === 'saida' ? 'valorSaida' : 'valorEntrada';
  const itens = [...(t[campo] || []), item];

  await setDoc(ref('trocas', trocaId), { [campo]: itens, [valorCampo]: calcValor(itens), atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh();
  openTroca(trocaId);
}

export async function removerItemTroca(trocaId, lado, idx) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  const campo = lado === 'saida' ? 'itensSaida' : 'itensEntrada';
  const valorCampo = lado === 'saida' ? 'valorSaida' : 'valorEntrada';
  const itens = [...(t[campo] || [])];
  itens.splice(idx, 1);

  await setDoc(ref('trocas', trocaId), { [campo]: itens, [valorCampo]: calcValor(itens), atualizadoEm: serverTimestamp() }, { merge: true });
  await window.App.refresh();
  openTroca(trocaId);
}

export async function finalizarTroca(trocaId) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  if (!(t.itensSaida?.length || t.itensEntrada?.length)) return toast('Adicione ao menos um item');

  const itensSaida = [...(t.itensSaida || [])];
  const itensEntrada = [...(t.itensEntrada || [])];
  const motivo = motivoTroca(t);

  for (const item of itensSaida) {
    if (item.tipoEntrega === 'pronta_entrega' && !item.processado) {
      try {
        await saidaEstoque(item.produtoId, item.quantidade, motivo);
        item.processado = true;
      } catch (e) {
        return toast(`Erro ao dar baixa em ${item.produtoNome}: ${e.message}`);
      }
    }
  }
  for (const item of itensEntrada) {
    if (item.tipoEntrega === 'pronta_entrega' && !item.processado) {
      await entradaEstoque(item.produtoId, item.quantidade, item.valorUnitario, motivo);
      item.processado = true;
    }
  }

  const pendente = itensSaida.some(i => i.tipoEntrega === 'entrega_futura' && !i.processado) ||
    itensEntrada.some(i => i.tipoEntrega === 'entrega_futura' && !i.processado);

  await setDoc(ref('trocas', trocaId), {
    itensSaida, itensEntrada, status: pendente ? 'parcial' : 'finalizada',
    finalizadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  }, { merge: true });

  closeModal();
  window.App.refresh(pendente ? 'Troca registrada — ainda há itens pendentes de entrega/recebimento' : 'Troca concluída!');
}

// Estorna os lançamentos de estoque já processados (saída volta como entrada, entrada volta como
// saída) e volta a troca para "aberta" — mesmo espírito do reabrirCarrinho, mas trocas têm as duas
// direções de estoque, então a reversão de um item "entrada" pode falhar se o produto já foi usado
// em outro lugar depois (estoque insuficiente); nesse caso avisa e segue com os demais itens.
export async function reabrirTroca(trocaId) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  if (!confirm('Reabrir esta troca? Os lançamentos de estoque já processados serão estornados (produtos que saíram voltam ao estoque; produtos que entraram são baixados de novo).')) return;

  const itensSaida = [...(t.itensSaida || [])];
  const itensEntrada = [...(t.itensEntrada || [])];
  let erros = 0;

  for (let i = 0; i < itensSaida.length; i++) {
    const item = itensSaida[i];
    if (!item.processado) continue;
    try {
      await entradaEstoque(item.produtoId, item.quantidade, item.valorUnitario || 0, 'Ajuste', 'reabertura');
      itensSaida[i] = { ...item, processado: false };
    } catch (e) { erros++; toast(`Erro ao estornar ${item.produtoNome}: ${e.message}`); }
  }
  for (let i = 0; i < itensEntrada.length; i++) {
    const item = itensEntrada[i];
    if (!item.processado) continue;
    try {
      await saidaEstoque(item.produtoId, item.quantidade, 'Ajuste');
      itensEntrada[i] = { ...item, processado: false };
    } catch (e) { erros++; toast(`Erro ao estornar ${item.produtoNome}: ${e.message}`); }
  }

  await setDoc(ref('trocas', trocaId), {
    itensSaida, itensEntrada, status: 'aberta', atualizadoEm: serverTimestamp()
  }, { merge: true });

  closeModal();
  window.App.refresh(erros ? 'Troca reaberta — alguns lançamentos não puderam ser estornados (veja os avisos)' : 'Troca reaberta — lançamentos de estoque estornados');
}

export async function marcarItemTrocaProcessado(trocaId, lado, idx) {
  const t = state.data.trocas.find(x => x.id === trocaId);
  if (!t) return;
  const campo = lado === 'saida' ? 'itensSaida' : 'itensEntrada';
  const itens = [...(t[campo] || [])];
  const item = itens[idx];
  if (!item || item.processado) return;

  try {
    if (lado === 'saida') await saidaEstoque(item.produtoId, item.quantidade, motivoTroca(t));
    else await entradaEstoque(item.produtoId, item.quantidade, item.valorUnitario, motivoTroca(t));
  } catch (e) {
    return toast(`Erro: ${e.message}`);
  }
  item.processado = true;
  itens[idx] = item;

  const outroLado = lado === 'saida' ? (t.itensEntrada || []) : (t.itensSaida || []);
  const tudoProcessado = [...itens, ...outroLado].every(i => i.tipoEntrega !== 'entrega_futura' || i.processado);

  await setDoc(ref('trocas', trocaId), {
    [campo]: itens, status: tudoProcessado ? 'finalizada' : 'parcial', atualizadoEm: serverTimestamp()
  }, { merge: true });

  await window.App.refresh('Item atualizado');
  openTroca(trocaId);
}

export async function cancelarTroca(trocaId) {
  if (!confirm('Cancelar esta troca? Itens já processados (baixa/entrada já feitas) não são revertidos automaticamente.')) return;
  await setDoc(ref('trocas', trocaId), { status: 'cancelada', atualizadoEm: serverTimestamp() }, { merge: true });
  closeModal();
  window.App.refresh('Troca cancelada');
}

// Trocas com a lista de itens expandida (mesmo padrão do toggleVendaDetalhe em vendas.js) —
// só estado de tela, não persiste.
const trocasExpandidas = new Set();

export function toggleTrocaDetalhe(id) {
  if (trocasExpandidas.has(id)) trocasExpandidas.delete(id);
  else trocasExpandidas.add(id);
  window.App.renderEstoque();
}

// Sub-lista com os produtos que saem/entram de uma troca, sem precisar abrir o modal inteiro.
function detalheTrocaHtml(t) {
  const linha = (it, lado) => {
    const pendente = it.tipoEntrega === 'entrega_futura' && !it.processado;
    const entregaLabel = it.tipoEntrega === 'entrega_futura' ? (it.processado ? (lado === 'saida' ? 'Entregue' : 'Recebido') : 'Futura') : 'Pronta';
    const entregaCor = it.tipoEntrega === 'entrega_futura' ? (it.processado ? 'green' : 'orange') : 'green';
    return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:5px 0;border-bottom:1px dashed var(--line)">
      <span>${it.quantidade}× ${esc(it.produtoNome)} ${pill(entregaLabel, entregaCor)}</span>
      <span style="white-space:nowrap">${money(it.valorUnitario)} un. • <b>${money(it.valorTotal)}</b></span>
    </div>`;
  };
  const saida = t.itensSaida || [], entrada = t.itensEntrada || [];
  const totalSaida = saida.reduce((s, it) => s + Number(it.valorTotal || 0), 0);
  const totalEntrada = entrada.reduce((s, it) => s + Number(it.valorTotal || 0), 0);
  const diferenca = totalEntrada - totalSaida;
  // % em cima do que saiu (referência: o que você abriu mão) — positivo = lucro (recebeu mais
  // valor do que deu), negativo = prejuízo (deu mais valor do que recebeu).
  const percentual = totalSaida > 0.004 ? (diferenca / totalSaida) * 100 : (diferenca > 0.004 ? 100 : 0);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:#EAF0F5;border-radius:10px;padding:10px"><small class="muted"><b>Saem (seus produtos)</b></small>${saida.length ? saida.map(it => linha(it, 'saida')).join('') : '<small class="muted">Nenhum item.</small>'}</div>
    <div style="background:#EAF7EC;border-radius:10px;padding:10px"><small class="muted"><b>Entram (recebidos)</b></small>${entrada.length ? entrada.map(it => linha(it, 'entrada')).join('') : '<small class="muted">Nenhum item.</small>'}</div>
  </div>
  ${(saida.length || entrada.length) && Math.abs(diferenca) > 0.004 ? `<div style="margin-top:10px;display:flex;justify-content:flex-end">
    ${pill(`${diferenca > 0 ? 'Lucro' : 'Prejuízo'} na troca: ${money(Math.abs(diferenca))} (${diferenca > 0 ? '+' : '-'}${Math.abs(percentual).toFixed(0)}%)`, diferenca > 0 ? 'green' : 'red')}
  </div>` : ''}`;
}

function trocaCardHtml(t) {
  const statusLabel = { aberta: 'Em andamento', parcial: 'Parcial (pendências)', finalizada: 'Finalizada', cancelada: 'Cancelada' }[t.status] || t.status;
  const statusCor = t.status === 'finalizada' ? 'green' : t.status === 'cancelada' ? 'red' : t.status === 'parcial' ? 'orange' : 'blue';
  const expandida = trocasExpandidas.has(t.id);
  return `<div class="list-item" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div>
        <button class="btn small" style="padding:3px 8px;margin-right:6px" onclick="App.toggleTrocaDetalhe('${t.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da troca'}">${expandida ? '▾' : '▸'}</button>
        <b class="cli-link" onclick="App.toggleTrocaDetalhe('${t.id}')">${t.parceira ? esc(t.parceira) : 'Troca sem nome'}</b>
        <small>${(t.itensSaida || []).length} produto(s) saem · ${(t.itensEntrada || []).length} produto(s) entram</small>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${pill(statusLabel, statusCor)}
        <button class="btn small" onclick="App.openTroca('${t.id}')">Abrir</button>
        <button class="btn small" onclick="App.editarParceiraTroca('${t.id}')" title="Editar parceira">✏️</button>
        <button class="btn small" style="color:var(--error)" onclick="App.excluirTroca('${t.id}')" title="Excluir">🗑️</button>
      </div>
    </div>
    ${expandida ? `<div style="background:#F7FAFC;border-radius:8px;padding:10px;margin-top:8px">${detalheTrocaHtml(t)}</div>` : ''}
  </div>`;
}

export function trocasTabHtml() {
  const trocas = [...(state.data.trocas || [])].sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
  return `<div class="panel">
    <div class="panel-head">
      <h3>Trocas com outras consultoras</h3>
      <button class="btn dark small" onclick="App.abrirNovaTroca()">+ Nova troca</button>
    </div>
    <p class="muted">Baixa de um ou mais produtos seus e entrada de um ou mais produtos recebidos — sem gerar receita/lucro. Cada item pode ser entregue/recebido na hora ou depois.</p>
    ${trocas.length ? `<div class="data-list">${trocas.map(trocaCardHtml).join('')}</div>` : '<p class="muted">Nenhuma troca registrada ainda.</p>'}
  </div>`;
}
