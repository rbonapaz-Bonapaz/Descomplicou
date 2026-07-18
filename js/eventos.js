import { state, col, ref, db, doc, getDoc, setDoc, addDoc, deleteDoc, getDocs, collection, serverTimestamp, showModal, closeModal, toast, cliById } from './state.js';
import { $, esc, money, norm, pill, labelLinha, toggleBareHtml, toggleHtml, linhasDe } from './utils.js';
import { WA_ICON } from './whatsapp.js';

let listasCache = {}; // eventoId -> array de listas de desejo (carregadas sob demanda)

// --- Alerta de novos leads (dashboard) ---
// null = ainda não verificado nesta sessão; array = resultado da última verificação (pode ser
// vazio). Verificação é sob demanda (chamada pelo dashboard), não em todo refresh — evita ficar
// lendo a subcoleção de leads de cada evento o tempo todo.
let novosLeadsCache = null;

export function novosLeadsResumo() {
  return novosLeadsCache;
}

// Compara o total de leads de cada evento ativo com o que a consultora já viu (ev.leadsVisto,
// salvo no próprio doc do evento) — o dashboard chama isso uma vez por sessão e se atualiza
// sozinho quando o resultado chega, sem precisar recarregar todos os dados do app.
export async function verificarNovosLeads() {
  await desativarEventosExpirados();
  const eventosAtivos = (state.data.eventos || []).filter(e => e.ativo !== false);
  const resultados = [];
  for (const ev of eventosAtivos) {
    try {
      const snap = await getDocs(collection(db, 'eventosPublicos', ev.id, 'listasDesejo'));
      const total = snap.size;
      const visto = Number(ev.leadsVisto || 0);
      if (total > visto) resultados.push({ eventoId: ev.id, eventoNome: ev.nome, novos: total - visto, total });
    } catch (e) { /* regras públicas podem não estar publicadas ainda — ignora silenciosamente */ }
  }
  novosLeadsCache = resultados;
  window.App.renderLeadsBanner?.();
}

// Marca os leads de um evento como vistos (registra o total atual) — some do alerta até
// aparecerem leads NOVOS de verdade.
export async function marcarLeadsVistos(eventoId) {
  const snap = await getDocs(collection(db, 'eventosPublicos', eventoId, 'listasDesejo'));
  await setDoc(doc(db, 'users', state.user.uid, 'eventos', eventoId), { leadsVisto: snap.size }, { merge: true });
  if (novosLeadsCache) novosLeadsCache = novosLeadsCache.filter(r => r.eventoId !== eventoId);
  window.App.renderLeadsBanner?.();
  window.App.goto('eventos');
  toggleListasEvento(eventoId);
}

// Liga a criação de cliente feita a partir de uma lista de desejo (ver clientes.js) de volta à lista.
window.addEventListener('lead-cliente-criado', e => {
  const l = (listasCache[e.detail.eventoId] || []).find(x => x.id === e.detail.listaId);
  if (l) l._clienteId = e.detail.clienteId;
  renderListasInline(e.detail.eventoId);
});

function formatDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).split('-');
  return `${dd}/${m}/${y}`;
}

function formatDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Texto de vigência do link exibido no card. Prioriza início/fim (data+hora); cai para o
// campo antigo "validade" (só data) de eventos criados antes desse recurso existir.
function vigenciaLabel(ev) {
  if (ev.vigenciaInicio || ev.vigenciaFim) {
    const partes = [];
    if (ev.vigenciaInicio) partes.push('a partir de ' + formatDateTime(ev.vigenciaInicio));
    if (ev.vigenciaFim) partes.push('até ' + formatDateTime(ev.vigenciaFim));
    return ' • Link válido ' + partes.join(' ');
  }
  if (ev.validade) return ' • Link válido até ' + formatDate(ev.validade);
  return '';
}

function linkPublico(id) {
  return location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') + '/evento.html?id=' + id;
}

// Status real do link, calculado pela data (não apenas o toggle manual "ativo"): aguardando
// (ainda não chegou o início da vigência), expirado (a vigência já passou) ou ativo (dentro
// da janela, ou sem vigência definida — sempre válido nesse caso).
function statusVigencia(ev) {
  const agora = new Date();
  const inicio = ev.vigenciaInicio ? new Date(ev.vigenciaInicio) : null;
  const fim = ev.vigenciaFim ? new Date(ev.vigenciaFim) : null;
  if (inicio && !isNaN(inicio) && agora < inicio) return { label: 'Aguardando início', cor: 'orange' };
  if (fim && !isNaN(fim) && agora > fim) return { label: 'Expirado', cor: 'red' };
  return { label: 'Ativo', cor: 'green' };
}

// Auto-desativação: o link público já bloqueia sozinho o acesso depois de vigenciaFim (ver
// evento-publico.js), mas o campo `ativo` no Firestore continuava true pra sempre — o que deixava
// esse evento contando como "ativo" em qualquer lugar que confie nesse campo (ex: verificarNovosLeads
// só varre eventos ativos). Aqui a gente torna esse estado verdadeiro: assim que a vigência
// expira, grava ativo:false de vez (uma vez por sessão por evento, pra não ficar regravando).
const eventosJaChecados = new Set();
export async function desativarEventosExpirados() {
  const agora = new Date();
  const expirados = (state.data.eventos || []).filter(ev => {
    if (ev.ativo === false || !ev.vigenciaFim || eventosJaChecados.has(ev.id)) return false;
    const fim = new Date(ev.vigenciaFim);
    return !isNaN(fim) && agora > fim;
  });
  for (const ev of expirados) {
    eventosJaChecados.add(ev.id);
    try {
      await setDoc(ref('eventos', ev.id), { ativo: false }, { merge: true });
      await setDoc(doc(db, 'eventosPublicos', ev.id), { ativo: false }, { merge: true });
      ev.ativo = false;
    } catch (e) {
      eventosJaChecados.delete(ev.id); // falhou — tenta de novo no próximo render
    }
  }
}

export function renderEventos() {
  desativarEventosExpirados();
  const eventos = [...state.data.eventos].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
  $('eventos').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Catálogo de Eventos</h3>
        <button class="btn dark" onclick="App.openNovoEvento()">+ Novo evento</button>
      </div>
      <p class="muted">Crie um link público para divulgar produtos com desconto. Visitantes montam uma lista de desejos e se identificam — você recebe leads prontos para virar cliente.</p>
    </div>
    ${eventos.length ? eventos.map(eventoCard).join('') : '<div class="panel"><p class="muted">Nenhum evento criado ainda.</p></div>'}`;
}

function eventoCard(ev) {
  const status = ev.ativo === false ? { label: 'Inativo', cor: 'gray' } : statusVigencia(ev);
  return `<div class="panel">
    <div class="panel-head">
      <h3>${esc(ev.nome)}</h3>
      ${pill(status.label, status.cor)}
    </div>
    <p class="muted">${ev.data ? 'Evento em ' + formatDate(ev.data) : ''}${vigenciaLabel(ev)} • ${(ev.produtos || []).length} produtos</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small" onclick="App.copiarLinkEvento('${ev.id}')">🔗 Copiar link</button>
      <button class="btn small green-btn" onclick="App.enviarWhatsappEvento('${ev.id}')">${WA_ICON} WhatsApp</button>
      <button class="btn small" onclick="App.gerarQrCodeEvento('${ev.id}')">📱 QR Code</button>
      <button class="btn small" onclick="App.abrirEditarEvento('${ev.id}')">✏️ Editar</button>
      <button class="btn small" onclick="App.atualizarPrecosEvento('${ev.id}')" title="Puxa preço, imagem, benefícios e estoque atuais do catálogo pra dentro do link">🔄 Atualizar preços</button>
      <button class="btn small dark" onclick="App.toggleListasEvento('${ev.id}')">💌 Listas de desejo</button>
      <button class="btn small" style="color:var(--error)" onclick="App.excluirEvento('${ev.id}')">🗑️ Excluir</button>
    </div>
    <div id="listas-${ev.id}"></div>
  </div>`;
}

// --- Criar / editar evento (formulário compartilhado) ---
function linhasDisponiveis() {
  return [...new Set(state.data.produtos
    .filter(p => p.ativoCatalogo !== false)
    .flatMap(p => linhasDe(p)))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function formHtmlEvento(ev) {
  const linhas = linhasDisponiveis();
  const descontosAtuais = ev?.descontosPorLinha || {};
  const linhasNoEvento = new Set((ev?.produtos || []).flatMap(p => linhasDe(p)));
  return `
    <div class="grid">
      <div class="field full"><label>Nome do evento</label><input id="evNome" value="${esc(ev?.nome || '')}" placeholder="Ex: Semana da Beleza"></div>
      <div class="field"><label>Data do evento</label><input type="date" id="evData" value="${esc(ev?.data || '')}"></div>
      <div class="field"><label>Início da vigência do link (opcional)</label><input type="datetime-local" id="evVigenciaInicio" value="${esc(ev?.vigenciaInicio || '')}"></div>
      <div class="field"><label>Fim da vigência do link (opcional)</label><input type="datetime-local" id="evVigenciaFim" value="${esc(ev?.vigenciaFim || '')}"></div>
      ${ev ? `<div class="field full"><label>Link do evento</label><input value="${esc(linkPublico(ev.id))}" readonly></div>`
        : `<div class="field full"><label>Link personalizado (opcional)</label><input id="evSlug" placeholder="Ex: demo-fabi (deixe em branco pra gerar automático)">
          <small class="muted">Vira parte do endereço do link — só depois de criado não dá mais pra mudar (evita quebrar um link já compartilhado).</small></div>`}
      <div class="field full"><label>Mensagem padrão para WhatsApp (opcional)</label>
        <textarea id="evMensagemWhats" placeholder="Ex: Oi! Preparei um catálogo especial pra você 💕 Dá uma olhada nos produtos e me manda sua lista de desejos:">${esc(ev?.mensagemWhatsapp || '')}</textarea>
      </div>
    </div>
    <div class="grid" style="margin-top:8px">
      <div class="field">${toggleHtml('evTodoCatalogo', !!ev?.todoCatalogo, 'App.aoMudarTodoCatalogo(this.checked)', 'Mostrar todo o catálogo')}</div>
      <div class="field">${toggleHtml('evMostrarPrecos', ev ? ev.mostrarPrecos !== false : true, '', 'Mostrar preços')}</div>
      <div class="field">${toggleHtml('evMostrarBeneficios', ev ? ev.mostrarBeneficios !== false : true, '', 'Mostrar benefícios')}</div>
      <div class="field">${toggleHtml('evMostrarEstoque', ev ? ev.mostrarEstoque !== false : true, '', 'Mostrar estoque')}</div>
      <div class="field"><label>% em Todos itens</label><input id="evDescontoTodos" placeholder="Ex: 10" onchange="App.aplicarDescontoTodos()"></div>
    </div>
    <small class="muted">Sem marcar "todo o catálogo": só os produtos das linhas participantes aparecem no link. Marcando: todo o catálogo aparece, mas o desconto só vale pras linhas participantes escolhidas abaixo — as demais aparecem pelo preço normal. Preencher "% em Todos itens" aplica esse desconto em todas as linhas de uma vez — depois ainda dá pra ajustar uma linha específica na mão, o valor digitado nela é o que vale. Vazio = sem desconto.</small>
    <h4 style="margin:16px 0 8px">Linhas participantes e desconto</h4>
    <p class="muted">Marque as linhas que entram no evento e o desconto (%) sobre o preço de venda atual.</p>
    <div class="table"><table><thead><tr><th>Participa</th><th>Linha</th><th>Desconto %</th></tr></thead><tbody>
      ${linhas.length ? linhas.map(l => {
        const marcado = ev ? linhasNoEvento.has(l) : true;
        return `<tr>
          <td>${toggleBareHtml('', marcado, '', `class="evLinhaChk" value="${esc(l)}"`)}</td>
          <td>${esc(labelLinha(l))}</td>
          <td><input class="evLinhaDesc" data-linha="${esc(l)}" value="${esc(descontosAtuais[l] ?? 0)}" style="width:80px"></td>
        </tr>`;
      }).join('') : '<tr><td colspan="3"><p class="muted">Nenhuma linha ativa no catálogo.</p></td></tr>'}
    </tbody></table></div><br>`;
}

// "Mostrar todo o catálogo" liga/desliga TODAS as linhas participantes junto — simétrico: ligar
// marca tudo, desligar desmarca tudo. A consultora ainda pode ajustar linha por linha depois.
export function aoMudarTodoCatalogo(ligado) {
  document.querySelectorAll('.evLinhaChk').forEach(c => { c.checked = ligado; });
}

// Preenche o desconto de TODAS as linhas de uma vez com o valor digitado em "% em Todos itens" —
// é um "aplicar e preencher" pontual, não uma fórmula viva: depois de aplicado, editar uma linha
// específica na mão sobrescreve só aquela linha, sem voltar a ser recalculada.
export function aplicarDescontoTodos() {
  const valor = ($('evDescontoTodos')?.value || '').trim();
  document.querySelectorAll('.evLinhaDesc').forEach(inp => { inp.value = valor || '0'; });
}

// Lê o formulário (criação ou edição) e monta os dados do evento. Retorna null (e avisa) se inválido.
function coletarDadosFormEvento() {
  const nome = $('evNome').value.trim();
  if (!nome) { toast('Informe o nome do evento'); return null; }

  const linhasSelecionadas = Array.from(document.querySelectorAll('.evLinhaChk:checked')).map(c => c.value);
  if (!linhasSelecionadas.length) { toast('Selecione ao menos uma linha'); return null; }

  const descontos = {};
  document.querySelectorAll('.evLinhaDesc').forEach(inp => {
    descontos[inp.dataset.linha] = Number(String(inp.value).replace(',', '.')) || 0;
  });

  // Com "todo o catálogo" marcado, o link mostra QUALQUER produto ativo — não só os das linhas
  // participantes; o desconto continua restrito às linhas escolhidas (as demais aparecem pelo
  // preço normal, descontoMax vira 0 pra elas).
  const todoCatalogo = !!$('evTodoCatalogo')?.checked;
  const produtos = state.data.produtos.filter(p => {
    if (p.ativoCatalogo === false) return false;
    if (todoCatalogo) return true;
    const linhasProd = linhasDe(p);
    return linhasProd.some(l => linhasSelecionadas.includes(l));
  }).map(p => {
    const linhasProd = linhasDe(p);
    const descontoMax = Math.max(0, ...linhasProd.filter(l => linhasSelecionadas.includes(l)).map(l => descontos[l] || 0));
    const precoOriginal = Number(p.precoVenda || p.precoAtual || p.precoOriginal || 0);
    const precoComDesconto = descontoMax > 0 ? Math.round(precoOriginal * (1 - descontoMax / 100) * 100) / 100 : precoOriginal;
    return {
      id: p.id, codigoFarmasi: p.codigoFarmasi || '', nome: p.nome, linha: linhasProd.join(', ') || 'Sem linha',
      imagem: p.imagem || '', beneficios: p.beneficios || '',
      precoOriginal, precoComDesconto,
      // Quantidade em pronta entrega no momento da publicação — snapshot, não atualiza sozinho
      // depois (mesmo padrão dos preços: o link congela o estado do catálogo na hora de criar/editar).
      prontaEntrega: Number(p.estoqueAtual || 0)
    };
  });

  if (!produtos.length) { toast(todoCatalogo ? 'Nenhum produto ativo no catálogo' : 'Nenhum produto ativo no catálogo para essas linhas'); return null; }

  // Snapshot do perfil público — a página do evento não tem login, então precisa desses
  // dados salvos junto (nome, Instagram, site) para montar um cabeçalho/rodapé decentes.
  const p = state.profile || {};
  const perfilPublico = {
    nome: p.nome || '', nomeNegocio: p.nomeNegocio || '', genero: p.genero || '',
    instagram: p.instagram || '', linkLoja: p.linkLoja || '', whatsapp: p.whatsapp || '',
    foto: p.fotoPerfil || state.user?.photoURL || '',
    // Cores personalizadas (item de tema visual) — sem isso, o link público de evento sempre ficava
    // no rosa padrão, ignorando a marca que a consultora configurou em Minha Conta.
    corPrimaria: p.corPrimaria || '', corFundo: p.corFundo || '', corTexto: p.corTexto || ''
  };

  return {
    nome, data: $('evData').value,
    vigenciaInicio: $('evVigenciaInicio').value, vigenciaFim: $('evVigenciaFim').value,
    mensagemWhatsapp: $('evMensagemWhats').value.trim(),
    mostrarPrecos: !!$('evMostrarPrecos')?.checked, mostrarBeneficios: !!$('evMostrarBeneficios')?.checked, mostrarEstoque: !!$('evMostrarEstoque')?.checked,
    descontosPorLinha: descontos, todoCatalogo, produtos, perfilPublico
  };
}

// Mesmo princípio de sincronizarProdutoNosEventos, mas pro RETRATO do perfil (nome, foto, cores
// personalizadas etc.) — ele também é congelado no evento na hora de criar/editar. Sem isso, mudar
// a cor de tema ou restaurar o padrão em Minha Conta nunca aparecia nos links já publicados, só na
// próxima vez que a consultora reabrisse e salvasse o evento manualmente. Chamada depois de savePerfil
// e restaurarTemaPadrao (perfil.js) — silenciosa, não bloqueia o salvamento do perfil se falhar.
export async function sincronizarPerfilNosEventos() {
  const eventosAtivos = (state.data.eventos || []).filter(e => e.ativo !== false);
  if (!eventosAtivos.length) return;
  const p = state.profile || {};
  const perfilPublico = {
    nome: p.nome || '', nomeNegocio: p.nomeNegocio || '', genero: p.genero || '',
    instagram: p.instagram || '', linkLoja: p.linkLoja || '', whatsapp: p.whatsapp || '',
    foto: p.fotoPerfil || state.user?.photoURL || '',
    corPrimaria: p.corPrimaria || '', corFundo: p.corFundo || '', corTexto: p.corTexto || ''
  };
  for (const ev of eventosAtivos) {
    try {
      await setDoc(ref('eventos', ev.id), { perfilPublico }, { merge: true });
      await setDoc(doc(db, 'eventosPublicos', ev.id), { perfilPublico }, { merge: true });
      ev.perfilPublico = perfilPublico;
    } catch (e) {
      console.error('Falha ao replicar perfil no evento', ev.id, e);
    }
  }
}

// O link de evento congela nome/preço/desconto/estoque/imagem dos produtos no momento de
// criar/editar (senão a página pública precisaria ler o catálogo privado da consultora, o que as
// regras do Firestore não permitem). Isso significa que uma alteração de preço/estoque/imagem no
// produto não aparece sozinha no link — chamada depois de salvar um produto (saveProduto,
// upsertProduto), atualiza esse instantâneo em qualquer evento ativo que já tenha esse produto,
// sem precisar reabrir/reeditar o evento inteiro. Só atualiza item já presente no evento (não
// adiciona nem remove produto da lista — isso continua exigindo editar o evento manualmente).
export async function sincronizarProdutoNosEventos(p) {
  // Eventos criados antes do id ser gravado no snapshot não têm x.id — nesses,
  // casa por código Farmasi ou nome pra não deixar evento antigo com preço velho.
  const mesmoProduto = x => x.id
    ? x.id === p.id
    : (x.codigoFarmasi && x.codigoFarmasi === (p.codigoFarmasi || '')) || norm(x.nome) === norm(p.nome);
  const eventosAfetados = (state.data.eventos || []).filter(ev => (ev.produtos || []).some(mesmoProduto));
  if (!eventosAfetados.length) return;
  const linhasProd = linhasDe(p);
  const precoOriginal = Number(p.precoVenda || p.precoAtual || p.precoOriginal || 0);
  for (const ev of eventosAfetados) {
    const descontos = ev.descontosPorLinha || {};
    const descontoMax = Math.max(0, ...linhasProd.filter(l => descontos[l] != null).map(l => descontos[l] || 0));
    const precoComDesconto = descontoMax > 0 ? Math.round(precoOriginal * (1 - descontoMax / 100) * 100) / 100 : precoOriginal;
    const produtosAtualizados = ev.produtos.map(x => mesmoProduto(x) ? {
      ...x, id: p.id, nome: p.nome, codigoFarmasi: p.codigoFarmasi || '', linha: linhasProd.join(', ') || 'Sem linha',
      imagem: p.imagem || '', beneficios: p.beneficios || '',
      precoOriginal, precoComDesconto, prontaEntrega: Number(p.estoqueAtual || 0)
    } : x);
    try {
      await setDoc(ref('eventos', ev.id), { produtos: produtosAtualizados }, { merge: true });
      await setDoc(doc(db, 'eventosPublicos', ev.id), { produtos: produtosAtualizados }, { merge: true });
      ev.produtos = produtosAtualizados;
    } catch (e) {
      // Não trava o salvamento do produto, mas a consultora precisa saber que o link ficou defasado.
      console.error('Falha ao replicar produto no evento', ev.id, e);
      toast(`Produto salvo, mas não consegui atualizar o evento "${ev.nome}": ${e.message}`);
    }
  }
}

// Re-sincroniza TODOS os produtos do evento com o catálogo atual (preço, imagem, benefícios,
// pronta entrega), recalculando os descontos por linha do próprio evento. Plano B determinístico
// pra quando alguma alteração de produto não replicou sozinha (ou pra eventos antigos).
export async function atualizarPrecosEvento(id) {
  const ev = state.data.eventos.find(e => e.id === id);
  if (!ev) return;
  const descontos = ev.descontosPorLinha || {};
  const achar = x => state.data.produtos.find(p =>
    (x.id && p.id === x.id) ||
    (x.codigoFarmasi && String(p.codigoFarmasi).trim() === String(x.codigoFarmasi).trim()) ||
    norm(p.nome) === norm(x.nome));
  let atualizados = 0, semCadastro = 0;
  const produtosAtualizados = (ev.produtos || []).map(x => {
    const p = achar(x);
    if (!p) { semCadastro++; return x; }
    const linhasProd = linhasDe(p);
    const precoOriginal = Number(p.precoVenda || p.precoAtual || p.precoOriginal || 0);
    const descontoMax = Math.max(0, ...linhasProd.filter(l => descontos[l] != null).map(l => descontos[l] || 0));
    const precoComDesconto = descontoMax > 0 ? Math.round(precoOriginal * (1 - descontoMax / 100) * 100) / 100 : precoOriginal;
    atualizados++;
    return {
      ...x, id: p.id, nome: p.nome, codigoFarmasi: p.codigoFarmasi || '', linha: linhasProd.join(', ') || 'Sem linha',
      imagem: p.imagem || '', beneficios: p.beneficios || '',
      precoOriginal, precoComDesconto, prontaEntrega: Number(p.estoqueAtual || 0)
    };
  });
  try {
    await setDoc(ref('eventos', id), { produtos: produtosAtualizados }, { merge: true });
    await setDoc(doc(db, 'eventosPublicos', id), { produtos: produtosAtualizados }, { merge: true });
    ev.produtos = produtosAtualizados;
    toast(`${atualizados} produto(s) atualizados no link do evento${semCadastro ? ` • ${semCadastro} sem correspondência no catálogo` : ''}`);
  } catch (e) {
    toast('Erro ao atualizar o evento: ' + e.message);
  }
}

// Transforma o texto digitado em "Link personalizado" num slug seguro pra usar como id de
// documento e pedaço de URL — só letras minúsculas, números e hífen.
function sanitizarSlug(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function openNovoEvento() {
  showModal(`<h3>Novo evento</h3>
    ${formHtmlEvento(null)}
    <button class="btn dark" onclick="App.confirmarNovoEvento()">Criar evento</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarNovoEvento() {
  const dados = coletarDadosFormEvento();
  if (!dados) return;

  const slugDigitado = sanitizarSlug($('evSlug')?.value);
  let id = slugDigitado || doc(col('eventos')).id;

  if (slugDigitado) {
    try {
      const jaExiste = await getDoc(doc(db, 'eventosPublicos', slugDigitado));
      if (jaExiste.exists()) return toast('Esse link já está em uso — escolha outro.');
    } catch (e) { /* leitura pública sempre permitida por regra — se falhar, segue e deixa o setDoc decidir */ }
  }

  const payload = { uid: state.user.uid, ativo: true, ...dados, criadoEm: serverTimestamp() };

  try {
    await setDoc(doc(db, 'users', state.user.uid, 'eventos', id), payload, { merge: true });
    await setDoc(doc(db, 'eventosPublicos', id), payload, { merge: true });
    closeModal();
    await window.App.refresh(`Evento criado com ${dados.produtos.length} produto(s)`);
    mostrarLinkEvento(id);
  } catch (e) {
    toast('Erro ao criar evento: verifique se as regras do Firestore foram publicadas.');
  }
}

export function abrirEditarEvento(id) {
  const ev = state.data.eventos.find(e => e.id === id);
  if (!ev) return toast('Evento não encontrado');
  showModal(`<h3>Editar evento</h3>
    ${formHtmlEvento(ev)}
    <button class="btn dark" onclick="App.confirmarEditarEvento('${id}')">Salvar alterações</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarEditarEvento(id) {
  const dados = coletarDadosFormEvento();
  if (!dados) return;

  // Editar SEMPRE reativa o link (ativo:true) — sem isso, um evento auto-desativado por vigência
  // vencida (ver desativarEventosExpirados) continuava desativado mesmo depois de a consultora
  // estender a data pra uma vigência futura, porque o merge:true do Firestore só toca nos campos
  // que o payload manda, e "ativo" nunca entrava aqui (só entrava na criação). A consultora sempre
  // pode desativar de novo manualmente por outro caminho, se quiser.
  const payload = { ...dados, ativo: true, atualizadoEm: serverTimestamp() };
  try {
    await setDoc(ref('eventos', id), payload, { merge: true });
    await setDoc(doc(db, 'eventosPublicos', id), payload, { merge: true });
    eventosJaChecados.delete(id); // reavalia a vigência do zero na próxima checagem
    closeModal();
    window.App.refresh('Evento atualizado');
  } catch (e) {
    toast('Erro ao salvar: verifique se as regras do Firestore foram publicadas.');
  }
}

function mostrarLinkEvento(id) {
  const link = linkPublico(id);
  showModal(`<h3>Evento criado! 🎉</h3>
    <p class="muted">Compartilhe este link com suas clientes e leads:</p>
    <input value="${esc(link)}" readonly onclick="this.select()" style="margin:10px 0"><br>
    <button class="btn dark" onclick="App.copiarLinkEvento('${id}')">🔗 Copiar link</button>
    <button class="btn small green-btn" onclick="App.closeModal();App.enviarWhatsappEvento('${id}')">${WA_ICON} WhatsApp</button>
    <button class="btn ghost" onclick="App.closeModal()">Fechar</button>`);
}

// Mensagem padrão usada quando o evento ainda não tem uma mensagem customizada salva.
function templateWhatsapp(ev) {
  return ev.mensagemWhatsapp?.trim() || `Oi! Preparei um catálogo especial para o evento "${ev.nome}" 💕 Dá uma olhada nos produtos e me manda sua lista de desejos:`;
}

export function enviarWhatsappEvento(id) {
  const ev = state.data.eventos.find(e => e.id === id);
  if (!ev) return toast('Evento não encontrado');
  const texto = `${templateWhatsapp(ev)}\n${linkPublico(id)}`;
  showModal(`<h3>Enviar por WhatsApp</h3>
    <p class="muted">Edite a mensagem se quiser antes de enviar. Ela fica salva como padrão deste evento para as próximas vezes.</p>
    <textarea id="evWhatsMsg" style="min-height:140px">${esc(texto)}</textarea><br><br>
    <button class="btn dark" onclick="App.confirmarEnvioWhatsapp('${id}')">${WA_ICON} Abrir WhatsApp</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function confirmarEnvioWhatsapp(id) {
  const texto = $('evWhatsMsg').value.trim();
  if (!texto) return toast('Escreva uma mensagem');
  const link = linkPublico(id);
  const mensagemBase = texto.replace(link, '').trim();
  try {
    await setDoc(ref('eventos', id), { mensagemWhatsapp: mensagemBase, atualizadoEm: serverTimestamp() }, { merge: true });
  } catch (e) { /* segue o envio mesmo se não conseguir salvar o novo padrão */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  closeModal();
}

export function copiarLinkEvento(id) {
  const link = linkPublico(id);
  if (!navigator.clipboard) return prompt('Copie o link:', link);
  navigator.clipboard.writeText(link).then(() => toast('Link copiado!')).catch(() => prompt('Copie o link:', link));
}

// Gera uma página A4 pronta pra imprimir/exportar como PDF, com o mesmo cabeçalho/rodapé
// do catálogo, o QR Code do link do evento e a mensagem especial (se houver) — pensada pra
// ser exibida num tablet/impressa e deixada no balcão do evento para quem ainda não é contato.
export function gerarQrCodeEvento(id) {
  const ev = state.data.eventos.find(e => e.id === id);
  if (!ev) return toast('Evento não encontrado');
  const p = state.profile || {};
  const link = linkPublico(id);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=1&data=${encodeURIComponent(link)}`;

  const html = `<section class="cat-page d-comfy">
    <header class="cat-header">
      <div class="cat-brand">${esc(ev.nome)}</div>
      <div class="cat-sub">${ev.data ? 'EVENTO EM ' + formatDate(ev.data) : 'CATÁLOGO ESPECIAL'}</div>
      <div class="cat-consult">${esc(p.nomeNegocio || 'CRM de Vendas')}<br>${esc(p.nome || '')}<br>${esc(p.whatsapp || '')}<br>${esc(p.instagram || '')}</div>
    </header>
    <main class="cat-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8mm;top:40mm">
      <h2 class="cat-line-title" style="margin:0">Aponte a câmera e monte sua lista de desejos!</h2>
      <img src="${qrSrc}" style="width:70mm;height:70mm;border:2px solid var(--p);border-radius:12px;padding:4mm;background:#fff">
      ${ev.mensagemWhatsapp ? `<p style="max-width:130mm;font-size:12pt;color:#333">${esc(ev.mensagemWhatsapp)}</p>` : ''}
    </main>
    <footer class="cat-footer">
      <div class="cat-foot-text"><b>${esc(p.nomeNegocio || 'CRM de Vendas')}</b><br>${esc(p.rodapeCatalogo || 'Fale comigo para fazer seu pedido')}</div>
    </footer>
  </section>`;

  $('printArea').innerHTML = html;
  const img = $('printArea').querySelector('img');
  const go = () => setTimeout(() => window.print(), 300);
  if (img.complete) go();
  else { img.onload = go; img.onerror = go; setTimeout(go, 1800); }
}

export async function excluirEvento(id) {
  // Só permite excluir depois que todas as listas de desejo forem marcadas como "Tratado" —
  // evita perder um lead que ainda não virou cliente/carrinho só porque o evento foi apagado.
  let listasSnap;
  try {
    listasSnap = await getDocs(collection(db, 'eventosPublicos', id, 'listasDesejo'));
  } catch (e) { return toast('Erro ao conferir as listas de desejo: ' + e.message); }
  const pendentes = listasSnap.docs.filter(d => !d.data().tratado).length;
  if (pendentes > 0) {
    return toast(`Ainda há ${pendentes} lead(s) não marcado(s) como "Tratado" — marque todos (💌 Listas de desejo) antes de excluir o evento.`);
  }

  if (!confirm('Excluir este evento? O link público deixará de funcionar e as listas de desejo enviadas serão apagadas.')) return;
  try {
    for (const d of listasSnap.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, 'eventosPublicos', id));
    await deleteDoc(ref('eventos', id));
    delete listasCache[id];
    window.App.refresh('Evento excluído');
  } catch (e) { toast('Erro ao excluir: ' + e.message); }
}

// --- Listas de desejo ---
async function carregarListas(eventoId) {
  const box = $('listas-' + eventoId);
  if (!box) return;
  box.innerHTML = '<p class="muted" style="margin-top:12px">Carregando...</p>';
  try {
    const snap = await getDocs(collection(db, 'eventosPublicos', eventoId, 'listasDesejo'));
    const anteriores = listasCache[eventoId] || [];
    const novas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Preserva vínculos com cliente já feitos nesta sessão ao recarregar.
    novas.forEach(n => { const antiga = anteriores.find(a => a.id === n.id); if (antiga?._clienteId) n._clienteId = antiga._clienteId; });
    listasCache[eventoId] = novas;
  } catch (e) {
    box.innerHTML = `<p class="muted" style="margin-top:12px">Erro ao carregar: ${e.message}</p>`;
    return;
  }
  renderListasInline(eventoId);
}

export async function toggleListasEvento(eventoId) {
  const box = $('listas-' + eventoId);
  if (!box) return;
  if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
  await carregarListas(eventoId);
}

export async function atualizarListasEvento(eventoId) {
  await carregarListas(eventoId);
  toast('Lista atualizada');
}

function renderListasInline(eventoId) {
  const box = $('listas-' + eventoId);
  if (!box) return;
  const listas = listasCache[eventoId] || [];
  const cabecalho = `<div style="display:flex;justify-content:flex-end;margin-top:12px">
    <button class="btn small" onclick="App.atualizarListasEvento('${eventoId}')">🔄 Atualizar lista</button>
  </div>`;
  if (!listas.length) { box.innerHTML = cabecalho + '<p class="muted">Ninguém enviou lista ainda.</p>'; return; }
  // Ações de uma lista de desejo — idênticas na tabela (desktop) e no cartão (mobile).
  const acoesLista = l => `
    ${l.whatsapp ? `<a class="btn small green-btn" href="https://wa.me/55${esc(String(l.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener" title="Falar no WhatsApp">${WA_ICON}</a>` : ''}
    ${!l._clienteId
      ? `<button class="btn small" onclick="App.vincularCliente('${eventoId}','${l.id}')">Vincular cliente</button>`
      : `<button class="btn small dark" onclick="App.transformarEmCarrinho('${eventoId}','${l.id}')">🛒 Virar carrinho</button>
         <button class="btn small" onclick="App.marcarInteresseDaLista('${eventoId}','${l.id}')" title="Ela tem interesse mas ainda não vai comprar — salva os produtos permanentemente no cadastro dela pra você oferecer de novo depois">⭐ Lista de interesse</button>`}`;
  const situacaoLista = (l, matchId) => `${pill(l.jaCliente ? 'Já é cliente' : 'Lead novo', l.jaCliente ? 'blue' : 'green')}${l._clienteId ? pill('Vinculada', 'green') : matchId ? ` ${pill('📌 Telefone de ' + (cliById(matchId)?.nome || ''), 'orange', 'Mesmo WhatsApp de um cliente já cadastrado — clique em "Vincular cliente" pra confirmar')}` : ''}`;
  box.innerHTML = cabecalho + `<div class="table only-desktop" style="margin-top:8px"><table><thead><tr>
    <th>Nome</th><th>Aniversário</th><th>WhatsApp</th><th>Situação</th><th>Produtos</th><th>Tratado</th><th>Ações</th>
  </tr></thead><tbody>${listas.map(l => { const matchId = !l._clienteId ? matchCliente(l) : null; return `<tr>
    <td>${esc(l.nomeVisitante)}</td>
    <td>${esc(l.nascimento || '-')}</td>
    <td>${esc(l.whatsapp || '-')}</td>
    <td>${situacaoLista(l, matchId)}</td>
    <td>${(l.produtosDesejados || []).map(p => esc(p.nome)).join(', ') || '-'}</td>
    <td>${toggleBareHtml('', !!l.tratado, `App.marcarLeadTratado('${eventoId}','${l.id}',this.checked)`)}</td>
    <td style="display:flex;gap:4px;flex-wrap:wrap">${acoesLista(l)}</td>
  </tr>`; }).join('')}</tbody></table></div>
  <div class="only-mobile vcards" style="margin-top:8px">${listas.map(l => { const matchId = !l._clienteId ? matchCliente(l) : null; return `<div class="vcard">
    <div class="vcard-top">
      <div class="vcard-cli" style="margin:0;font-size:17px">${esc(l.nomeVisitante)}</div>
    </div>
    <div style="margin:6px 0 4px">${situacaoLista(l, matchId)}</div>
    <div class="vcard-rows">
      <div class="vcard-row"><span>Aniversário</span><b>${esc(l.nascimento || '-')}</b></div>
      <div class="vcard-row"><span>WhatsApp</span><b>${esc(l.whatsapp || '-')}</b></div>
      <div class="vcard-row"><span>Produtos</span><b style="text-align:right">${(l.produtosDesejados || []).map(p => esc(p.nome)).join(', ') || '-'}</b></div>
      <div class="vcard-row"><span>Tratado</span><b>${toggleBareHtml('', !!l.tratado, `App.marcarLeadTratado('${eventoId}','${l.id}',this.checked)`)}</b></div>
    </div>
    <div class="vcard-actions">${acoesLista(l)}</div>
  </div>`; }).join('')}</div>`;
}

// Marca/desmarca uma lista de desejo como "tratada" — libera (ou não) a exclusão do evento.
// Precisa das regras do Firestore atualizadas (listasDesejo agora aceita update do dono).
export async function marcarLeadTratado(eventoId, listaId, tratado) {
  try {
    await setDoc(doc(db, 'eventosPublicos', eventoId, 'listasDesejo', listaId), { tratado }, { merge: true });
    const l = (listasCache[eventoId] || []).find(x => x.id === listaId);
    if (l) l.tratado = tratado;
  } catch (e) { toast('Erro ao marcar: verifique se as regras do Firestore foram publicadas.'); }
}

function matchCliente(lista) {
  const digits = String(lista.whatsapp || '').replace(/\D/g, '');
  if (!digits) return null;
  const found = state.data.clientes.find(c => String(c.whatsapp || '').replace(/\D/g, '') === digits);
  return found?.id || null;
}

export function vincularCliente(eventoId, listaId) {
  const lista = (listasCache[eventoId] || []).find(l => l.id === listaId);
  if (!lista) return;
  const existenteId = matchCliente(lista);
  const clientesOrdenados = [...state.data.clientes].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const opts = clientesOrdenados.map(c =>
    `<option value="${c.id}" ${c.id === existenteId ? 'selected' : ''}>${esc(c.nome)}${c.whatsapp ? ' — ' + esc(c.whatsapp) : ''}</option>`
  ).join('');

  showModal(`<h3>Vincular cliente</h3>
    <p class="muted">Lista de <b>${esc(lista.nomeVisitante)}</b>${lista.whatsapp ? ' • ' + esc(lista.whatsapp) : ''}</p>
    ${existenteId ? `<div class="alert-box" style="margin:10px 0">Encontramos <b>${esc(cliById(existenteId)?.nome)}</b> com o mesmo WhatsApp — já vem selecionado na lista abaixo.</div>` : ''}
    <div class="field full"><label>Buscar cliente já cadastrado</label>
      <input id="vcBusca" placeholder="Digite para filtrar..." oninput="App.filtrarClientesVinculo()">
    </div>
    <div class="field full">
      <select id="vcCliente" size="8" style="height:auto">${opts || '<option disabled>Nenhum cliente cadastrado ainda</option>'}</select>
    </div><br>
    <button class="btn dark" onclick="App.confirmarVinculoSelecionado('${eventoId}','${listaId}')">Vincular selecionado</button>
    <button class="btn ghost" onclick="App.abrirNovoClienteDeLista('${eventoId}','${listaId}')">+ Cadastrar como novo cliente</button>`);
}

export function filtrarClientesVinculo() {
  const q = norm($('vcBusca')?.value || '');
  const sel = $('vcCliente');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => { opt.hidden = !!q && !norm(opt.textContent).includes(q); });
}

export function confirmarVinculoSelecionado(eventoId, listaId) {
  const clienteId = $('vcCliente')?.value;
  if (!clienteId) return toast('Selecione um cliente na lista');
  confirmarVinculo(eventoId, listaId, clienteId);
}

export function confirmarVinculo(eventoId, listaId, clienteId) {
  const l = (listasCache[eventoId] || []).find(x => x.id === listaId);
  if (l) l._clienteId = clienteId;
  closeModal();
  toast('Vinculado! Agora você pode transformar em carrinho.');
  renderListasInline(eventoId);
}

// A visitante digita a data livremente no evento (ex: "15/05/1990") — tenta converter para o
// formato ISO que o campo de data do cadastro de cliente espera. Exige o ano: é data de
// nascimento de verdade, então sem ano não arrisca gravar "nascido este ano" — deixa em
// branco para a consultora preencher manualmente.
function parseDataDigitada(txt) {
  const t = String(txt || '').trim();
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function abrirNovoClienteDeLista(eventoId, listaId) {
  const lista = (listasCache[eventoId] || []).find(l => l.id === listaId);
  closeModal();
  const nascimentoISO = parseDataDigitada(lista?.nascimento);
  if (lista?.nascimento && !nascimentoISO) toast(`Confira a data de aniversário digitada: "${lista.nascimento}"`);
  window.App.openClienteForm('', { eventoId, listaId, nome: lista?.nomeVisitante || '', apelido: lista?.apelido || '', whatsapp: lista?.whatsapp || '', nascimento: nascimentoISO, origem: 'Evento' });
}

// Copia os produtos da lista de desejos do evento pra lista de interesse PERMANENTE do cliente
// (fica no cadastro dela, não só enquanto o evento existir) — pra quando ela tem interesse mas
// não vai comprar agora, e a consultora quer lembrar de oferecer de novo depois.
export async function marcarInteresseDaLista(eventoId, listaId) {
  const lista = (listasCache[eventoId] || []).find(l => l.id === listaId);
  if (!lista) return toast('Lista não encontrada');
  const clienteId = lista._clienteId;
  if (!clienteId) return toast('Vincule esta pessoa a um cliente primeiro.');
  const { adicionarInteresseCliente } = await import('./clientes.js');
  const evento = state.data.eventos.find(e => e.id === eventoId);

  let novos = 0;
  for (const w of lista.produtosDesejados || []) {
    const p = state.data.produtos.find(x => (w.codigoFarmasi && x.codigoFarmasi === w.codigoFarmasi) || norm(x.nome) === norm(w.nome));
    const adicionou = await adicionarInteresseCliente(clienteId, {
      produtoId: p?.id || w.nome, produtoNome: p?.nome || w.nome, codigoFarmasi: p?.codigoFarmasi || ''
    }, `Evento: ${evento?.nome || ''}`);
    if (adicionou) novos++;
  }
  if (!novos) return toast('Esses produtos já estavam na lista de interesse dela, ou a lista está vazia.');
  window.App.refresh(`${novos} produto(s) adicionado(s) à lista de interesse permanente de ${lista.nomeVisitante}`);
}

export async function transformarEmCarrinho(eventoId, listaId) {
  const lista = (listasCache[eventoId] || []).find(l => l.id === listaId);
  if (!lista) return toast('Lista não encontrada');
  const clienteId = lista._clienteId;
  if (!clienteId) return toast('Vincule esta pessoa a um cliente primeiro.');
  const cliente = cliById(clienteId);
  if (!cliente) return toast('Cliente não encontrado');

  const itens = [];
  for (const w of lista.produtosDesejados || []) {
    const p = state.data.produtos.find(x => (w.codigoFarmasi && x.codigoFarmasi === w.codigoFarmasi) || norm(x.nome) === norm(w.nome));
    if (!p) continue;
    const preco = Number(w.precoComDesconto || p.precoVenda || p.precoAtual || 0);
    const estoque = Number(p.estoqueAtual || 0);
    const custoMedio = Number(p.custoMedio || 0);
    const tipoEntrega = estoque > 0 ? 'pronta_entrega' : 'entrega_futura';
    itens.push({
      produtoId: p.id, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
      quantidade: 1, precoUnitario: preco, totalItem: preco,
      custoMedioUsado: custoMedio, custoTotal: custoMedio,
      lucroTotal: preco - custoMedio, motivo: 'Venda', geraLucro: true,
      tipoEntrega, baixouEstoque: false
    });
  }
  if (!itens.length) return toast('Nenhum produto da lista foi encontrado no seu catálogo atual.');

  const totalPedido = itens.reduce((s, i) => s + i.totalItem, 0);
  const custoTotal = itens.reduce((s, i) => s + i.custoTotal, 0);
  const lucroTotal = itens.reduce((s, i) => s + i.lucroTotal, 0);

  const r = await addDoc(col('carrinhos'), {
    clienteId: cliente.id, clienteNome: cliente.nome,
    status: 'aberto', pagamento: '', statusPagamento: 'pendente',
    mostrarSemEstoque: false,
    itens, totalPedido, custoTotal, lucroTotal,
    possuiEntregaFutura: itens.some(i => i.tipoEntrega === 'entrega_futura'),
    observacoes: 'Gerado a partir da lista de desejos do evento.',
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  });
  toast('Carrinho criado a partir da lista de desejos');
  await window.App.refresh();
  window.App.openCarrinho(r.id);
}
