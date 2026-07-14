import { state, col, ref, db, deleteDoc, showModal, closeModal, toast, setDoc, addDoc, serverTimestamp,
  cliById, lastBuy, salesAgg, openCarrinhosForClient, planoInfo } from './state.js';
import { $, esc, money, today, norm, daysSince, daysToBirthday, pill, withFocusPreserved, formatDateBR } from './utils.js';
import { whatsAppBtn, onclickArg } from './whatsapp.js';

export function renderClientes() {
  withFocusPreserved('qcli', () => {
    $('clientes').innerHTML = `<div class="panel">
      <div class="toolbar">
        <button class="btn dark" onclick="App.openClienteForm()">+ Cadastrar Cliente</button>
        <input id="qcli" placeholder="Buscar..." oninput="App.renderClientes()" value="${esc($('qcli')?.value || '')}">
      </div>
      ${tableClientes()}
    </div>`;
  });
}

function tableClientes() {
  const q = norm($('qcli')?.value || '');
  const l = state.data.clientes.filter(c => !q || norm(c.nome + ' ' + c.whatsapp + ' ' + c.cidade).includes(q));
  if (!l.length) return '<p class="muted">Nenhum cliente.</p>';
  return `<div class="table"><table><thead><tr>
    <th>Cliente</th><th>Contato</th><th>Última compra</th><th>Status</th><th>Ações</th>
  </tr></thead><tbody>${l.map(c => {
    const ds = daysSince(lastBuy(c));
    const carrinhoAberto = openCarrinhosForClient(c.id).length > 0;
    return `<tr>
      <td data-label="Cliente">
        <b class="cli-link" onclick="App.openCliente360('${c.id}')">${esc(c.nome)}</b>
        ${carrinhoAberto ? '<span class="pill blue" style="cursor:pointer" onclick="App.openCarrinhoDoCliente(\'' + c.id + '\')">🛒 aberto</span>' : ''}
      </td>
      <td data-label="Contato">${esc(c.whatsapp || '')}</td>
      <td data-label="Compra">${lastBuy(c) ? `${formatDateBR(lastBuy(c))} <small class="muted">(${ds} dias)</small>` : '-'}</td>
      <td data-label="Status">${pill(ds <= 30 ? 'Quente' : ds <= 60 ? 'Morno' : 'Frio', ds <= 30 ? 'green' : ds <= 60 ? 'blue' : 'red')}</td>
      <td data-label="Ações" style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn small" onclick="App.openCliente360('${c.id}')">Ver</button>
        <button class="btn small" onclick="App.openClienteForm('${c.id}')">Editar</button>
        ${whatsAppBtn(c.whatsapp, 'contatoFrio', { nome: c.nome, telefone: c.whatsapp })}
        <button class="btn small" style="color:var(--error)" onclick="App.excluirCliente('${c.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
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
  const c = id ? cliById(id) : (prefill ? { nome: prefill.nome, whatsapp: prefill.whatsapp, nascimento: prefill.nascimento, origem: prefill.origem } : {});
  showModal(`<h3>${id ? 'Editar' : 'Novo'} Cliente</h3>
    ${leadPrefill ? '<p class="muted">Pré-preenchido a partir de uma lista de desejos de evento.</p>' : ''}
    <div class="grid">
      <div class="field"><label>Nome</label><input id="cNome" value="${esc(c.nome || '')}"></div>
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
      <div class="field full"><label>Observações</label><textarea id="cObs">${esc(c.observacoes || '')}</textarea></div>
    </div><br>
    <button class="btn dark" onclick="App.saveCliente('${id}')">Salvar</button>
    <button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
}

export async function saveCliente(id = '') {
  if (!id && planoInfo().atingiuLimite) {
    closeModal();
    return toast('Limite de clientes do plano atingido');
  }
  const d = {
    nome: $('cNome').value, whatsapp: $('cWhats').value, email: $('cEmail').value,
    nascimento: $('cNasc').value, cidade: $('cCidade').value, endereco: $('cEndereco').value,
    genero: $('cGenero').value, origem: $('cOrigem').value,
    ultimoContato: $('cUlt').value, preferenciaContato: $('cPrefContato').value,
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
        ${c.endereco ? `<p class="muted" style="margin:2px 0">${esc(c.endereco)}</p>` : ''}
        ${c.nascimento ? `<p class="muted" style="margin:2px 0">🎂 ${formatDateBR(c.nascimento)} ${diasAniv <= 30 ? '• ' + (diasAniv === 0 ? 'Hoje!' : 'Faltam ' + diasAniv + ' dias') : ''}</p>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${c.whatsapp ? `<button class="btn small green-btn" onclick="App.sendWhatsApp('contatoFrio',${onclickArg({ nome: c.nome, telefone: c.whatsapp })})">💬 WhatsApp</button>` : ''}
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
      ${vendas.length ? `<div class="table"><table><thead><tr><th>Data</th><th>Valor</th><th>Lucro</th><th>Pgto</th></tr></thead>
        <tbody>${vendas.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 10).map(v => `<tr>
          <td data-label="Data">${formatDateBR(v.data)}</td>
          <td data-label="Valor">${money(v.receita || v.totalPedido)}</td>
          <td data-label="Lucro">${money(v.lucroTotal)}</td>
          <td data-label="Pgto">${esc(v.pagamento || '-')}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma venda registrada.</p>'}
    </div>

    <div class="panel" style="margin-top:12px">
      <h3>Agendamentos</h3>
      ${agendamentos.length ? `<div class="table"><table><thead><tr><th>Data</th><th>Tipo</th><th>Status</th></tr></thead>
        <tbody>${agendamentos.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 10).map(a => `<tr>
          <td data-label="Data">${formatDateBR(a.data)} ${a.hora || ''}</td>
          <td data-label="Tipo">${esc(a.tipo)}</td>
          <td data-label="Status">${pill(a.status || 'agendado', 'blue')}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum agendamento.</p>'}
    </div>

    ${c.observacoes ? `<div class="panel" style="margin-top:12px"><h3>Observações</h3><p>${esc(c.observacoes)}</p></div>` : ''}

    <br><button class="btn ghost" onclick="App.closeModal()">Fechar</button>
  </div>`);
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
