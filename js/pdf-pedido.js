import { state, carrinhoById, cliById } from './state.js';
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

// Benefícios não ficam salvos no item do carrinho — busca no cadastro atual do produto.
function beneficiosDoItem(it) {
  return state.data.produtos.find(p => p.id === it.produtoId)?.beneficios || '';
}

function linhaBeneficios(it, colspan) {
  const b = beneficiosDoItem(it);
  return b ? `<tr><td colspan="${colspan}" style="font-size:7pt;color:#666;font-style:italic;border-top:0;padding-top:0">${esc(b)}</td></tr>` : '';
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

  let html = `<section class="pdf-page pedido-pdf">
    <header class="pdf-header">
      <div class="pdf-brand">${esc(p.nomeNegocio || 'CRM de Vendas')}</div>
      <div class="pdf-sub">${interno ? 'PEDIDO INTERNO' : 'PEDIDO'}</div>
      <div class="pdf-consult">${esc(p.nome || '')}<br>${esc(p.whatsapp || '')}<br>${esc(p.instagram || '')}</div>
    </header>
    <main class="pdf-content" style="top:35mm;bottom:${interno ? '30' : '26'}mm;left:8mm;right:8mm">
      <div class="pedido-resumo">
        <div class="pedido-resumo-item"><small>Cliente</small><b>${esc(carr.clienteNome)}</b></div>
        <div class="pedido-resumo-item"><small>Data</small><b>${esc(dataStr)}</b></div>
        <div class="pedido-resumo-item"><small>Itens</small><b>${totalItens}</b></div>
        <div class="pedido-resumo-item"><small>Pagamento</small><b>${esc(carr.pagamento || 'A combinar')}</b></div>
        <div class="pedido-resumo-item"><small>Status pgto.</small><b>${statusPgto}</b></div>
        <div class="pedido-resumo-item"><small>Parcelamento</small><b>${esc(parcelamento)}</b></div>
      </div>`;

  const colspanPronta = interno ? 9 : 6;
  const colspanFutura = interno ? 7 : 6;

  if (pronta.length) {
    html += `<h3 class="pedido-section-title">Pronta Entrega</h3>
      <table class="pedido-table"><thead><tr>
        <th>Código</th><th>Produto</th><th>Qtd</th><th>Original</th><th>Preço Unit.</th><th>Total</th>
        ${interno ? '<th>Custo Unit.</th><th>Custo Total</th><th>Lucro</th>' : ''}
      </tr></thead><tbody>${pronta.map(it => {
        const original = Number(it.precoOriginal || it.precoUnitario || 0);
        const temDesconto = original > it.precoUnitario;
        return `<tr>
        <td>${esc(it.codigoFarmasi || '-')}</td>
        <td>${esc(it.produtoNome)}</td><td style="text-align:center">${it.quantidade}</td>
        <td style="text-align:right">${temDesconto ? money(original) : '-'}</td>
        <td style="text-align:right">${money(it.precoUnitario)}${temDesconto ? ` <span style="color:var(--success);font-weight:900">-${descontoPercent(original, it.precoUnitario)}%</span>` : ''}</td>
        <td style="text-align:right">${money(it.totalItem)}</td>
        ${interno ? `<td style="text-align:right">${money(it.custoMedioUsado)}</td>
          <td style="text-align:right">${money(it.custoTotal)}</td>
          <td style="text-align:right">${money(it.lucroTotal)}</td>` : ''}
      </tr>${linhaBeneficios(it, colspanPronta)}`;
      }).join('')}</tbody></table>`;
  }

  if (futura.length) {
    html += `<h3 class="pedido-section-title">Entrega Futura</h3>
      <table class="pedido-table"><thead><tr>
        <th>Código</th><th>Produto</th><th>Qtd</th><th>Original</th><th>Preço Unit.</th><th>Total</th>
        ${interno ? '<th>Status</th>' : ''}
      </tr></thead><tbody>${futura.map(it => {
        const original = Number(it.precoOriginal || it.precoUnitario || 0);
        const temDesconto = original > it.precoUnitario;
        return `<tr>
        <td>${esc(it.codigoFarmasi || '-')}</td>
        <td>${esc(it.produtoNome)}</td><td style="text-align:center">${it.quantidade}</td>
        <td style="text-align:right">${temDesconto ? money(original) : '-'}</td>
        <td style="text-align:right">${money(it.precoUnitario)}${temDesconto ? ` <span style="color:var(--success);font-weight:900">-${descontoPercent(original, it.precoUnitario)}%</span>` : ''}</td>
        <td style="text-align:right">${money(it.totalItem)}</td>
        ${interno ? `<td>${it.entregue ? 'Entregue' : 'Pendente'}</td>` : ''}
      </tr>${linhaBeneficios(it, colspanFutura)}`;
      }).join('')}</tbody></table>`;
  }

  const totalOriginal = itens.reduce((s, i) => s + Number(i.precoOriginal || i.precoUnitario || 0) * i.quantidade, 0);
  const totalDesconto = totalOriginal - itens.reduce((s, i) => s + i.totalItem, 0);

  html += `<div class="pedido-totais">
    ${totalDesconto > 0 ? `<div class="pedido-total-line"><span>Valor original</span><b>${money(totalOriginal)}</b></div>
      <div class="pedido-total-line"><span>Desconto</span><b style="color:var(--success)">- ${money(totalDesconto)} (-${descontoPercent(totalOriginal, totalOriginal - totalDesconto)}%)</b></div>` : ''}
    <div class="pedido-total-line"><span>Total do pedido</span><b>${money(carr.totalPedido)}</b></div>
    ${interno ? (() => {
      const venda = state.data.vendas.find(v => v.carrinhoId === carr.id);
      const custoCartao = venda ? Number(venda.custoCartao || 0) : calcCustoCartao(carr.totalPedido, carr.pagamento, carr.parcelas, jurosAutomatico(carr.totalPedido || 0, carr.parcelas || 1, state.profile), state.profile, carr.cartaoTipo).total;
      const lucroReal = venda?.lucroReal != null ? Number(venda.lucroReal) : carr.lucroTotal - custoCartao;
      return `<div class="pedido-total-line"><span>Custo total</span><b>${money(carr.custoTotal)}</b></div>
      <div class="pedido-total-line"><span>Lucro bruto</span><b>${money(carr.lucroTotal)}</b></div>
      ${custoCartao > 0 ? `<div class="pedido-total-line"><span>Custo de cartão/maquininha</span><b style="color:var(--error)">- ${money(custoCartao)}</b></div>` : ''}
      <div class="pedido-total-line"><span>Lucro real</span><b>${money(lucroReal)}</b></div>
      <div class="pedido-total-line"><span>Margem real</span><b>${carr.totalPedido ? ((lucroReal / carr.totalPedido) * 100).toFixed(1) : 0}%</b></div>`;
    })() : ''}
  </div>`;

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
