import { state } from './state.js';

const templates = {
  aniversario: (nome) =>
    `Olá, ${nome}! Passando para te desejar um feliz aniversário! 🎉\nQue seu dia seja muito especial.`,
  contatoFrio: (nome) =>
    `Oi, ${nome}! Tudo bem?\nFaz um tempinho que não conversamos e lembrei de você.\nChegaram algumas novidades Farmasi. Quer que eu te envie?`,
  agenda: (nome, hora) =>
    `Oi, ${nome}! Passando para confirmar nosso atendimento de hoje às ${hora || ''}.`,
  posVenda: (nome) =>
    `Oi, ${nome}! Tudo certo com o produto que você recebeu?\nQueria saber se gostou e se precisa de alguma orientação de uso.`,
  resumoPedido: (nome, carrinho) => {
    const pronta = (carrinho.itens || []).filter(i => i.tipoEntrega !== 'entrega_futura');
    const futura = (carrinho.itens || []).filter(i => i.tipoEntrega === 'entrega_futura');
    const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    let msg = `Oi, ${nome}! Segue o resumo do seu pedido:\n\n`;
    if (pronta.length) {
      msg += `*Pronta entrega:*\n`;
      pronta.forEach(i => msg += `${i.quantidade}x ${i.produtoNome} - ${money(i.totalItem)}\n`);
      msg += '\n';
    }
    if (futura.length) {
      msg += `*Entrega futura:*\n`;
      futura.forEach(i => msg += `${i.quantidade}x ${i.produtoNome} - ${money(i.totalItem)}\n`);
      msg += '\n';
    }
    msg += `*Total: ${money(carrinho.totalPedido)}*\n`;
    msg += `Pagamento: ${carrinho.pagamento || 'A combinar'}`;
    return msg;
  },
  retorno: (nome, carrinho) => {
    const itens = (carrinho.itens || []).map(i => i.produtoNome).join(', ');
    return `Oi, ${nome}! Passando para saber como você está e se posso te ajudar com mais alguma coisa 💕\n${itens ? `Na sua última compra você levou: ${itens}.\n` : ''}Posso te mostrar novidades ou repor algo?`;
  }
};

export function formatPhone(tel) {
  const n = String(tel || '').replace(/\D/g, '');
  return n.startsWith('55') ? n : '55' + n;
}

export function openWhatsApp(telefone, mensagem = '') {
  const num = formatPhone(telefone);
  if (!num || num === '55') return;
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank');
}

// Serializa dados para uso seguro dentro de um atributo onclick="..." — as aspas duplas
// do JSON precisam virar &quot; senão fecham o atributo HTML e quebram o onclick.
export function onclickArg(data) {
  return JSON.stringify(data).replace(/"/g, '&quot;');
}

export function whatsAppBtn(telefone, context, data = {}) {
  if (!telefone) return '';
  const onclick = `App.sendWhatsApp('${context}',${onclickArg(data)})`;
  return `<button class="btn small green-btn" onclick="${onclick}" title="WhatsApp">💬</button>`;
}

export function sendWhatsApp(context, data) {
  const nome = data.nome || '';
  const telefone = data.telefone || data.whatsapp || '';
  let msg = '';
  switch (context) {
    case 'aniversario': msg = templates.aniversario(nome); break;
    case 'contatoFrio': msg = templates.contatoFrio(nome); break;
    case 'agenda': msg = templates.agenda(nome, data.hora); break;
    case 'posVenda': msg = templates.posVenda(nome); break;
    case 'resumoPedido': msg = templates.resumoPedido(nome, data.carrinho || {}); break;
    case 'retorno': msg = templates.retorno(nome, data.carrinho || {}); break;
    default: msg = `Oi, ${nome}!`;
  }
  openWhatsApp(telefone, msg);
}
