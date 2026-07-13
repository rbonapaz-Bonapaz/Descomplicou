import { state, SECTIONS, db, setDoc, getDoc, getDocs, addDoc, deleteDoc, writeBatch, serverTimestamp, doc, collection, showModal, closeModal, toast } from './state.js';
import { $, esc, money, parseMoney, norm, pill, withFocusPreserved, sectionTabsHtml, formatDateBR, addDias, toggleHtml, linhasDe, labelLinha, descontoPercent, porGenero } from './utils.js';
import { extractProdutos, dedupBatch } from './importar.js';

const PLANOS = ['teste', 'gratuito', 'mensal', 'semestral', 'anual', 'vencido', 'cancelado'];
const PLANOS_LABEL = { teste: 'Teste', gratuito: 'Gratuito', mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual', vencido: 'Vencido', cancelado: 'Cancelado' };
let cmCache = [];
let usersCache = [];

export function renderAdmin() {
  if (state.profile.role !== 'admin') {
    $('admin').innerHTML = '<div class="panel"><p class="muted">Acesso restrito.</p></div>';
    return;
  }
  const sec = state.section.admin;
  const cfg = state.config || {};
  let html = sectionTabsHtml('admin', SECTIONS.admin, sec);

  if (sec === 'consultoras') {
    html += `<div class="panel">
      <div class="panel-head">
        <h3>Painel Administrativo</h3>
        <button class="btn dark small" onclick="App.carregarConsultoras()">🔄 Atualizar lista</button>
      </div>
      <p class="muted">Gerencie consultoras, planos, acessos e administradoras.</p>
      <div id="adminList"><p class="muted">Clique em "Atualizar lista" para carregar as consultoras.</p></div>
    </div>`;
  }

  if (sec === 'catalogoMestre') {
    html += `<div class="panel">
      <div class="panel-head">
        <h3>Catálogo mestre (base coletiva)</h3>
        <span id="cmCount" class="pill blue">carregando...</span>
      </div>
      <p class="muted">Produtos publicados aqui ficam disponíveis para toda consultora que ativar "Usar base coletiva" em Minha Conta. Ela sincroniza quando quiser; preço de venda, custo e estoque continuam individuais.</p>
      <label class="btn pink">Selecionar JSON<input type="file" multiple accept=".json" style="display:none" onchange="App.readCatalogoMestreFiles(this.files)"></label>
      <br><br>
      <textarea id="cmJson" placeholder="Ou cole o JSON aqui..."></textarea>
      <br><br>
      <button class="btn dark" onclick="App.importarCatalogoMestreTexto()">Analisar</button>
      <button class="btn ghost" style="color:var(--error)" onclick="App.limparCatalogoMestre()">🗑️ Limpar catálogo mestre</button>
    </div>
    <div id="cmPreview"></div>
    <div class="panel">
      <hr style="margin:0 0 16px;border:0;border-top:1px solid var(--line)">
      <div id="cmLista"><p class="muted">Carregando produtos...</p></div>
    </div>`;
  }

  if (sec === 'planos') {
    html += `<div class="panel">
      <h3>Preços dos planos</h3>
      <p class="muted">Valores exibidos para todas as consultoras em "Minha Conta". Ajuste manualmente quando fizer reajuste.</p>
      <div class="grid">
        <div class="field"><label>Mensal</label><input id="cfgMensal" value="${money(cfg.precoMensal || 0)}"></div>
        <div class="field"><label>Semestral</label><input id="cfgSemestral" value="${money(cfg.precoSemestral || 0)}"></div>
        <div class="field"><label>Anual</label><input id="cfgAnual" value="${money(cfg.precoAnual || 0)}"></div>
        <div class="field"><label>Limite de clientes no teste grátis</label><input id="cfgLimite" type="number" value="${cfg.limiteTeste ?? 5}"></div>
        <div class="field"><label>Limite de clientes no plano gratuito</label><input id="cfgLimiteGratuito" type="number" value="${cfg.limiteGratuito ?? 10}"></div>
      </div><br>
      <button class="btn dark" onclick="App.salvarConfigPlanos()">Salvar preços</button>
    </div>`;
  }

  if (sec === 'financeiro') {
    html += `<div class="panel">
      <div class="panel-head">
        <h3>Financeiro</h3>
        <button class="btn dark small" onclick="App.carregarConsultoras()">🔄 Atualizar</button>
      </div>
      <p class="muted">Receita recorrente estimada com base nos preços da aba "Planos" e nas consultoras cadastradas, e quem está prestes a vencer.</p>
      <div id="adminFinanceiro"><p class="muted">Clique em "Atualizar" para carregar.</p></div>
    </div>`;
  }

  $('admin').innerHTML = html;
  if (sec === 'catalogoMestre') carregarCatalogoMestre();
}

async function carregarCatalogoMestre(mostrarToast) {
  try {
    const snap = await getDocs(collection(db, 'catalogoMestre'));
    cmCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if ($('cmCount')) $('cmCount').textContent = cmCache.length + ' produtos';
    renderCatalogoMestreLista();
    if (mostrarToast) toast('Lista atualizada');
  } catch (e) {
    if ($('cmCount')) $('cmCount').textContent = 'erro ao carregar';
    if ($('cmLista')) $('cmLista').innerHTML = `<p class="muted">Erro ao carregar: ${e.message}</p>`;
  }
}

function renderCatalogoMestreLista() {
  withFocusPreserved('cmSearch', () => {
    const box = $('cmLista');
    if (!box) return;
    const q = norm($('cmSearch')?.value || '');
    const itens = cmCache.filter(p => !q || norm(p.nome + ' ' + p.codigoFarmasi + ' ' + p.linha).includes(q));
    box.innerHTML = `
      <div class="toolbar"><input id="cmSearch" placeholder="Buscar por nome ou código..." oninput="App.filtrarCatalogoMestre()" value="${esc($('cmSearch')?.value || '')}"></div>
      <div class="table"><table><thead><tr>
        <th></th><th>Nome</th><th>Código</th><th>Linha</th><th>Original</th><th>Atual</th><th>Ações</th>
      </tr></thead><tbody>${itens.length ? itens.map(p => `<tr>
        <td data-label=""><img class="thumb" src="${esc(p.imagem || '')}" onerror="this.style.visibility='hidden'"></td>
        <td data-label="Nome">${esc(p.nome)}</td>
        <td data-label="Código">${esc(p.codigoFarmasi || '-')}</td>
        <td data-label="Linha">${esc(linhasDe(p).map(labelLinha).join(', ') || '-')}</td>
        <td data-label="Original">${money(p.precoOriginal)}</td>
        <td data-label="Atual">${money(p.precoAtual)}${descontoPercent(p.precoOriginal, p.precoAtual) ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">-${descontoPercent(p.precoOriginal, p.precoAtual)}%</span>` : ''}</td>
        <td data-label="Ações" style="display:flex;gap:4px">
          <button class="btn small" onclick="App.editarProdutoMestre('${p.id}')" title="Editar">✏️</button>
          <button class="btn small" style="color:var(--error)" onclick="App.excluirProdutoMestre('${p.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="7"><p class="muted">Nenhum produto encontrado.</p></td></tr>`}</tbody></table></div>`;
  });
}

export function filtrarCatalogoMestre() {
  renderCatalogoMestreLista();
}

export function editarProdutoMestre(id) {
  const p = cmCache.find(x => x.id === id);
  if (!p) return toast('Produto não encontrado, atualize a lista.');
  showModal(`<h3>Editar produto (base coletiva)</h3>
    <div class="grid">
      <div class="field"><label>Nome</label><input id="cmENome" value="${esc(p.nome || '')}"></div>
      <div class="field"><label>Código Farmasi</label><input id="cmECodigo" value="${esc(p.codigoFarmasi || '')}"></div>
      <div class="field"><label>Linha</label><input id="cmELinha" value="${esc(p.linha || '')}"></div>
      <div class="field full"><label>Imagem (URL)</label><input id="cmEImagem" value="${esc(p.imagem || '')}"></div>
      <div class="field"><label>Preço original</label><input id="cmEOriginal" value="${money(p.precoOriginal || 0)}"></div>
      <div class="field"><label>Preço atual</label><input id="cmEAtual" value="${money(p.precoAtual || 0)}"></div>
      <div class="field full">
        <label>Benefícios / descrição</label>
        <textarea id="cmEBeneficios">${esc(p.beneficios || '')}</textarea>
        <button class="btn small" style="margin-top:6px" onclick="App.gerarBeneficiosProduto(this,'cmENome','cmELinha','cmEBeneficios')">✨ Gerar com IA</button>
      </div>
    </div><br>
    <button class="btn dark" onclick="App.salvarProdutoMestre('${id}')">Salvar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function salvarProdutoMestre(id) {
  const d = {
    nome: $('cmENome').value,
    codigoFarmasi: $('cmECodigo').value,
    linha: $('cmELinha').value || 'Sem linha',
    imagem: $('cmEImagem').value,
    precoOriginal: parseMoney($('cmEOriginal').value),
    precoAtual: parseMoney($('cmEAtual').value),
    beneficios: $('cmEBeneficios').value,
    atualizadoEm: serverTimestamp()
  };
  try {
    await setDoc(doc(db, 'catalogoMestre', id), d, { merge: true });
    closeModal();
    toast('Produto atualizado na base coletiva');
    carregarCatalogoMestre();
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

export async function excluirProdutoMestre(id) {
  const p = cmCache.find(x => x.id === id);
  if (!confirm(`Excluir "${p?.nome || id}" da base coletiva?\nIsso não afeta os produtos já sincronizados nas contas das consultoras — só remove daqui.`)) return;
  try {
    await deleteDoc(doc(db, 'catalogoMestre', id));
    toast('Produto removido da base coletiva');
    carregarCatalogoMestre();
  } catch (e) { toast('Erro ao excluir: ' + e.message); }
}

async function upsertCatalogoMestreLote(existentes, raw) {
  const codigo = String(raw.codigoFarmasi || '').trim();
  const nome = String(raw.nome || '').trim();
  let p = codigo ? existentes.find(x => String(x.codigoFarmasi || '') === codigo) : null;
  if (!p && nome) p = existentes.find(x => norm(x.nome) === norm(nome));
  const d = {
    nome, codigoFarmasi: codigo, linha: raw.linha || 'Sem linha', imagem: raw.imagem || '',
    precoOriginal: parseMoney(raw.precoOriginal || 0),
    precoAtual: parseMoney(raw.precoAtual || raw.precoOriginal || 0),
    atualizadoEm: serverTimestamp()
  };
  const ben = String(raw.beneficios || raw.descricao || raw.beneficio || '').trim();
  if (ben) d.beneficios = ben;
  if (p) {
    await setDoc(doc(db, 'catalogoMestre', p.id), d, { merge: true });
    Object.assign(p, d);
  } else {
    const r = await addDoc(collection(db, 'catalogoMestre'), { ...d, criadoEm: serverTimestamp() });
    existentes.push({ id: r.id, ...d });
  }
}

async function importarParaCatalogoMestre(itens) {
  const snap = await getDocs(collection(db, 'catalogoMestre'));
  const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  for (const raw of itens) await upsertCatalogoMestreLote(existentes, raw);
  return itens.length;
}

// Verifica se um item do JSON já existe no catálogo mestre (por código, fallback nome normalizado).
function existenteMestre(p) {
  const cod = String(p.codigoFarmasi || '').trim();
  if (cod) return cmCache.find(x => String(x.codigoFarmasi || '') === cod);
  return cmCache.find(x => norm(x.nome) === norm(p.nome));
}

// Conferência antes de salvar (mesmo padrão da importação de Produtos): mostra o que é novo/
// atualização e permite editar qualquer campo direto na tabela antes de confirmar.
function renderCatalogoMestrePreview(arr) {
  const box = $('cmPreview');
  if (!box) return;
  if (!arr.length) { box.innerHTML = ''; return; }
  const novos = arr.filter(p => !existenteMestre(p)).length;
  const atualiza = arr.length - novos;
  box.innerHTML = `<div class="panel">
    <div class="panel-head">
      <h3>Conferência (${arr.length})</h3>
      <div style="display:flex;gap:6px">${pill(novos + ' novos', 'green')}${pill(atualiza + ' atualizações', 'blue')}</div>
    </div>
    <p class="muted">Produtos existentes (mesmo código Farmasi) são atualizados, não duplicados. Edite qualquer campo abaixo antes de salvar, se precisar.</p>
    <div class="table"><table><thead><tr>
      <th>Produto</th><th>Código</th><th>Linha</th><th>Original</th><th>Atual</th><th>Situação</th>
    </tr></thead><tbody>${arr.map((p, idx) => {
      const ex = existenteMestre(p);
      return `<tr>
        <td data-label="Produto"><input value="${esc(p.nome)}" onchange="App.editarItemImportMestre(${idx},'nome',this.value)"></td>
        <td data-label="Código"><input value="${esc(p.codigoFarmasi || '')}" onchange="App.editarItemImportMestre(${idx},'codigoFarmasi',this.value)"></td>
        <td data-label="Linha"><input value="${esc(p.linha)}" onchange="App.editarItemImportMestre(${idx},'linha',this.value)"></td>
        <td data-label="Original"><input value="${esc(p.precoOriginal || '')}" onchange="App.editarItemImportMestre(${idx},'precoOriginal',this.value)"></td>
        <td data-label="Atual"><input value="${esc(p.precoAtual || '')}" onchange="App.editarItemImportMestre(${idx},'precoAtual',this.value)"></td>
        <td data-label="Situação">${ex ? pill('Atualiza', 'blue') : pill('Novo', 'green')}</td>
      </tr>`;
    }).join('')}</tbody></table></div><br>
    <button class="btn dark" onclick="App.confirmarImportCatalogoMestre()">Salvar ${arr.length} produto(s)</button>
  </div>`;
}

export function editarItemImportMestre(idx, campo, valor) {
  if (!window.__catalogoMestreImport?.[idx]) return;
  window.__catalogoMestreImport[idx][campo] = valor;
  renderCatalogoMestrePreview(window.__catalogoMestreImport);
}

export async function readCatalogoMestreFiles(files) {
  let all = [];
  for (const f of files) {
    try { all = all.concat(extractProdutos(JSON.parse(await f.text()))); }
    catch (e) { toast(`Erro em ${f.name}: ${e.message}`); }
  }
  const arr = dedupBatch(all);
  if (!arr.length) return toast('Nenhum produto encontrado.');
  window.__catalogoMestreImport = arr;
  renderCatalogoMestrePreview(arr);
}

export function importarCatalogoMestreTexto() {
  const txt = ($('cmJson').value || '').trim();
  if (!txt) return toast('Cole o JSON ou use "Selecionar JSON" para escolher arquivos.');
  try {
    const arr = dedupBatch(extractProdutos(JSON.parse(txt)));
    if (!arr.length) return toast('Nenhum produto encontrado no JSON.');
    window.__catalogoMestreImport = arr;
    renderCatalogoMestrePreview(arr);
  } catch (e) { toast('JSON inválido: ' + e.message); }
}

export async function confirmarImportCatalogoMestre() {
  const arr = window.__catalogoMestreImport || [];
  if (!arr.length) return;
  try {
    const n = await importarParaCatalogoMestre(arr);
    toast(`${n} produto(s) importados na base coletiva`);
    window.__catalogoMestreImport = [];
    $('cmPreview').innerHTML = '';
    carregarCatalogoMestre();
  } catch (e) { toast('Erro ao salvar: verifique se as regras do Firestore foram publicadas.'); }
}

export async function limparCatalogoMestre() {
  if (!confirm('Remover TODOS os produtos da base coletiva?\nIsso não afeta os produtos já sincronizados nas contas das consultoras.')) return;
  try {
    const snap = await getDocs(collection(db, 'catalogoMestre'));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    toast('Base coletiva limpa');
    carregarCatalogoMestre();
  } catch (e) { toast('Erro ao limpar: verifique se as regras do Firestore foram publicadas.'); }
}

export async function salvarConfigPlanos() {
  try {
    await setDoc(doc(db, 'config', 'planos'), {
      precoMensal: parseMoney($('cfgMensal').value),
      precoSemestral: parseMoney($('cfgSemestral').value),
      precoAnual: parseMoney($('cfgAnual').value),
      limiteTeste: Number($('cfgLimite').value || 5),
      limiteGratuito: Number($('cfgLimiteGratuito').value || 10),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    toast('Preços atualizados');
    window.App.refresh();
  } catch (e) { toast('Erro ao salvar: verifique se as regras do Firestore foram publicadas.'); }
}

export async function carregarConsultoras() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderConsultorasLista();
    renderFinanceiroLista();
  } catch (e) {
    const msg = `<p class="muted">Erro ao carregar: ${e.message}. Verifique se as regras do Firestore (firestore.rules) foram publicadas com suporte a admin.</p>`;
    if ($('adminList')) $('adminList').innerHTML = msg;
    if ($('adminFinanceiro')) $('adminFinanceiro').innerHTML = msg;
  }
}

function renderConsultorasLista() {
  const box = $('adminList');
  if (!box) return;
  const users = usersCache;
  box.innerHTML = `
    <div class="cards" style="margin-bottom:16px">
      <div class="card"><span>Consultoras</span><b>${users.length}</b></div>
      <div class="card"><span>Ativas</span><b>${users.filter(u => u.plano && u.plano !== 'vencido' && u.plano !== 'cancelado' && u.status !== 'suspenso').length}</b></div>
      <div class="card"><span>Administradores(as)</span><b>${users.filter(u => u.role === 'admin').length}</b></div>
    </div>
    <div class="table"><table><thead><tr>
      <th>Nome</th><th>E-mail</th><th>Papel</th><th>Plano</th><th>Status</th><th>Último login</th><th>Ações</th>
    </tr></thead><tbody>${users.map(u => `<tr>
      <td data-label="Nome">${esc(u.nome || u.email || u.id)}</td>
      <td data-label="E-mail">${esc(u.email || '-')}</td>
      <td data-label="Papel">${u.role === 'admin' ? pill('Admin', 'green') : pill(porGenero(u.genero, { f: 'Usuária', m: 'Usuário', x: 'Usuário(a)' }), 'gray')}</td>
      <td data-label="Plano">${pill(PLANOS_LABEL[u.plano] || u.plano || 'Teste', planColor(u.plano))}</td>
      <td data-label="Status">${u.status === 'excluido' ? pill('Conta excluída', 'gray') : pill(u.status || 'ativo', u.status === 'suspenso' ? 'red' : 'green')}</td>
      <td data-label="Login">${u.ultimoLogin?.toDate ? u.ultimoLogin.toDate().toLocaleDateString('pt-BR') : '-'}</td>
      <td data-label="Ações"><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

// Receita recorrente estimada (MRR): planos semestral/anual são convertidos para equivalente mensal
// para poder somar com o mensal e dar uma noção real de faturamento recorrente por mês.
function renderFinanceiroLista() {
  const box = $('adminFinanceiro');
  if (!box) return;
  const users = usersCache;
  const cfg = state.config || {};
  const ativos = plano => users.filter(u => (u.plano || 'teste') === plano && u.status !== 'suspenso');
  const mensal = ativos('mensal'), semestral = ativos('semestral'), anual = ativos('anual');
  const recMensal = mensal.length * Number(cfg.precoMensal || 0);
  const recSemestral = semestral.length * (Number(cfg.precoSemestral || 0) / 6);
  const recAnual = anual.length * (Number(cfg.precoAnual || 0) / 12);
  const mrr = recMensal + recSemestral + recAnual;

  const hoje = new Date().toISOString().slice(0, 10);
  const limite = addDias(hoje, 15);
  const aVencer = users.filter(u => u.premiumAte && ['mensal', 'semestral', 'anual'].includes(u.plano) &&
      u.premiumAte >= hoje && u.premiumAte <= limite)
    .sort((a, b) => String(a.premiumAte).localeCompare(String(b.premiumAte)));

  box.innerHTML = `
    <div class="cards" style="margin-bottom:16px">
      <div class="card"><span>Mensal</span><b>${mensal.length} · ${money(recMensal)}</b></div>
      <div class="card"><span>Semestral</span><b>${semestral.length} · ${money(recSemestral)}</b></div>
      <div class="card"><span>Anual</span><b>${anual.length} · ${money(recAnual)}</b></div>
      <div class="card"><span>MRR estimado</span><b>${money(mrr)}</b></div>
    </div>
    <h4 style="margin:0 0 10px">A vencer nos próximos 15 dias (${aVencer.length})</h4>
    <div class="table"><table><thead><tr>
      <th>Nome</th><th>E-mail</th><th>Plano</th><th>Vence em</th><th>Ações</th>
    </tr></thead><tbody>${aVencer.length ? aVencer.map(u => `<tr>
      <td data-label="Nome">${esc(u.nome || u.email || u.id)}</td>
      <td data-label="E-mail">${esc(u.email || '-')}</td>
      <td data-label="Plano">${pill(PLANOS_LABEL[u.plano] || u.plano, planColor(u.plano))}</td>
      <td data-label="Vence em">${formatDateBR(u.premiumAte)}</td>
      <td data-label="Ações"><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></td>
    </tr>`).join('') : `<tr><td colspan="5"><p class="muted">Nenhuma consultora vencendo nos próximos 15 dias.</p></td></tr>`}</tbody></table></div>`;
}

function planColor(plano) {
  switch (plano) {
    case 'mensal': case 'semestral': case 'anual': return 'green';
    case 'teste': return 'blue';
    case 'gratuito': return 'orange';
    case 'vencido': case 'cancelado': return 'red';
    default: return 'gray';
  }
}

export async function editarConsultora(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  const u = s.exists() ? s.data() : {};
  const planoOpts = PLANOS.map(p => `<option value="${p}" ${u.plano === p ? 'selected' : ''}>${PLANOS_LABEL[p]}</option>`).join('');
  const souEu = uid === state.user.uid;
  showModal(`<h3>Gerenciar ${porGenero(u.genero, { f: 'Consultora', m: 'Consultor', x: 'Consultor(a)' })}</h3>
    <p class="muted">${esc(u.nome || u.email || uid)} • ${esc(u.email || '')}</p>
    <div class="grid">
      <div class="field"><label>Plano</label><select id="adPlano">${planoOpts}</select></div>
      <div class="field">
        <label>Limite de clientes (teste/gratuito)</label>
        <div style="background:#F3F6FA;border-radius:12px;padding:11px">
          ${toggleHtml('adIlimitado', u.limiteIlimitado, '', 'Ilimitado (ex: parcerias no gratuito)')}
        </div>
      </div>
      <div class="field"><label>Status</label>
        <select id="adStatus">
          <option value="ativo" ${u.status !== 'suspenso' ? 'selected' : ''}>Ativo</option>
          <option value="suspenso" ${u.status === 'suspenso' ? 'selected' : ''}>Suspenso</option>
        </select>
      </div>
      <div class="field">
        <label>Papel</label>
        <select id="adRole" ${souEu ? 'disabled' : ''}>
          <option value="user" ${u.role !== 'admin' ? 'selected' : ''}>${porGenero(u.genero, { f: 'Usuária', m: 'Usuário', x: 'Usuário(a)' })}</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${porGenero(u.genero, { f: 'Administradora', m: 'Administrador', x: 'Administrador(a)' })}</option>
        </select>
        ${souEu ? '<small class="muted">Você não pode alterar seu próprio papel.</small>' : ''}
      </div>
      <div class="field"><label>Premium até</label><input type="date" id="adPremium" value="${esc(u.premiumAte || '')}"></div>
      <div class="field full"><label>Link de pagamento</label><input id="adLink" value="${esc(u.linkPagamento || '')}"></div>
      <div class="field full"><label>Observações admin</label><textarea id="adObs">${esc(u.observacoesAdmin || '')}</textarea></div>
    </div><br>
    <button class="btn dark" onclick="App.salvarConsultora('${uid}')">Salvar</button>
    <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>`);
}

export async function salvarConsultora(uid) {
  const d = {
    plano: $('adPlano').value, status: $('adStatus').value,
    limiteIlimitado: $('adIlimitado').checked,
    premiumAte: $('adPremium').value, linkPagamento: $('adLink').value,
    observacoesAdmin: $('adObs').value, atualizadoAdminEm: serverTimestamp()
  };
  if (uid !== state.user.uid && $('adRole')) d.role = $('adRole').value;
  await setDoc(doc(db, 'users', uid), d, { merge: true });
  closeModal();
  toast('Consultora atualizada');
  carregarConsultoras();
}
