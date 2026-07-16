import { state, carrinhoById, cliById, numeroPedidoLabel } from './state.js';
import { $, esc, money, normStatusPag, descontoPercent } from './utils.js';
import { calcCustoCartao, jurosAutomatico } from './carrinho.js';

export function gerarPdfCliente(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  gerarPdf(carr, false);
}

export function gerarPdfInterno(carrinhoId) {
  const carr = state.data.carrinhos.find(c => c.id === carrinhoId);
  if (!carr) return;
  gerarPdf(carr, true);
}

// Benefícios e foto não ficam salvos no item do carrinho — busca no cadastro atual do produto.
function produtoDoItem(it) {
  return state.data.produtos.find(p => p.id === it.produtoId);
}

// Linha de item no estilo "resumo de pedido de loja" (referências Amazon/Shopee do usuário):
// foto + produto/código em cima, benefícios e desconto logo abaixo, quantidade e valores à direita.
function itemRowHtml(it, interno) {
  const prod = produtoDoItem(it);
  const beneficios = prod?.beneficios || '';
  const original = Number(it.precoOriginal || it.precoUnitario || 0);
  const temDesconto = original > it.precoUnitario;
  return `<div class="pedido-item">
    ${prod?.imagem ? `<img src="${esc(prod.imagem)}">` : '<div class="pedido-item-noimg">sem foto</div>'}
    <div class="pedido-item-main">
      ${it.kitNome ? `<div class="pedido-item-cod">🎁 ${esc(it.kitNome)}</div>` : ''}
      <div class="pedido-item-nome">${esc(it.produtoNome)}</div>
      <div class="pedido-item-cod">Código ${esc(it.codigoFarmasi || '-')}</div>
      ${beneficios ? `<div class="pedido-item-benef">${esc(beneficios)}</div>` : ''}
      ${temDesconto ? `<div><span class="pedido-desc-tag">Desconto de ${descontoPercent(original, it.precoUnitario)}% neste item</span></div>` : ''}
      ${interno ? `<div class="pedido-item-interno">Custo ${money(it.custoMedioUsado)}/un. • custo total ${money(it.custoTotal)} • lucro ${money(it.lucroTotal)}${it.tipoEntrega === 'entrega_futura' ? ` • ${it.entregue ? 'entregue' : 'pendente'}` : ''}</div>` : ''}
    </div>
    <div class="pedido-qtd">${it.quantidade}×</div>
    <div class="pedido-item-valores">
      ${temDesconto ? `<del>${money(original)}</del>` : ''}
      <span class="un">${money(it.precoUnitario)} un.</span>
      <span class="tot">${money(it.totalItem)}</span>
    </div>
  </div>`;
}

function gerarPdf(carr, interno) {
  const p = state.profile || {};
  const itens = carr.itens || [];
  const pronta = itens.filter(i => i.tipoEntrega !== 'entrega_futura');
  const futura = itens.filter(i => i.tipoEntrega === 'entrega_futura');

  const statusPgtoNorm = normStatusPag(carr.statusPagamento);
  const statusPgto = statusPgtoNorm === 'pago' ? 'Pago' : statusPgtoNorm === 'parcial' ? 'Parcial' : 'Pendente';

  const totalItens = itens.reduce((s, it) => s + Number(it.quantidade || 0), 0);
  const dataStr = carr.finalizadoEm?.toDate ? carr.finalizadoEm.toDate().toLocaleDateString('pt-BR') : '-';
  const parcelamento = carr.parcelas > 1
    ? `${carr.parcelas}x de ${money((carr.totalPedido || 0) / carr.parcelas)}${carr.jurosPor === 'cliente' ? ' (juros por conta do cliente)' : ' (sem juros para o cliente)'}`
    : 'À vista';

  const totalOriginal = itens.reduce((s, i) => s + Number(i.precoOriginal || i.precoUnitario || 0) * i.quantidade, 0);
  const subtotalItens = itens.reduce((s, i) => s + Number(i.totalItem || 0), 0);
  const totalDescontoItens = totalOriginal - subtotalItens;
  const descontoPedido = Number(carr.descontoPedidoValor || 0);

  // Bloco de resumo estilo Amazon (sem "Enviar para" — a maioria é entrega em mãos):
  // Pedido | Pagamento | Resumo com subtotal, descontos e total geral.
  const resumoMini = `
    <div class="pedido-mini-line"><span>Subtotal (${totalItens} item${totalItens === 1 ? '' : 'ns'})</span><b>${money(totalDescontoItens > 0.004 ? totalOriginal : subtotalItens)}</b></div>
    ${totalDescontoItens > 0.004 ? `<div class="pedido-mini-line"><span>Desconto nos itens</span><b class="pedido-desc-tag">− ${money(totalDescontoItens)}</b></div>` : ''}
    ${descontoPedido > 0.004 ? `<div class="pedido-mini-line"><span>Desconto do pedido${carr.descontoPedido?.tipo === 'percent' ? ` (${carr.descontoPedido.valor}%)` : ''}</span><b class="pedido-desc-tag">− ${money(descontoPedido)}</b></div>` : ''}
    <div class="pedido-mini-line total"><span>Total geral</span><b>${money(carr.totalPedido)}</b></div>`;

  let html = `<section class="pdf-page pedido-pdf">
    <header class="pdf-header">
      <div class="pdf-brand">${esc(p.nomeNegocio || 'CRM de Vendas')}</div>
      <div class="pdf-sub">${interno ? 'PEDIDO INTERNO' : 'PEDIDO'}</div>
      <div class="pdf-consult">${esc(p.nome || '')}<br>${esc(p.whatsapp || '')}<br>${esc(p.instagram || '')}</div>
    </header>
    <main class="pdf-content" style="top:35mm;bottom:26mm;left:8mm;right:8mm">
      <div class="pedido-info-grid">
        <div class="pedido-info-col">
          <h4>Pedido${carr.numeroPedido ? ` Nº ${numeroPedidoLabel(carr)}` : ''}</h4>
          <p><b>${esc(carr.clienteNome)}</b></p>
          <p>Data: ${esc(dataStr)}</p>
          <p>${totalItens} item${totalItens === 1 ? '' : 'ns'}</p>
        </div>
        <div class="pedido-info-col">
          <h4>Forma de pagamento</h4>
          <p>${esc(carr.pagamento || 'A combinar')}${carr.cartaoTipo && carr.pagamento === 'Cartão' ? ` (${esc(carr.cartaoTipo)})` : ''}</p>
          <p>${esc(parcelamento)}</p>
          <p>Status: <b>${statusPgto}</b>${Number(carr.valorPago || 0) > 0.004 && statusPgtoNorm !== 'pago' ? ` — recebido ${money(carr.valorPago)}` : ''}</p>
        </div>
        <div class="pedido-info-col">
          <h4>Resumo do pedido</h4>
          ${resumoMini}
        </div>
      </div>`;

  if (pronta.length) {
    html += `<h3 class="pedido-section-title">Pronta entrega</h3>
      <div class="pedido-itens">${pronta.map(it => itemRowHtml(it, interno)).join('')}</div>`;
  }
  if (futura.length) {
    html += `<h3 class="pedido-section-title">Entrega futura</h3>
      <div class="pedido-itens">${futura.map(it => itemRowHtml(it, interno)).join('')}</div>`;
  }

  // Bloco de resultado só no PDF interno — o do cliente já tem tudo no resumo do topo.
  if (interno) {
    const venda = state.data.vendas.find(v => v.carrinhoId === carr.id);
    const custoCartao = venda ? Number(venda.custoCartao || 0) : calcCustoCartao(carr.totalPedido, carr.pagamento, carr.parcelas, jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, state.profile), state.profile, carr.cartaoTipo, carr.cartaoOperadoraId, carr.cartaoBandeiraGrupo).total;
    const lucroReal = venda?.lucroReal != null ? Number(venda.lucroReal) : carr.lucroTotal - custoCartao;
    html += `<div class="pedido-totais">
      <div class="pedido-total-line"><span>Resultado (interno)</span><b>${money(carr.totalPedido)}</b></div>
      <div class="pedido-total-line"><span>Custo total</span><b>${money(carr.custoTotal)}</b></div>
      <div class="pedido-total-line"><span>Lucro bruto</span><b>${money(carr.lucroTotal)}</b></div>
      ${custoCartao > 0 ? `<div class="pedido-total-line"><span>Custo de cartão/maquininha</span><b style="color:var(--error)">- ${money(custoCartao)}</b></div>` : ''}
      <div class="pedido-total-line"><span>Lucro real</span><b>${money(lucroReal)}</b></div>
      <div class="pedido-total-line"><span>Margem real</span><b>${carr.totalPedido ? ((lucroReal / carr.totalPedido) * 100).toFixed(1) : 0}%</b></div>
    </div>`;
  }

  if (carr.observacoes) {
    html += `<div class="pedido-obs"><b>Observações:</b> ${esc(carr.observacoes)}</div>`;
  }

  if (!interno) {
    html += `<div class="pedido-agradecimento">
      <p>${esc(p.mensagemPadrao || 'Obrigada pela preferência! 💕')}</p>
    </div>`;
  }

  html += `</main>
    <footer class="pdf-footer">
      <div class="pdf-foot-text"><b>${esc(p.nomeNegocio || 'CRM de Vendas')}</b><br>${esc(p.rodapeCatalogo || 'Fale comigo para fazer seu pedido')}</div>
    </footer>
  </section>`;

  $('printArea').innerHTML = html;
  setTimeout(() => window.print(), 350);
}
