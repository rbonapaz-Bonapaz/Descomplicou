import { state, db, setDoc, getDoc, getDocs, addDoc, deleteDoc, writeBatch, serverTimestamp, doc, collection, showModal, closeModal, toast } from './state.js';
import { $, esc, money, parseMoney, norm, pill, withFocusPreserved, formatDateBR, addDias, today, toggleHtml, linhasDe, labelLinha, descontoPercent, porGenero, combinarLinhas } from './utils.js';
import { extractProdutos, dedupBatch } from './importar.js';

const PLANOS = ['teste', 'gratuito', 'mensal', 'semestral', 'anual', 'vencido', 'cancelado'];
const PLANOS_LABEL = { teste: 'Teste', gratuito: 'Gratuito', mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual', vencido: 'Vencido', cancelado: 'Cancelado' };
const PLANOS_PAGOS = ['mensal', 'semestral', 'anual'];
let cmCache = [];
let usersCache = [];

export function renderAdmin() {
  if (state.profile.role !== 'admin') {
    $('admin').innerHTML = '<div class="panel"><p class="muted">Acesso restrito.</p></div>';
    return;
  }
  const sec = state.section.admin;
  const cfg = state.config || {};
  let html = '';

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
        <h3>Sugestões de descrição</h3>
      </div>
      <p class="muted">Quando uma consultora sincroniza e o produto dela tem uma descrição mais completa que a do Catálogo mestre (que estava sem descrição), a sugestão aparece aqui — aprove para atualizar o mestre, ou rejeite.</p>
      <div id="sbLista" style="margin-top:12px"><p class="muted">Carregando sugestões...</p></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Linhas da base coletiva</h3>
      </div>
      <p class="muted">Linhas de produto publicadas para todas as consultoras. Quem usa a base coletiva pode sincronizar em Produtos → Linhas — as linhas daqui são <b>acrescentadas</b> às que a consultora já tem (nada é apagado).</p>
      <div class="toolbar">
        <input id="novaLinhaColetiva" placeholder="Nome da linha (ex: Maquiagem)">
        <button class="btn dark" onclick="App.adicionarLinhaColetiva()">+ Adicionar linha</button>
      </div>
      <div id="lcLista" style="margin-top:12px"><p class="muted">Carregando linhas...</p></div>
    </div>
    <div class="panel">
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
    </div>

    <div class="panel">
      <h3>Reajuste anual por IPCA</h3>
      <p class="muted">Lembrete manual — o sistema NUNCA muda os preços sozinho. Preencha o % apurado no IBGE e a data em que o reajuste passa a valer; a consultora vê um aviso prévio em Minha Conta, e você vê o lembrete aqui até marcar como aplicado.</p>
      <div class="grid">
        <div class="field"><label>IPCA acumulado (%)</label><input id="cfgIpcaPercentual" placeholder="Ex: 4,5" value="${cfg.ipcaPercentual ?? ''}"></div>
        <div class="field"><label>Reajuste válido a partir de</label><input type="date" id="cfgIpcaData" value="${cfg.ipcaData || ''}"></div>
      </div><br>
      <button class="btn dark" onclick="App.salvarConfigIpca()">Salvar reajuste agendado</button>
      ${cfg.ipcaPercentual && cfg.ipcaData ? `<button class="btn small" style="margin-left:8px" onclick="App.marcarIpcaAplicado()">✓ Já apliquei — marcar como feito</button>` : ''}
      ${cfg.ipcaPercentual && cfg.ipcaData && new Date(cfg.ipcaData) <= new Date() ? `<div class="alert-box" style="margin-top:10px">⏰ O reajuste de ${cfg.ipcaPercentual}% já venceu (válido desde ${formatDateBR(cfg.ipcaData)}) — atualize os preços na tabela acima e marque como aplicado.</div>` : ''}
    </div>

    <div class="panel">
      <h3>Promoção de indicação</h3>
      <p class="muted">Quando ativa, cada consultora tem um link próprio de indicação em Minha Conta. Se a pessoa indicada virar plano pago (mensal/semestral/anual) pela primeira vez, quem indicou ganha 30 dias a mais de plano automaticamente.</p>
      ${toggleHtml('cfgPromoIndicacao', cfg.promocaoIndicacaoAtiva, 'App.togglePromocaoIndicacao(this.checked)', 'Promoção de indicação ativa')}
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
  if (sec === 'catalogoMestre') { carregarCatalogoMestre(); carregarLinhasColetivas(); carregarSugestoesBeneficios(); }
}

// --- Sugestões de descrição (benefícios) vindas da sincronização das consultoras ---
// Consultora não tem permissão de escrita no catalogoMestre — a sincronização grava aqui uma
// sugestão em vez de atualizar direto; o admin aprova (grava no mestre) ou rejeita.
let sugestoesBeneficiosCache = [];

async function carregarSugestoesBeneficios() {
  try {
    const snap = await getDocs(collection(db, 'sugestoesBeneficios'));
    sugestoesBeneficiosCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => (s.status || 'pendente') === 'pendente');
    renderSugestoesBeneficios();
  } catch (e) {
    if ($('sbLista')) $('sbLista').innerHTML = `<p class="muted">Erro ao carregar: ${esc(e.message)}</p>`;
  }
}

function renderSugestoesBeneficios() {
  const box = $('sbLista');
  if (!box) return;
  if (!sugestoesBeneficiosCache.length) { box.innerHTML = '<p class="muted">Nenhuma sugestão pendente.</p>'; return; }
  box.innerHTML = sugestoesBeneficiosCache.map(s => `
    <div class="panel" style="background:#F7FAFC;margin-bottom:10px">
      <b>${esc(s.nome || 'Produto')}</b>${s.codigoFarmasi ? ` <span class="muted">• Código ${esc(s.codigoFarmasi)}</span>` : ''}
      <p class="muted" style="margin:6px 0 2px">Sugerido por ${esc(s.sugeridoPorNome || 'uma consultora')}:</p>
      <p style="margin:0 0 10px">${esc(s.beneficiosSugerido)}</p>
      <button class="btn small dark" onclick="App.aprovarSugestaoBeneficio('${s.id}')">✓ Aprovar e atualizar mestre</button>
      <button class="btn small ghost" style="color:var(--error)" onclick="App.rejeitarSugestaoBeneficio('${s.id}')">✗ Rejeitar</button>
    </div>`).join('');
}

export async function aprovarSugestaoBeneficio(id) {
  const s = sugestoesBeneficiosCache.find(x => x.id === id);
  if (!s) return;
  try {
    await setDoc(doc(db, 'catalogoMestre', s.catalogoMestreId), { beneficios: s.beneficiosSugerido, atualizadoEm: serverTimestamp() }, { merge: true });
    await deleteDoc(doc(db, 'sugestoesBeneficios', id));
    sugestoesBeneficiosCache = sugestoesBeneficiosCache.filter(x => x.id !== id);
    renderSugestoesBeneficios();
    toast('Descrição atualizada no Catálogo mestre');
    carregarCatalogoMestre();
  } catch (e) { toast('Erro ao aprovar: ' + e.message); }
}

export async function rejeitarSugestaoBeneficio(id) {
  try {
    await deleteDoc(doc(db, 'sugestoesBeneficios', id));
    sugestoesBeneficiosCache = sugestoesBeneficiosCache.filter(x => x.id !== id);
    renderSugestoesBeneficios();
    toast('Sugestão rejeitada');
  } catch (e) { toast('Erro ao rejeitar: ' + e.message); }
}

// --- Linhas da base coletiva (G.4) ---
// Guardadas em /config/linhasColetivas (leitura: qualquer autenticado; escrita: só admin — já
// coberto pelas regras existentes de /config). As consultoras sincronizam em Produtos → Linhas.
let linhasColetivasCache = null;

async function carregarLinhasColetivas() {
  try {
    const snap = await getDoc(doc(db, 'config', 'linhasColetivas'));
    linhasColetivasCache = snap.exists() ? (snap.data().linhas || []) : [];
    renderLinhasColetivas();
  } catch (e) {
    if ($('lcLista')) $('lcLista').innerHTML = `<p class="muted">Erro ao carregar: ${esc(e.message)} — as regras do Firestore podem não estar publicadas.</p>`;
  }
}

function renderLinhasColetivas() {
  const box = $('lcLista');
  if (!box) return;
  const linhas = linhasColetivasCache || [];
  box.innerHTML = linhas.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${linhas.map(l => `
        <span class="chip" style="display:inline-flex;align-items:center;gap:8px">
          ${esc(labelLinha(l))}
          <button style="border:0;background:none;cursor:pointer;color:var(--error);font-weight:900" onclick="App.removerLinhaColetiva('${esc(l)}')" title="Remover linha">✗</button>
        </span>`).join('')}</div>`
    : '<p class="muted">Nenhuma linha publicada ainda.</p>';
}

async function salvarLinhasColetivas(linhas) {
  await setDoc(doc(db, 'config', 'linhasColetivas'), { linhas, atualizadoEm: serverTimestamp() }, { merge: true });
  linhasColetivasCache = linhas;
  renderLinhasColetivas();
}

export async function adicionarLinhaColetiva() {
  const nome = ($('novaLinhaColetiva')?.value || '').trim();
  if (!nome) return toast('Digite o nome da linha');
  const atuais = linhasColetivasCache || [];
  if (atuais.some(l => norm(l) === norm(nome))) return toast('Essa linha já existe na base coletiva');
  try {
    await salvarLinhasColetivas([...atuais, nome]);
    if ($('novaLinhaColetiva')) $('novaLinhaColetiva').value = '';
    toast(`Linha "${nome}" publicada na base coletiva`);
  } catch (e) {
    toast('Não foi possível salvar: ' + e.message);
  }
}

export async function removerLinhaColetiva(nome) {
  if (!confirm(`Remover a linha "${nome}" da base coletiva? As consultoras que já sincronizaram continuam com ela.`)) return;
  try {
    await salvarLinhasColetivas((linhasColetivasCache || []).filter(l => l !== nome));
    toast(`Linha "${nome}" removida da base coletiva`);
  } catch (e) {
    toast('Não foi possível remover: ' + e.message);
  }
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
      <div class="table only-desktop"><table><thead><tr>
        <th></th><th>Nome</th><th>Código</th><th>Linha</th><th>Original</th><th>Atual</th><th>Ações</th>
      </tr></thead><tbody>${itens.length ? itens.map(p => `<tr>
        <td><img class="thumb" src="${esc(p.imagem || '')}" onerror="this.style.visibility='hidden'"></td>
        <td>${esc(p.nome)}</td>
        <td>${esc(p.codigoFarmasi || '-')}</td>
        <td>${esc(linhasDe(p).map(labelLinha).join(', ') || '-')}</td>
        <td>${money(p.precoOriginal)}</td>
        <td>${money(p.precoAtual)}${descontoPercent(p.precoOriginal, p.precoAtual) ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">-${descontoPercent(p.precoOriginal, p.precoAtual)}%</span>` : ''}</td>
        <td style="display:flex;gap:4px">
          <button class="btn small" onclick="App.editarProdutoMestre('${p.id}')" title="Editar">✏️</button>
          <button class="btn small" style="color:var(--error)" onclick="App.excluirProdutoMestre('${p.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="7"><p class="muted">Nenhum produto encontrado.</p></td></tr>`}</tbody></table></div>
      <div class="only-mobile vcards">${itens.length ? itens.map(p => `<div class="vcard">
        <div class="vcard-top" style="align-items:flex-start">
          <img src="${esc(p.imagem || '')}" onerror="this.style.visibility='hidden'" style="width:52px;height:52px;object-fit:contain;border-radius:12px;background:#fff;box-shadow:var(--ring);flex:0 0 auto">
          <div style="flex:1 1 auto;min-width:0">
            <div style="font-size:16px;font-weight:800;overflow-wrap:break-word">${esc(p.nome)}</div>
            <div class="prod-tags" style="margin-top:4px"><span class="prod-tag">Código <b>${esc(p.codigoFarmasi || '-')}</b></span><span class="prod-tag">Linha <b>${esc(linhasDe(p).map(labelLinha).join(', ') || '-')}</b></span></div>
          </div>
        </div>
        <div class="vcard-rows">
          <div class="vcard-row"><span>Original</span><b>${money(p.precoOriginal)}</b></div>
          <div class="vcard-row"><span>Atual</span><b>${money(p.precoAtual)}${descontoPercent(p.precoOriginal, p.precoAtual) ? ` <span class="tag green" style="font-size:10px;padding:2px 6px">-${descontoPercent(p.precoOriginal, p.precoAtual)}%</span>` : ''}</b></div>
        </div>
        <div class="vcard-actions">
          <button class="btn small" onclick="App.editarProdutoMestre('${p.id}')" title="Editar">✏️ Editar</button>
          <button class="btn small" style="color:var(--error)" onclick="App.excluirProdutoMestre('${p.id}')" title="Excluir">🗑️ Excluir</button>
        </div>
      </div>`).join('') : '<p class="muted">Nenhum produto encontrado.</p>'}</div>`;
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
    linha: combinarLinhas($('cmELinha').value),
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
    nome, codigoFarmasi: codigo, linha: combinarLinhas(p?.linha, raw.linha), imagem: raw.imagem || '',
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
    <div class="table table-scroll"><table><thead><tr>
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

// Só agenda o lembrete — nunca muda preço sozinho. A consultora vê o aviso prévio em Minha Conta
// (Notificação Prévia, transparência do reajuste); o admin some com o lembrete só ao confirmar
// que já aplicou manualmente na tabela de preços acima.
export async function salvarConfigIpca() {
  const percentual = String($('cfgIpcaPercentual')?.value || '').replace(',', '.').trim();
  const dataReajuste = $('cfgIpcaData')?.value || '';
  if (!percentual || !dataReajuste) return toast('Preencha o percentual e a data do reajuste');
  try {
    await setDoc(doc(db, 'config', 'planos'), { ipcaPercentual: percentual, ipcaData: dataReajuste, atualizadoEm: serverTimestamp() }, { merge: true });
    toast('Reajuste agendado — a consultora já vê o aviso em Minha Conta');
    window.App.refresh();
  } catch (e) { toast('Erro ao salvar: verifique se as regras do Firestore foram publicadas.'); }
}

export async function togglePromocaoIndicacao(ativa) {
  try {
    await setDoc(doc(db, 'config', 'planos'), { promocaoIndicacaoAtiva: ativa, atualizadoEm: serverTimestamp() }, { merge: true });
    toast(ativa ? 'Promoção de indicação ativada' : 'Promoção de indicação desativada');
    window.App.refresh();
  } catch (e) { toast('Erro ao salvar: verifique se as regras do Firestore foram publicadas.'); }
}

export async function marcarIpcaAplicado() {
  if (!confirm('Confirma que já atualizou os preços na tabela acima com o reajuste do IPCA? Isso limpa o lembrete e o aviso da consultora.')) return;
  try {
    await setDoc(doc(db, 'config', 'planos'), { ipcaPercentual: '', ipcaData: '', atualizadoEm: serverTimestamp() }, { merge: true });
    toast('Reajuste marcado como aplicado');
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
    <div class="table only-desktop"><table><thead><tr>
      <th>Nome</th><th>E-mail</th><th>Papel</th><th>Plano</th><th>Status</th><th>Último login</th><th>Ações</th>
    </tr></thead><tbody>${users.map(u => `<tr>
      <td>${esc(u.nome || u.email || u.id)}</td>
      <td>${esc(u.email || '-')}</td>
      <td>${u.role === 'admin' ? pill('Admin', 'green') : pill(porGenero(u.genero, { f: 'Usuária', m: 'Usuário', x: 'Usuário(a)' }), 'gray')}</td>
      <td>${pill(PLANOS_LABEL[u.plano] || u.plano || 'Teste', planColor(u.plano))}</td>
      <td>${u.status === 'excluido' ? pill('Conta excluída', 'gray') : pill(u.status || 'ativo', u.status === 'suspenso' ? 'red' : 'green')}</td>
      <td>${u.ultimoLogin?.toDate ? u.ultimoLogin.toDate().toLocaleDateString('pt-BR') : '-'}</td>
      <td><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></td>
    </tr>`).join('')}</tbody></table></div>
    <div class="only-mobile vcards">${users.map(u => `<div class="vcard">
      <div class="vcard-top">
        <div class="vcard-cli" style="margin:0;font-size:17px">${esc(u.nome || u.email || u.id)}</div>
        ${u.role === 'admin' ? pill('Admin', 'green') : pill(porGenero(u.genero, { f: 'Usuária', m: 'Usuário', x: 'Usuário(a)' }), 'gray')}
      </div>
      <div class="vcard-rows">
        <div class="vcard-row"><span>E-mail</span><b>${esc(u.email || '-')}</b></div>
        <div class="vcard-row"><span>Plano</span><b>${pill(PLANOS_LABEL[u.plano] || u.plano || 'Teste', planColor(u.plano))}</b></div>
        <div class="vcard-row"><span>Status</span><b>${u.status === 'excluido' ? pill('Conta excluída', 'gray') : pill(u.status || 'ativo', u.status === 'suspenso' ? 'red' : 'green')}</b></div>
        <div class="vcard-row"><span>Último login</span><b>${u.ultimoLogin?.toDate ? u.ultimoLogin.toDate().toLocaleDateString('pt-BR') : '-'}</b></div>
      </div>
      <div class="vcard-actions"><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></div>
    </div>`).join('')}</div>`;
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
    <div class="table only-desktop"><table><thead><tr>
      <th>Nome</th><th>E-mail</th><th>Plano</th><th>Vence em</th><th>Ações</th>
    </tr></thead><tbody>${aVencer.length ? aVencer.map(u => `<tr>
      <td>${esc(u.nome || u.email || u.id)}</td>
      <td>${esc(u.email || '-')}</td>
      <td>${pill(PLANOS_LABEL[u.plano] || u.plano, planColor(u.plano))}</td>
      <td>${formatDateBR(u.premiumAte)}</td>
      <td><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></td>
    </tr>`).join('') : `<tr><td colspan="5"><p class="muted">Nenhuma consultora vencendo nos próximos 15 dias.</p></td></tr>`}</tbody></table></div>
    <div class="only-mobile vcards">${aVencer.length ? aVencer.map(u => `<div class="vcard">
      <div class="vcard-top">
        <div class="vcard-cli" style="margin:0;font-size:17px">${esc(u.nome || u.email || u.id)}</div>
        ${pill(PLANOS_LABEL[u.plano] || u.plano, planColor(u.plano))}
      </div>
      <div class="vcard-rows">
        <div class="vcard-row"><span>E-mail</span><b>${esc(u.email || '-')}</b></div>
        <div class="vcard-row"><span>Vence em</span><b>${formatDateBR(u.premiumAte)}</b></div>
      </div>
      <div class="vcard-actions"><button class="btn small" onclick="App.editarConsultora('${u.id}')">✏️ Gerenciar</button></div>
    </div>`).join('') : '<p class="muted">Nenhuma consultora vencendo nos próximos 15 dias.</p>'}</div>`;
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

  // Promoção de indicação: se essa consultora virou plano pago AGORA (não estava antes) e foi
  // indicada por alguém que ainda não recebeu a recompensa dessa indicação, estende o plano de
  // quem indicou em 30 dias. Só dispara uma vez por indicação (indicacaoRecompensada trava isso).
  const antigo = usersCache.find(u => u.id === uid);
  const virouPago = antigo && !PLANOS_PAGOS.includes(antigo.plano) && PLANOS_PAGOS.includes(d.plano);
  if (state.config?.promocaoIndicacaoAtiva && virouPago && antigo.indicadoPorUid && !antigo.indicacaoRecompensada) {
    try {
      const refSnap = await getDoc(doc(db, 'users', antigo.indicadoPorUid));
      if (refSnap.exists()) {
        const refDados = refSnap.data();
        const baseData = refDados.premiumAte && refDados.premiumAte > today() ? refDados.premiumAte : today();
        const novaData = addDias(baseData, 30);
        await setDoc(doc(db, 'users', antigo.indicadoPorUid), {
          premiumAte: novaData,
          ultimoMesGanhoIndicacao: { data: today(), indicadoNome: antigo.nome || antigo.email || '' }
        }, { merge: true });
        d.indicacaoRecompensada = true;
        toast(`🎉 ${refDados.nome || 'Quem indicou'} ganhou 30 dias de plano por essa indicação!`);
      }
    } catch (e) { /* não bloqueia o salvamento da consultora por causa da recompensa */ }
  }

  await setDoc(doc(db, 'users', uid), d, { merge: true });
  closeModal();
  toast('Consultora atualizada');
  carregarConsultoras();
}
