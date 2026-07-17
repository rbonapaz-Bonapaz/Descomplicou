import { state, functions, httpsCallable, toast } from './state.js';

// Ícone oficial do WhatsApp (bolha + fone), inline SVG — substitui o emoji 💬 em todos os botões.
export const WA_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-3px;flex:0 0 auto"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M12.004 4.6c-4.087 0-7.4 3.313-7.4 7.4 0 1.301.34 2.577.986 3.7L4.6 19.4l3.8-.997a7.37 7.37 0 0 0 3.604.94h.003c4.087 0 7.4-3.313 7.4-7.4s-3.313-7.343-7.403-7.343zm0 13.53a6.1 6.1 0 0 1-3.113-.85l-.223-.132-2.318.608.619-2.26-.146-.232a6.12 6.12 0 0 1-.94-3.264c0-3.38 2.75-6.13 6.13-6.13 3.38 0 6.13 2.75 6.13 6.13 0 3.38-2.75 6.13-6.14 6.13z"/><path fill="#fff" d="M15.188 13.746c-.163-.082-.965-.476-1.115-.53-.15-.055-.259-.082-.368.082-.109.163-.42.53-.516.639-.095.109-.19.123-.353.041-.163-.082-.688-.254-1.311-.809-.485-.432-.812-.966-.907-1.129-.095-.163-.01-.251.072-.333.074-.073.163-.19.245-.285.082-.096.109-.164.163-.273.055-.109.027-.204-.014-.286-.041-.082-.368-.885-.504-1.212-.133-.319-.269-.276-.368-.28h-.313c-.109 0-.286.041-.436.204-.15.163-.572.559-.572 1.363 0 .803.586 1.579.667 1.688.082.109 1.153 1.76 2.793 2.467.39.168.694.269.931.344.391.124.747.107 1.03.065.314-.047.965-.395 1.101-.777.136-.382.136-.708.095-.777-.041-.068-.15-.109-.313-.191z"/></svg>`;

const templates = {
  aniversario: (nome) =>
    `Olá, ${nome}! Passando para te desejar um feliz aniversário! 🎉\nQue seu dia seja muito especial.\n\nSeparei uma condição especial de presente pra você comemorar — quer que eu te mostre? 🎁`,
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
    if ((carrinho.descontoPedidoValor || 0) > 0.004) {
      msg += `Subtotal: ${money(carrinho.subtotalPedido)}\n`;
      msg += `Desconto: -${money(carrinho.descontoPedidoValor)} 🎁\n`;
    }
    msg += `*Total: ${money(carrinho.totalPedido)}*\n`;
    msg += `Pagamento: ${carrinho.pagamento || 'A combinar'}`;
    return msg;
  },
  retorno: (nome, carrinho) => {
    const itens = (carrinho.itens || []).map(i => i.produtoNome).join(', ');
    return `Oi, ${nome}! Passando para saber como você está e se posso te ajudar com mais alguma coisa 💕\n${itens ? `Na sua última compra você levou: ${itens}.\n` : ''}Posso te mostrar novidades ou repor algo?`;
  },
  linkPagamento: (nome, data) => {
    const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `Oi, ${nome}! Segue o link para pagamento do seu pedido${data.valor > 0.004 ? ` — valor de ${money(data.valor)}` : ''}:\n${data.link}`;
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
  return `<button class="btn small green-btn" onclick="${onclick}" title="WhatsApp">${WA_ICON}</button>`;
}

// Mapa dos contextos de relacionamento para os TEMPLATES aprovados na Meta (WhatsApp Cloud API).
// O `name` precisa bater EXATAMENTE com o nome do template criado e aprovado no painel da Meta, e a
// ordem de `params` precisa bater com as variáveis {{1}}, {{2}}... do corpo do template lá. Se você
// nomear os templates de outro jeito na Meta, ajuste os `name` aqui. Templates transacionais longos
// (resumo do pedido, link de pagamento) seguem no envio manual via wa.me — não entram na automação.
const WA_TEMPLATES = {
  aniversario:  { name: 'aniversario_cliente', lang: 'pt_BR', params: d => [d.nome || ''] },
  contatoFrio:  { name: 'contato_frio',        lang: 'pt_BR', params: d => [d.nome || ''] },
  agenda:       { name: 'confirmacao_agenda',  lang: 'pt_BR', params: d => [d.nome || '', d.hora || ''] },
  posVenda:     { name: 'pos_venda',           lang: 'pt_BR', params: d => [d.nome || ''] },
  retorno:      { name: 'retorno_cliente',     lang: 'pt_BR', params: d => [d.nome || ''] }
};

// Envio AUTOMÁTICO pela API oficial da Meta: dispara sozinho, sem abrir o WhatsApp e sem a
// consultora apertar "enviar". Só funciona depois que a WhatsApp Cloud API estiver configurada
// (token + ID do número como secrets da Cloud Function) e com o template correspondente aprovado na
// Meta — veja docs/whatsapp-cloud-api.md. Enquanto não estiver configurado, a function responde com
// erro claro e o fluxo manual via wa.me continua disponível como sempre.
export async function enviarWhatsAppAuto(context, data = {}) {
  const tpl = WA_TEMPLATES[context];
  if (!tpl) return toast('Esse tipo de mensagem ainda não tem envio automático — use o botão manual.');
  const telefone = data.telefone || data.whatsapp || '';
  if (!telefone) return toast('Cliente sem telefone cadastrado.');
  try {
    const enviar = httpsCallable(functions, 'enviarWhatsAppTemplate');
    await enviar({
      to: telefone,
      templateName: tpl.name,
      languageCode: tpl.lang,
      bodyParams: tpl.params(data)
    });
    toast('Mensagem enviada automaticamente pelo WhatsApp ✅');
  } catch (e) {
    toast('Não consegui enviar automático: ' + (e.message || 'erro desconhecido') + ' — envie manual pelo botão do WhatsApp.');
  }
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
    case 'linkPagamento': msg = templates.linkPagamento(nome, data); break;
    default: msg = `Oi, ${nome}!`;
  }
  openWhatsApp(telefone, msg);
}
