// "Adicionar por voz" (Ações Rápidas) — a consultora fala ou digita um pedido em texto livre
// (ex: "Fabiula quer 2 batom vermelho e 1 base FPS30"), a IA extrai cliente + itens, e cada um é
// casado localmente contra o cadastro real dela antes de qualquer gravação no Firestore. Nada é
// criado sem a consultora conferir e confirmar a tela de preview — evita erro silencioso de
// interpretação (cliente errada, produto trocado, quantidade errada).
import { state, showModal, closeModal, toast, addDoc, col, cliById, prodById, serverTimestamp, estoqueDisponivel } from './state.js';
import { $, esc, norm, searchPickerHtml, iniciarCooldownBotao } from './utils.js';
import { interpretarPedidoDeVenda } from './gemini.js';

let reconhecimento = null;
let gravando = false;

export function abrirPedidoPorTexto() {
  showModal(`<h3>🎤 Adicionar por voz ou texto</h3>
    <p class="muted">Fale ou digite algo como "Fabiula quer 2 batom vermelho e 1 base FPS30" — a IA identifica a cliente e os produtos, e você confirma antes de criar o carrinho.</p>
    <div class="field full">
      <textarea id="pvTexto" placeholder="Ex: Fabiula quer 2 batom vermelho e 1 base FPS30" rows="3"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button class="btn" id="pvMicBtn" onclick="App.alternarGravacaoPedidoVoz()">🎤 Falar</button>
      <button class="btn dark" id="pvInterpretarBtn" onclick="App.interpretarPedidoVoz()">✨ Interpretar</button>
      <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>
    </div>
    <p class="muted" id="pvAvisoVoz" style="margin-top:8px"></p>`);
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec && $('pvAvisoVoz')) $('pvAvisoVoz').textContent = 'Reconhecimento de voz não é suportado neste navegador — digite o pedido no campo acima.';
}

export function alternarGravacaoPedidoVoz() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return toast('Reconhecimento de voz não é suportado neste navegador — digite o pedido.');
  const btn = $('pvMicBtn');
  if (gravando) { reconhecimento?.stop(); return; }

  reconhecimento = new Rec();
  reconhecimento.lang = 'pt-BR';
  reconhecimento.interimResults = false;
  reconhecimento.maxAlternatives = 1;
  reconhecimento.onstart = () => {
    gravando = true;
    if (btn) { btn.textContent = '⏹ Ouvindo... toque para parar'; btn.classList.add('dark'); }
  };
  reconhecimento.onresult = (e) => {
    const texto = Array.from(e.results).map(r => r[0].transcript).join(' ');
    const campo = $('pvTexto');
    if (campo) campo.value = (campo.value.trim() ? campo.value.trim() + ' ' : '') + texto;
  };
  reconhecimento.onerror = () => toast('Não consegui captar o áudio — tente de novo ou digite.');
  reconhecimento.onend = () => {
    gravando = false;
    if (btn) { btn.textContent = '🎤 Falar'; btn.classList.remove('dark'); }
  };
  reconhecimento.start();
}

// Produto: compara palavra a palavra (normalizada) contra o nome cadastrado — exige pelo menos
// 60% das palavras do texto ouvido presentes no nome do produto pra considerar um match confiável;
// abaixo disso é melhor deixar a consultora escolher manualmente do que arriscar trocar o produto.
function melhorMatchProduto(textoOuvido) {
  const alvo = norm(textoOuvido);
  if (!alvo) return null;
  const palavras = alvo.split(' ').filter(Boolean);
  let melhor = null, melhorScore = 0;
  for (const p of state.data.produtos) {
    const nomeNorm = norm(p.nome);
    if (nomeNorm === alvo) return p;
    const hits = palavras.filter(w => nomeNorm.includes(w)).length;
    const score = palavras.length ? hits / palavras.length : 0;
    if (score > melhorScore) { melhorScore = score; melhor = p; }
  }
  return melhorScore >= 0.6 ? melhor : null;
}

function melhorMatchCliente(textoOuvido) {
  const alvo = norm(textoOuvido);
  if (!alvo) return null;
  const exato = state.data.clientes.find(c => norm(c.nome) === alvo);
  if (exato) return exato;
  const primeiroNome = alvo.split(' ')[0];
  const porPrimeiroNome = primeiroNome && state.data.clientes.find(c => norm(c.nome).split(' ')[0] === primeiroNome);
  if (porPrimeiroNome) return porPrimeiroNome;
  return state.data.clientes.find(c => norm(c.nome).includes(alvo) || alvo.includes(norm(c.nome))) || null;
}

// `interpretando` trava novos cliques (e o Enter/duplo toque no botão) enquanto a chamada ao
// Gemini está em andamento — sem essa trava, cada clique extra soma outra requisição no mesmo
// minuto e ajuda a estourar o limite do plano gratuito (15/min) por engano.
let interpretando = false;

export async function interpretarPedidoVoz() {
  if (interpretando) return;
  const texto = $('pvTexto')?.value.trim();
  if (!texto) return toast('Digite ou fale o pedido antes de interpretar.');

  interpretando = true;
  const btn = $('pvInterpretarBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Interpretando...'; }
  toast('Interpretando com IA...');
  let cooldown = false;
  try {
    const resultado = await interpretarPedidoDeVenda(texto);
    if (!resultado.itens.length) return toast('Não identifiquei nenhum produto nesse texto — tente reformular.');
    const clienteMatch = resultado.cliente ? melhorMatchCliente(resultado.cliente) : null;
    const itensResolvidos = resultado.itens.map(i => ({ ...i, produtoMatch: melhorMatchProduto(i.produto) }));
    renderPreviewPedidoVoz(texto, resultado.cliente, clienteMatch, itensResolvidos);
  } catch (e) {
    toast(e.message);
    if (e.tipoGemini === 'limite_por_minuto') cooldown = e.segundosEspera || 30;
  } finally {
    interpretando = false;
    // O botão pode não existir mais se a interpretação deu certo e o modal já trocou de tela.
    const btnAtual = $('pvInterpretarBtn');
    if (btnAtual) {
      if (cooldown) iniciarCooldownBotao(btnAtual, cooldown, '✨ Interpretar');
      else { btnAtual.disabled = false; btnAtual.textContent = '✨ Interpretar'; }
    }
  }
}

function renderPreviewPedidoVoz(textoOriginal, clienteTexto, clienteMatch, itens) {
  const clientesOrdenados = clienteMatch
    ? [clienteMatch, ...state.data.clientes.filter(c => c.id !== clienteMatch.id)]
    : state.data.clientes;
  const clientePicker = searchPickerHtml('pvCliente', clientesOrdenados, c => c.nome);

  const itensHtml = itens.map((it, idx) => {
    const produtosOrdenados = it.produtoMatch
      ? [it.produtoMatch, ...state.data.produtos.filter(p => p.id !== it.produtoMatch.id)]
      : state.data.produtos;
    const picker = searchPickerHtml(`pvItem${idx}`, produtosOrdenados,
      p => `${p.nome}${p.codigoFarmasi ? ' | cód: ' + p.codigoFarmasi : ''} | disp: ${estoqueDisponivel(p.id)}`);
    return `<div class="panel" style="background:#F7FAFC;margin-top:8px" data-pv-item="${idx}">
      <p class="muted" style="margin:0 0 6px">Ouvi: "${esc(it.produto)}"${it.produtoMatch ? '' : ' <span style="color:var(--error);font-weight:900">— não encontrei, escolha abaixo</span>'}</p>
      <div class="grid">
        <div class="field full">${picker}</div>
        <div class="field"><label>Quantidade</label><input id="pvQtd${idx}" type="number" min="1" value="${it.quantidade}"></div>
      </div>
      <button class="btn small" style="color:var(--error);margin-top:6px" onclick="this.closest('[data-pv-item]').remove()">✗ Remover item</button>
    </div>`;
  }).join('');

  showModal(`<h3>Conferir pedido</h3>
    <p class="muted" style="margin:0 0 10px">"${esc(textoOriginal)}"</p>
    <div class="field full"><label>Cliente${clienteMatch ? '' : (clienteTexto ? ` — não encontrei "${esc(clienteTexto)}", escolha abaixo` : ' — não identifiquei, escolha abaixo')}</label>${clientePicker}</div>
    <div id="pvItens">${itensHtml}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn dark" onclick="App.confirmarPedidoVoz(${itens.length})">✓ Criar carrinho</button>
      <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>
    </div>`);
}

export async function confirmarPedidoVoz(totalItens) {
  const clienteId = $('pvCliente')?.value;
  const cliente = cliById(clienteId);
  if (!cliente) return toast('Escolha a cliente antes de confirmar.');

  const itens = [];
  for (let idx = 0; idx < totalItens; idx++) {
    if (!document.querySelector(`[data-pv-item="${idx}"]`)) continue; // item removido no preview
    const p = prodById($(`pvItem${idx}`)?.value);
    if (!p) continue;
    const qtd = Math.max(1, Number($(`pvQtd${idx}`)?.value || 1));
    const preco = Number(p.precoVenda || p.precoAtual || 0);
    const custoMedio = Number(p.custoMedio || 0);
    const tipoEntrega = estoqueDisponivel(p.id) >= qtd ? 'pronta_entrega' : 'entrega_futura';
    itens.push({
      produtoId: p.id, produtoNome: p.nome, codigoFarmasi: p.codigoFarmasi || '',
      quantidade: qtd, precoUnitario: preco, precoOriginal: Number(p.precoOriginal || 0) || preco, totalItem: preco * qtd,
      custoMedioUsado: custoMedio, custoTotal: custoMedio * qtd,
      lucroTotal: (preco - custoMedio) * qtd, motivo: 'Venda', geraLucro: true,
      tipoEntrega, baixouEstoque: false
    });
  }
  if (!itens.length) return toast('Nenhum item para adicionar — confira o pedido.');

  const totalPedido = itens.reduce((s, i) => s + i.totalItem, 0);
  const custoTotal = itens.reduce((s, i) => s + i.custoTotal, 0);
  const lucroTotal = itens.reduce((s, i) => s + i.lucroTotal, 0);

  const r = await addDoc(col('carrinhos'), {
    clienteId: cliente.id, clienteNome: cliente.nome,
    status: 'aberto', pagamento: '', statusPagamento: 'pendente',
    mostrarSemEstoque: false,
    itens, totalPedido, custoTotal, lucroTotal,
    observacoes: 'Criado a partir de pedido por voz/texto.',
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  });
  await window.App.refresh();
  window.App.openCarrinho(r.id);
}
