export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const parseMoney = v => Number(String(v || '0').replace(/R\$|\s|\./g, '').replace(',', '.')) || 0;
export const today = () => new Date().toISOString().slice(0, 10);
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
  'cuidados cabelo': 'Cuidados com o cabelo',
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
export function thSort(label, field, current, filterKey) {
  const [f, dir] = String(current || '').split('_');
  const active = f === field;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
  return `<th style="cursor:pointer;user-select:none" onclick="App.setFilter('${filterKey}','${field}_${nextDir}')" title="Ordenar">${label}${active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
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
