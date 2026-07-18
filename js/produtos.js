import { state, SECTIONS, col, ref, db, doc, collection, getDoc, getDocs, showModal, closeModal, toast, setDoc, addDoc, deleteDoc, deleteField, writeBatch, serverTimestamp, stockAgg, prodById, cliById, reservadoEmAberto, entregaFuturaPendente } from './state.js';
import { $, esc, money, parseMoney, norm, pill, sortWrapped, sortBarHtml, sectionTabsHtml, toggleHtml, toggleBareHtml, linhasDe, labelLinha, descontoPercent, today, combinarLinhas, formatDateBR } from './utils.js';
import { gerarBeneficios } from './gemini.js';
import { btnAdicionarPreEncomenda } from './preencomenda.js';
import { sincronizarProdutoNosEventos } from './eventos.js';

// Rastreia produtos editados nesta sessão — usado para conferência rápida de estoque
window.__produtosEditadosHoje = window.__produtosEditadosHoje || new Set();

// Reutilizável em qualquer formulário com campos de nome/linha/benefícios (Produtos, Catálogo mestre).
export async function gerarBeneficiosProduto(btn, idNome, idLinha, idBeneficios) {
  const nome = $(idNome)?.value, linha = $(idLinha)?.value;
  const original = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
  try {
    const texto = await gerarBeneficios(nome, linha);
    if ($(idBeneficios)) $(idBeneficios).value = texto;
  } catch (e) {
    toast(e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function chips(tipo, vals) {
  return `<div class="chips">${vals.map(v =>
    `<button class="chip ${state.filters[tipo] === v[0] ? 'active' : ''}" onclick="App.setFilter('${tipo}','${v[0]}')">${v[1]}</button>`
  ).join('')}</div>`;
}

// Pílulas de status do produto (separadas dos botões: no cartão mobile as pílulas ficam numa linha
// própria; se entrassem na grade de ações, a grade as esticaria pra largura de botão, ficando torto).
function produtoStatusHtml(x) {
  return `${pill(x.est > 0 ? 'Em estoque' : 'Sem estoque', x.est > 0 ? 'green' : 'red', x.est > 0 ? `${x.est} unidade(s) disponível(is) agora` : 'Nenhuma unidade disponível — venda entra como entrega futura')}${x.p.ativoCatalogo !== false ? ` ${pill('Catálogo', 'blue', 'Aparece no catálogo público (PDF e link de eventos)')}` : ''}`;
}

// Botões de ação do produto (só os botões, sem pílulas) — vão na grade .vcard-actions no mobile.
function produtoBotoesHtml(x) {
  return `
    ${btnAdicionarPreEncomenda(x.p.id)}
    <button class="btn small" onclick="App.openProdutoForm('${x.p.id}')" title="Editar">✏️</button>
    ${(x.p.historicoPrecos || []).length ? `<button class="btn small" onclick="App.abrirHistoricoPrecos('${x.p.id}')" title="Histórico de preços">📈</button>` : ''}
    <button class="btn small" style="color:var(--error)" onclick="App.excluirProduto('${x.p.id}')" title="Excluir">🗑️</button>`;
}

// Desktop (.data-card): pílulas e botões juntos, como no design original.
function produtoAcoesHtml(x) {
  return `${produtoStatusHtml(x)}${produtoBotoesHtml(x)}`;
}

function productCard(x) {
  return `<div class="data-card only-desktop">
    <img src="${esc(x.p.imagem || '')}" onerror="this.style.visibility='hidden'">
    <div>
      <b class="cli-link" onclick="App.openProdutoForm('${x.p.id}')">${esc(x.p.nome)}</b>
      <div class="prod-tags"><span class="prod-tag">Código <b>${esc(x.p.codigoFarmasi || '-')}</b></span><span class="prod-tag">Linha <b>${esc(linhasDe(x.p).map(labelLinha).join(', ') || '-')}</b></span></div>
    </div>
    <div class="metric"><small>Original / atual</small><b>${money(x.p.precoOriginal)} / ${money(x.p.precoAtual)}${descontoPercent(x.p.precoOriginal, x.p.precoAtual) ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">-${descontoPercent(x.p.precoOriginal, x.p.precoAtual)}%</span>` : ''}</b></div>
    <div class="metric"><small>Custo médio</small><b>${money(x.custo)}</b></div>
    <div class="metric"><small>Estoque</small><b>${x.est}</b>${reservadoEmAberto(x.p.id) > 0 ? `<br><span class="tag red" style="font-size:10px;padding:2px 6px;cursor:pointer" title="Clique para ver os carrinhos com este produto" onclick="App.abrirCarrinhosComProdutoReservado('${x.p.id}')">🛒 ${reservadoEmAberto(x.p.id)} reservado</span>` : ''}${entregaFuturaPendente(x.p.id) > 0 ? `<br><span class="tag orange" style="font-size:10px;padding:2px 6px;cursor:pointer" title="Vendido mas ainda não entregue — clique para ver os carrinhos" onclick="App.abrirCarrinhosComEntregaFutura('${x.p.id}')">📤 ${entregaFuturaPendente(x.p.id)} a entregar</span>` : ''}</div>
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${produtoAcoesHtml(x)}</div>
  </div>
  <div class="vcard only-mobile">
    <div class="vcard-top" style="align-items:flex-start">
      <img src="${esc(x.p.imagem || '')}" onerror="this.style.visibility='hidden'" style="width:52px;height:52px;object-fit:contain;border-radius:12px;background:#fff;box-shadow:var(--ring);flex:0 0 auto">
      <div style="flex:1 1 auto;min-width:0">
        <div class="cli-link" style="font-size:17px;font-weight:800;overflow-wrap:break-word" onclick="App.openProdutoForm('${x.p.id}')">${esc(x.p.nome)}</div>
        <div class="prod-tags" style="margin-top:4px">
          <span class="prod-tag">Código <b>${esc(x.p.codigoFarmasi || '-')}</b></span>
          <span class="prod-tag">Linha <b>${esc(linhasDe(x.p).map(labelLinha).join(', ') || '-')}</b></span>
        </div>
      </div>
    </div>
    <div class="vcard-rows">
      <div class="vcard-row"><span>Original / atual</span><b>${money(x.p.precoOriginal)} / ${money(x.p.precoAtual)}${descontoPercent(x.p.precoOriginal, x.p.precoAtual) ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">-${descontoPercent(x.p.precoOriginal, x.p.precoAtual)}%</span>` : ''}</b></div>
      <div class="vcard-row"><span>Custo médio</span><b>${money(x.custo)}</b></div>
      <div class="vcard-row"><span>Estoque</span><b>${x.est}${reservadoEmAberto(x.p.id) > 0 ? ` <span class="tag red" style="font-size:10px;padding:2px 6px;cursor:pointer" title="Clique para ver os carrinhos com este produto" onclick="App.abrirCarrinhosComProdutoReservado('${x.p.id}')">🛒 ${reservadoEmAberto(x.p.id)}</span>` : ''}${entregaFuturaPendente(x.p.id) > 0 ? ` <span class="tag orange" style="font-size:10px;padding:2px 6px;cursor:pointer" title="Vendido mas ainda não entregue — clique para ver os carrinhos" onclick="App.abrirCarrinhosComEntregaFutura('${x.p.id}')">📤 ${entregaFuturaPendente(x.p.id)} a entregar</span>` : ''}</b></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${produtoStatusHtml(x)}</div>
    <div class="vcard-actions">${produtoBotoesHtml(x)}</div>
  </div>`;
}

// A busca de Produtos (qprod) e a busca de atribuir linhas (qLinhaAssoc) convivem na mesma
// função de render, em abas diferentes — por isso preserva foco/cursor de qualquer uma das
// duas que estiver ativa (withFocusPreserved de utils.js só cobre um id por vez).
const FOCUS_IDS_PRODUTOS = ['qprod', 'qLinhaAssoc'];
export function renderProdutos() {
  const idAtivo = FOCUS_IDS_PRODUTOS.find(id => document.activeElement?.id === id);
  const elAtivo = idAtivo ? document.getElementById(idAtivo) : null;
  const cursorPos = elAtivo ? elAtivo.selectionStart : null;
  renderProdutosInner();
  if (idAtivo) {
    const el = document.getElementById(idAtivo);
    if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
  }
}

function renderProdutosInner() {
  const s = stockAgg(), f = state.filters.prod;
  let ps = s.ps;
  if (f === 'em') ps = ps.filter(x => x.est > 0);
  if (f === 'sem') ps = ps.filter(x => x.est <= 0);
  if (f === 'promo') ps = ps.filter(x => x.promo);
  if (f === 'semcusto') ps = ps.filter(x => x.semCusto);
  if (f === 'baixo') ps = ps.filter(x => x.baixo);
  if (f === 'catalogo') ps = ps.filter(x => x.p.ativoCatalogo !== false);
  if (f === 'foracatalogo') ps = ps.filter(x => x.p.ativoCatalogo === false);

  const linhaFiltro = state.filters.prodLinha || '';
  if (linhaFiltro) ps = ps.filter(x => linhasDe(x.p).includes(linhaFiltro));

  const q = norm($('qprod')?.value || '');
  if (q) ps = ps.filter(x => norm(x.p.nome + ' ' + x.p.codigoFarmasi + ' ' + x.p.linha).includes(q));
  ps = sortWrapped(ps, state.filters.prodSort);

  const todasLinhas = Array.from(new Set(state.data.produtos.flatMap(linhasDe))).sort((a, b) => labelLinha(a).localeCompare(labelLinha(b), 'pt-BR'));

  const sec = state.section.produtos;
  let html = `
      <div class="cards">
        <div class="card"><span>Total produtos</span><b>${state.data.produtos.length}</b></div>
        <div class="card"><span>Em estoque</span><b>${s.em.length}</b></div>
        <div class="card"><span>Sem estoque</span><b>${s.ps.filter(x => x.est <= 0).length}</b></div>
        <div class="card"><span>Sem custo</span><b>${s.sem.length}</b></div>
      </div>
      ${sectionTabsHtml('produtos', SECTIONS.produtos, sec)}`;

    if (sec === 'produtos') {
      html += `${state.profile?.usaBaseColetiva ? `<div class="panel" style="background:#F7FAFC">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><b>Base coletiva ativa</b><br><small class="muted">Puxe as novidades publicadas pela administração para seus produtos.</small></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn dark small" onclick="App.sincronizarBaseColetiva()">🔄 Sincronizar com base coletiva</button>
            <button class="btn small" onclick="App.openProdutoForm()">+ Novo produto</button>
          </div>
        </div>
      </div>` : ''}
      <div class="panel">
        <div class="toolbar">
          ${state.profile?.usaBaseColetiva ? '' : '<button class="btn dark" onclick="App.openProdutoForm()">+ Novo produto</button>'}
          <input id="qprod" placeholder="Buscar produto..." oninput="App.renderProdutos()" value="${esc($('qprod')?.value || '')}">
          <select onchange="App.setFilter('prodLinha',this.value)" style="max-width:220px">
            <option value="">Todas as linhas</option>
            ${todasLinhas.map(l => `<option value="${esc(l)}" ${linhaFiltro === l ? 'selected' : ''}>${esc(labelLinha(l))}</option>`).join('')}
          </select>
        </div>
        ${sortBarHtml(state.filters.prodSort, 'prodSort')}
        ${chips('prod', [['todos', 'Todos'], ['em', 'Em estoque'], ['sem', 'Sem estoque'], ['promo', 'Promoção'], ['semcusto', 'Sem custo'], ['baixo', 'Estoque baixo'], ['catalogo', 'No catálogo'], ['foracatalogo', 'Fora do catálogo']])}
        <div class="data-list">
          ${ps.map(productCard).join('') || '<p class="muted">Nenhum produto para este filtro.</p>'}
        </div>
        ${state.data.produtos.length ? `<div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          ${state.data.produtos.some(p => norm(p.linha || '').includes('importado pedido')) ? `<button class="btn small" onclick="App.corrigirLinhaImportadoPedido()">🔧 Corrigir linha "Importado pedido"</button>` : ''}
          ${state.data.produtos.some(p => mesclarLinhas('', p.linha) !== (p.linha || 'Sem linha')) ? `<button class="btn small" onclick="App.corrigirLinhasDuplicadas()">🔧 Corrigir linhas duplicadas</button>` : ''}
          ${state.data.produtos.some(p => Number(p.precoVenda || 0) > 0 && Number(p.precoVenda) !== Number(p.precoAtual || 0)) ? `<button class="btn small" onclick="App.migrarPrecoVendaAntigo()">🔧 Migrar "Preço de venda" antigo</button>` : ''}
          <button class="btn small" onclick="App.exportarProdutosJson()">📤 Exportar JSON</button>
          <button class="btn ghost" style="color:var(--error)" onclick="App.excluirTodosProdutos()">🗑️ Excluir todos os produtos</button>
        </div>` : ''}
      </div>`;
    }

    if (sec === 'linhas') html += linhasTabHtml();

  $('produtos').innerHTML = html;
}

export async function excluirProduto(id) {
  const p = prodById(id);
  if (!p) return;
  if (!confirm(`Excluir o produto "${p.nome}"?\nEssa ação não pode ser desfeita.`)) return;
  await deleteDoc(ref('produtos', id));
  closeModal();
  window.App.refresh('Produto excluído');
}

// Exporta a base de produtos em JSON compatível com a importação (Produtos e Admin → Catálogo
// mestre já leem esse formato) — útil para enviar sua base pra outra consultora ou pro admin
// publicar na base coletiva. Ambas as importações pedem conferência antes de salvar.
export function exportarProdutosJson() {
  const arr = state.data.produtos.map(p => ({
    nome: p.nome || '', codigo: p.codigoFarmasi || '', linha: p.linha || '',
    precoOriginal: Number(p.precoOriginal || 0), precoAtual: Number(p.precoAtual || 0),
    imagem: p.imagem || '', beneficios: p.beneficios || ''
  }));
  const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `produtos-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${arr.length} produto(s) exportados`);
}

// Remove a linha fictícia "Importado pedido" (fallback antigo, já corrigido) de qualquer produto
// que ainda tenha ficado com ela — sem apagar as demais linhas do produto, se houver mais de uma.
export async function corrigirLinhaImportadoPedido() {
  const alvo = norm('Importado pedido');
  const afetados = state.data.produtos.filter(p => String(p.linha || '').split(',').some(s => norm(s.trim()) === alvo));
  if (!afetados.length) return toast('Nenhum produto com a linha "Importado pedido" encontrado.');
  if (!confirm(`Corrigir a linha de ${afetados.length} produto(s) que têm "Importado pedido"?`)) return;
  for (let i = 0; i < afetados.length; i += 450) {
    const batch = writeBatch(db);
    afetados.slice(i, i + 450).forEach(p => {
      const restantes = String(p.linha || '').split(',').map(s => s.trim()).filter(s => s && norm(s) !== alvo);
      batch.update(ref('produtos', p.id), { linha: restantes.length ? restantes.join(', ') : 'Sem linha' });
    });
    await batch.commit();
  }
  window.App.refresh(`Linha corrigida em ${afetados.length} produto(s)`);
}

// O campo "Preço de venda" foi removido (item 26): existia separado de "Preço atual" mas todo o
// sistema priorizava ele quando preenchido, gerando confusão — agora só existe "Preço atual", que
// é sempre o valor usado em Vendas/Trocas/Eventos. Produtos que já tinham um "Preço de venda"
// diferente do "Preço atual" cadastrado antes dessa mudança ficam com esse valor antigo órfão no
// Firestore (não lido em lugar nenhum mais) — esta migração leva esse valor pra "Preço atual" antes
// de descartá-lo, pra não mudar o preço que a consultora estava realmente cobrando sem avisar.
export async function migrarPrecoVendaAntigo() {
  const afetados = state.data.produtos.filter(p => Number(p.precoVenda || 0) > 0 && Number(p.precoVenda) !== Number(p.precoAtual || 0));
  if (!afetados.length) return toast('Nenhum produto com "Preço de venda" antigo pendente de migração.');
  if (!confirm(`Migrar "Preço de venda" pra "Preço atual" em ${afetados.length} produto(s)? O preço atual vai passar a ser o mesmo valor que estava em "Preço de venda".`)) return;
  for (let i = 0; i < afetados.length; i += 450) {
    const batch = writeBatch(db);
    afetados.slice(i, i + 450).forEach(p => batch.update(ref('produtos', p.id), { precoAtual: Number(p.precoVenda || 0), precoVenda: deleteField() }));
    await batch.commit();
  }
  window.App.refresh(`Preço migrado em ${afetados.length} produto(s)`);
}

// Limpa produtos que ficaram com nomes de linha repetidos no campo (ex: "Maquiagem, Cremoso,
// Maquiagem, Cremoso"), bug de raiz já corrigido em mesclarLinhas — isso só limpa o estrago que já
// tinha sido feito em sincronizações anteriores.
export async function corrigirLinhasDuplicadas() {
  const afetados = state.data.produtos.filter(p => mesclarLinhas('', p.linha) !== (p.linha || 'Sem linha'));
  if (!afetados.length) return toast('Nenhum produto com linha duplicada encontrado.');
  if (!confirm(`Corrigir linhas duplicadas em ${afetados.length} produto(s)?`)) return;
  for (let i = 0; i < afetados.length; i += 450) {
    const batch = writeBatch(db);
    afetados.slice(i, i + 450).forEach(p => batch.update(ref('produtos', p.id), { linha: mesclarLinhas('', p.linha) }));
    await batch.commit();
  }
  window.App.refresh(`Linha corrigida em ${afetados.length} produto(s)`);
}

// --- Cadastro próprio de linhas (não vêm mais automático do JSON importado) ---
let linhaSelecionadaAtribuir = '';
let qLinhaAssoc = '';

function linhasTabHtml() {
  const linhas = [...(state.profile?.linhasCustom || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let html = `<div class="panel">
    <h3>Suas linhas de produto</h3>
    <p class="muted">Defina os nomes das linhas que você quer usar. Elas não vêm mais automáticas do arquivo importado — você escolhe quais existem e atribui aos produtos aqui.</p>
    <div class="toolbar">
      <input id="novaLinhaNome" placeholder="Nome da nova linha (ex: Maquiagem)">
      <button class="btn dark" onclick="App.adicionarLinhaCustom()">+ Adicionar linha</button>
      ${state.profile?.usaBaseColetiva ? '<button class="btn small" onclick="App.sincronizarLinhasColetivas()">🔄 Sincronizar linhas da base coletiva</button>' : ''}
    </div>
    ${linhas.length ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">${linhas.map(l => `
      <span class="chip ${linhaSelecionadaAtribuir === l ? 'active' : ''}" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px" onclick="App.selecionarLinhaParaAtribuir('${esc(l)}')">
        ${esc(l)}
        <button style="border:0;background:none;cursor:pointer;font-weight:900" onclick="event.stopPropagation();App.editarLinhaCustom('${esc(l)}')" title="Editar nome da linha">✏️</button>
        <button style="border:0;background:none;cursor:pointer;color:var(--error);font-weight:900" onclick="event.stopPropagation();App.removerLinhaCustom('${esc(l)}')" title="Remover linha">✗</button>
      </span>`).join('')}</div>` : '<p class="muted" style="margin-top:12px">Nenhuma linha cadastrada ainda.</p>'}
  </div>`;

  if (linhaSelecionadaAtribuir) {
    const q = norm(qLinhaAssoc);
    let prods = state.data.produtos;
    if (q) prods = prods.filter(p => norm(p.nome + ' ' + p.codigoFarmasi).includes(q));
    prods = [...prods].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    html += `<div class="panel">
      <div class="panel-head"><h3>Atribuir "${esc(linhaSelecionadaAtribuir)}" aos produtos</h3></div>
      <input id="qLinhaAssoc" placeholder="Buscar produto..." oninput="App.filtrarLinhaAssoc(this.value)" value="${esc(qLinhaAssoc)}">
      <div class="table table-scroll" style="margin-top:10px"><table><thead><tr><th></th><th>Produto</th><th>Código</th><th>Linhas atuais</th></tr></thead><tbody>
        ${prods.map(p => `<tr>
          <td>${toggleBareHtml('toggle_' + p.id, linhasDe(p).includes(linhaSelecionadaAtribuir), `App.toggleProdutoNaLinha('${p.id}','${esc(linhaSelecionadaAtribuir)}',this.checked)`)}</td>
          <td data-label="Produto">${esc(p.nome)}</td>
          <td data-label="Código">${esc(p.codigoFarmasi || '-')}</td>
          <td data-label="Linhas">${esc([...linhasDe(p)].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ') || '-')}</td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }
  return html;
}

// Puxa as linhas publicadas pelo Admin (/config/linhasColetivas) e ACRESCENTA às da consultora —
// as que ela já tem permanecem (comparação normalizada pra não duplicar "Maquiagem"/"maquiagem").
export async function sincronizarLinhasColetivas() {
  let snap;
  try {
    snap = await getDoc(doc(db, 'config', 'linhasColetivas'));
  } catch (e) {
    return toast('Não foi possível acessar as linhas da base coletiva. Fale com a administração.');
  }
  const doAdmin = snap.exists() ? (snap.data().linhas || []) : [];
  if (!doAdmin.length) return toast('A administração ainda não publicou linhas na base coletiva.');
  const atuais = state.profile?.linhasCustom || [];
  const novas = doAdmin.filter(l => !atuais.some(a => norm(a) === norm(l)));
  if (!novas.length) return toast('Suas linhas já estão em dia com a base coletiva.');
  const todas = [...atuais, ...novas];
  await setDoc(doc(db, 'users', state.user.uid), { linhasCustom: todas }, { merge: true });
  state.profile = { ...state.profile, linhasCustom: todas };
  window.App.refresh(`${novas.length} linha(s) adicionada(s) da base coletiva`);
}

export async function adicionarLinhaCustom() {
  const nome = ($('novaLinhaNome')?.value || '').trim();
  if (!nome) return toast('Digite o nome da linha');
  const atuais = state.profile?.linhasCustom || [];
  if (atuais.some(l => norm(l) === norm(nome))) return toast('Essa linha já existe');
  const novas = [...atuais, nome];
  await setDoc(doc(db, 'users', state.user.uid), { linhasCustom: novas }, { merge: true });
  state.profile = { ...state.profile, linhasCustom: novas };
  window.App.refresh(`Linha "${nome}" adicionada`);
}

// Renomeia uma linha em cascata (item 23): troca o nome cadastrado E corrige todos os produtos que
// já usam esse nome (campo p.linha, texto separado por vírgula) — evita "Maquiagem"/"Maquiagens"
// convivendo pra sempre só porque corrigir um typo exigiria abrir produto por produto.
export async function editarLinhaCustom(nomeAntigo) {
  const novo = prompt(`Novo nome para a linha "${nomeAntigo}":`, nomeAntigo)?.trim();
  if (!novo || novo === nomeAntigo) return;
  const atuais = state.profile?.linhasCustom || [];
  if (atuais.some(l => l !== nomeAntigo && norm(l) === norm(novo))) {
    return toast(`Já existe uma linha "${novo}" — escolha outro nome ou remova a duplicada.`);
  }

  toast('Atualizando produtos vinculados à linha...');

  // Atualiza o cadastro de linhas da consultora.
  const novasLinhas = atuais.map(l => l === nomeAntigo ? novo : l);
  await setDoc(doc(db, 'users', state.user.uid), { linhasCustom: novasLinhas }, { merge: true });

  // Atualização em cascata: todo produto que tem essa linha (comparação normalizada, robusta a
  // maiúscula/acento) tem o nome trocado dentro do texto composto, preservando as outras linhas do
  // mesmo produto. writeBatch agrupa tudo numa única viagem ao Firestore (até 500 por lote).
  const afetados = state.data.produtos.filter(p => linhasDe(p).some(l => norm(l) === norm(nomeAntigo)));
  if (afetados.length) {
    const batch = writeBatch(db);
    afetados.forEach(p => {
      const novasDoProduto = linhasDe(p).map(l => norm(l) === norm(nomeAntigo) ? novo : l);
      const linhaTexto = [...new Set(novasDoProduto)].join(', ');
      p.linha = linhaTexto; // reflete na hora, sem esperar o refresh
      batch.set(ref('produtos', p.id), { linha: linhaTexto }, { merge: true });
    });
    await batch.commit();
  }

  state.profile = { ...state.profile, linhasCustom: novasLinhas };
  if (linhaSelecionadaAtribuir === nomeAntigo) linhaSelecionadaAtribuir = novo;
  window.App.refresh(`Linha renomeada para "${novo}" — ${afetados.length} produto(s) atualizado(s)`);
}

export async function removerLinhaCustom(nome) {
  if (!confirm(`Remover a linha "${nome}"? Os produtos que já tinham essa linha mantêm o texto, só não aparece mais aqui pra selecionar.`)) return;
  const novas = (state.profile?.linhasCustom || []).filter(l => l !== nome);
  await setDoc(doc(db, 'users', state.user.uid), { linhasCustom: novas }, { merge: true });
  state.profile = { ...state.profile, linhasCustom: novas };
  if (linhaSelecionadaAtribuir === nome) linhaSelecionadaAtribuir = '';
  window.App.refresh(`Linha "${nome}" removida`);
}

export function selecionarLinhaParaAtribuir(linha) {
  linhaSelecionadaAtribuir = linha;
  qLinhaAssoc = '';
  renderProdutos();
}

export function filtrarLinhaAssoc(valor) {
  qLinhaAssoc = valor;
  renderProdutos();
}

// Liga/desliga uma linha num produto sem mexer nas outras linhas que ele já tiver (um produto
// pode pertencer a mais de uma linha). Atualiza a tela na hora e salva em seguida.
export async function toggleProdutoNaLinha(produtoId, linha, incluir) {
  const p = prodById(produtoId);
  if (!p) return;
  const atuais = linhasDe(p).filter(l => l !== linha);
  const novas = incluir ? [...atuais, linha] : atuais;
  p.linha = novas.length ? novas.join(', ') : 'Sem linha';
  renderProdutos();
  await setDoc(ref('produtos', produtoId), { linha: p.linha }, { merge: true });
}

export async function excluirTodosProdutos() {
  const total = state.data.produtos.length;
  if (!total) return;
  if (!confirm(`Excluir TODOS os ${total} produtos?\nEssa ação não pode ser desfeita.`)) return;
  const resp = prompt(`Confirme digitando EXCLUIR para apagar os ${total} produtos:`);
  if ((resp || '').trim().toUpperCase() !== 'EXCLUIR') return toast('Cancelado');
  // Firestore limita 500 operações por batch
  for (let i = 0; i < state.data.produtos.length; i += 450) {
    const batch = writeBatch(db);
    state.data.produtos.slice(i, i + 450).forEach(p => batch.delete(ref('produtos', p.id)));
    await batch.commit();
  }
  window.App.refresh('Todos os produtos foram excluídos');
}

export function openProdutoForm(id = '') {
  const p = id ? prodById(id) : {};
  if (id) window.__produtosEditadosHoje.add(id);
  const linhasCustom = state.profile?.linhasCustom || [];
  const linhasAtuais = linhasDe(p);
  const linhaFieldHtml = linhasCustom.length ? `
    <input type="hidden" id="pLinha" value="${esc(p.linha || '')}">
    <div style="display:flex;flex-wrap:wrap;gap:10px;background:#F3F6FA;border-radius:12px;padding:10px">
      ${linhasCustom.map(l => `<label class="toggle-line" style="font-size:13px;font-weight:700">
        ${toggleBareHtml('', linhasAtuais.includes(l), 'App.atualizarLinhasProdutoForm()', `class="linha-check" value="${esc(l)}"`)}
        ${esc(l)}
      </label>`).join('')}
    </div>
    <small class="muted">Gerencie suas linhas em Produtos → Linhas.</small>`
    : `<input id="pLinha" value="${esc(p.linha || '')}" placeholder="Ex: Maquiagem">
    <small class="muted">Crie linhas em Produtos → Linhas pra escolher por seleção em vez de digitar.</small>`;
  showModal(`<h3>${id ? 'Editar' : 'Novo'} Produto</h3>
    <div class="grid">
      <div class="field"><label>Nome</label><input id="pNome" value="${esc(p.nome || '')}"></div>
      <div class="field"><label>Código Farmasi</label><input id="pCodigo" value="${esc(p.codigoFarmasi || '')}"></div>
      <div class="field full"><label>Linha</label>${linhaFieldHtml}</div>
      <div class="field"><label>Imagem (URL)</label><input id="pImagem" value="${esc(p.imagem || '')}"></div>
      <div class="field"><label>Preço original</label><input id="pOriginal" value="${money(p.precoOriginal || 0)}">
        <small class="muted">Preço de tabela cheio (o valor "de", riscado).</small></div>
      <div class="field"><label>Preço atual</label><input id="pAtual" value="${money(p.precoAtual || 0)}">
        <small class="muted">O que você cobra do cliente hoje — é o valor usado em Vendas, Trocas e Eventos.</small></div>
      <div class="field"><label>Custo médio</label><input id="pCusto" value="${money(p.custoMedio || 0)}"></div>
      <div class="field"><label>Estoque atual</label><input id="pEstoque" type="number" value="${p.estoqueAtual || 0}"></div>
      <div class="field"><label>Estoque mínimo</label><input id="pMinimo" type="number" value="${p.estoqueMinimo || 1}"></div>
      <div class="field full">${toggleHtml('pAtivoCatalogo', p.ativoCatalogo !== false, '', 'Ativo no catálogo')}</div>
      <div class="field">${toggleHtml('pProntaEntrega', p.produtoProntaEntrega, '', 'Produto de pronta entrega')}</div>
      <div class="field">${toggleHtml('pMonitorar', p.monitorarEstoqueBaixo, '', 'Monitorar estoque baixo')}</div>
      <div class="field">${toggleHtml('pConferido', p.conferido, '', '✓ Conferido')}</div>
      <div class="field full">
        <label>Benefícios / descrição (aparece no catálogo)</label>
        <textarea id="pBeneficios" placeholder="Ex: Hidrata profundamente, controla oleosidade, vegano...">${esc(p.beneficios || '')}</textarea>
        <button class="btn small" style="margin-top:6px" onclick="App.gerarBeneficiosProduto(this,'pNome','pLinha','pBeneficios')">✨ Gerar com IA</button>
      </div>
      <div class="field full"><label>Observação interna (não aparece no catálogo)</label><textarea id="pObs">${esc(p.observacao || '')}</textarea></div>
    </div><br>
    <button class="btn dark" onclick="App.saveProduto('${id}')">${id ? 'Salvar' : 'Cadastrar'}</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

// Junta as linhas marcadas nos checkboxes (Produtos → Linhas cadastradas) no campo oculto #pLinha,
// que é o que saveProduto realmente lê — assim o formulário funciona igual, tenha ele input de
// texto livre (sem linhas cadastradas ainda) ou os checkboxes (linhas já cadastradas).
export function atualizarLinhasProdutoForm() {
  const marcadas = Array.from(document.querySelectorAll('.linha-check:checked')).map(i => i.value);
  if ($('pLinha')) $('pLinha').value = marcadas.join(', ');
}

// Histórico de alteração de preço atual — guarda só a mudança de verdade, não toda vez que o
// formulário é salvo com o mesmo valor. Limitado às últimas 50 entradas pra não crescer sem fim
// no documento do produto (isso já é mais que suficiente pra qualquer análise de tendência real).
function registrarHistoricoPrecos(anterior, d) {
  if (!anterior) return d.historicoPrecos || [];
  const historico = [...(anterior.historicoPrecos || [])];
  const mudouAtual = Number(anterior.precoAtual || 0) !== d.precoAtual;
  if (mudouAtual) {
    historico.push({
      data: today(),
      precoAtualAnterior: Number(anterior.precoAtual || 0), precoAtualNovo: d.precoAtual
    });
  }
  return historico.slice(-50);
}

export async function saveProduto(id = '') {
  const anterior = id ? prodById(id) : null;
  const d = {
    nome: $('pNome').value,
    codigoFarmasi: $('pCodigo').value,
    linha: combinarLinhas($('pLinha').value),
    imagem: $('pImagem').value,
    precoOriginal: parseMoney($('pOriginal').value),
    precoAtual: parseMoney($('pAtual').value),
    custoMedio: parseMoney($('pCusto').value),
    estoqueAtual: Number($('pEstoque').value || 0),
    estoqueMinimo: Number($('pMinimo').value || 1),
    ativoCatalogo: $('pAtivoCatalogo').checked,
    produtoProntaEntrega: $('pProntaEntrega').checked,
    // Marca que a pronta entrega foi definida à mão — a partir daqui, entradas/saídas de estoque
    // não desligam nem ligam essa flag sozinhas quando ela estiver desativada (só perguntam antes).
    prontaEntregaManual: true,
    monitorarEstoqueBaixo: $('pMonitorar').checked,
    conferido: $('pConferido').checked,
    dataConferencia: $('pConferido').checked ? serverTimestamp() : (anterior?.dataConferencia || null),
    beneficios: $('pBeneficios').value,
    observacao: $('pObs').value,
    atualizadoEm: serverTimestamp()
  };
  if (id) {
    d.historicoPrecos = registrarHistoricoPrecos(anterior, d);
    await setDoc(ref('produtos', id), d, { merge: true });
    await sincronizarProdutoNosEventos({ id, ...d });
  } else {
    await addDoc(col('produtos'), { ...d, ativo: true, criadoEm: serverTimestamp() });
  }
  closeModal();
  window.App.refresh('Produto salvo');
}

export async function marcarProdutosEditadosComoConferidos() {
  const produtosEditados = Array.from(window.__produtosEditadosHoje || []);
  if (!produtosEditados.length) return toast('Nenhum produto foi editado');

  const batch = writeBatch(db);
  let ok = 0;
  for (const produtoId of produtosEditados) {
    try {
      batch.update(ref('produtos', produtoId), {
        conferido: true,
        dataConferencia: serverTimestamp()
      });
      ok++;
    } catch (e) {
      console.error(`Erro ao marcar ${produtoId} como conferido:`, e);
    }
  }
  await batch.commit();
  window.__produtosEditadosHoje.clear();
  window.App.refresh(`${ok} produto(s) marcado(s) como conferido(s)`);
}

// Pega produtos alterados nas últimas N horas usando o campo `atualizadoEm` que já é salvo em
// todo saveProduto — cobre também edições feitas antes do checkbox "Conferido" existir, já que
// esse campo sempre foi gravado (diferente de window.__produtosEditadosHoje, que só existe na
// sessão atual e não tem como "lembrar" de edições de sessões passadas).
function produtosAlteradosNasUltimasHoras(horas) {
  const limite = Date.now() - horas * 60 * 60 * 1000;
  return state.data.produtos.filter(p => {
    if (p.conferido) return false;
    const ts = p.atualizadoEm?.toMillis ? p.atualizadoEm.toMillis() : (p.atualizadoEm?.seconds ? p.atualizadoEm.seconds * 1000 : 0);
    return ts >= limite;
  }).sort((a, b) => {
    const ta = a.atualizadoEm?.toMillis ? a.atualizadoEm.toMillis() : 0;
    const tb = b.atualizadoEm?.toMillis ? b.atualizadoEm.toMillis() : 0;
    return tb - ta;
  });
}

export function abrirConferenciaPorHorario(horas = 4) {
  const produtos = produtosAlteradosNasUltimasHoras(horas);
  window.__horasConferencia = horas;
  showModal(`<h3>Conferir produtos recentes</h3>
    <div class="field">
      <label>Buscar produtos alterados nas últimas quantas horas?</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="cfHoras" type="number" min="1" value="${horas}" style="width:100px" onchange="App.atualizarConferenciaPorHorario(Number(this.value))">
        <span class="muted">horas</span>
      </div>
    </div>
    <p style="margin-top:10px">${produtos.length ? `<b>${produtos.length}</b> produto(s) alterado(s) nesse período e ainda não conferido(s):` : 'Nenhum produto alterado nesse período (ou já estão todos conferidos).'}</p>
    ${produtos.length ? `<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin:10px 0">
      ${produtos.map(p => `<div style="padding:6px 4px;border-bottom:1px solid var(--border-light)">${esc(p.nome)} <small class="muted">${esc(p.codigoFarmasi || '')}</small></div>`).join('')}
    </div>
    <button class="btn dark" onclick="App.confirmarConferenciaPorHorario()">✓ Marcar ${produtos.length} produto(s) como conferido(s)</button>` : ''}
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export function atualizarConferenciaPorHorario(horas) {
  abrirConferenciaPorHorario(horas);
}

export async function confirmarConferenciaPorHorario() {
  const horas = window.__horasConferencia || 4;
  const produtos = produtosAlteradosNasUltimasHoras(horas);
  if (!produtos.length) return toast('Nenhum produto para marcar');

  const batch = writeBatch(db);
  produtos.forEach(p => {
    batch.update(ref('produtos', p.id), { conferido: true, dataConferencia: serverTimestamp() });
  });
  await batch.commit();
  closeModal();
  window.App.refresh(`${produtos.length} produto(s) marcado(s) como conferido(s)`);
}

// Modal com o histórico de mudanças de preço do produto — mais recente primeiro. Só existe pra
// produtos editados pelo menos uma vez com preço diferente (ver registrarHistoricoPrecos).
export function abrirHistoricoPrecos(id) {
  const p = prodById(id);
  if (!p) return toast('Produto não encontrado');
  const historico = [...(p.historicoPrecos || [])].reverse();
  showModal(`<h3>📈 Histórico de preços — ${esc(p.nome)}</h3>
    ${historico.length ? `<div class="table table-scroll"><table><thead><tr>
      <th>Data</th><th>Preço atual</th>
    </tr></thead><tbody>${historico.map(h => `<tr>
      <td data-label="Data">${formatDateBR(h.data)}</td>
      <td data-label="Preço atual">${h.precoAtualAnterior !== h.precoAtualNovo ? `<del>${money(h.precoAtualAnterior)}</del> → ${money(h.precoAtualNovo)}` : money(h.precoAtualNovo)}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma alteração de preço registrada ainda — o histórico começa a partir da próxima vez que você editar o preço deste produto.</p>'}
    <br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
}

// Remove duplicados por código (fallback nome) dentro do próprio catálogo mestre, combinando linhas.
function dedupMestre(items) {
  const map = {};
  items.forEach(p => {
    // Normaliza o código (string + trim) antes de usar como chave — sem isso, "123" e 123
    // (ou " 123") caíam em chaves diferentes e duplicavam o mesmo produto na sincronização.
    const key = String(p.codigoFarmasi || '').trim() || norm(p.nome);
    if (map[key]) map[key] = { ...map[key], ...p, linha: mesclarLinhas(map[key].linha, p.linha) };
    else map[key] = p;
  });
  return Object.values(map);
}

function produtoExistente(p) {
  const codigo = String(p.codigoFarmasi || '').trim();
  return codigo ? state.data.produtos.find(x => String(x.codigoFarmasi || '') === codigo)
    : state.data.produtos.find(x => norm(x.nome) === norm(p.nome));
}

function statusBaseColetiva(p) {
  return produtoExistente(p) ? 'Atualiza' : 'Novo';
}

// Só entra na tela de conferência quem é produto novo OU tem alguma divergência real (nome, linha,
// preço de tabela ou foto) contra o que já está cadastrado — produtos já iguais não precisam de
// atenção da consultora a cada sincronização.
function difereDaBaseColetiva(mestre) {
  const ex = produtoExistente(mestre);
  if (!ex) return true;
  if (norm(ex.nome || '') !== norm(mestre.nome || '')) return true;
  const linhasExistentes = new Set(String(ex.linha || '').split(',').map(s => norm(s.trim())).filter(Boolean));
  const linhasNovas = String(mestre.linha || '').split(',').map(s => norm(s.trim())).filter(Boolean);
  if (linhasNovas.some(l => !linhasExistentes.has(l))) return true;
  const paraCentavos = v => Math.round(parseMoney(v || 0) * 100);
  if (paraCentavos(ex.precoOriginal) !== paraCentavos(mestre.precoOriginal)) return true;
  if (paraCentavos(ex.precoAtual) !== paraCentavos(mestre.precoAtual || mestre.precoOriginal)) return true;
  if (mestre.imagem && mestre.imagem !== ex.imagem) return true;
  // Descrição da consultora mais completa que a do mestre e ainda não sugerida — precisa entrar
  // na conferência pra que salvar dispare sugerirBeneficioCatalogoMestre() dentro de upsertProduto
  // (senão um produto "igual" em tudo, menos na descrição, nunca chegava a gerar sugestão).
  const beneficiosEx = String(ex.beneficios || '').trim();
  const beneficiosMestre = String(mestre.beneficios || '').trim();
  if (beneficiosEx.length > beneficiosMestre.length && ex.beneficioSugeridoHash !== beneficiosEx) return true;
  return false;
}

// Puxa os produtos da base coletiva do Admin (catalogoMestre) e abre uma tela de conferência
// (editar/remover cada item) antes de gravar — evita duplicatas e preços errados indo direto pro banco.
export async function sincronizarBaseColetiva() {
  let snap;
  try {
    snap = await getDocs(collection(db, 'catalogoMestre'));
  } catch (e) {
    return toast('Não foi possível acessar a base coletiva. Fale com a administração.');
  }
  const todosVerificados = dedupMestre(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  if (!todosVerificados.length) return toast('A base coletiva do Administrador ainda não tem produtos.');
  window.__baseColetivaVerificados = todosVerificados.length;
  window.__baseColetivaTodos = todosVerificados.filter(difereDaBaseColetiva);
  window.__baseColetivaLinhaFiltro = '';
  aplicarFiltroBaseColetiva();
}

// Reconstrói a lista de conferência a partir da base já filtrada por divergência
// (window.__baseColetivaTodos), aplicando o filtro de linha escolhido — trocar o filtro reinicia a
// conferência (edições feitas antes da troca não são mantidas, já que a lista é remontada do zero
// pra refletir a nova linha).
function aplicarFiltroBaseColetiva() {
  const todos = window.__baseColetivaTodos || [];
  const filtro = window.__baseColetivaLinhaFiltro || '';
  window.__baseColetivaPreview = filtro ? todos.filter(p => linhasDe(p).includes(filtro)) : todos;
  renderBaseColetivaPreview();
}

export function filtrarLinhaBaseColetiva(linha) {
  window.__baseColetivaLinhaFiltro = linha;
  aplicarFiltroBaseColetiva();
}

function renderBaseColetivaPreview() {
  const arr = window.__baseColetivaPreview || [];
  const todasLinhas = Array.from(new Set((window.__baseColetivaTodos || []).flatMap(linhasDe))).sort((a, b) => labelLinha(a).localeCompare(labelLinha(b), 'pt-BR'));
  const verificados = window.__baseColetivaVerificados || (window.__baseColetivaTodos || []).length;
  const necessitam = (window.__baseColetivaTodos || []).length;
  const banner = `<p class="muted" style="margin-bottom:10px">Foram verificados ${verificados} produto(s) e ${necessitam ? `apenas ${necessitam} necessita(m)` : 'nenhum necessita'} de atualização.</p>`;
  if (!arr.length) {
    showModal(`<h3>Conferência da base coletiva</h3>
      ${banner}
      <div class="field" style="max-width:260px;margin-bottom:10px"><label>Importar só a linha</label>
        <select onchange="App.filtrarLinhaBaseColetiva(this.value)">
          <option value="">Todas as linhas</option>
          ${todasLinhas.map(l => `<option value="${esc(l)}" ${window.__baseColetivaLinhaFiltro === l ? 'selected' : ''}>${esc(labelLinha(l))}</option>`).join('')}
        </select>
      </div>
      <p class="muted">${necessitam ? 'Nenhum produto nessa linha precisa de atualização.' : 'Tudo já está em dia com a base coletiva.'}</p>
      <button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
    return;
  }
  const novos = arr.filter(p => statusBaseColetiva(p) === 'Novo').length;
  const atualiza = arr.length - novos;
  showModal(`<h3>Conferência da base coletiva (${arr.length})</h3>
    ${banner}
    <div class="field" style="max-width:260px;margin-bottom:10px"><label>Importar só a linha</label>
      <select onchange="App.filtrarLinhaBaseColetiva(this.value)">
        <option value="">Todas as linhas</option>
        ${todasLinhas.map(l => `<option value="${esc(l)}" ${window.__baseColetivaLinhaFiltro === l ? 'selected' : ''}>${esc(labelLinha(l))}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px">${pill(novos + ' novos', 'green')}${pill(atualiza + ' atualizações', 'blue')}</div>
    <p class="muted">Confira, edite ou remova itens antes de salvar. Seu preço de venda, custo médio e estoque não são alterados.</p>
    <div class="table table-scroll"><table style="table-layout:fixed;min-width:720px"><thead><tr>
      <th style="width:22%">Nome</th><th style="width:12%">Código</th><th style="width:22%">Linha</th><th style="width:14%">Preço original</th><th style="width:14%">Preço atual</th><th style="width:12%">Situação</th><th style="width:4%"></th>
    </tr></thead><tbody>${arr.map((p, idx) => `<tr>
      <td data-label="Nome"><input style="width:100%" value="${esc(p.nome || '')}" onchange="App.editarItemBaseColetiva(${idx},'nome',this.value)"></td>
      <td data-label="Código"><input style="width:100%" value="${esc(p.codigoFarmasi || '')}" onchange="App.editarItemBaseColetiva(${idx},'codigoFarmasi',this.value)"></td>
      <td data-label="Linha"><input style="width:100%" value="${esc(p.linha || '')}" onchange="App.editarItemBaseColetiva(${idx},'linha',this.value)"></td>
      <td data-label="Original"><input style="width:100%" value="${esc(p.precoOriginal || '')}" onchange="App.editarItemBaseColetiva(${idx},'precoOriginal',this.value)"></td>
      <td data-label="Atual"><input style="width:100%" value="${esc(p.precoAtual || '')}" onchange="App.editarItemBaseColetiva(${idx},'precoAtual',this.value)"></td>
      <td data-label="Situação">${pill(statusBaseColetiva(p), statusBaseColetiva(p) === 'Novo' ? 'green' : 'blue')}</td>
      <td><button class="btn small" style="color:var(--error)" onclick="App.removerItemBaseColetiva(${idx})" title="Remover">✗</button></td>
    </tr>`).join('')}</tbody></table></div><br>
    <button class="btn dark" onclick="App.confirmarBaseColetiva()">Salvar ${arr.length} produto(s)</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export function editarItemBaseColetiva(idx, campo, valor) {
  if (!window.__baseColetivaPreview?.[idx]) return;
  window.__baseColetivaPreview[idx][campo] = valor;
}

export function removerItemBaseColetiva(idx) {
  if (!window.__baseColetivaPreview) return;
  window.__baseColetivaPreview.splice(idx, 1);
  renderBaseColetivaPreview();
}

export async function confirmarBaseColetiva() {
  const itens = window.__baseColetivaPreview || [];
  for (const p of itens) await upsertProduto(p);
  window.__baseColetivaPreview = null;
  window.__baseColetivaTodos = null;
  await marcarUltimaSincronizacaoBaseColetiva();
  closeModal();
  window.App.refresh(`${itens.length} produto(s) sincronizados da base coletiva`);
}

async function marcarUltimaSincronizacaoBaseColetiva() {
  await setDoc(doc(db, 'users', state.user.uid), { baseColetivaUltimaSincronizacao: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, baseColetivaUltimaSincronizacao: { toDate: () => new Date() } };
}

// Sincronização automática silenciosa (chamada 1x por dia, no login, quando a consultora ativa
// essa opção): aplica direto sem tela de conferência, mas só mexe em nome/código/linha/foto/preço
// de tabela — nunca em preço de venda, custo médio ou estoque (upsertProduto já garante isso).
export async function autoSincronizarBaseColetiva() {
  let snap;
  try {
    snap = await getDocs(collection(db, 'catalogoMestre'));
  } catch (e) {
    toast('Não foi possível sincronizar com a base coletiva automaticamente (erro: ' + e.message + '). Tente sincronizar manualmente em Produtos.');
    return;
  }
  const itens = dedupMestre(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  if (!itens.length) return;
  for (const p of itens) await upsertProduto(p);
  await marcarUltimaSincronizacaoBaseColetiva();
}

// Um produto pode existir em mais de uma linha (ex: mesmo código vendido em "Skincare" e "Kits").
// Em vez de sobrescrever, combina as linhas existentes com a nova em uma lista única "A, B".
// Bug de raiz corrigido: linhaNova podia vir como uma string já com várias linhas separadas por
// vírgula (ex: "Maquiagem, Cremoso"), mas só era trim()ada como um bloco único antes de entrar no
// Set — então numa sincronização seguinte, a mesma string "Maquiagem, Cremoso" (agora diferente dos
// elementos "Maquiagem" e "Cremoso" já separados de uma mesclagem anterior) entrava de novo inteira,
// duplicando tudo a cada sync (ex: "Maquiagem, Cremoso, Maquiagem, Cremoso"). Agora as duas entradas
// são sempre separadas por vírgula antes de comparar, e a comparação ignora acento/maiúscula/hífen
// (normalizada, com de/para de grafias conhecidas) mas preserva a grafia oficial/primeira ocorrência.
export const mesclarLinhas = combinarLinhas;

// Consultoras não podem escrever no Catálogo mestre (só o admin) — em vez de gravar direto,
// registra uma sugestão pro admin revisar e aprovar em Admin → Catálogo mestre.
async function sugerirBeneficioCatalogoMestre(catalogoMestreId, nome, codigoFarmasi, beneficiosSugerido) {
  try {
    await addDoc(collection(db, 'sugestoesBeneficios'), {
      catalogoMestreId, nome, codigoFarmasi,
      beneficiosSugerido,
      sugeridoPorUid: state.user.uid,
      sugeridoPorNome: state.profile?.nome || state.user.email || '',
      status: 'pendente',
      criadoEm: serverTimestamp()
    });
  } catch (e) { /* sugestão é um extra opcional — não deve travar a sincronização se falhar */ }
}

export async function upsertProduto(raw) {
  const codigo = String(raw.codigoFarmasi || raw.codigo || '').trim();
  const nome = String(raw.nome || '').trim();
  let p = codigo ? state.data.produtos.find(x => String(x.codigoFarmasi || '') === codigo) : null;
  if (!p && nome) p = state.data.produtos.find(x => norm(x.nome) === norm(nome));
  const d = {
    nome, codigoFarmasi: codigo,
    linha: mesclarLinhas(p?.linha, raw.linha),
    atualizadoEm: serverTimestamp()
  };
  // Importação de pedido/estoque não sabe preço de venda nem tem foto — só mexe nesses campos
  // quando a fonte realmente informa algo, senão zerava o preço original/atual e apagava a foto
  // de produtos já cadastrados toda vez que a consultora importava uma nota de compra.
  if (raw.imagem) d.imagem = raw.imagem;
  if (raw.precoOriginal != null || raw.precoAtual != null) {
    d.precoOriginal = parseMoney(raw.precoOriginal || 0);
    d.precoAtual = parseMoney(raw.precoAtual || raw.precoOriginal || 0);
  }
  // Benefícios: entre o texto já cadastrado e o que vem nesta importação, mantém sempre o mais
  // completo (maior número de caracteres) — assim uma lista com benefício detalhado não é perdida
  // por uma importação posterior mais pobre, nem o contrário.
  const beneficiosNovo = String(raw.beneficios || raw.descricao || raw.beneficio || '').trim();
  const beneficiosAtual = String(p?.beneficios || '').trim();
  if (beneficiosNovo.length > beneficiosAtual.length) d.beneficios = beneficiosNovo;
  // Caso contrário (a descrição da consultora está mais completa que a do Catálogo mestre — vazia
  // ou não), sugere a descrição pro admin em vez de gravar direto — só admin pode escrever no mestre.
  // raw.id só existe quando raw veio do catalogoMestre (sincronização); guarda o texto já sugerido
  // no próprio produto (beneficioSugeridoHash) pra não reenviar a mesma sugestão a cada sync.
  else if (beneficiosAtual.length > beneficiosNovo.length && raw.id && p?.beneficioSugeridoHash !== beneficiosAtual) {
    await sugerirBeneficioCatalogoMestre(raw.id, nome, codigo, beneficiosAtual);
    d.beneficioSugeridoHash = beneficiosAtual;
  }
  // Flags de estoque (usadas pela importação de pedido) só são aplicadas quando explicitamente informadas
  if (raw.produtoProntaEntrega != null) d.produtoProntaEntrega = !!raw.produtoProntaEntrega;
  if (raw.monitorarEstoqueBaixo != null) d.monitorarEstoqueBaixo = !!raw.monitorarEstoqueBaixo;
  if (p) {
    await setDoc(ref('produtos', p.id), d, { merge: true });
    await sincronizarProdutoNosEventos({ ...p, ...d, id: p.id });
    return p.id;
  }
  const r = await addDoc(col('produtos'), {
    imagem: '', precoOriginal: 0, precoAtual: 0,
    ...d, estoqueAtual: 0, estoqueMinimo: 1, custoMedio: 0,
    ativoCatalogo: true, produtoProntaEntrega: false, monitorarEstoqueBaixo: false,
    ativo: true, criadoEm: serverTimestamp()
  });
  return r.id;
}
