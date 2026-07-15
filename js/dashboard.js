import { state, salesAgg, stockAgg, lastBuy, lastSaleDate, openCarrinhosForClient, diasContatoFrio, nomeAtualDoCliente, planoInfo } from './state.js';
import { $, esc, money, today, daysToBirthday, daysSince, pill, formatBirthDate, ageOnNextBirthday, formatDateBR, porGenero } from './utils.js';
import { whatsAppBtn } from './whatsapp.js';
import { novosLeadsResumo, verificarNovosLeads, marcarLeadsVistos } from './eventos.js';
import { datasComemorativasResumo, carregarDatasComemorativas } from './datasComemorativas.js';

// Sub-render isolado (só o card de datas comemorativas) — mesmo padrão do renderLeadsBanner.
export function renderDatasComemorativas() {
  const box = $('datasComemorativas');
  if (box) box.innerHTML = datasComemorativasHtml();
}

function datasComemorativasHtml() {
  const lista = datasComemorativasResumo();
  if (lista === null) return '<p class="muted">Carregando...</p>';
  if (!lista.length) return '<p class="muted">Nenhuma data comemorativa nos próximos 30 dias.</p>';
  return lista.map(d => `<div class="list-item">
    <div><b>${esc(d.nome)}</b><small>${d.dataStr} • ${d.dias === 0 ? 'Hoje!' : d.dias === 1 ? 'Amanhã' : d.dias + ' dias'}</small></div>
    <span class="tag pink">🎁 Boa pra presente</span>
  </div>`).join('');
}

// Sub-render isolado (só o banner de leads) — chamado depois que verificarNovosLeads() termina,
// sem precisar recarregar o dashboard inteiro nem os dados do app.
export function renderLeadsBanner() {
  const box = $('leadsBanner');
  if (!box) return;
  box.innerHTML = leadsBannerHtml();
}

// Alerta de vencimento do plano: banner quando faltam 7 dias ou menos, com link direto pra
// renovar. Planos teste/gratuito nunca "vencem" por data (ver planoInfo em state.js), então nunca
// disparam esse aviso — só plano pago com premiumAte configurado.
function vencimentoBannerHtml() {
  const pi = planoInfo();
  if (pi.diasParaVencer == null || pi.diasParaVencer > 7) return '';
  const dias = pi.diasParaVencer;
  const texto = dias <= 0 ? 'Seu plano vence hoje!' : dias === 1 ? 'Seu plano vence amanhã!' : `Seu plano vence em ${dias} dias.`;
  return `<div class="panel" style="background:#FFF0F0;border:1px solid #F5A3A3;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>⏰ <b>${texto}</b> Renove pra não perder o acesso.</div>
      <button class="btn dark small" onclick="App.goto('perfil');App.setSection('perfil','plano')">Ir para Meu Plano</button>
    </div>
  </div>`;
}

function leadsBannerHtml() {
  const resumo = novosLeadsResumo();
  if (!resumo || !resumo.length) return '';
  return resumo.map(r => `<div class="panel" style="background:#FFF7E6;border:1px solid #F5C453;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>🎉 <b>${r.novos} novo${r.novos === 1 ? '' : 's'} lead${r.novos === 1 ? '' : 's'}</b> no evento "${esc(r.eventoNome)}" — alguém montou uma lista de desejos e ainda não foi atendido.</div>
      <button class="btn dark small" onclick="App.marcarLeadsVistos('${r.eventoId}')">Ver lista</button>
    </div>
  </div>`).join('');
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
function relogioStr() {
  const d = new Date();
  const dia = DIAS_SEMANA[d.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${d.toLocaleDateString('pt-BR')} • ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
// Atualiza o relógio do painel a cada segundo sem precisar re-renderizar a página inteira
// (renderDashboard só roda de novo quando os dados mudam de verdade).
setInterval(() => { const el = $('dashClock'); if (el) el.textContent = relogioStr(); }, 1000);

export function recommendations() {
  const s = stockAgg(), out = [];
  s.baixo.forEach(x => out.push(`<div class="list-item"><div><b>Repor ${esc(x.p.nome)}</b><small>Estoque ${x.est}, abaixo do mínimo</small></div><span class="tag orange">Repor</span></div>`));
  s.parados.forEach(x => out.push(`<div class="list-item"><div><b>Promover ${esc(x.p.nome)}</b><small>${daysSince(lastSaleDate(x.p))} dias sem venda</small></div><span class="tag pink">Promoção</span></div>`));
  s.sem.forEach(x => out.push(`<div class="list-item"><div><b>Corrigir custo</b><small>${esc(x.p.nome)}</small></div><span class="tag orange">Sem custo</span></div>`));

  const diasFrio = diasContatoFrio();
  const cold = state.data.clientes.filter(c => daysSince(lastBuy(c) || c.ultimoContato) >= diasFrio);
  if (cold.length) out.push(`<div class="list-item"><div><b>Chamar ${cold.length} cliente(s) frio(s)</b><small>${diasFrio}+ dias sem contato</small></div><span class="tag orange">Reaquecer</span></div>`);

  const agHoje = state.data.agendamentos.filter(a => a.data === today() && (a.status || 'agendado') === 'agendado');
  if (agHoje.length) out.push(`<div class="list-item"><div><b>Confirmar ${agHoje.length} agendamento(s) de hoje</b><small>Envie confirmação via WhatsApp</small></div><span class="tag blue">Confirmar</span></div>`);

  const carrPend = state.data.carrinhos.filter(c => c.status === 'aberto');
  if (carrPend.length) out.push(`<div class="list-item"><div><b>Finalizar ${carrPend.length} carrinho(s) pendente(s)</b><small>Carrinhos aguardando finalização</small></div><span class="tag blue">Finalizar</span></div>`);

  return out;
}

export function renderDashboard() {
  const r = salesAgg(30), s = stockAgg();
  const carrAbertos = state.data.carrinhos.filter(c => c.status === 'aberto');
  const entregasFuturas = state.data.carrinhos.filter(c =>
    (c.status === 'parcial' || c.status === 'finalizado') && c.itens?.some(i => i.tipoEntrega === 'entrega_futura' && !i.entregue)
  );

  const birth = state.data.clientes.map(c => ({ ...c, dias: daysToBirthday(c.nascimento) }))
    .filter(c => c.dias <= 30).sort((a, b) => a.dias - b.dias).slice(0, 5);

  const cold = state.data.clientes.map(c => ({ ...c, ds: daysSince(lastBuy(c) || c.ultimoContato) }))
    .filter(c => c.ds >= diasContatoFrio()).sort((a, b) => a.ds - b.ds).slice(0, 5);

  const agenda = state.data.agendamentos.filter(a => a.data === today()).slice(0, 4);

  const retornos = state.data.carrinhos.filter(c =>
    c.retornoDias > 0 && !c.retornoFeito && c.dataRetorno && c.dataRetorno <= today() &&
    (c.status === 'finalizado' || c.status === 'parcial' || c.status === 'entregue')
  ).sort((a, b) => String(a.dataRetorno).localeCompare(String(b.dataRetorno)));

  $('dashboard').innerHTML = `
    ${vencimentoBannerHtml()}
    <div id="leadsBanner">${leadsBannerHtml()}</div>
    <div class="hero">
      <p class="eyebrow">Seu dia hoje</p>
      <h2>Olá, ${esc((state.profile.nome || state.user.displayName || porGenero(state.profile?.genero, { f: 'Consultora', m: 'Consultor', x: 'Consultor(a)' })).split(' ')[0])}!</h2>
      <p class="muted" id="dashClock" style="margin:0 0 12px">${relogioStr()}</p>
      <div class="quick-grid three">
        <div class="quick-card pink" onclick="App.openNovoCarrinho()"><small>⚡ Ação rápida</small>Novo Carrinho</div>
        <div class="quick-card black" onclick="App.openClienteForm()"><small>Cadastrar</small>Novo Cliente</div>
        <div class="quick-card" onclick="App.openAgendamentoForm()"><small>Agendar</small>Atendimento</div>
      </div>
    </div>

    <div class="cards">
      <div class="card clickable" onclick="App.goto('vendas')"><span>Carrinhos abertos</span><b>${carrAbertos.length}</b></div>
      <div class="card clickable" onclick="App.goto('relatorios')"><span>Faturamento 30d</span><b>${money(r.fat)}</b></div>
      <div class="card clickable" onclick="App.goto('relatorios')"><span>Lucro 30d</span><b>${money(r.luc)}</b></div>
      <div class="card clickable" onclick="App.goto('estoque')"><span>Valor em estoque</span><b>${money(s.invest)}</b></div>
      <div class="card clickable" onclick="App.goto('estoque')"><span>Lucro potencial</span><b>${money(s.pot)} <span class="muted" style="font-size:11px;font-weight:700">(${s.invest ? (s.pot / s.invest * 100).toFixed(0) : 0}%)</span></b></div>
      <div class="card clickable" onclick="App.goto('vendas')"><span>Entregas futuras</span><b>${entregasFuturas.length}</b></div>
    </div>

    <div class="dash-grid">
      <div class="panel">
        <div class="panel-head"><h3>🎂 Aniversariantes próximos</h3><button class="linkbtn" onclick="App.goto('clientes')">Ver todos</button></div>
        <div class="list">${birth.length ? birth.map(c => {
          const dataStr = formatBirthDate(c.nascimento);
          const idade = ageOnNextBirthday(c.nascimento);
          return `<div class="list-item">
          <div>
            <b class="cli-link" onclick="App.openCliente360('${c.id}')">${esc(c.nome)}</b>
            <small>${dataStr ? dataStr + (idade != null ? ' • ' + idade + ' anos' : '') + ' • ' : ''}${c.dias === 0 ? 'Hoje!' : c.dias === 1 ? 'Amanhã' : c.dias + ' dias'}</small>
          </div>
          <div style="display:flex;gap:4px;align-items:center">
            <span class="tag pink">${c.dias <= 1 ? 'Prioridade' : 'Em breve'}</span>
            ${whatsAppBtn(c.whatsapp, 'aniversario', { nome: c.nome, telefone: c.whatsapp })}
            <button class="btn small" onclick="App.openCarrinhoForCliente('${c.id}')">🛒</button>
          </div>
        </div>`;
        }).join('') : '<p class="muted">Nenhum aniversário nos próximos 30 dias.</p>'}</div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>🎁 Datas comemorativas</h3></div>
        <div class="list" id="datasComemorativas">${datasComemorativasHtml()}</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>📅 Agenda de hoje</h3>
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn small" title="${state.profile?.googleCalendarId ? 'Sincronizar Google Agenda' : 'Conectar Google Agenda'}" onclick="${state.profile?.googleCalendarId ? 'App.importarDoGoogleAgenda()' : 'App.conectarGoogleAgendaUI()'}">🔄${state.profile?.googleCalendarId ? '' : ' Conectar Google Agenda'}</button>
            <button class="linkbtn" onclick="App.openAgendamentoForm()">Novo</button>
          </div>
        </div>
        <div class="list">${agenda.length ? agenda.map(a => {
          const cli = state.data.clientes.find(c => c.id === a.clienteId);
          return `<div class="list-item">
            <div>
              ${a.clienteId ? `<b class="cli-link" onclick="App.openCliente360('${a.clienteId}')">${esc(nomeAtualDoCliente(a.clienteId, a.clienteNome))}</b>` : `<b>${esc(a.clienteNome)}</b>`}
              <small>${esc(a.tipo)} • ${esc(a.hora || '')}</small>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              <span class="tag blue">${esc(a.status || 'agendado')}</span>
              ${whatsAppBtn(cli?.whatsapp, 'agenda', { nome: nomeAtualDoCliente(a.clienteId, a.clienteNome), telefone: cli?.whatsapp, hora: a.hora })}
              ${(a.status || 'agendado') === 'agendado' ? `<button class="btn small" onclick="App.concluirAgendamento('${a.id}')">✓</button>` : ''}
            </div>
          </div>`;
        }).join('') : '<p class="muted">Nenhum atendimento hoje.</p>'}</div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>⚠️ Contatos frios</h3><button class="linkbtn" onclick="App.goto('clientes')">Reaquecer</button></div>
        <div class="list">${cold.length ? cold.map(c => `<div class="list-item">
          <div>
            <b class="cli-link" onclick="App.openCliente360('${c.id}')">${esc(c.nome)}</b>
            <small>${lastBuy(c) ? 'Última compra: ' + formatDateBR(lastBuy(c)) : 'Sem compra registrada'}</small>
          </div>
          <div style="display:flex;gap:4px;align-items:center">
            <span class="tag orange">${c.ds} dias</span>
            ${whatsAppBtn(c.whatsapp, 'contatoFrio', { nome: c.nome, telefone: c.whatsapp })}
            <button class="btn small" onclick="App.marcarContatado('${c.id}')">✓</button>
            <button class="btn small" onclick="App.openCarrinhoForCliente('${c.id}')">🛒</button>
          </div>
        </div>`).join('') : '<p class="muted">Nenhum contato frio.</p>'}</div>
      </div>

      ${carrAbertos.length ? `<div class="panel">
        <div class="panel-head"><h3>🛒 Carrinhos pendentes</h3><button class="linkbtn" onclick="App.goto('vendas')">Ver todos</button></div>
        <div class="list">${carrAbertos.slice(0, 5).map(c => `<div class="list-item">
          <div>
            <b class="cli-link" onclick="App.openCarrinho('${c.id}')">${esc(nomeAtualDoCliente(c.clienteId, c.clienteNome))}</b>
            <small>${(c.itens || []).length} itens • ${money(c.totalPedido || 0)}</small>
          </div>
          <button class="btn small dark" onclick="App.openCarrinho('${c.id}')">Abrir</button>
        </div>`).join('')}</div>
      </div>` : ''}

      ${retornos.length ? `<div class="panel">
        <div class="panel-head"><h3>🔔 Retornos agendados</h3></div>
        <div class="list">${retornos.map(c => {
          const cli = state.data.clientes.find(cl => cl.id === c.clienteId);
          const atraso = daysSince(c.dataRetorno);
          const itensNomes = (c.itens || []).map(i => i.produtoNome).join(', ');
          return `<div class="list-item">
            <div>
              <b class="cli-link" onclick="App.openCliente360('${c.clienteId}')">${esc(nomeAtualDoCliente(c.clienteId, c.clienteNome))}</b>
              <small>${esc(itensNomes)} • ${atraso <= 0 ? 'previsto para hoje' : atraso + ' dia(s) de atraso'}</small>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${whatsAppBtn(cli?.whatsapp, 'retorno', { nome: nomeAtualDoCliente(c.clienteId, c.clienteNome), telefone: cli?.whatsapp, carrinho: c })}
              <button class="btn small" onclick="App.marcarRetornoFeito('${c.id}')">✓ Feito</button>
            </div>
          </div>`;
        }).join('')}</div>
      </div>` : ''}

      <div class="panel">
        <div class="panel-head"><h3>📦 Recomendações</h3><button class="linkbtn" onclick="App.goto('relatorios')">Ver relatórios</button></div>
        <div class="list">${recommendations().slice(0, 6).join('') || '<p class="muted">Nenhuma recomendação crítica.</p>'}</div>
      </div>
    </div>`;

  // Verifica leads novos só uma vez por sessão (novosLeadsResumo null = ainda não checado) — o
  // banner acima já ocupou o espaço vazio; quando o resultado chegar, renderLeadsBanner() atualiza
  // só essa div, sem recarregar o resto do dashboard.
  if (novosLeadsResumo() === null) verificarNovosLeads();

  // Mesmo padrão pro card de datas comemorativas — carrega uma vez por sessão (a BrasilAPI
  // precisa de rede) e só atualiza a div própria quando o resultado chega.
  if (datasComemorativasResumo() === null) carregarDatasComemorativas();
}
