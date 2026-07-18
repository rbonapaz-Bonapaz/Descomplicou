import { state, col, ref, db, deleteDoc, showModal, closeModal, toast, setDoc, addDoc, serverTimestamp,
  cliById, lastBuy, salesAgg, openCarrinhosForClient, planoInfo, estoqueDisponivel, numeroPedidoLabel } from './state.js';
import { $, esc, money, today, norm, daysSince, daysToBirthday, pill, withFocusPreserved, formatDateBR, thSort } from './utils.js';
import { whatsAppBtn, onclickArg, WA_ICON, openWhatsApp, formatPhone } from './whatsapp.js';
import { detalheVendaHtml } from './vendas.js';
import { gerarSugestaoAbordagem } from './gemini.js';

// Vendas expandidas no histórico do Cliente 360 (mesmo padrão do accordion de Vendas — B.2) —
// só estado de tela, não persiste. Chave é a venda (v.id), não o carrinho.
const historicoExpandido = new Set();

export function toggleHistoricoVenda(clienteId, vendaId) {
  if (historicoExpandido.has(vendaId)) historicoExpandido.delete(vendaId);
  else historicoExpandido.add(vendaId);
  openCliente360(clienteId);
}

export function renderClientes() {
  withFocusPreserved('qcli', () => {
    $('clientes').innerHTML = `<div class="cards">
      <div class="card"><span>Total de clientes</span><b>${state.data.clientes.length}</b></div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <button class="btn dark" onclick="App.openClienteForm()">+ Cadastrar Cliente</button>
        <input id="qcli" placeholder="Buscar..." oninput="App.renderClientes()" value="${esc($('qcli')?.value || '')}">
      </div>
      ${tableClientes()}
    </div>`;
  });
}

// Ordena a listagem de clientes pela coluna clicada (state.filters.clientesSort, ex: "compra_desc").
// Texto ordena alfabético case-insensitive (norm já baixa caixa e remove acento), data usa a
// própria string ISO (ordena cronológico certinho por comparação lexicográfica), status usa os
// mesmos dias-desde-última-compra que definem Quente/Morno/Frio, então a ordem reflete a categoria.
function ordenarClientes(lista) {
  const [field, dir] = String(state.filters.clientesSort || '').split('_');
  if (!field) return lista;
  const mul = dir === 'desc' ? -1 : 1;
  const val = c => {
    if (field === 'contato') return norm(c.whatsapp || '');
    if (field === 'compra') return lastBuy(c) || '';
    if (field === 'status') return daysSince(lastBuy(c));
    return norm(c.nome || '');
  };
  return [...lista].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === 'string') return va.localeCompare(vb, 'pt-BR') * mul;
    return (va - vb) * mul;
  });
}

// Ações de um cliente — HTML idêntico na tabela (desktop) e no cartão (mobile), mesmo padrão de
// vendaAcoesHtml em vendas.js, pra tabela e cartão nunca saírem de sincronia.
function clienteAcoesHtml(c) {
  return `
    <button class="btn small" onclick="App.openCliente360('${c.id}')">Ver</button>
    <button class="btn small" onclick="App.openClienteForm('${c.id}')">Editar</button>
    ${whatsAppBtn(c.whatsapp, 'contatoFrio', { nome: c.apelido || c.nome, telefone: c.whatsapp })}
    <button class="btn small" style="color:var(--error)" onclick="App.excluirCliente('${c.id}')" title="Excluir">🗑️</button>`;
}

// Cartão de cliente no celular (mesma classe .vcard do cartão de Vendas) — nome em destaque no
// topo, status em pílula, contato/última compra em linhas com separador, ações em grade.
function clienteCardHtml(c) {
  const ds = daysSince(lastBuy(c));
  const carrinhoAberto = openCarrinhosForClient(c.id).length > 0;
  const statusLabel = ds <= 30 ? 'Quente' : ds <= 60 ? 'Morno' : 'Frio';
  const statusCor = ds <= 30 ? 'green' : ds <= 60 ? 'blue' : 'red';
  return `<div class="vcard">
    <div class="vcard-top">
      <div class="vcard-cli cli-link" style="margin:0" onclick="App.openCliente360('${c.id}')">${esc(c.nome)}</div>
      ${pill(statusLabel, statusCor)}
    </div>
    ${carrinhoAberto || (c.tags || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${carrinhoAberto ? `<span class="pill blue" style="cursor:pointer" onclick="App.openCarrinhoDoCliente('${c.id}')">🛒 carrinho aberto</span>` : ''}
      ${(c.tags || []).map(t => pill(t, 'pink')).join('')}
    </div>` : ''}
    <div class="vcard-rows">
      <div class="vcard-row"><span>Contato</span><b>${esc(c.whatsapp || '-')}</b></div>
      <div class="vcard-row"><span>Última compra</span><b>${lastBuy(c) ? `${formatDateBR(lastBuy(c))} <small class="muted">(${ds}d)</small>` : '-'}</b></div>
    </div>
    <div class="vcard-actions">${clienteAcoesHtml(c)}</div>
  </div>`;
}

function tableClientes() {
  const q = norm($('qcli')?.value || '');
  let l = state.data.clientes.filter(c => !q || norm(c.nome + ' ' + c.whatsapp + ' ' + c.cidade + ' ' + (c.tags || []).join(' ')).includes(q));
  if (!l.length) return '<p class="muted">Nenhum cliente.</p>';
  const sortKey = state.filters.clientesSort;
  l = ordenarClientes(l);

  const tabela = `<div class="table only-desktop"><table><thead><tr>
    ${thSort('Cliente', 'nome', sortKey, 'clientesSort')}${thSort('Contato', 'contato', sortKey, 'clientesSort')}${thSort('Última compra', 'compra', sortKey, 'clientesSort')}${thSort('Status', 'status', sortKey, 'clientesSort')}<th>Ações</th>
  </tr></thead><tbody>${l.map(c => {
    const ds = daysSince(lastBuy(c));
    const carrinhoAberto = openCarrinhosForClient(c.id).length > 0;
    return `<tr>
      <td>
        <b class="cli-link" onclick="App.openCliente360('${c.id}')">${esc(c.nome)}</b>
        ${carrinhoAberto ? '<span class="pill blue" style="cursor:pointer" onclick="App.openCarrinhoDoCliente(\'' + c.id + '\')">🛒 aberto</span>' : ''}
        ${(c.tags || []).length ? `<div style="margin-top:4px">${c.tags.map(t => pill(t, 'pink')).join(' ')}</div>` : ''}
      </td>
      <td>${esc(c.whatsapp || '')}</td>
      <td>${lastBuy(c) ? `${formatDateBR(lastBuy(c))} <small class="muted">(${ds} dias)</small>` : '-'}</td>
      <td>${pill(ds <= 30 ? 'Quente' : ds <= 60 ? 'Morno' : 'Frio', ds <= 30 ? 'green' : ds <= 60 ? 'blue' : 'red')}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">${clienteAcoesHtml(c)}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;

  const cartoes = `<div class="only-mobile vcards">${l.map(clienteCardHtml).join('')}</div>`;

  return tabela + cartoes;
}

let leadPrefill = null; // { eventoId, listaId } — pré-cadastro vindo de uma lista de desejos de evento

// Canal pelo qual a cliente chegou até você — usado no relatório de origem para saber onde
// vale mais a pena investir tempo/dinheiro captando novas clientes.
export const ORIGENS_CLIENTE = ['Evento', 'Indicação', 'Instagram', 'WhatsApp', 'Parceria/Troca', 'Loja física', 'Já era conhecida/contato', 'Outro'];

export function openClienteForm(id = '', prefill = null) {
  if (!id) {
    const pi = planoInfo();
    if (pi.atingiuLimite) {
      return showModal(`<h3>Limite do plano ${pi.isGratuito ? 'gratuito' : 'teste'} atingido</h3>
        <p>Seu plano permite até <b>${pi.limite} clientes</b> e você já tem ${pi.clientesUsados}.</p>
        <p class="muted">Fale com a administração para liberar um plano pago e cadastrar mais clientes.</p>
        <br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
    }
  }
  leadPrefill = !id && prefill ? prefill : null;
  const c = id ? cliById(id) : (prefill ? { nome: prefill.nome, apelido: prefill.apelido, whatsapp: prefill.whatsapp, nascimento: prefill.nascimento, origem: prefill.origem } : {});
  showModal(`<h3>${id ? 'Editar' : 'Novo'} Cliente</h3>
    ${leadPrefill ? '<p class="muted">Pré-preenchido a partir de uma lista de desejos de evento.</p>' : ''}
    <div class="grid">
      <div class="field"><label>Nome</label><input id="cNome" value="${esc(c.nome || '')}"></div>
      <div class="field"><label>Como deseja ser chamado(a)?</label><input id="cApelido" placeholder="Ex: Fabiula de Oliveira – Fabi" value="${esc(c.apelido || '')}"></div>
      <div class="field"><label>WhatsApp</label><input id="cWhats" value="${esc(c.whatsapp || '')}"></div>
      <div class="field"><label>E-mail</label><input id="cEmail" value="${esc(c.email || '')}"></div>
      <div class="field"><label>Nascimento</label><input type="date" id="cNasc" value="${esc(c.nascimento || '')}"></div>
      <div class="field"><label>Cidade</label><input id="cCidade" value="${esc(c.cidade || '')}"></div>
      <div class="field"><label>Endereço</label><input id="cEndereco" value="${esc(c.endereco || '')}"></div>
      <div class="field"><label>Como conheceu você?</label>
        <select id="cOrigem" ${leadPrefill ? 'disabled' : ''}>
          <option value="" ${!c.origem ? 'selected' : ''}>Não informado</option>
          ${ORIGENS_CLIENTE.map(o => `<option value="${o}" ${c.origem === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        ${leadPrefill ? '<small class="muted">Veio de uma lista de evento — marcado automaticamente.</small>' : ''}
      </div>
      <div class="field"><label>Gênero</label>
        <select id="cGenero">
          <option value="" ${!c.genero ? 'selected' : ''}>Não informado</option>
          <option value="Feminino" ${c.genero === 'Feminino' ? 'selected' : ''}>Feminino</option>
          <option value="Masculino" ${c.genero === 'Masculino' ? 'selected' : ''}>Masculino</option>
          <option value="Outro" ${c.genero === 'Outro' ? 'selected' : ''}>Outro</option>
        </select>
      </div>
      <div class="field"><label>Último contato</label><input type="date" id="cUlt" value="${esc(c.ultimoContato || '')}"></div>
      <div class="field"><label>Preferência de contato</label>
        <select id="cPrefContato">
          <option ${(c.preferenciaContato || '') === '' ? 'selected' : ''}>Sem preferência</option>
          <option ${c.preferenciaContato === 'WhatsApp' ? 'selected' : ''}>WhatsApp</option>
          <option ${c.preferenciaContato === 'Ligação' ? 'selected' : ''}>Ligação</option>
          <option ${c.preferenciaContato === 'E-mail' ? 'selected' : ''}>E-mail</option>
          <option ${c.preferenciaContato === 'Presencial' ? 'selected' : ''}>Presencial</option>
        </select>
      </div>
      <div class="field full"><label>Tags (separadas por vírgula)</label><input id="cTags" placeholder="Ex: VIP, Skincare" value="${esc((c.tags || []).join(', '))}"></div>
      <div class="field full"><label>Observações</label><textarea id="cObs">${esc(c.observacoes || '')}</textarea></div>
    </div><br>
    <div style="display:flex;gap:8px">
      <button class="btn dark" onclick="App.saveCliente('${id}')">Salvar</button>
      <button class="btn ghost" onclick="App.closeModal()">Fechar</button>
    </div>`);
}

export async function saveCliente(id = '') {
  if (!id && planoInfo().atingiuLimite) {
    closeModal();
    return toast('Limite de clientes do plano atingido');
  }
  const d = {
    nome: $('cNome').value, apelido: $('cApelido').value.trim(), whatsapp: $('cWhats').value, email: $('cEmail').value,
    nascimento: $('cNasc').value, cidade: $('cCidade').value, endereco: $('cEndereco').value,
    genero: $('cGenero').value, origem: $('cOrigem').value,
    ultimoContato: $('cUlt').value, preferenciaContato: $('cPrefContato').value,
    tags: $('cTags').value.split(',').map(t => t.trim()).filter(Boolean),
    observacoes: $('cObs').value, atualizadoEm: serverTimestamp()
  };
  if (id) {
    await setDoc(ref('clientes', id), d, { merge: true });
  } else {
    const r = await addDoc(col('clientes'), { ...d, criadoEm: serverTimestamp() });
    if (leadPrefill) {
      window.dispatchEvent(new CustomEvent('lead-cliente-criado', { detail: { ...leadPrefill, clienteId: r.id } }));
      leadPrefill = null;
    }
  }
  closeModal();
  window.App.refresh('Cliente salvo');
}

// --- Copiloto de vendas (Gemini) — "Gerar Sugestão de Abordagem" no Cliente 360 ---
// Compila o histórico real da cliente num contexto textual e pede ao Gemini uma mensagem de
// WhatsApp personalizada. Nunca envia nada sozinho — abre um modal com o texto pra revisar/editar
// e só então copiar ou abrir o WhatsApp com o texto pronto.
function compilarContextoCliente(c) {
  const linhas = [];
  const vendas = state.data.vendas.filter(v => v.clienteId === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ultima = vendas[0];
  if (ultima) {
    const dias = daysSince(ultima.data);
    const itens = (ultima.itens || []).map(i => i.produtoNome).join(', ') || 'produtos não especificados';
    linhas.push(`Última compra há ${dias} dias: ${itens}.`);
  } else {
    linhas.push('Ainda não fez nenhuma compra registrada.');
  }
  if ((c.tags || []).length) linhas.push(`Tags/preferências: ${c.tags.join(', ')}.`);
  const diasAniv = daysToBirthday(c.nascimento);
  if (diasAniv === 0) linhas.push('Hoje é o dia do aniversário do cliente.');
  else if (diasAniv > 0 && diasAniv <= 7) linhas.push(`Aniversário do cliente em ${diasAniv} dia(s).`);
  // Produtos que ela já comprou antes e que acabaram de repor no estoque (gatilho de reposição).
  const produtosComprados = new Set();
  vendas.forEach(v => (v.itens || []).forEach(i => { if (i.produtoId) produtosComprados.add(i.produtoId); }));
  const repostos = [...produtosComprados]
    .map(id => state.data.produtos.find(p => p.id === id))
    .filter(p => p && estoqueDisponivel(p.id) > 0)
    .slice(0, 2);
  if (repostos.length) linhas.push(`Produto(s) que ela já comprou e você tem em estoque agora: ${repostos.map(p => p.nome).join(', ')}.`);
  if (Number(c.credito || 0) > 0.004) linhas.push(`Cliente tem ${money(c.credito)} de crédito disponível.`);
  return linhas.join('\n');
}

export async function gerarSugestaoAbordagemCliente(id) {
  const c = cliById(id);
  if (!c) return toast('Cliente não encontrado');
  showModal(`<h3>🤖 Gerando sugestão...</h3><p class="muted">Consultando o Gemini com o histórico de ${esc(c.nome)}.</p>`);
  try {
    const contexto = compilarContextoCliente(c);
    const texto = await gerarSugestaoAbordagem(contexto);
    showModal(`<h3>🤖 Sugestão de abordagem — ${esc(c.nome)}</h3>
      <p class="muted">Revise ou edite antes de enviar. Nada é enviado automaticamente.</p>
      <textarea id="sugestaoTexto" rows="6">${esc(texto)}</textarea>
      <br><br>
      <button class="btn dark" onclick="App.copiarSugestaoAbordagem()">📋 Copiar</button>
      ${c.whatsapp ? `<button class="btn small green-btn" onclick="App.enviarSugestaoAbordagem('${esc(c.whatsapp)}')">${WA_ICON} Abrir WhatsApp</button>` : ''}
      <button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
  } catch (e) {
    showModal(`<h3>Não foi possível gerar a sugestão</h3><p>${esc(e.message)}</p><br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
  }
}

export function copiarSugestaoAbordagem() {
  const texto = $('sugestaoTexto')?.value || '';
  navigator.clipboard?.writeText(texto);
  toast('Texto copiado');
}

export function enviarSugestaoAbordagem(whatsapp) {
  const texto = $('sugestaoTexto')?.value || '';
  openWhatsApp(whatsapp, texto);
}

export function openCliente360(id) {
  const c = cliById(id);
  if (!c) return toast('Cliente não encontrado');

  const vendas = state.data.vendas.filter(v => v.clienteId === id);
  const agendamentos = state.data.agendamentos.filter(a => a.clienteId === id);
  const carrinhos = openCarrinhosForClient(id);
  const totalFat = vendas.reduce((s, v) => s + Number(v.receita || v.totalPedido || 0), 0);
  const totalLuc = vendas.reduce((s, v) => s + Number(v.lucroTotal || 0), 0);
  const ds = daysSince(lastBuy(c));
  const diasAniv = daysToBirthday(c.nascimento);

  showModal(`<div class="cliente360">
    <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px">
      <div>
        <h3 style="margin:0">${esc(c.nome)}</h3>
        <p class="muted" style="margin:4px 0">${esc(c.whatsapp || '')} • ${esc(c.cidade || '')} • ${esc(c.email || '')}</p>
        ${c.origem ? pill('Origem: ' + c.origem, 'blue') : ''}
        ${(c.tags || []).length ? `<span style="margin-left:6px">${c.tags.map(t => pill(t, 'pink')).join(' ')}</span>` : ''}
        ${c.endereco ? `<p class="muted" style="margin:2px 0">${esc(c.endereco)}</p>` : ''}
        ${c.nascimento ? `<p class="muted" style="margin:2px 0">🎂 ${formatDateBR(c.nascimento)} ${diasAniv <= 30 ? '• ' + (diasAniv === 0 ? 'Hoje!' : 'Faltam ' + diasAniv + ' dias') : ''}</p>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${c.whatsapp ? `<button class="btn small green-btn" onclick="App.sendWhatsApp('contatoFrio',${onclickArg({ nome: c.apelido || c.nome, telefone: c.whatsapp })})">${WA_ICON} WhatsApp</button>` : ''}
        ${state.profile?.geminiApiKey ? `<button class="btn small" onclick="App.gerarSugestaoAbordagemCliente('${id}')">🤖 Gerar Sugestão de Abordagem</button>` : ''}
        <button class="btn small dark" onclick="App.closeModal();App.openCarrinhoForCliente('${id}')">🛒 Carrinho</button>
        <button class="btn small" onclick="App.closeModal();App.openAgendamentoForm('${id}')">📅 Agendar</button>
        <button class="btn small" onclick="App.marcarContatado('${id}')">✓ Contatado</button>
        <button class="btn small" onclick="App.closeModal();App.openClienteForm('${id}')">✏️ Editar</button>
      </div>
    </div>

    <div class="cards" style="margin-top:16px">
      <div class="card"><span>Compras</span><b>${vendas.length}</b></div>
      <div class="card"><span>Faturamento</span><b>${money(totalFat)}</b></div>
      <div class="card"><span>Lucro gerado</span><b>${money(totalLuc)}</b></div>
      ${Number(c.credito || 0) > 0.004 ? `<div class="card"><span>Créditos</span><b style="color:var(--success)">${money(c.credito)}</b></div>` : ''}
      <div class="card"><span>Status</span><b>${pill(ds <= 30 ? 'Quente' : ds <= 60 ? 'Morno' : 'Frio', ds <= 30 ? 'green' : ds <= 60 ? 'blue' : 'red')}</b></div>
    </div>

    ${carrinhos.length ? `<div class="panel" style="margin-top:12px;background:#FFF7E6">
      <h3>🛒 Carrinho aberto</h3>
      ${carrinhos.map(cr => `<p>${cr.itens?.length || 0} itens • ${money(cr.totalPedido || 0)}
        <button class="btn small dark" onclick="App.closeModal();App.openCarrinho('${cr.id}')">Abrir carrinho</button></p>`).join('')}
    </div>` : ''}

    <div class="panel" style="margin-top:12px">
      <h3>Histórico de vendas</h3>
      ${vendas.length ? (() => {
        const lista = vendas.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 10);
        const tabela = `<div class="table only-desktop"><table><thead><tr><th></th><th>Nº</th><th>Data</th><th>Valor</th><th>Lucro</th><th>Pgto</th></tr></thead>
        <tbody>${lista.map(v => {
          const expandida = historicoExpandido.has(v.id);
          const carr = state.data.carrinhos.find(cr => cr.id === v.carrinhoId);
          return `<tr>
          <td><button class="btn small" style="padding:3px 8px" onclick="App.toggleHistoricoVenda('${id}','${v.id}')" title="${expandida ? 'Ocultar itens' : 'Ver itens da venda'}">${expandida ? '▾' : '▸'}</button></td>
          <td><small class="muted">${carr ? numeroPedidoLabel(carr) : '-'}</small></td>
          <td style="cursor:pointer" onclick="App.toggleHistoricoVenda('${id}','${v.id}')">${formatDateBR(v.data)}</td>
          <td>${money(v.receita || v.totalPedido)}</td>
          <td>${money(v.lucroTotal)}</td>
          <td>${esc(v.pagamento || '-')}</td>
        </tr>${expandida ? `<tr><td colspan="6" style="background:#F7FAFC">${carr ? detalheVendaHtml(carr) : '<small class="muted">Carrinho original não encontrado (pode ter sido excluído).</small>'}</td></tr>` : ''}`;
        }).join('')}</tbody></table></div>`;
        const cartoes = `<div class="only-mobile vcards">${lista.map(v => {
          const expandida = historicoExpandido.has(v.id);
          const carr = state.data.carrinhos.find(cr => cr.id === v.carrinhoId);
          return `<div class="vcard">
            <div class="vcard-top">
              <span class="vcard-num">Nº ${carr ? numeroPedidoLabel(carr) : '-'} · ${formatDateBR(v.data)}</span>
              <span>${esc(v.pagamento || '-')}</span>
            </div>
            <div class="vcard-rows">
              <div class="vcard-row"><span>Valor</span><b>${money(v.receita || v.totalPedido)}</b></div>
              <div class="vcard-row"><span>Lucro</span><b>${money(v.lucroTotal)}</b></div>
            </div>
            <button class="btn small ghost vcard-toggle" onclick="App.toggleHistoricoVenda('${id}','${v.id}')">${expandida ? '▾ Ocultar itens' : '▸ Ver itens'}</button>
            ${expandida ? `<div class="vcard-itens">${carr ? detalheVendaHtml(carr) : '<small class="muted">Carrinho original não encontrado (pode ter sido excluído).</small>'}</div>` : ''}
          </div>`;
        }).join('')}</div>`;
        return tabela + cartoes;
      })() : '<p class="muted">Nenhuma venda registrada.</p>'}
    </div>

    <div class="panel" style="margin-top:12px">
      <h3>Agendamentos</h3>
      ${agendamentos.length ? (() => {
        const lista = agendamentos.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 10);
        const tabela = `<div class="table only-desktop"><table><thead><tr><th>Data</th><th>Tipo</th><th>Status</th></tr></thead>
        <tbody>${lista.map(a => `<tr>
          <td>${formatDateBR(a.data)} ${a.hora || ''}</td>
          <td>${esc(a.tipo)}</td>
          <td>${pill(a.status || 'agendado', 'blue')}</td>
        </tr>`).join('')}</tbody></table></div>`;
        const cartoes = `<div class="only-mobile vcards">${lista.map(a => `<div class="vcard">
          <div class="vcard-top">
            <span class="vcard-num">${formatDateBR(a.data)}${a.hora ? ' às ' + esc(a.hora) : ''}</span>
            ${pill(a.status || 'agendado', 'blue')}
          </div>
          <div class="vcard-rows"><div class="vcard-row"><span>Tipo</span><b>${esc(a.tipo)}</b></div></div>
        </div>`).join('')}</div>`;
        return tabela + cartoes;
      })() : '<p class="muted">Nenhum agendamento.</p>'}
    </div>

    ${(c.interesses || []).length ? `<div class="panel" style="margin-top:12px">
      <h3>⭐ Produtos de interesse</h3>
      <p class="muted">Ela demonstrou interesse mas ainda não comprou — bom gancho pra próxima abordagem.</p>
      <div class="list">${c.interesses.map(i => `<div class="list-item">
        <div><b>${esc(i.produtoNome)}</b><small>${i.origem ? esc(i.origem) + ' • ' : ''}${formatDateBR(i.adicionadoEm)}</small></div>
        <button class="btn small" style="color:var(--error)" onclick="App.removerInteresseCliente('${id}','${esc(i.produtoId)}')" title="Remover da lista">✗</button>
      </div>`).join('')}</div>
    </div>` : ''}

    ${c.observacoes ? `<div class="panel" style="margin-top:12px"><h3>Observações</h3><p>${esc(c.observacoes)}</p></div>` : ''}

    <br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>
  </div>`);
}

// --- Lista de interesse (permanente no cadastro do cliente) ---
// Diferente da lista de desejos de um evento (que só existe enquanto o evento existe), isso fica
// gravado no cliente pra sempre — ela demonstrou interesse mas não comprou ainda; a consultora
// acompanha e oferece de novo depois, de qualquer evento ou tela.
export async function adicionarInteresseCliente(clienteId, produto, origem = 'Manual') {
  const c = cliById(clienteId);
  if (!c) return toast('Cliente não encontrado');
  const atuais = c.interesses || [];
  if (atuais.some(i => i.produtoId === produto.produtoId)) return false; // já está na lista, não duplica
  const novo = { ...produto, origem, adicionadoEm: today() };
  await setDoc(ref('clientes', clienteId), { interesses: [...atuais, novo], atualizadoEm: serverTimestamp() }, { merge: true });
  return true;
}

export async function removerInteresseCliente(clienteId, produtoId) {
  const c = cliById(clienteId);
  if (!c) return;
  const interesses = (c.interesses || []).filter(i => i.produtoId !== produtoId);
  await setDoc(ref('clientes', clienteId), { interesses, atualizadoEm: serverTimestamp() }, { merge: true });
  // Atualiza o state local e reabre o mesmo modal na hora, em vez de esperar o refresh completo
  // (que recarrega tudo do Firestore mas não remonta o modal já aberto — o item ficava visível
  // até fechar/reabrir a tela do cliente).
  const idx = state.data.clientes.findIndex(x => x.id === clienteId);
  if (idx !== -1) state.data.clientes[idx] = { ...state.data.clientes[idx], interesses };
  openCliente360(clienteId);
  toast('Item removido da lista de interesse');
}

export async function marcarContatado(id) {
  await setDoc(ref('clientes', id), { ultimoContato: today(), atualizadoEm: serverTimestamp() }, { merge: true });
  toast('Contato registrado');
  window.App.refresh('Contato atualizado');
}

export async function excluirCliente(id) {
  const c = cliById(id);
  if (!c) return;
  const vendas = state.data.vendas.filter(v => v.clienteId === id).length;
  const aviso = vendas ? `\n\nAtenção: este cliente tem ${vendas} venda(s) registrada(s). O histórico de vendas será mantido, mas ficará sem cliente vinculado.` : '';
  if (!confirm(`Excluir o cliente "${c.nome}"?${aviso}\n\nEssa ação não pode ser desfeita.`)) return;
  const resp = prompt('Confirme digitando EXCLUIR para apagar este cliente:');
  if ((resp || '').trim().toUpperCase() !== 'EXCLUIR') return;
  await deleteDoc(ref('clientes', id));
  closeModal();
  window.App.refresh('Cliente excluído');
}
