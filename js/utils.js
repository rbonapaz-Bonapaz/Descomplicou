export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const parseMoney = v => Number(String(v || '0').replace(/R\$|\s|\./g, '').replace(',', '.')) || 0;
export const today = () => new Date().toISOString().slice(0, 10);
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Comparador de ordenação alfabética (pt-BR, ignora maiúsculas/acentos na prática) por .nome — usado
// em toda lista/seletor de clientes e produtos que não tem opção de ordenação própria, pra sempre
// aparecer em ordem alfabética por padrão em vez da ordem de cadastro no Firestore.
export const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');

// Trava um botão por N segundos com contagem regressiva visível — usado depois de um erro de
// limite de requisições por minuto (Gemini), pra deixar claro que é só esperar (não a chave errada)
// e impedir clique repetido que só prolongaria a espera (cada tentativa nova soma na mesma cota).
export function iniciarCooldownBotao(btn, segundos, textoNormal) {
  if (!btn) return;
  btn.disabled = true;
  let restante = segundos;
  btn.textContent = `⏳ Aguarde ${restante}s...`;
  const interval = setInterval(() => {
    restante--;
    if (restante <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.textContent = textoNormal;
    } else {
      btn.textContent = `⏳ Aguarde ${restante}s...`;
    }
  }, 1000);
}

// Escolhe a forma correta de um rótulo de papel/cargo conforme o gênero cadastrado da pessoa
// (campo "genero" do perfil/cliente: Feminino/Masculino/Outro/vazio). Sem gênero definido, usa
// a forma neutra "x" (ex: "Consultor(a)") em vez de assumir feminino.
export function porGenero(genero, formas) {
  if (genero === 'Feminino') return formas.f;
  if (genero === 'Masculino') return formas.m;
  return formas.x;
}

// Normaliza statusPagamento para minúsculas — resiliente a registros antigos salvos com
// maiúscula (bug de <option> sem value= já corrigido, mas dados existentes podem ter ficado assim).
export const normStatusPag = v => String(v || 'pendente').toLowerCase();

// De/para de grafias divergentes do banco (hífen, minúsculo, variações de escrita) para o nome
// oficial da linha — evita que "Cuidados-pessoais", "cuidados pessoais" e "Cuidados Pessoais"
// virem 3 categorias diferentes nos filtros do Catálogo/PDF. Chave = norm() da grafia encontrada.
const LINHA_CANONICA = {
  'cuidados pessoais': 'Cuidados Pessoais',
  'cuidados pele': 'Cuidados com a pele',
  'cuidados com a pele': 'Cuidados com a pele',
  'cuidados cabelo': 'Cuidados com o cabelo',
  'cuidados com o cabelo': 'Cuidados com o cabelo',
  'crescimento cabelo': 'Crescimento Cabelo'
};

// Higieniza uma única linha: remove espaços extras e, se a grafia (ignorando acento/maiúscula/
// hífen) bater com uma variação conhecida, troca pelo nome oficial. Grafias não mapeadas mantêm
// o texto exatamente como a consultora cadastrou.
export function canonLinha(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  return LINHA_CANONICA[norm(s)] || s;
}

// Um produto pode pertencer a mais de uma linha — quando o mesmo produto aparece em JSONs de
// categorias diferentes na importação, as linhas são mescladas numa string "Linha A, Linha B".
// Trata isso como tags (uma por categoria) em vez de valor único, senão cada combinação vira uma
// "linha" própria nos filtros (poluindo o catálogo/PDF/link de evento com entradas gigantes).
// Cada parte passa por canonLinha (de/para de grafias) e o resultado é deduplicado por norm()
// (ignora acento/maiúscula/hífen), preservando a grafia oficial/primeira ocorrência.
export const linhasDe = p => {
  const partes = String(p?.linha || 'Sem linha').split(',').map(s => canonLinha(s)).filter(Boolean);
  const vistos = new Set();
  return partes.filter(s => {
    const chave = norm(s);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
};

// Junta uma ou mais strings de linhas (cada uma podendo já conter várias separadas por vírgula),
// higienizando (trim + de/para) e deduplicando por norm() — usada tanto para mesclar linha atual +
// nova numa importação quanto para sanitizar o valor digitado/selecionado antes de salvar.
export function combinarLinhas(...strings) {
  const partes = strings
    .flatMap(s => String(s || '').split(','))
    .map(s => canonLinha(s))
    .filter(s => s && norm(s) !== 'sem linha');
  const vistos = new Set();
  const resultado = [];
  for (const p of partes) {
    const chave = norm(p);
    if (!vistos.has(chave)) { vistos.add(chave); resultado.push(p); }
  }
  return resultado.length ? resultado.join(', ') : 'Sem linha';
}

// % de desconto para exibir junto do "De/Por" (arredondado, só quando realmente há desconto).
export function descontoPercent(original, atual) {
  const o = Number(original || 0), a = Number(atual || 0);
  if (!o || !a || o <= a) return 0;
  return Math.round((1 - a / o) * 100);
}

// Nomes de linha "crus" (às vezes vindos de URLs/JSON de importação, com hífen) ganham uma
// versão mais natural só para exibição — o valor gravado/usado em filtros continua o original.
export function labelLinha(l) {
  const raw = String(l || 'Sem linha').trim();
  const canonico = canonLinha(raw);
  if (canonico !== raw) return canonico;
  // Só converte hífen→espaço e capitaliza quando é um slug cru (ex: vindo de importação antiga,
  // "cuidados-cabelo"). Linhas cadastradas normalmente (sem hífen) mantêm a grafia exata digitada.
  if (raw.includes('-')) {
    return raw.replace(/-/g, ' ').split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
  }
  return raw;
}

// Lê um File de imagem, redimensiona/comprime e retorna um data URL (JPEG) para
// caber no limite de ~1MB de um documento Firestore. maxSize = maior lado em px.
export function fileToDataURL(file, maxSize = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhum arquivo'));
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

// Executa renderFn (que substitui innerHTML e recria o input de id `id`) preservando
// foco e posição do cursor, já que recriar o DOM sempre tira o foco do elemento antigo.
export function withFocusPreserved(id, renderFn) {
  const prev = document.getElementById(id);
  const hadFocus = document.activeElement === prev;
  const cursorPos = hadFocus ? prev.selectionStart : null;
  renderFn();
  if (hadFocus) {
    const el = document.getElementById(id);
    if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
  }
}

export const ORDENACOES = [['nome_asc', 'Nome A-Z'], ['nome_desc', 'Nome Z-A'], ['custo_asc', 'Custo ↑'], ['custo_desc', 'Custo ↓'], ['preco_asc', 'Preço ↑'], ['preco_desc', 'Preço ↓']];

// Colunas clicáveis para ordenação (substitui o dropdown ORDENACOES nas telas de cards).
export const SORT_COLS = [['nome', 'Nome'], ['codigo', 'Código'], ['linha', 'Linha'], ['custo', 'Custo'], ['preco', 'Preço'], ['estoque', 'Estoque']];

// Barra de "cabeçalhos" clicáveis (Estoque/Produtos usam cards, não <table>, então
// simulamos o clique-para-ordenar de uma tabela com botões). filterKey = 'prodSort'|'estoqueSort'.
export function sortBarHtml(current, filterKey) {
  const [field, dir] = String(current || 'nome_asc').split('_');
  return `<div class="sort-bar">${SORT_COLS.map(([f, l]) => {
    const active = field === f;
    const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
    return `<button class="sort-col ${active ? 'active' : ''}" onclick="App.setFilter('${filterKey}','${f}_${nextDir}')">${l}${active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>`;
  }).join('')}</div>`;
}

// Cabeçalho <th> clicável de ordenação para tabelas de verdade (Vendas, Clientes etc — diferente
// de sortBarHtml, que simula isso com botões pra telas de cards). field = chave do campo,
// current = valor salvo em state.filters[filterKey] (ex: "cliente_asc"), filterKey = nome do filtro.
// Cards colapsáveis (efeito accordion) — usado em TODOS os painéis do Dashboard e de Relatórios
// (item 15: privacidade de tela compartilhada, ex: mostrar o app pra cliente do lado sem expor
// valores). Estado só em memória da sessão (não precisa persistir no Firestore: é preferência de
// tela, não dado de negócio, e os dados continuam carregados — só o container interno some
// visualmente). O cabeçalho (título + botões de ação como "Ver todos"/"Configurar") continua
// sempre visível; um clique em qualquer parte da barra de título (ou no chevron) alterna o corpo,
// exceto em botões/links internos do cabeçalho, que usam stopPropagation pra não conflitar.
const colapsados = new Set();

export function toggleColapsavel(key) {
  const body = document.getElementById('colBody-' + key);
  const chevron = document.getElementById('colChevron-' + key);
  if (!body) return;
  const vaiColapsar = !colapsados.has(key);
  if (vaiColapsar) colapsados.add(key); else colapsados.delete(key);
  body.classList.toggle('report-card-collapsed', vaiColapsar);
  if (chevron) chevron.textContent = vaiColapsar ? '▸' : '▾';
}

// Monta um <div class="panel"> com cabeçalho clicável (título/ações + chevron) e corpo recolhível.
// `key` precisa ser único na tela inteira (ex: 'dashAniversariantes', 'relOrigem'). `headInnerHtml`
// é o conteúdo do cabeçalho (título, badges, botões de ação) — botões que não devem alternar o
// card precisam do próprio onclick com `event.stopPropagation()` antes da ação.
export function collapsibleHtml(key, headInnerHtml, bodyHtml) {
  const colapsado = colapsados.has(key);
  return `<div class="panel">
    <div class="panel-head report-card-head" onclick="App.toggleColapsavel('${key}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.toggleColapsavel('${key}')}">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${headInnerHtml}</div>
      <span class="report-card-chevron" id="colChevron-${key}">${colapsado ? '▸' : '▾'}</span>
    </div>
    <div id="colBody-${key}" class="report-card-body${colapsado ? ' report-card-collapsed' : ''}">${bodyHtml}</div>
  </div>`;
}

// --- Tema visual personalizável (item 21: cor de fundo + cor principal, por consultora) ---
// Clareia (percent > 0) ou escurece (percent < 0) uma cor hex — usado pra derivar automaticamente o
// tom "pressionado/hover" (--ps) a partir da cor principal escolhida, sem precisar de um terceiro
// seletor de cor. Mantém a interface simples: a consultora só escolhe DUAS cores (fundo + principal).
function sombrearCor(hex, percent) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const num = parseInt(h, 16);
  const ajustar = canal => {
    const v = (num >> canal) & 0xFF;
    const novo = percent < 0 ? v * (1 + percent) : v + (255 - v) * percent;
    return Math.max(0, Math.min(255, Math.round(novo)));
  };
  const r = ajustar(16), g = ajustar(8), b = ajustar(0);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// Aplica (ou remove, se vazio) as cores personalizadas do perfil como variáveis CSS no :root —
// sobrescreve só --p/--ps/--bg, o resto do tema (texto, cinzas, sombras) continua igual pra manter
// contraste e legibilidade garantidos. Chamado uma vez a cada carregamento/atualização do perfil;
// nunca mexe em dados salvos, só na aparência da aba já aberta.
export function aplicarTemaPersonalizado(perfil) {
  const root = document.documentElement.style;
  const cor = perfil?.corPrimaria;
  const fundo = perfil?.corFundo;
  if (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) {
    root.setProperty('--p', cor);
    root.setProperty('--ps', sombrearCor(cor, -0.15));
    // Botões de ação principais (.btn.dark) também assumem a cor escolhida — sem isso a
    // personalização quase não aparecia (só títulos/links mudavam, os botões seguiam navy fixo).
    // Só sobrescreve quando há cor personalizada: sem personalização, --btn-dark fica indefinido e
    // o CSS cai no navy padrão (var(--text)), preservando o visual de quem não mexeu nas cores.
    root.setProperty('--btn-dark', sombrearCor(cor, -0.08));
  } else {
    root.removeProperty('--p');
    root.removeProperty('--ps');
    root.removeProperty('--btn-dark');
  }
  if (fundo && /^#[0-9a-fA-F]{6}$/.test(fundo)) root.setProperty('--bg', fundo);
  else root.removeProperty('--bg');

  // Cor do texto — terceiro slot de personalização. Fica de fora da mesma checagem acima porque é
  // independente das outras duas (dá pra mudar só o texto sem mudar fundo/destaque). O tipo de
  // fonte (Alegreya/Inter) NÃO é personalizável — só a cor.
  const texto = perfil?.corTexto;
  if (texto && /^#[0-9a-fA-F]{6}$/.test(texto)) root.setProperty('--text', texto);
  else root.removeProperty('--text');

  // Cor do menu lateral (desktop) / menu de baixo (celular) — quarto slot, independente do resto.
  const menu = perfil?.corMenu;
  if (menu && /^#[0-9a-fA-F]{6}$/.test(menu)) root.setProperty('--side-bg', menu);
  else root.removeProperty('--side-bg');

  // Cor dos cartões/painéis (os blocos brancos como painéis, cards e campos de formulário) —
  // quinto slot, independente do resto.
  const cartoes = perfil?.corCartoes;
  if (cartoes && /^#[0-9a-fA-F]{6}$/.test(cartoes)) root.setProperty('--card-bg', cartoes);
  else root.removeProperty('--card-bg');
}

// --- Pix estático (BR Code / EMV, padrão Banco Central) ---
// Monta o payload TLV (tag-length-value) e calcula o CRC16-CCITT final — o mesmo formato que
// qualquer banco/app de pagamento lê num QR Code Pix "Copia e Cola" estático (sem chamar API
// nenhuma, sem depender de gateway: só a chave Pix da consultora + o valor do pedido).
function tlv(id, valor) {
  return id + String(valor.length).padStart(2, '0') + valor;
}

function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// O padrão exige texto só ASCII (sem acento) e limita o tamanho de nome/cidade — normaliza
// removendo acentuação, filtra pra ASCII imprimível e corta no limite de cada campo.
function limparAsciiPix(s, max) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '').trim().slice(0, max).toUpperCase();
}

// Detecta o tipo da chave Pix quando o tipo não foi informado ("auto"). CPF e celular ambos podem
// ter 11 dígitos — por isso o perfil tem um seletor manual; esta detecção é só o palpite de reserva.
function detectarTipoChavePix(raw) {
  if (raw.includes('@')) return 'email';
  // Chave aleatória (UUID): tem letras e/ou hifens no meio do texto.
  if (/[a-zA-Z]/.test(raw) || raw.includes('-')) return 'aleatoria';
  const d = raw.replace(/\D/g, '');
  if (d.length === 14) return 'cnpj';
  if (d.length === 11) return 'cpf'; // palpite: CPF é a chave mais comum com 11 dígitos
  if (d.length === 10 || d.length === 12 || d.length === 13) return 'celular';
  return 'aleatoria';
}

// Normaliza a chave pro formato EXATO que o banco tem registrado — é a causa nº1 de "conta não
// encontrada" ao escanear: CPF/CNPJ/celular com pontuação, ou celular sem o +55, não batem com a
// chave cadastrada. CPF/CNPJ viram só dígitos; celular vira E.164 (+55DDDnúmero); e-mail minúsculo;
// aleatória fica como está.
export function normalizarChavePix(chave, tipo) {
  const raw = String(chave || '').trim();
  if (!raw) return '';
  const t = (tipo && tipo !== 'auto') ? tipo : detectarTipoChavePix(raw);
  const digitos = raw.replace(/\D/g, '');
  switch (t) {
    case 'cpf': return digitos.slice(0, 11);
    case 'cnpj': return digitos.slice(0, 14);
    case 'email': return raw.toLowerCase();
    case 'celular': {
      // 10-11 dígitos = DDD + número, sem o código do país → prefixa 55. 12-13 já vêm com o 55.
      const comPais = (digitos.length === 10 || digitos.length === 11) ? '55' + digitos : digitos;
      return '+' + comPais;
    }
    default: return raw; // aleatória — enviada exatamente como cadastrada
  }
}

// Logo do negócio (opcional, Minha Conta → Conta) no rodapé dos PDFs (pedido, relatório, catálogo)
// — some sozinho quando não cadastrado, sem afetar o layout de quem só usa o nome em texto.
export function logoNegocioHtml(p, cls = 'pdf-foot-logo') {
  const logo = p?.logoNegocio || '';
  return logo ? `<img src="${esc(logo)}" alt="" class="${cls}">` : '';
}

// Gera o BR Code (Pix Copia e Cola) estático: chave + valor exato do pedido, sem taxa de
// intermediário nenhuma — é o mesmo texto que vira o QR Code exibido no carrinho.
export function gerarPixCopiaECola({ chave, tipoChave, titular, cidade, valor, txid }) {
  const chaveClean = normalizarChavePix(chave, tipoChave);
  if (!chaveClean) return '';
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chaveClean);
  const nomeClean = limparAsciiPix(titular, 25) || 'RECEBEDOR';
  const cidadeClean = limparAsciiPix(cidade, 15) || 'BRASIL';
  const txidClean = limparAsciiPix(txid, 25) || '***';
  const valorNum = Number(valor || 0);

  let payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (valorNum > 0 ? tlv('54', valorNum.toFixed(2)) : '') +
    tlv('58', 'BR') +
    tlv('59', nomeClean) +
    tlv('60', cidadeClean) +
    tlv('62', tlv('05', txidClean));

  payload += '6304';
  return payload + crc16ccitt(payload);
}

export function thSort(label, field, current, filterKey) {
  const [f, dir] = String(current || '').split('_');
  const active = f === field;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
  return `<th class="th-sort" onclick="App.setFilter('${filterKey}','${field}_${nextDir}')" title="Ordenar">${label}${active ? ` <span class="th-sort-arrow">${dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
}

// Ordena uma lista de itens "envolvidos" (formato {p, custo, venda, est, ...} usado em
// produtos/estoque) por nome, código, linha, custo médio, preço de venda ou estoque.
export function sortWrapped(arr, key) {
  const [field, dir] = String(key || 'nome_asc').split('_');
  const mul = dir === 'desc' ? -1 : 1;
  const val = x => {
    if (field === 'custo') return Number(x.custo || 0);
    if (field === 'preco') return Number(x.venda || 0);
    if (field === 'estoque') return Number(x.est || 0);
    if (field === 'codigo') return norm(x.p.codigoFarmasi || '');
    if (field === 'linha') return norm(x.p.linha || '');
    return norm(x.p.nome);
  };
  return [...arr].sort((a, b) => {
    const va = val(a), vb = val(b);
    return typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') * mul : (va - vb) * mul;
  });
}

// Barra de abas para dividir páginas longas em seções (ver SECTIONS em state.js).
export function sectionTabsHtml(pagina, sections, active) {
  return `<div class="sub-tabs">${sections.map(([k, l]) =>
    `<button class="sub-tab ${active === k ? 'active' : ''}" onclick="App.setSection('${pagina}','${k}')">${esc(l)}</button>`
  ).join('')}</div>`;
}

// Campo de busca + <select> filtrado embaixo — substitui um <select> comum quando a lista é
// grande demais para rolar (ex: escolher produto num catálogo com 100+ itens). `describe(item)`
// gera o texto de cada opção; `onchangeSelect` é o atributo onchange (string) do <select> final.
export function searchPickerHtml(selectId, itens, describe, onchangeSelect = '') {
  const buscaId = selectId + 'Busca';
  const opts = itens.map((it, i) => `<option value="${esc(it.id)}" ${i === 0 ? 'selected' : ''}>${esc(describe(it))}</option>`).join('');
  return `<input id="${buscaId}" placeholder="Digite para buscar..." oninput="App.filtrarSearchPicker('${selectId}')" style="margin-bottom:6px">
    <select id="${selectId}" size="6" style="height:auto" ${onchangeSelect ? `onchange="${onchangeSelect}"` : ''}>${opts}</select>`;
}

export function filtrarSearchPicker(selectId) {
  const q = norm($(selectId + 'Busca')?.value || '');
  const sel = $(selectId);
  if (!sel) return;
  let primeiraVisivel = null;
  Array.from(sel.options).forEach(opt => {
    opt.hidden = !!q && !norm(opt.textContent).includes(q);
    if (!opt.hidden && !primeiraVisivel) primeiraVisivel = opt;
  });
  if (primeiraVisivel && (!sel.value || sel.selectedOptions[0]?.hidden)) {
    sel.value = primeiraVisivel.value;
    sel.dispatchEvent(new Event('change'));
  }
}

export function pill(t, c = 'gray', title = '') {
  return `<span class="pill ${c}"${title ? ` title="${esc(title)}"` : ''}>${esc(t)}</span>`;
}

// Campo de senha com ícone de olho para mostrar/ocultar o valor digitado.
export function senhaInputHtml(id, label, autocomplete = 'new-password') {
  return `<div class="field"><label>${esc(label)}</label>
    <div class="senha-wrap">
      <input type="password" id="${id}" autocomplete="${autocomplete}">
      <button type="button" class="senha-eye" tabindex="-1" onclick="const i=document.getElementById('${id}');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'">👁</button>
    </div>
  </div>`;
}

// Toggle switch (em vez do checkbox quadrado padrão do navegador) para qualquer opção liga/desliga.
// onchange recebe "this.checked" pronto — ex: onchange="App.minhaFuncao(this.checked)".
export function toggleHtml(id, checked, onchange, label = '', extra = '') {
  return `<label class="toggle-line">
    ${toggleBareHtml(id, checked, onchange)}
    ${label ? esc(label) : ''}${extra}
  </label>`;
}

// Só o switch, sem label ao redor — para células de tabela onde o rótulo já é o cabeçalho da
// coluna. attrs aceita atributos extras crus (ex: `class="evLinhaChk" value="X"`).
export function toggleBareHtml(id, checked, onchange = '', attrs = '') {
  const idAttr = id ? `id="${id}"` : '';
  return `<span class="toggle-switch"><input type="checkbox" ${idAttr} ${attrs} ${checked ? 'checked' : ''} ${onchange ? `onchange="${onchange}"` : ''}><span class="toggle-track"></span></span>`;
}

export function daysToBirthday(n) {
  if (!n) return 9999;
  let [y, m, d] = String(n).split('-').map(Number);
  const now = new Date();
  let b = new Date(now.getFullYear(), m - 1, d);
  if (b < new Date(now.getFullYear(), now.getMonth(), now.getDate())) b = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.ceil((b - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export function formatBirthDate(n) {
  if (!n) return '';
  const [, m, d] = String(n).split('-').map(Number);
  if (!m || !d) return '';
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0');
}

// Idade que a pessoa completa no próximo aniversário (o que está sendo contado nos dias)
export function ageOnNextBirthday(n) {
  if (!n) return null;
  const [y, m, d] = String(n).split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let nextYear = now.getFullYear();
  const jaPassouEsteAno = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() > d);
  if (jaPassouEsteAno) nextYear++;
  const age = nextYear - y;
  return age >= 0 ? age : null;
}

// Converte uma data 'YYYY-MM-DD' (formato interno) para exibição 'DD/MM/AAAA'.
// Usar em qualquer lugar que mostre uma data de cliente/venda/agenda/plano ao usuário.
export function formatDateBR(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).split('-');
  if (!y || !m || !dd || y.length !== 4) return String(d);
  return `${dd}/${m}/${y}`;
}

// Soma dias a uma data 'YYYY-MM-DD', devolvendo outra data no mesmo formato.
export function addDias(dataISO, dias) {
  const d = new Date(dataISO + 'T00:00:00');
  d.setDate(d.getDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

export function daysSince(d) {
  return d ? Math.floor((new Date(today()) - new Date(d)) / 86400000) : 9999;
}

export function inPeriod(d, days = 30) {
  if (days === 'all') return true;
  return d && ((new Date(today()) - new Date(d)) / 86400000 <= Number(days));
}

// Gráfico de linha simples (SVG puro, sem libs) para tendência de faturamento por dia.
export function lineChartSvg(pontos, opts = {}) {
  const w = opts.width || 640, h = opts.height || 140, pad = 8;
  if (!pontos.length) return '<p class="muted">Sem dados no período.</p>';
  const vals = pontos.map(p => p.fat);
  const max = Math.max(1, ...vals);
  const stepX = pontos.length > 1 ? (w - pad * 2) / (pontos.length - 1) : 0;
  const coord = (p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (p.fat / max) * (h - pad * 2);
    return [x, y];
  };
  const linePts = pontos.map((p, i) => coord(p, i).map(n => n.toFixed(1)).join(',')).join(' ');
  const [firstX] = coord(pontos[0], 0);
  const [lastX] = coord(pontos[pontos.length - 1], pontos.length - 1);
  const areaPts = `${firstX.toFixed(1)},${(h - pad).toFixed(1)} ${linePts} ${lastX.toFixed(1)},${(h - pad).toFixed(1)}`;
  const circles = pontos.map((p, i) => {
    const [x, y] = coord(p, i);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--p)"><title>${formatDateBR(p.data)}: ${money(p.fat)}</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block" preserveAspectRatio="none">
    <polyline points="${areaPts}" fill="rgba(247,37,98,.10)" stroke="none"></polyline>
    <polyline points="${linePts}" fill="none" stroke="var(--p)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
    ${circles}
  </svg>`;
}

// Paleta compartilhada dos gráficos de barra/rosca — mesma cor de marca (--p) para o item #1,
// tons complementares pros seguintes, sem depender de nenhuma lib externa de gráficos.
const CHART_CORES = ['#F72562', '#4C6FFF', '#0E9F6E', '#F5A623', '#8E44AD', '#17A2B8', '#E67E22', '#6C757D'];

// Gráfico de barras horizontal simples (SVG puro) — recebe [{label, valor}], já ordenado como
// deve aparecer. valueFmt formata o número exibido ao lado de cada barra (padrão: inteiro).
export function barChartSvg(pontos, opts = {}) {
  if (!pontos.length) return '<p class="muted">Sem dados no período.</p>';
  const valueFmt = opts.valueFmt || (v => String(v));
  const max = Math.max(1, ...pontos.map(p => Number(p.valor) || 0));
  return `<div class="bar-chart">${pontos.map((p, i) => {
    const pct = max ? Math.max(2, (Number(p.valor) || 0) / max * 100) : 0;
    const cor = CHART_CORES[i % CHART_CORES.length];
    return `<div class="bar-chart-row">
      <span class="bar-chart-label" title="${esc(p.label)}">${esc(p.label)}</span>
      <div class="bar-chart-track"><div class="bar-chart-fill" style="width:${pct.toFixed(1)}%;background:${cor}"></div></div>
      <span class="bar-chart-value">${esc(valueFmt(p.valor))}</span>
    </div>`;
  }).join('')}</div>`;
}

// Gráfico de rosca (donut) em SVG puro — recebe [{label, valor}]. Sem lib externa: monta os arcos
// manualmente via coordenadas polares. Legenda vem embaixo com a cor de cada fatia e o % do total.
export function donutChartSvg(pontos, opts = {}) {
  const dados = pontos.filter(p => Number(p.valor) > 0);
  if (!dados.length) return '<p class="muted">Sem dados no período.</p>';
  const valueFmt = opts.valueFmt || (v => String(v));
  const total = dados.reduce((s, p) => s + Number(p.valor), 0);
  const cx = 60, cy = 60, r = 50, rInner = 28;
  let anguloAtual = -90; // começa no topo (12h)
  const polar = (ang, raio) => {
    const rad = (ang * Math.PI) / 180;
    return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)];
  };
  const fatias = dados.map((p, i) => {
    const fatiaAngulo = (Number(p.valor) / total) * 360;
    const inicio = anguloAtual, fim = anguloAtual + fatiaAngulo;
    anguloAtual = fim;
    const largeArc = fatiaAngulo > 180 ? 1 : 0;
    const [x1, y1] = polar(inicio, r), [x2, y2] = polar(fim, r);
    const [x1i, y1i] = polar(fim, rInner), [x2i, y2i] = polar(inicio, rInner);
    const cor = CHART_CORES[i % CHART_CORES.length];
    const d = dados.length === 1
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
      : `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x1i.toFixed(2)} ${y1i.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i.toFixed(2)} ${y2i.toFixed(2)} Z`;
    return { d, cor, p, pct: (Number(p.valor) / total) * 100 };
  });
  return `<div class="donut-chart">
    <svg viewBox="0 0 120 120" style="width:140px;height:140px;flex:0 0 auto">
      ${fatias.map(f => `<path d="${f.d}" fill="${f.cor}"><title>${esc(f.p.label)}: ${esc(valueFmt(f.p.valor))}</title></path>`).join('')}
    </svg>
    <div class="donut-legend">${fatias.map(f => `<div class="donut-legend-item">
      <span class="donut-dot" style="background:${f.cor}"></span>
      <span>${esc(f.p.label)}</span>
      <b>${f.pct.toFixed(0)}%</b>
    </div>`).join('')}</div>
  </div>`;
}

// Gera e baixa um CSV a partir de linhas de dados — abre certinho no Excel/Google Sheets (BOM UTF-8
// evita acento quebrado no Excel). headers = ['Coluna 1', 'Coluna 2', ...], rows = [[v1, v2], ...].
export function downloadCSV(filename, headers, rows) {
  const escapeCsv = v => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [headers, ...rows].map(row => row.map(escapeCsv).join(';'));
  const conteudo = '﻿' + linhas.join('\r\n'); // BOM garante acentuação certa ao abrir no Excel
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
