import { state, col, ref, showModal, closeModal, toast, setDoc, addDoc, deleteDoc, serverTimestamp, cliById, nomeAtualDoCliente, nomeChamado, agendaAgg } from './state.js';
import { $, esc, today, pill, formatDateBR, toggleHtml, porNome } from './utils.js';
import { whatsAppBtn } from './whatsapp.js';
import { sincronizarAgendamento, removerEventoGoogle, googleAgendaConectada, listarEventosGoogle } from './googleAgenda.js';
import { ordemVisualAcoes } from './vendas.js';

// Salva no Firestore e, se o Google Agenda estiver conectado, espelha lá também — sem travar o
// fluxo caso a sincronização falhe (token expirado etc.), só avisa.
async function sincronizarSeAtivo(id, dadosAgendamento) {
  if (!googleAgendaConectada()) return;
  const googleEventId = await sincronizarAgendamento(dadosAgendamento);
  if (googleEventId) await setDoc(ref('agendamentos', id), { googleEventId }, { merge: true });
}

// Completa o outro lado da sincronização: puxa os eventos do Google Agenda (criados/editados
// direto no celular) e cria/atualiza os agendamentos correspondentes aqui no CRM. Eventos sem
// cliente vinculado (criados fora do fluxo do CRM) ficam com o nome do evento como referência —
// dá pra editar depois e associar a um cliente cadastrado.
export async function importarDoGoogleAgenda() {
  if (!googleAgendaConectada()) return toast('Conecte o Google Agenda em Minha Conta primeiro.');
  const eventos = await listarEventosGoogle();
  let criados = 0, atualizados = 0;
  for (const ev of eventos) {
    if (!ev.id) continue;
    const dataISO = ev.start?.date || ev.start?.dateTime?.slice(0, 10);
    if (!dataISO) continue;
    const hora = ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : '';
    const horaFim = ev.end?.dateTime ? ev.end.dateTime.slice(11, 16) : '';
    const titulo = ev.summary || 'Evento do Google Agenda';
    const [tipoParte, clienteParte] = titulo.includes(' — ') ? titulo.split(' — ') : ['Atendimento', titulo];
    const existente = state.data.agendamentos.find(a => a.googleEventId === ev.id);

    if (existente) {
      const mudou = existente.data !== dataISO || existente.hora !== hora || (existente.horaFim || '') !== horaFim || (existente.observacoes || '') !== (ev.description || '') || (existente.local || '') !== (ev.location || '');
      if (mudou) {
        await setDoc(ref('agendamentos', existente.id), {
          data: dataISO, hora, horaFim, observacoes: ev.description || existente.observacoes || '',
          local: ev.location || existente.local || '', atualizadoEm: serverTimestamp()
        }, { merge: true });
        atualizados++;
      }
    } else {
      await addDoc(col('agendamentos'), {
        clienteId: '', clienteNome: clienteParte || titulo,
        tipo: TIPOS.includes(tipoParte) ? tipoParte : 'Atendimento',
        data: dataISO, hora, horaFim, local: ev.location || '', observacoes: ev.description || '', status: 'agendado',
        googleEventId: ev.id, origemGoogle: true, criadoEm: serverTimestamp()
      });
      criados++;
    }
  }
  window.App.refresh(`Google Agenda: ${criados} novo(s), ${atualizados} atualizado(s)`);
}

const TIPOS = [
  'Atendimento', 'Entrega', 'Follow-up', 'Cobrança', 'Demonstração',
  'Reunião de oportunidade', 'Aniversário', 'Recompra', 'Retirada de pedido', 'Outro'
];

// Abre o Google Maps sem API paga: texto vira busca (maps/search) e um link colado abre direto.
// O link colado cobre o caso de cidade pequena em que o endereço não bate com o ponto real —
// a consultora acha o lugar certo no app do Maps, compartilha e cola o link no agendamento.
function mapsUrl(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v);
}

export function abrirMapaDoCampo(inputId) {
  const url = mapsUrl($(inputId)?.value);
  if (!url) return toast('Digite um endereço ou cole um link do Maps primeiro');
  window.open(url, '_blank');
}

export function abrirMapaAgendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  const url = mapsUrl(a?.local);
  if (url) window.open(url, '_blank');
}

// Ao trocar o cliente no formulário, sugere o endereço do cadastro — mas nunca por cima do que
// a consultora já digitou/colou no campo.
export function preencherLocalDoCliente(clienteId) {
  const el = $('aLocal');
  if (!el || el.value.trim()) return;
  el.value = cliById(clienteId)?.endereco || '';
}

// Cliente é opcional: um compromisso pode ser exclusivo da consultora (ex: evento de demonstração
// para várias convidadas, sem cliente específico atrelado). Sem cliente, usa um título livre no
// lugar do nome — é ele que aparece na tabela e no espelho do Google Agenda.
function clienteFieldHtml(clienteIdSelecionado, tituloValor) {
  const cliOpts = [...state.data.clientes].sort(porNome).map(c =>
    `<option value="${c.id}" ${c.id === clienteIdSelecionado ? 'selected' : ''}>${esc(c.nome)}</option>`
  ).join('');
  return `<div class="field full"><label>Cliente (opcional)</label>
      <select id="aCli" onchange="App.preencherLocalDoCliente(this.value);App.toggleAgendamentoTitulo()">
        <option value="">— Sem cliente (compromisso próprio) —</option>
        ${cliOpts}
      </select>
    </div>
    <div class="field full" id="aTituloWrap" style="${clienteIdSelecionado ? 'display:none' : ''}">
      <label>Título do compromisso</label>
      <input id="aTitulo" value="${esc(tituloValor || '')}" placeholder="Ex: Evento de demonstração">
    </div>`;
}

export function toggleAgendamentoTitulo() {
  const temCliente = !!$('aCli')?.value;
  if ($('aTituloWrap')) $('aTituloWrap').style.display = temCliente ? 'none' : '';
}

// Campo de local compartilhado pelos modais de novo/editar agendamento.
function localFieldHtml(valor) {
  return `<div class="field full"><label>Local / endereço (opcional)</label>
    <div style="display:flex;gap:8px">
      <input id="aLocal" value="${esc(valor || '')}" placeholder="Endereço ou link do Google Maps" style="flex:1">
      <button type="button" class="btn small" onclick="App.abrirMapaDoCampo('aLocal')" title="Ver no mapa">📍 Mapa</button>
    </div>
    <small class="muted">Endereço errado no mapa? Ache o ponto certo no app do Maps, compartilhe e cole o link aqui.</small>
  </div>`;
}

export function renderAgenda() {
  const ag = agendaAgg('all');
  const agHoje = state.data.agendamentos.filter(a => a.data === today());

  $('agenda').innerHTML = `
    <div class="cards">
      <div class="card"><span>Hoje</span><b>${agHoje.length}</b></div>
      <div class="card"><span>Pendentes</span><b>${ag.pendentes}</b></div>
      <div class="card"><span>Realizados</span><b>${ag.realizados}</b></div>
      <div class="card"><span>Cancelados</span><b>${ag.cancelados}</b></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Agenda</h3>
        <div style="display:flex;gap:8px">
          ${googleAgendaConectada() ? '<button class="btn small" onclick="App.importarDoGoogleAgenda()">📥 Puxar do Google Agenda</button>' : ''}
          <button class="btn dark" onclick="App.openAgendamentoForm()">+ Novo atendimento</button>
        </div>
      </div>
      ${tableAgenda()}
    </div>`;
}

// Ações de um agendamento — HTML idêntico na tabela (desktop) e no cartão (mobile), mesmo padrão
// de vendaAcoesHtml/clienteAcoesHtml, pra tabela e cartão nunca saírem de sincronia.
function agendamentoAcoesHtml(a, c) {
  return `
    ${(a.status || 'agendado') === 'agendado' ? `
      <button class="btn small" onclick="App.concluirAgendamento('${a.id}')">✓ Concluir</button>
      <button class="btn small" onclick="App.reagendarAgendamento('${a.id}')">↻ Reagendar</button>
      <button class="btn small" onclick="App.cancelarAgendamento('${a.id}')">✗ Cancelar</button>
    ` : ''}
    <button class="btn small" onclick="App.editarAgendamento('${a.id}')" title="Editar">✏️</button>
    <button class="btn small" onclick="App.removerAgendamento('${a.id}')" title="Excluir">🗑️</button>
    ${a.local ? `<button class="btn small" onclick="App.abrirMapaAgendamento('${a.id}')" title="Ver local no mapa">📍</button>` : ''}
    ${whatsAppBtn(c?.whatsapp, 'agenda', { nome: nomeChamado(a.clienteId, a.clienteNome), telefone: c?.whatsapp, hora: a.hora })}`;
}

// Cartão de agendamento no celular (mesma classe .vcard do cartão de Vendas/Clientes) — data/hora
// em destaque no topo, cliente e tipo em linhas, ações em grade.
function agendamentoCardHtml(a, c) {
  return `<div class="vcard">
    <div class="vcard-top">
      <span class="vcard-num">${formatDateBR(a.data)}${a.hora ? ' às ' + esc(a.hora) : ''}</span>
      ${pill(a.status || 'agendado', statusColor(a.status))}
    </div>
    <div class="vcard-cli">
      ${a.clienteId ? `<span class="cli-link" onclick="App.openCliente360('${a.clienteId}')">${esc(nomeAtualDoCliente(a.clienteId, a.clienteNome))}</span>` : esc(a.clienteNome)}
      ${!a.clienteId ? (a.origemGoogle ? pill('via Google', 'blue') : pill('compromisso', 'gray')) : ''}
    </div>
    <div class="vcard-rows">
      <div class="vcard-row"><span>Tipo</span><b>${esc(a.tipo)}</b></div>
    </div>
    <div class="vcard-actions">${agendamentoAcoesHtml(a, c)}</div>
  </div>`;
}

function tableAgenda() {
  const l = state.data.agendamentos.sort((a, b) => {
    const da = String(a.data + (a.hora || '')), db = String(b.data + (b.hora || ''));
    return db.localeCompare(da);
  });
  if (!l.length) return '<p class="muted">Nenhum agendamento.</p>';

  const tabela = `<div class="table only-desktop"><table><thead><tr>
    <th>Data</th><th>Hora</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Ações</th>
  </tr></thead><tbody>${l.map(a => {
    const c = state.data.clientes.find(c => c.id === a.clienteId);
    return `<tr>
      <td>${formatDateBR(a.data)}</td>
      <td>${esc(a.hora || '-')}</td>
      <td>
        ${a.clienteId ? `<b class="cli-link" onclick="App.openCliente360('${a.clienteId}')">${esc(nomeAtualDoCliente(a.clienteId, a.clienteNome))}</b>` : `<b>${esc(a.clienteNome)}</b> ${a.origemGoogle ? pill('via Google', 'blue') : pill('compromisso', 'gray')}`}
      </td>
      <td>${esc(a.tipo)}</td>
      <td>${pill(a.status || 'agendado', statusColor(a.status))}</td>
      <td class="acoes-tabela">${ordemVisualAcoes(agendamentoAcoesHtml(a, c))}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;

  const cartoes = `<div class="only-mobile vcards">${l.map(a => agendamentoCardHtml(a, state.data.clientes.find(c => c.id === a.clienteId))).join('')}</div>`;

  return tabela + cartoes;
}

function statusColor(s) {
  switch (s) {
    case 'realizado': return 'green';
    case 'cancelado': return 'red';
    case 'reagendado': return 'orange';
    default: return 'blue';
  }
}

export function openAgendamentoForm(clienteId = '') {
  const tipoOpts = TIPOS.map(t => `<option>${t}</option>`).join('');
  const cliInicial = clienteId ? cliById(clienteId) : null;

  showModal(`<h3>Novo Agendamento</h3>
    <div class="grid">
      ${clienteFieldHtml(clienteId, '')}
      <div class="field"><label>Tipo</label><select id="aTipo">${tipoOpts}</select></div>
      <div class="field"><label>Data</label><input type="date" id="aData" value="${today()}"></div>
      <div class="field"><label>Hora</label><input type="time" id="aHora"></div>
      <div class="field"><label>Hora final (opcional)</label><input type="time" id="aHoraFim"></div>
      ${localFieldHtml(cliInicial?.endereco)}
      <div class="field full"><label>Observações</label><textarea id="aObs"></textarea></div>
    </div><br>
    <button class="btn dark" onclick="App.saveAgendamento()">Confirmar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function saveAgendamento() {
  const clienteId = $('aCli').value;
  const c = clienteId ? cliById(clienteId) : null;
  const titulo = ($('aTitulo')?.value || '').trim();
  if (!clienteId && !titulo) return toast('Escolha um cliente ou informe um título para o compromisso');
  const dados = {
    clienteId: clienteId || '', clienteNome: c ? c.nome : titulo,
    tipo: $('aTipo').value, data: $('aData').value, hora: $('aHora').value, horaFim: $('aHoraFim')?.value || '',
    local: $('aLocal').value.trim(),
    observacoes: $('aObs').value, status: 'agendado', criadoEm: serverTimestamp()
  };
  const r = await addDoc(col('agendamentos'), dados);
  await sincronizarSeAtivo(r.id, dados);
  closeModal();
  window.App.refresh('Agendamento criado');
}

export function editarAgendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  if (!a) return;
  const tipoOpts = TIPOS.map(t => `<option ${t === a.tipo ? 'selected' : ''}>${t}</option>`).join('');

  showModal(`<h3>Editar Agendamento</h3>
    <div class="grid">
      ${clienteFieldHtml(a.clienteId, a.clienteId ? '' : a.clienteNome)}
      <div class="field"><label>Tipo</label><select id="aTipo">${tipoOpts}</select></div>
      <div class="field"><label>Data</label><input type="date" id="aData" value="${a.data}"></div>
      <div class="field"><label>Hora</label><input type="time" id="aHora" value="${a.hora || ''}"></div>
      <div class="field"><label>Hora final (opcional)</label><input type="time" id="aHoraFim" value="${a.horaFim || ''}"></div>
      ${localFieldHtml(a.local)}
      <div class="field full"><label>Observações</label><textarea id="aObs">${esc(a.observacoes || '')}</textarea></div>
    </div><br>
    <button class="btn dark" onclick="App.updateAgendamento('${id}')">Salvar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function updateAgendamento(id) {
  const clienteId = $('aCli').value;
  const c = clienteId ? cliById(clienteId) : null;
  const titulo = ($('aTitulo')?.value || '').trim();
  if (!clienteId && !titulo) return toast('Escolha um cliente ou informe um título para o compromisso');
  const a = state.data.agendamentos.find(x => x.id === id);
  const dados = {
    clienteId: clienteId || '', clienteNome: c ? c.nome : titulo,
    tipo: $('aTipo').value, data: $('aData').value, hora: $('aHora').value, horaFim: $('aHoraFim')?.value || '',
    local: $('aLocal').value.trim(),
    observacoes: $('aObs').value, atualizadoEm: serverTimestamp()
  };
  await setDoc(ref('agendamentos', id), dados, { merge: true });
  await sincronizarSeAtivo(id, { ...a, ...dados, googleEventId: a?.googleEventId });
  closeModal();
  window.App.refresh('Agendamento atualizado');
}

export function concluirAgendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  if (!a) return;
  showModal(`<h3>Concluir Agendamento</h3>
    <p><b>${esc(nomeAtualDoCliente(a.clienteId, a.clienteNome))}</b> — ${esc(a.tipo)} em ${formatDateBR(a.data)}</p>
    <div class="grid">
      <div class="field full"><label>Resumo do atendimento</label><textarea id="aResumo"></textarea></div>
      ${a.clienteId ? `<div class="field">${toggleHtml('aGerouVenda', false, '', 'Gerou venda?')}</div>` : ''}
      <div class="field"><label>Próximo contato (opcional)</label><input type="date" id="aProximo"></div>
    </div><br>
    <button class="btn dark" onclick="App.confirmarConclusao('${id}')">Confirmar conclusão</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarConclusao(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  const gerouVenda = !!$('aGerouVenda')?.checked;
  await setDoc(ref('agendamentos', id), {
    status: 'realizado', resumo: $('aResumo').value,
    gerouVenda,
    concluidoEm: serverTimestamp()
  }, { merge: true });

  if ($('aProximo').value && a) {
    await addDoc(col('agendamentos'), {
      clienteId: a.clienteId, clienteNome: a.clienteNome,
      tipo: 'Follow-up', data: $('aProximo').value, hora: '',
      observacoes: `Follow-up de ${a.tipo} em ${a.data}`,
      status: 'agendado', criadoEm: serverTimestamp()
    });
  }

  closeModal();
  if (gerouVenda && a?.clienteId) {
    window.App.openCarrinhoForCliente(a.clienteId);
  }
  window.App.refresh('Agendamento concluído');
}

export async function cancelarAgendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  await setDoc(ref('agendamentos', id), { status: 'cancelado', atualizadoEm: serverTimestamp() }, { merge: true });
  if (a) await removerEventoGoogle(a);
  window.App.refresh('Agendamento cancelado');
}

export function reagendarAgendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  if (!a) return;
  showModal(`<h3>Reagendar</h3>
    <p><b>${esc(nomeAtualDoCliente(a.clienteId, a.clienteNome))}</b> — ${esc(a.tipo)}</p>
    <div class="grid">
      <div class="field"><label>Nova data</label><input type="date" id="aNovaData" value="${today()}"></div>
      <div class="field"><label>Nova hora</label><input type="time" id="aNovaHora" value="${a.hora || ''}"></div>
      <div class="field"><label>Nova hora final (opcional)</label><input type="time" id="aNovaHoraFim" value="${a.horaFim || ''}"></div>
    </div><br>
    <button class="btn dark" onclick="App.confirmarReagendamento('${id}')">Confirmar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarReagendamento(id) {
  const a = state.data.agendamentos.find(x => x.id === id);
  await setDoc(ref('agendamentos', id), {
    status: 'reagendado', atualizadoEm: serverTimestamp()
  }, { merge: true });
  if (a) {
    await removerEventoGoogle(a);
    const dados = {
      clienteId: a.clienteId, clienteNome: a.clienteNome,
      tipo: a.tipo, data: $('aNovaData').value, hora: $('aNovaHora').value, horaFim: $('aNovaHoraFim')?.value || '',
      local: a.local || '', observacoes: a.observacoes || '', status: 'agendado',
      reagendadoDe: id, criadoEm: serverTimestamp()
    };
    const r = await addDoc(col('agendamentos'), dados);
    await sincronizarSeAtivo(r.id, dados);
  }
  closeModal();
  window.App.refresh('Agendamento reagendado');
}

export async function removerAgendamento(id) {
  if (!confirm('Remover este agendamento?')) return;
  const a = state.data.agendamentos.find(x => x.id === id);
  await deleteDoc(ref('agendamentos', id));
  if (a) await removerEventoGoogle(a);
  window.App.refresh('Agendamento removido');
}
