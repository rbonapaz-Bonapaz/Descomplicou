// Busca global (item novo, pedido pela consultora): um campo único que acha "tudo que tem essa
// palavra" — telas/seções do sistema, clientes e produtos — sem precisar saber de cor em qual menu
// cada coisa está. Não é um índice full-text sofisticado: é substring simples (norm() já ignora
// acento/maiúscula), suficiente pro tamanho de dado de uma consultora individual.
import { state } from './state.js';
import { $, esc, norm } from './utils.js';

// Cada destino tem um rótulo (o que aparece no resultado), a página/seção pra onde navegar, e
// palavras-chave extras que não aparecem no rótulo mas a consultora pode digitar (ex: "trocas" já
// é o rótulo, mas alguém pode digitar "troca" no singular — norm() cobre isso por substring).
const DESTINOS = [
  { label: 'Painel Inicial', page: 'dashboard' },
  { label: 'Catálogo', page: 'catalogo' },
  { label: 'Catálogo de Eventos', page: 'eventos', kw: 'evento eventos link publico' },
  { label: 'Clientes', page: 'clientes' },
  { label: 'Agenda', page: 'agenda' },
  { label: 'Vendas / Carrinhos', page: 'vendas', kw: 'venda vendas carrinho carrinhos pedido pedidos' },
  { label: 'Estoque', page: 'estoque', section: 'estoque' },
  { label: 'Importar pedido', page: 'estoque', section: 'importar', kw: 'importar pdf farmasi' },
  { label: 'Trocas', page: 'estoque', section: 'trocas', kw: 'troca trocas' },
  { label: 'Pré-encomenda', page: 'estoque', section: 'preEncomenda', kw: 'pre encomenda comprar' },
  { label: 'Produtos', page: 'produtos', section: 'produtos' },
  { label: 'Linhas de produto', page: 'produtos', section: 'linhas', kw: 'linha linhas categoria' },
  { label: 'Relatórios', page: 'relatorios' },
  { label: 'Minha Conta', page: 'perfil', section: 'conta', kw: 'perfil personalizacao cores fonte' },
  { label: 'Pagamentos', page: 'perfil', section: 'pagamento', kw: 'pix infinitepay operadora cartao taxa' },
  { label: 'Integrações', page: 'perfil', section: 'integracoes', kw: 'whatsapp google agenda gemini ia base coletiva' },
  { label: 'Relatórios (configurar)', page: 'perfil', section: 'relatorios', kw: 'cards inteligencia secoes' },
  { label: 'Meu plano', page: 'perfil', section: 'plano', kw: 'plano assinatura vencimento' },
  { label: 'Segurança', page: 'perfil', section: 'seguranca', kw: 'senha backup zona de risco excluir conta' },
  { label: 'Admin', page: 'admin', kw: 'administracao consultoras' },
  { label: 'Sobre', page: 'sobre' }
];

function abrirDestino(d) {
  window.App.goto(d.page);
  if (d.section) window.App.setSection(d.page, d.section);
  fecharResultadosBusca();
}

// Expostos em window pra montar o onclick inline dos resultados sem precisar registrar no App.
window._buscaGlobalAbrirDestino = i => abrirDestino(DESTINOS[i]);
window._buscaGlobalAbrirCliente = id => { window.App.openCliente360(id); fecharResultadosBusca(); };
window._buscaGlobalAbrirProduto = id => { window.App.openProdutoForm(id); fecharResultadosBusca(); };

function linhaResultado(icone, titulo, subtitulo, onclick) {
  return `<div class="busca-global-item" onclick="${onclick}">
    <span class="busca-global-ico">${icone}</span>
    <div><b>${titulo}</b>${subtitulo ? `<small>${subtitulo}</small>` : ''}</div>
  </div>`;
}

export function renderResultadosBusca() {
  const box = $('buscaGlobalResultados');
  if (!box) return;
  const termo = $('buscaGlobalInput')?.value.trim() || '';
  if (!termo) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const q = norm(termo);

  const destinos = DESTINOS
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => norm(d.label + ' ' + (d.kw || '')).includes(q))
    .slice(0, 6);

  const clientes = state.data.clientes
    .filter(c => norm(c.nome + ' ' + (c.apelido || '') + ' ' + (c.whatsapp || '')).includes(q))
    .slice(0, 5);

  const produtos = state.data.produtos
    .filter(p => norm(p.nome + ' ' + (p.codigoFarmasi || '')).includes(q))
    .slice(0, 5);

  if (!destinos.length && !clientes.length && !produtos.length) {
    box.classList.remove('hidden');
    box.innerHTML = '<p class="muted" style="padding:12px">Nada encontrado.</p>';
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = `
    ${destinos.length ? `<div class="busca-global-grupo">Telas</div>${destinos.map(({ d, i }) =>
      linhaResultado('📍', esc(d.label), '', `window._buscaGlobalAbrirDestino(${i})`)).join('')}` : ''}
    ${clientes.length ? `<div class="busca-global-grupo">Clientes</div>${clientes.map(c =>
      linhaResultado('👤', esc(c.nome), esc(c.whatsapp || ''), `window._buscaGlobalAbrirCliente('${c.id}')`)).join('')}` : ''}
    ${produtos.length ? `<div class="busca-global-grupo">Produtos</div>${produtos.map(p =>
      linhaResultado('🏷️', esc(p.nome), p.codigoFarmasi ? 'Cód: ' + esc(p.codigoFarmasi) : '', `window._buscaGlobalAbrirProduto('${p.id}')`)).join('')}` : ''}
  `;
}

export function fecharResultadosBusca() {
  const box = $('buscaGlobalResultados');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  const input = $('buscaGlobalInput');
  if (input) input.value = '';
}
