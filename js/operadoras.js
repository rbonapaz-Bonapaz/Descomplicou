// Cadastro de operadoras de cartão (Minha Conta → Pagamento) — tabela de taxas por operadora e
// grupo de bandeira (Visa/Mastercard vs Elo/Amex), débito e crédito 1x-12x. É a ÚNICA fonte do
// custo estimado da maquininha no carrinho (calcCustoCartao em carrinho.js) — os antigos campos de
// taxa fixa genérica no perfil foram removidos por serem sempre imprecisos perto da tabela real.
// Sem operadora selecionada no carrinho, o custo simplesmente não é mostrado.
import { state, col, ref, db, addDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, showModal, closeModal, toast } from './state.js';
import { $, esc, pill, iniciarCooldownBotao } from './utils.js';
import { buscarTaxasOperadoraPorNome } from './gemini.js';

const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1);

// Taxas exatas da InfinitePay (plano "Em 1 dia útil", conferido nas telas do app em 16/07/2026) —
// serve só de ponto de partida pro seed; a consultora edita livremente depois se a operadora dela
// tiver outro plano/taxas.
const SEED_INFINITEPAY = {
  nome: 'InfinitePay',
  prazoRecebimentoDias: 1,
  taxaDebito: { visaMaster: 1.37, eloAmex: 2.58 },
  taxaCredito: [
    { parcelas: 1, visaMaster: 3.15, eloAmex: 4.91 },
    { parcelas: 2, visaMaster: 5.39, eloAmex: 6.47 },
    { parcelas: 3, visaMaster: 6.12, eloAmex: 7.20 },
    { parcelas: 4, visaMaster: 6.85, eloAmex: 7.92 },
    { parcelas: 5, visaMaster: 7.57, eloAmex: 8.63 },
    { parcelas: 6, visaMaster: 8.28, eloAmex: 9.33 },
    { parcelas: 7, visaMaster: 8.99, eloAmex: 10.03 },
    { parcelas: 8, visaMaster: 9.69, eloAmex: 10.72 },
    { parcelas: 9, visaMaster: 10.38, eloAmex: 11.41 },
    { parcelas: 10, visaMaster: 11.06, eloAmex: 12.08 },
    { parcelas: 11, visaMaster: 11.74, eloAmex: 12.75 },
    { parcelas: 12, visaMaster: 12.40, eloAmex: 13.41 }
  ]
};

// Taxa (%) da operadora pra uma combinação bandeira/parcela — null se a operadora não existe ou
// não tem linha cadastrada pra essa quantidade de parcelas (chamador cai no cálculo padrão).
export function taxaOperadora(operadoraId, bandeiraGrupo, ehDebito, parcelas) {
  const op = state.data.operadoras.find(o => o.id === operadoraId);
  if (!op) return null;
  const grupo = bandeiraGrupo === 'eloAmex' ? 'eloAmex' : 'visaMaster';
  if (ehDebito) {
    const v = op.taxaDebito?.[grupo];
    return v != null ? Number(v) : null;
  }
  const linha = (op.taxaCredito || []).find(l => Number(l.parcelas) === Number(parcelas || 1));
  return linha && linha[grupo] != null ? Number(linha[grupo]) : null;
}

export function operadoraById(id) {
  return state.data.operadoras.find(o => o.id === id) || null;
}

// Operadora marcada como padrão (única possível por vez — ver definirOperadoraPadrao) — é ela que
// o carrinho usa sozinho assim que "Cartão" é selecionado, sem precisar escolher entre as
// maquininhas antigas do histórico. Sem nenhuma marcada ainda, retorna null (carrinho cai no
// comportamento antigo de dropdown pra escolher manualmente).
export function operadoraPadrao() {
  return state.data.operadoras.find(o => o.padrao === true) || null;
}

// Marca uma operadora como padrão e desmarca todas as outras num único lote — Firestore não tem
// "unique constraint" nativa, então a exclusividade (só uma padrão por vez) é garantida aqui,
// gravando padrao:false explícito nas demais junto com padrao:true na escolhida.
export async function definirOperadoraPadrao(id) {
  const batch = writeBatch(db);
  state.data.operadoras.forEach(o => {
    batch.set(ref('operadoras', o.id), { padrao: o.id === id }, { merge: true });
  });
  await batch.commit();
  window.App.refresh('Operadora padrão definida — o carrinho já usa essa maquininha automaticamente');
}

// Link de pagamento pra usar no botão "Enviar link de pagamento" do carrinho: prioriza a operadora
// selecionada naquele carrinho; sem seleção (ou sem link nela), cai na primeira operadora cadastrada
// que tenha um link preenchido — assim funciona mesmo antes da consultora escolher operadora no
// carrinho (ex: pagamento ainda não é Cartão), contanto que alguma operadora tenha link cadastrado.
export function linkPagamentoAtivo(carr) {
  const selecionada = carr?.cartaoOperadoraId ? operadoraById(carr.cartaoOperadoraId) : null;
  if (selecionada?.linkPagamento) return selecionada.linkPagamento;
  return state.data.operadoras.find(o => o.linkPagamento)?.linkPagamento || '';
}

export function renderOperadorasPanel() {
  const lista = state.data.operadoras;
  return `<div class="panel">
    <div class="panel-head">
      <h3>💳 Operadoras de cartão</h3>
    </div>
    <p class="muted">Cadastre a maquininha/operadora que você usa (ex: InfinitePay) com a tabela de taxas exata por bandeira e parcela — é a única fonte do custo estimado da maquininha no carrinho. Marque uma como <b>padrão</b> pra ela ser usada sozinha no carrinho assim que "Cartão" for selecionado, sem precisar escolher entre as maquininhas antigas do histórico.</p>
    ${lista.length ? `<div class="list" style="margin-top:12px">${lista.map(o => `
      <div class="list-item">
        <div>
          <b>${esc(o.nome)}</b>${o.padrao ? pill('★ Padrão', 'green') : ''}
          <small class="muted" style="display:block">Recebe em ${o.prazoRecebimentoDias || 1} dia(s) útil(eis) · Débito V/M ${(o.taxaDebito?.visaMaster ?? 0)}% · Crédito 1x V/M ${(o.taxaCredito?.[0]?.visaMaster ?? 0)}%${o.linkPagamento ? ' · 🔗 com link de pagamento' : ''}</small>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${o.padrao ? '' : `<button class="btn small" onclick="App.definirOperadoraPadrao('${o.id}')" title="Usar essa operadora automaticamente no carrinho">☆ Definir como padrão</button>`}
          <button class="btn small" onclick="App.abrirOperadoraForm('${o.id}')">✏️ Editar</button>
          <button class="btn small" style="color:var(--error)" onclick="App.excluirOperadora('${o.id}')">🗑️</button>
        </div>
      </div>`).join('')}</div>` : '<p class="muted" style="margin-top:10px">Nenhuma operadora cadastrada ainda.</p>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn dark" onclick="App.abrirOperadoraForm()">+ Nova operadora</button>
      ${!lista.some(o => o.nome === 'InfinitePay') ? `<button class="btn" onclick="App.semearInfinitePay()">🚀 Cadastrar InfinitePay com taxas padrão</button>` : ''}
    </div>
  </div>`;
}

function linhaTaxaHtml(n, credito) {
  return `<div class="field"><label>${n}x</label>
    <div style="display:flex;gap:6px">
      <input id="opCredVM${n}" placeholder="V/M %" value="${credito?.visaMaster ?? ''}">
      <input id="opCredEA${n}" placeholder="Elo/Amex %" value="${credito?.eloAmex ?? ''}">
    </div>
  </div>`;
}

export function abrirOperadoraForm(id = '') {
  const o = id ? operadoraById(id) : null;
  showModal(`<h3>${o ? 'Editar' : 'Nova'} operadora</h3>
    <div class="grid">
      <div class="field full"><label>Nome</label><input id="opNome" placeholder="Ex: InfinitePay" value="${esc(o?.nome || '')}"></div>
      <div class="field"><label>Prazo de recebimento (dias úteis)</label><input id="opPrazo" type="number" min="0" value="${o?.prazoRecebimentoDias ?? 1}"></div>
      <div class="field full"><label>Link de pagamento (opcional)</label><input id="opLink" placeholder="https://..." value="${esc(o?.linkPagamento || '')}"></div>
      <div class="field"><label>Máximo de parcelas</label><input id="opMaxParcelas" type="number" min="1" max="24" value="${o?.maxParcelas ?? 12}"></div>
    </div>
    <p class="muted" style="margin:-8px 0 0;font-size:12px">Se preenchido, é esse link que o botão "💳 Enviar link de pagamento" do carrinho manda pra cliente quando essa operadora estiver selecionada. Quando você escolher "Cliente assume o juro" no carrinho, o juro repassado é calculado sozinho pela diferença entre a taxa da parcela escolhida e a taxa à vista aqui embaixo — não precisa digitar juro à parte.</p>
    <div class="panel" style="background:#F7FAFC;margin:14px 0">
      <h4 style="margin:0 0 8px">✨ Atualizar com IA</h4>
      <p class="muted" style="margin:0 0 8px">Preencha o nome da operadora acima e clique no botão — a IA busca sozinha na internet a tabela de tarifas oficial vigente (débito, crédito à vista, 2x a 12x, por bandeira) e preenche os campos abaixo. Nada é salvo automaticamente: confira, ajuste se precisar, e clique em "Salvar" no fim da tela pra confirmar.</p>
      <button class="btn" id="opIaBtn" style="margin-top:4px" onclick="App.atualizarOperadoraComIA()">✨ Buscar taxas com IA</button>
    </div>
    <h4 style="margin:16px 0 8px">Débito (%)</h4>
    <div class="grid">
      <div class="field"><label>Visa/Mastercard</label><input id="opDebVM" value="${o?.taxaDebito?.visaMaster ?? ''}"></div>
      <div class="field"><label>Elo/Amex</label><input id="opDebEA" value="${o?.taxaDebito?.eloAmex ?? ''}"></div>
    </div>
    <h4 style="margin:16px 0 8px">Crédito por parcela (%) — Visa/Mastercard | Elo/Amex</h4>
    <div class="grid">${PARCELAS.map(n => linhaTaxaHtml(n, (o?.taxaCredito || []).find(l => l.parcelas === n))).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn dark" onclick="App.salvarOperadora('${id}')">Salvar</button>
      <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>
    </div>`);
}

function parseNum(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Preenche os campos do formulário já aberto buscando sozinha na internet (via IA, a partir do
// NOME digitado) a tabela de tarifas oficial vigente da operadora — só sobrescreve o que a IA
// encontrou, mantém o resto como estava. Não grava nada sozinho: quem confirma é a consultora
// clicando "Salvar" depois de conferir.
let atualizandoComIA = false;

export async function atualizarOperadoraComIA() {
  if (atualizandoComIA) return;
  const nome = $('opNome')?.value.trim();
  if (!nome) return toast('Preencha o nome da operadora antes de buscar com IA.');

  atualizandoComIA = true;
  const btn = $('opIaBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Buscando...'; }
  let cooldown = false;
  try {
    const dados = await buscarTaxasOperadoraPorNome(nome);
    if (dados.prazoRecebimentoDias != null && $('opPrazo')) $('opPrazo').value = dados.prazoRecebimentoDias;
    if (dados.taxaDebito.visaMaster != null && $('opDebVM')) $('opDebVM').value = dados.taxaDebito.visaMaster;
    if (dados.taxaDebito.eloAmex != null && $('opDebEA')) $('opDebEA').value = dados.taxaDebito.eloAmex;
    let preenchidos = dados.prazoRecebimentoDias != null || dados.taxaDebito.visaMaster != null || dados.taxaDebito.eloAmex != null ? 1 : 0;
    dados.taxaCredito.forEach(l => {
      if (l.visaMaster != null && $(`opCredVM${l.parcelas}`)) { $(`opCredVM${l.parcelas}`).value = l.visaMaster; preenchidos++; }
      if (l.eloAmex != null && $(`opCredEA${l.parcelas}`)) { $(`opCredEA${l.parcelas}`).value = l.eloAmex; preenchidos++; }
    });
    toast(preenchidos ? 'Campos preenchidos pela IA — confira e clique "Salvar" para confirmar' : `Não encontrei taxas confiáveis pra "${nome}" — confira o nome ou preencha manualmente`);
  } catch (e) {
    toast(e.message);
    if (e.tipoGemini === 'limite_por_minuto') cooldown = e.segundosEspera || 30;
  } finally {
    atualizandoComIA = false;
    const btnAtual = $('opIaBtn');
    if (btnAtual) {
      if (cooldown) iniciarCooldownBotao(btnAtual, cooldown, '✨ Buscar taxas com IA');
      else { btnAtual.disabled = false; btnAtual.textContent = '✨ Buscar taxas com IA'; }
    }
  }
}

export async function salvarOperadora(id = '') {
  const nome = $('opNome')?.value.trim();
  if (!nome) return toast('Preencha o nome da operadora');
  const d = {
    nome,
    prazoRecebimentoDias: Number($('opPrazo')?.value || 1),
    linkPagamento: ($('opLink')?.value || '').trim(),
    maxParcelas: Number($('opMaxParcelas')?.value || 12),
    taxaDebito: { visaMaster: parseNum($('opDebVM')?.value), eloAmex: parseNum($('opDebEA')?.value) },
    taxaCredito: PARCELAS.map(n => ({
      parcelas: n,
      visaMaster: parseNum($(`opCredVM${n}`)?.value),
      eloAmex: parseNum($(`opCredEA${n}`)?.value)
    })),
    atualizadoEm: serverTimestamp()
  };
  if (id) {
    await setDoc(ref('operadoras', id), d, { merge: true });
  } else {
    // Primeira operadora cadastrada já nasce padrão — mesma lógica do seed automático da
    // InfinitePay, pra nunca deixar o carrinho sem nenhuma marcada até a consultora lembrar.
    const primeira = state.data.operadoras.length === 0;
    await addDoc(col('operadoras'), { ...d, padrao: primeira, criadoEm: serverTimestamp() });
  }
  closeModal();
  window.App.refresh(id ? 'Operadora atualizada' : 'Operadora cadastrada');
}

export async function excluirOperadora(id) {
  const o = operadoraById(id);
  if (!o) return;
  if (!confirm(`Excluir a operadora "${o.nome}"? Carrinhos que já usam essa operadora voltam a usar a taxa padrão.`)) return;
  await deleteDoc(ref('operadoras', id));
  // Excluiu a que era padrão: promove a próxima que sobrou (se houver) — sem isso, o carrinho
  // ficaria sem nenhuma operadora padrão até a consultora lembrar de configurar de novo.
  if (o.padrao) {
    const proxima = state.data.operadoras.find(x => x.id !== id);
    if (proxima) await setDoc(ref('operadoras', proxima.id), { padrao: true }, { merge: true });
  }
  window.App.refresh('Operadora excluída');
}

export async function semearInfinitePay() {
  // Primeira operadora cadastrada já nasce padrão — sem isso, o carrinho ficaria sem nenhuma
  // marcada até a consultora lembrar de ir configurar manualmente.
  const primeira = state.data.operadoras.length === 0;
  await addDoc(col('operadoras'), { ...SEED_INFINITEPAY, padrao: primeira, criadoEm: serverTimestamp() });
  window.App.refresh('InfinitePay cadastrada com as taxas padrão — confira e ajuste se precisar');
}
