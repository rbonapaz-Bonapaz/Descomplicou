import { state, SECTIONS, db, col, ref, setDoc, serverTimestamp, doc, getDocs, writeBatch, planoInfo, toast,
  auth, GoogleAuthProvider, EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, deleteUser } from './state.js';
import { $, esc, money, pill, fileToDataURL, sectionTabsHtml, formatDateBR, today, toggleHtml, toggleBareHtml, senhaInputHtml } from './utils.js';
import { biometriaDisponivel, temBiometriaAtiva } from './biometria.js';
import { ehLoginEmail, traduzErro } from './auth.js';
import { conectarGoogleAgenda, desconectarGoogleAgenda, googleAgendaConectada } from './googleAgenda.js';
import { importarDoGoogleAgenda } from './agenda.js';
import { gerarBeneficios } from './gemini.js';
import { CARDS_INTELIGENCIA, SECOES_RELATORIO, ordemSecoes, secaoAtiva, renderRelatorios } from './relatorios.js';
import { NOMES_DATAS_AUTOMATICAS, carregarDatasComemorativas } from './datasComemorativas.js';
import { renderOperadorasPanel } from './operadoras.js';

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function renderPerfil() {
  const p = state.profile || {};
  const foto = p.fotoPerfil || state.user?.photoURL || '';
  const sec = state.section.perfil;
  let html = sectionTabsHtml('perfil', SECTIONS.perfil, sec);

  if (sec === 'conta') {
    html += `<div class="panel">
      <h3>Minha Conta e personalização</h3>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <img id="perFotoPrev" src="${esc(foto)}" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;background:#EEF1F5;box-shadow:var(--ring)" onerror="this.style.visibility='hidden'">
        <div>
          <label class="btn dark small">Carregar foto<input type="file" accept="image/*" style="display:none" onchange="App.carregarFotoPerfil(this.files[0])"></label>
          ${p.fotoPerfil ? '<button class="btn ghost small" style="color:var(--error);margin-left:6px" onclick="App.removerFotoPerfil()">Remover</button>' : ''}
          <p class="muted" style="margin:6px 0 0;font-size:12px">JPG ou PNG. A imagem é reduzida automaticamente.</p>
        </div>
      </div>
      <div class="grid">
        <div class="field"><label>Nome</label><input id="perNome" value="${esc(p.nome || '')}"></div>
        <div class="field"><label>Nome do negócio</label><input id="perNegocio" value="${esc(p.nomeNegocio || 'CRM de Vendas')}"></div>
        <div class="field"><label>WhatsApp</label><input id="perWhats" value="${esc(p.whatsapp || '')}"></div>
        <div class="field"><label>Instagram</label><input id="perInsta" value="${esc(p.instagram || '')}"></div>
        <div class="field"><label>Gênero</label>
          <select id="perGenero">
            <option value="" ${!p.genero ? 'selected' : ''}>Não informado</option>
            <option value="Feminino" ${p.genero === 'Feminino' ? 'selected' : ''}>Feminino</option>
            <option value="Masculino" ${p.genero === 'Masculino' ? 'selected' : ''}>Masculino</option>
            <option value="Outro" ${p.genero === 'Outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="field"><label>Link loja/site para QR Code</label><input id="perLoja" value="${esc(p.linkLoja || '')}"></div>
        <div class="field"><label>Título catálogo</label><input id="perTitulo" value="${esc(p.tituloCatalogo || 'Catálogo Inteligente')}"></div>
        <div class="field"><label>Subtítulo</label><input id="perSub" value="${esc(p.subtituloCatalogo || 'GESTÃO DE PRODUTOS + PDF')}"></div>
        <div class="field full"><label>Rodapé</label><input id="perRodape" value="${esc(p.rodapeCatalogo || 'Fale comigo para fazer seu pedido')}"></div>
        <div class="field"><label>Dias sem contato para virar "cliente frio"</label><input id="perDiasFrio" type="number" min="1" value="${p.diasContatoFrio || 30}"></div>
        <div class="field"><label>Mostrar próximos dias na Agenda do Painel Inicial</label>
          <select id="perDiasAgenda">
            <option value="0" ${!p.diasAgendaPainel ? 'selected' : ''}>Não mostrar (só hoje)</option>
            <option value="3" ${p.diasAgendaPainel === 3 ? 'selected' : ''}>Próximos 3 dias</option>
            <option value="7" ${p.diasAgendaPainel === 7 ? 'selected' : ''}>Próximos 7 dias</option>
            <option value="15" ${p.diasAgendaPainel === 15 ? 'selected' : ''}>Próximos 15 dias</option>
          </select>
        </div>
        <div class="field full"><label>Mensagem padrão</label><textarea id="perMsg">${esc(p.mensagemPadrao || '')}</textarea></div>
      </div><br>
      <button class="btn dark" onclick="App.savePerfil()">Salvar</button>
    </div>

    <div class="panel">
      <h3>🎉 Datas comemorativas</h3>
      <p class="muted">Aparecem no Painel Inicial como sugestão de presente quando faltam 30 dias ou menos.</p>
      <p class="muted" style="margin-top:10px"><b>Importadas automaticamente:</b> ${NOMES_DATAS_AUTOMATICAS.join(', ')}, além dos feriados nacionais do ano (buscados automaticamente, variam ano a ano).</p>
      <div class="toolbar" style="margin-top:14px">
        <input id="novaDataNome" placeholder="Nome (ex: Aniversário da loja)">
        <select id="novaDataDia">${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<option value="${d}">${d}</option>`).join('')}</select>
        <select id="novaDataMes">${MESES_NOME.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
        <select id="novaDataAno" title="Deixe em 'Todo ano' pra repetir anualmente (ex: aniversário), ou escolha um ano específico pra uma data que só acontece uma vez">
          <option value="">Todo ano</option>
          ${Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
        <button class="btn dark" id="btnSalvarDataComemorativa" onclick="App.adicionarDataComemorativa()">+ Adicionar data</button>
        <button class="btn ghost hidden" id="btnCancelarEdicaoData" onclick="App.cancelarEdicaoDataComemorativa()">Cancelar edição</button>
      </div>
      ${(p.datasComemorativasCustom || []).length ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">${[...(p.datasComemorativasCustom || [])].sort((a, b) => a.mes - b.mes || a.dia - b.dia).map(d => `
        <span class="chip" style="display:inline-flex;align-items:center;gap:8px">
          ${esc(d.nome)} — ${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}${d.ano ? `/${d.ano}` : ''}
          <button style="border:0;background:none;cursor:pointer;font-weight:900" onclick="App.editarDataComemorativa('${esc(d.nome)}')" title="Editar">✏️</button>
          <button style="border:0;background:none;cursor:pointer;color:var(--error);font-weight:900" onclick="App.removerDataComemorativa('${esc(d.nome)}')" title="Remover">✗</button>
        </span>`).join('')}</div>` : '<p class="muted" style="margin-top:12px">Nenhuma data personalizada cadastrada ainda.</p>'}
    </div>

    <div class="panel">
      <h3>📅 Sincronizar com Google Agenda</h3>
      <p class="muted">Cria um calendário dedicado na sua conta Google com o nome que você escolher, e espelha lá os agendamentos criados/editados no CRM. A conexão dura cerca de 1h por vez — se parar de sincronizar, é só clicar em "Reconectar".</p>
      <div class="grid">
        <div class="field full"><label>Nome da agenda no Google</label><input id="perNomeAgendaGoogle" value="${esc(p.nomeAgendaGoogle || `Agenda - ${p.nomeNegocio || 'CRM de Vendas'}`)}"></div>
      </div><br>
      ${p.googleCalendarId
      ? `<span class="pill green">✓ Conectada</span>
          <button class="btn small" style="margin-left:8px" onclick="App.conectarGoogleAgendaUI()">🔄 Reconectar</button>
          <button class="btn small ghost" style="color:var(--error);margin-left:8px" onclick="App.desconectarGoogleAgendaUI()">Desconectar</button>`
      : `<button class="btn dark" onclick="App.conectarGoogleAgendaUI()">🔗 Conectar Google Agenda</button>`}
    </div>

    <div class="panel">
      <h3>✨ Assistente de IA (Gemini)</h3>
      <p class="muted">Cole sua própria chave de API do Gemini para usar o botão "✨ Gerar com IA" no cadastro de produtos (sugere benefícios a partir do nome) e o botão "🤖 Gerar Sugestão de Abordagem" no Cliente 360 (sugere uma mensagem de WhatsApp personalizada com base no histórico da cliente). A chave fica salva só na sua conta e a chamada é feita direto do seu navegador para o Google — não passa por nenhum servidor nosso.</p>
      <div class="grid">
        <div class="field full"><label>Chave de API do Gemini</label><input type="password" id="perGeminiKey" placeholder="Cole aqui sua chave" value="${esc(p.geminiApiKey || '')}"></div>
      </div>
      <p class="muted" style="font-size:12px">Não tem uma chave? Crie gratuitamente em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</p>
      <button class="btn dark" onclick="App.salvarGeminiKey()">Salvar chave</button>
      ${p.geminiApiKey ? '<span class="pill green" style="margin-left:8px">✓ Configurada</span>' : ''}
    </div>`;
  }

  if (sec === 'pagamento') {
    html += `<div class="panel">
      <h3>Pagamento</h3>
      <p class="muted">Máximo de parcelas, juro cobrado da cliente, custo da maquininha e link de cobrança agora ficam no cadastro de cada <b>operadora</b> (abaixo) — quem assume o juro em cada venda é escolhido direto no carrinho. Aqui só fica o checkout automático da InfinitePay.</p>
      <div class="grid">
        <div class="field"><label>Handle da InfinitePay (@usuário)</label><input id="perInfinitePayHandle" placeholder="Ex: minhaloja" value="${esc(p.infinitePayHandle || '')}"></div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:8px">O handle da InfinitePay (o @usuário da sua conta de recebedor) libera o botão "💳 Gerar cobrança InfinitePay" no carrinho — gera um link/QR Code de pagamento de verdade e confirma sozinho quando a cliente pagar.</p><br>
      <button class="btn dark" onclick="App.savePerfil()">Salvar</button>
    </div>

    ${renderOperadorasPanel()}`;
  }

  if (sec === 'plano') {
    html += `<div class="panel">
      <h3>Meu plano</h3>
      ${planoBox()}
    </div>`;
  }

  if (sec === 'relatorios') {
    const cfg = p.relCardsAtivos || {};
    html += `<div class="panel">
      <h3>Cards de Inteligência</h3>
      <p class="muted">Escolha quais indicadores avançados aparecem na tela de Relatórios. Todos vêm ativados por padrão.</p>
      <div class="grid" style="margin-top:8px">
        ${CARDS_INTELIGENCIA.map(c => `<div class="field">
          ${toggleHtml('relCard_' + c.key, cfg[c.key] !== false, `App.salvarConfigRelatorios('${c.key}',this.checked)`, c.label)}
          <small class="muted">${esc(c.desc)}</small>
        </div>`).join('')}
      </div>
    </div>

    <div class="panel">
      <h3>Seções do relatório</h3>
      <p class="muted">Escolha quais seções aparecem e em que ordem — arraste pelo ☰ para reorganizar. Todas vêm ativadas por padrão.</p>
      <div id="relSecoesLista" style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${secoesListaHtml()}</div>
    </div>`;
  }

  if (sec === 'baseColetiva') {
    const ultimaSinc = p.baseColetivaUltimaSincronizacao?.toDate ? formatDateBR(p.baseColetivaUltimaSincronizacao.toDate().toISOString().slice(0, 10)) + ' às ' + p.baseColetivaUltimaSincronizacao.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'nunca';
    html += `<div class="panel">
      <h3>Base coletiva de produtos</h3>
      <p class="muted">Ative para usar a base de produtos publicada pela administração como ponto de partida (nome, código, linha, foto e preço de tabela). Seu preço de venda, custo médio e estoque continuam sempre individuais.</p>
      ${toggleHtml('perBaseColetiva', p.usaBaseColetiva, 'App.toggleBaseColetiva(this.checked)', 'Usar base coletiva do Administrador')}
      ${p.usaBaseColetiva ? `<div class="alert-box" style="margin-top:12px">⚠️ O preço da base coletiva pode divergir do site da Farmasi — o site muda o preço com frequência, e a atualização aqui depende de quando a administração publicou a base.</div>
        <p class="muted" style="margin-top:8px">Última sincronização: <b>${ultimaSinc}</b></p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <button class="btn dark" onclick="App.sincronizarBaseColetiva()">🔄 Sincronizar agora</button>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
          ${toggleHtml('perAutoSync', p.baseColetivaAutoSync, 'App.salvarAutoSyncBaseColetiva(this.checked)', 'Sincronizar automaticamente todo dia')}
          <p class="muted" style="margin:6px 0 0;font-size:12px">Só sincroniza sozinho quando você abrir o CRM depois do horário escolhido (o app não roda em segundo plano com a tela fechada).</p>
          <div class="field" style="max-width:160px;margin-top:8px"><label>Horário</label><input type="time" id="perAutoSyncHora" value="${esc(p.baseColetivaAutoSyncHora || '08:00')}" onchange="App.salvarAutoSyncBaseColetiva(document.getElementById('perAutoSync').checked)"></div>
        </div>` : ''}
    </div>`;
  }

  if (sec === 'seguranca') {
    html += `${!ehLoginEmail() ? `<div class="panel">
      <h3>Criar senha de acesso</h3>
      <p class="muted">Sua conta usa login pelo Google. Crie uma senha para também poder entrar com e-mail e senha (recomendado por segurança).</p>
      <div class="grid">
        ${senhaInputHtml('perSenhaGoogleNova', 'Nova senha')}
        ${senhaInputHtml('perSenhaGoogleConfirma', 'Confirmar nova senha')}
      </div>
      <p class="muted" style="font-size:12px">Mínimo 8 caracteres, com número e caractere especial.</p><br>
      <button class="btn dark" onclick="App.criarSenhaGoogle()">Criar senha</button>
    </div>` : `<div class="panel">
      <h3>Alterar senha</h3>
      <div class="grid">
        ${senhaInputHtml('perSenhaAtual', 'Senha atual')}
        ${senhaInputHtml('perSenhaNova', 'Nova senha')}
        ${senhaInputHtml('perSenhaConfirma', 'Confirmar nova senha')}
      </div><br>
      <button class="btn dark" onclick="App.alterarSenha()">Alterar senha</button>
    </div>`}

    <div class="panel">
      <h3>Segurança do aparelho</h3>
      <p class="muted">Trava adicional neste navegador/aparelho: pede sua biometria (digital, Face ID ou Windows Hello) toda vez que o CRM abrir. Não substitui seu login — é um cadeado a mais, como em apps bancários.</p>
      <div id="bioSecBox"><p class="muted">Verificando disponibilidade...</p></div>
    </div>

    <div class="panel">
      <h3>🔢 Numeração de pedidos</h3>
      <p class="muted">Cada pedido novo já recebe um número sequencial + um sufixo exclusivo do cliente (ex: "1042-01" na 1ª compra dela, "-02" na 2ª) no momento em que a venda é finalizada. Pedidos antigos, feitos antes desse recurso, ainda não têm número — rode uma vez para numerá-los em ordem de finalização da venda. Ação segura, pode rodar quantas vezes quiser.</p>
      <button class="btn" onclick="App.migrarNumeracaoPedidos()">Numerar pedidos antigos</button>
    </div>

    <div class="panel">
      <h3>💾 Backup dos meus dados</h3>
      <p class="muted">Baixa um arquivo JSON com todos os seus dados (clientes, produtos, vendas, agenda, estoque e demais cadastros) — guarde em algum lugar seguro de vez em quando, como uma cópia extra. Usa só os dados já carregados na tela, sem gastar leituras extras do banco.</p>
      <button class="btn" onclick="App.exportarBackupCompleto()">📥 Baixar backup completo</button>
    </div>

    <div class="panel">
      <h3>♻️ Restaurar estoque de um backup</h3>
      <p class="muted">Se você apagou o estoque por engano (ou precisa reverter para um estado anterior), suba aqui o arquivo JSON baixado em "Backup dos meus dados". Só a quantidade em estoque e o custo médio de cada produto são restaurados (por código Farmasi, com fallback por nome) — nada mais é alterado.</p>
      <input type="file" id="restaurarEstoqueArquivo" accept="application/json">
      <button class="btn" style="margin-top:8px" onclick="App.restaurarEstoqueDoBackup()">♻️ Restaurar estoque deste arquivo</button>
    </div>

    <div class="panel" style="border:1px solid #FBE4E4">
      <h3 style="color:var(--error)">♻️ Restaurar backup completo</h3>
      <p class="muted">Restaura clientes, produtos, vendas, carrinhos, agenda, movimentações de estoque, catálogos, eventos, trocas, pré-encomendas e despesas — tudo exatamente como estava no arquivo. Registros apagados desde o backup voltam a existir; registros que mudaram são sobrescritos por completo. Nada criado depois do backup é apagado. Use com cuidado.</p>
      <input type="file" id="restaurarBackupArquivo" accept="application/json">
      <button class="btn ghost" style="margin-top:8px;color:var(--error);border-color:var(--error)" onclick="App.restaurarBackupCompleto()">♻️ Restaurar backup completo deste arquivo</button>
    </div>

    <div class="panel" style="border:1px solid #FBE4E4">
      <h3 style="color:var(--error)">Zona de risco</h3>
      <p class="muted">Ações irreversíveis. Cada botão pede confirmação por digitação antes de executar. Seu login e plano nunca são afetados.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost" style="color:var(--error)" onclick="App.apagarEstoque()">🗑️ Apagar todo o estoque</button>
        <button class="btn ghost" style="color:var(--error)" onclick="App.apagarClientes()">🗑️ Apagar base de clientes</button>
        <button class="btn ghost" style="color:var(--error)" onclick="App.apagarVendas()">🗑️ Apagar vendas</button>
        <button class="btn ghost" style="color:var(--error)" onclick="App.zerarMeusDados()">🗑️ Zerar todos os meus dados</button>
      </div>
    </div>

    <div class="panel" style="border:1px solid #FBE4E4;background:#FFF8F8">
      <h3 style="color:var(--error)">Excluir minha conta</h3>
      <p class="muted">Diferente da "Zona de risco" acima, isto apaga sua conta por completo (LGPD — Direito de Eliminação): clientes, produtos, agenda, estoque e demais dados pessoais são apagados; o histórico de vendas é mantido anonimizado (sem nome de cliente) por exigência fiscal; e seu login é removido para sempre. Vai pedir para confirmar sua senha/Google antes de executar.</p>
      <button class="btn ghost" style="color:var(--error);border-color:var(--error)" onclick="App.excluirMinhaConta()">⚠️ Excluir minha conta definitivamente</button>
    </div>`;
  }

  $('perfil').innerHTML = html;
  if (sec === 'seguranca') renderBioSecurityBox();
}

// Link de indicação: leva o próprio uid como código — simples, sem precisar de um registro
// separado de códigos, e cada consultora só tem um link mesmo (o dela).
function linkIndicacao() {
  return location.origin + location.pathname.replace(/index\.html$/, '') + `?ref=${state.user.uid}`;
}

export function copiarLinkIndicacao() {
  const input = $('perLinkIndicacao');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(
    () => toast('Link de indicação copiado!'),
    () => { input.select(); toast('Selecione e copie o link (Ctrl+C)'); }
  );
}

function planoBox() {
  const pi = planoInfo();
  const cfg = state.config || {};
  const planoLabel = { teste: 'Teste grátis', gratuito: 'Gratuito', mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual', vencido: 'Vencido', cancelado: 'Cancelado' }[pi.plano] || pi.plano;
  const badgeColor = pi.vencido ? 'red' : pi.isTeste ? 'blue' : pi.isGratuito ? 'orange' : 'green';

  let usoHtml = '';
  if (pi.ilimitado && (pi.isTeste || pi.isGratuito)) {
    usoHtml = `<div style="margin-top:10px"><small class="muted">${pi.clientesUsados} clientes · limite ilimitado</small></div>`;
  } else if (pi.isTeste || pi.isGratuito) {
    const pct = Math.min(100, Math.round((pi.clientesUsados / pi.limite) * 100));
    usoHtml = `<div style="margin-top:10px">
      <small class="muted">${pi.clientesUsados} de ${pi.limite} clientes usados</small>
      <div style="background:#EEF1F5;border-radius:999px;height:10px;margin-top:4px;overflow:hidden">
        <div style="background:${pct >= 100 ? 'var(--error)' : 'var(--p)'};width:${pct}%;height:100%"></div>
      </div>
    </div>`;
  }

  return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${pill(planoLabel, badgeColor)}
      ${pi.premiumAte ? `<small class="muted">Válido até ${formatDateBR(pi.premiumAte)}</small>` : ''}
    </div>
    ${usoHtml}
    ${pi.vencido ? '<div class="alert-box" style="margin-top:10px">Seu plano está vencido. Fale com a administração para renovar.</div>' : ''}
    ${pi.atingiuLimite ? '<div class="alert-box" style="margin-top:10px">Limite de clientes do plano teste atingido.</div>' : ''}
    ${cfg.ipcaPercentual && cfg.ipcaData ? `<div class="alert-box" style="margin-top:10px;background:#FFF7E6;border-color:#F5C453;color:#8A6100">📢 Aviso de reajuste: os preços dos planos terão um ajuste de ${esc(String(cfg.ipcaPercentual))}% (IPCA) a partir de ${formatDateBR(cfg.ipcaData)}.</div>` : ''}
    ${state.profile?.ultimoMesGanhoIndicacao ? `<div class="alert-box" style="margin-top:10px;background:#E6F7EE;border-color:#0E9F6E;color:#0E9F6E">🎉 Você ganhou 30 dias de plano por indicar ${esc(state.profile.ultimoMesGanhoIndicacao.indicadoNome || 'uma nova consultora')}!</div>` : ''}
    ${cfg.promocaoIndicacaoAtiva ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
      <small class="muted" style="text-transform:uppercase;font-weight:900;letter-spacing:.08em">Indique e ganhe</small>
      <p class="muted" style="margin:4px 0 8px">Compartilhe seu link — quando a pessoa indicada virar plano pago, você ganha 30 dias a mais de graça.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="perLinkIndicacao" readonly value="${esc(linkIndicacao())}" style="flex:1;min-width:200px">
        <button class="btn dark small" onclick="App.copiarLinkIndicacao()">📋 Copiar link</button>
      </div>
    </div>` : ''}
    <div style="margin-top:14px">
      <small class="muted" style="text-transform:uppercase;font-weight:900;letter-spacing:.08em">Tabela de preços (referência)</small>
      <div class="grid" style="margin-top:8px">
        <div class="card"><span>Mensal</span><b>${money(cfg.precoMensal || 0)}</b></div>
        <div class="card"><span>Semestral</span><b>${money(cfg.precoSemestral || 0)}</b>${descontoVsMensal(cfg.precoMensal, cfg.precoSemestral, 6)}</div>
        <div class="card"><span>Anual</span><b>${money(cfg.precoAnual || 0)}</b>${descontoVsMensal(cfg.precoMensal, cfg.precoAnual, 12)}</div>
      </div>
    </div>`;
}

// % de desconto do plano em relação ao mensal, comparando o equivalente mensal (preço do plano
// dividido pelos meses que ele cobre) com o preço do plano mensal avulso.
function descontoVsMensal(precoMensal, precoPlano, meses) {
  const m = Number(precoMensal || 0), p = Number(precoPlano || 0);
  if (!m || !p) return '';
  const equivalenteMensal = p / meses;
  const desconto = Math.round((1 - equivalenteMensal / m) * 100);
  if (desconto <= 0) return '';
  return `<span class="tag green" style="font-size:10px;padding:2px 6px;margin-top:4px">-${desconto}% vs. mensal</span>`;
}

async function renderBioSecurityBox() {
  const box = $('bioSecBox');
  if (!box) return;
  const disponivel = await biometriaDisponivel();
  if (!box) return; // pode ter navegado para outra página nesse meio-tempo
  if (!disponivel) {
    box.innerHTML = '<p class="muted">Biometria não disponível neste navegador/aparelho.</p>';
    return;
  }
  const ativa = temBiometriaAtiva(state.user.uid);
  box.innerHTML = ativa
    ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="pill green">Ativa neste aparelho</span>
        <button class="btn ghost small" style="color:var(--error)" onclick="App.desativarBiometria();App.renderPerfil()">Desativar</button>
      </div>`
    : `<button class="btn dark" onclick="App.ativarBiometria().then(()=>App.renderPerfil())">🔒 Ativar biometria neste aparelho</button>`;
}

export async function savePerfil() {
  const p = state.profile || {};
  const parseNum = v => Number(String(v ?? 0).replace(',', '.')) || 0;
  const d = {
    nome: $('perNome')?.value ?? p.nome ?? '',
    nomeNegocio: $('perNegocio')?.value ?? p.nomeNegocio ?? 'CRM de Vendas',
    whatsapp: $('perWhats')?.value ?? p.whatsapp ?? '',
    instagram: $('perInsta')?.value ?? p.instagram ?? '',
    genero: $('perGenero')?.value ?? p.genero ?? '',
    linkLoja: $('perLoja')?.value ?? p.linkLoja ?? '',
    tituloCatalogo: $('perTitulo')?.value ?? p.tituloCatalogo ?? 'Catálogo Inteligente',
    subtituloCatalogo: $('perSub')?.value ?? p.subtituloCatalogo ?? 'GESTÃO DE PRODUTOS + PDF',
    rodapeCatalogo: $('perRodape')?.value ?? p.rodapeCatalogo ?? 'Fale comigo para fazer seu pedido',
    diasContatoFrio: $('perDiasFrio') ? Number($('perDiasFrio').value || 30) : (p.diasContatoFrio || 30),
    diasAgendaPainel: $('perDiasAgenda') ? Number($('perDiasAgenda').value || 0) : (p.diasAgendaPainel || 0),
    mensagemPadrao: $('perMsg')?.value ?? p.mensagemPadrao ?? '',
    infinitePayHandle: ($('perInfinitePayHandle')?.value ?? p.infinitePayHandle ?? '').trim().replace(/^@/, ''),
    atualizadoEm: serverTimestamp()
  };
  await setDoc(doc(db, 'users', state.user.uid), d, { merge: true });
  state.profile = { ...state.profile, ...d };
  window.App.refresh('Personalização salva');
}

export async function carregarFotoPerfil(file) {
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file, 400, 0.8);
    const prev = $('perFotoPrev');
    if (prev) { prev.src = dataUrl; prev.style.visibility = 'visible'; }
    await setDoc(doc(db, 'users', state.user.uid), { fotoPerfil: dataUrl, atualizadoEm: serverTimestamp() }, { merge: true });
    state.profile = { ...state.profile, fotoPerfil: dataUrl };
    window.App.refresh('Foto atualizada');
  } catch (e) {
    toast('Não foi possível carregar a foto: ' + e.message);
  }
}

export async function removerFotoPerfil() {
  await setDoc(doc(db, 'users', state.user.uid), { fotoPerfil: '', atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, fotoPerfil: '' };
  window.App.refresh('Foto removida');
}

export async function conectarGoogleAgendaUI() {
  const nome = $('perNomeAgendaGoogle')?.value.trim() || `Agenda - ${state.profile?.nomeNegocio || 'CRM de Vendas'}`;
  try {
    await conectarGoogleAgenda(nome);
    await importarDoGoogleAgenda();
    window.App.refresh('Google Agenda conectada e sincronizada nos dois sentidos!');
  } catch (e) {
    toast('Não foi possível conectar: ' + e.message);
  }
}

export async function desconectarGoogleAgendaUI() {
  if (!confirm('Desconectar o Google Agenda? Os agendamentos já criados lá não são apagados.')) return;
  await desconectarGoogleAgenda();
  window.App.refresh('Google Agenda desconectada');
}

export async function salvarGeminiKey() {
  const key = $('perGeminiKey').value.trim();
  await setDoc(doc(db, 'users', state.user.uid), { geminiApiKey: key, atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, geminiApiKey: key };
  window.App.refresh(key ? 'Chave do Gemini salva' : 'Chave removida');
}

export async function salvarConfigRelatorios(key, ativo) {
  const atual = { ...(state.profile?.relCardsAtivos || {}), [key]: ativo };
  await setDoc(doc(db, 'users', state.user.uid), { relCardsAtivos: atual, atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, relCardsAtivos: atual };
  renderRelatorios();
  toast(ativo ? 'Card ativado' : 'Card desativado');
}

// Lista arrastável das seções do relatório (drag-and-drop nativo do navegador, sem biblioteca).
function secoesListaHtml() {
  return ordemSecoes().map(key => {
    const def = SECOES_RELATORIO.find(s => s.key === key);
    if (!def) return '';
    return `<div class="list-item" draggable="true" data-key="${key}"
      ondragstart="App.relSecaoDragStart(event)" ondragover="event.preventDefault()" ondrop="App.relSecaoDrop(event)"
      style="cursor:grab">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--muted)" title="Arraste para reordenar">☰</span>
        <b>${esc(def.label)}</b>
      </div>
      ${toggleBareHtml('relSecao_' + key, secaoAtiva(key), `App.salvarSecaoRelatorioAtiva('${key}',this.checked)`)}
    </div>`;
  }).join('');
}

let relDragKey = null;
export function relSecaoDragStart(ev) {
  relDragKey = ev.currentTarget.dataset.key;
  ev.dataTransfer.effectAllowed = 'move';
}

export async function relSecaoDrop(ev) {
  ev.preventDefault();
  const targetKey = ev.currentTarget.dataset.key;
  if (!relDragKey || relDragKey === targetKey) return;
  const ordem = ordemSecoes().filter(k => k !== relDragKey);
  const idx = ordem.indexOf(targetKey);
  ordem.splice(idx, 0, relDragKey);
  relDragKey = null;
  await setDoc(doc(db, 'users', state.user.uid), { relSecoesOrdem: ordem, atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, relSecoesOrdem: ordem };
  renderRelatorios();
  const box = $('relSecoesLista');
  if (box) box.innerHTML = secoesListaHtml();
}

export async function salvarSecaoRelatorioAtiva(key, ativo) {
  const atual = { ...(state.profile?.relSecoesAtivas || {}), [key]: ativo };
  await setDoc(doc(db, 'users', state.user.uid), { relSecoesAtivas: atual, atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, relSecoesAtivas: atual };
  renderRelatorios();
  toast(ativo ? 'Seção ativada' : 'Seção desativada');
}

export async function toggleBaseColetiva(v) {
  await setDoc(doc(db, 'users', state.user.uid), { usaBaseColetiva: v, atualizadoEm: serverTimestamp() }, { merge: true });
  state.profile = { ...state.profile, usaBaseColetiva: v };
  window.App.refresh(v ? 'Base coletiva ativada' : 'Base coletiva desativada');
}

// Nome original da data em edição (null = modo "adicionar nova"). Guardado à parte porque o nome
// pode ser alterado no próprio formulário — precisa saber qual entrada substituir na gravação.
let editandoDataComemorativaNome = null;

export function editarDataComemorativa(nome) {
  const d = (state.profile?.datasComemorativasCustom || []).find(x => x.nome === nome);
  if (!d) return;
  editandoDataComemorativaNome = nome;
  if ($('novaDataNome')) $('novaDataNome').value = d.nome;
  if ($('novaDataDia')) $('novaDataDia').value = String(d.dia);
  if ($('novaDataMes')) $('novaDataMes').value = String(d.mes);
  if ($('novaDataAno')) $('novaDataAno').value = d.ano ? String(d.ano) : '';
  if ($('btnSalvarDataComemorativa')) $('btnSalvarDataComemorativa').textContent = '✓ Salvar edição';
  $('btnCancelarEdicaoData')?.classList.remove('hidden');
  $('novaDataNome')?.focus();
}

export function cancelarEdicaoDataComemorativa() {
  editandoDataComemorativaNome = null;
  if ($('novaDataNome')) $('novaDataNome').value = '';
  if ($('novaDataAno')) $('novaDataAno').value = '';
  if ($('btnSalvarDataComemorativa')) $('btnSalvarDataComemorativa').textContent = '+ Adicionar data';
  $('btnCancelarEdicaoData')?.classList.add('hidden');
}

export async function adicionarDataComemorativa() {
  const nome = ($('novaDataNome')?.value || '').trim();
  if (!nome) return toast('Digite o nome da data');
  const dia = Number($('novaDataDia')?.value || 0);
  const mes = Number($('novaDataMes')?.value || 0);
  const ano = Number($('novaDataAno')?.value || 0) || null; // null = repete todo ano
  const atuais = state.profile?.datasComemorativasCustom || [];
  const editando = editandoDataComemorativaNome;
  // Duplicidade de nome só é problema contra as OUTRAS datas (a própria, em edição, pode manter o nome)
  if (atuais.some(d => d.nome.toLowerCase() === nome.toLowerCase() && d.nome !== editando)) return toast('Já existe uma data com esse nome');
  const entrada = { nome, dia, mes, ...(ano ? { ano } : {}) };
  const novas = editando ? atuais.map(d => d.nome === editando ? entrada : d) : [...atuais, entrada];
  await setDoc(doc(db, 'users', state.user.uid), { datasComemorativasCustom: novas }, { merge: true });
  state.profile = { ...state.profile, datasComemorativasCustom: novas };
  cancelarEdicaoDataComemorativa();
  await carregarDatasComemorativas();
  window.App.refresh(`Data "${nome}" ${editando ? 'atualizada' : 'adicionada'}`);
}

export async function removerDataComemorativa(nome) {
  const novas = (state.profile?.datasComemorativasCustom || []).filter(d => d.nome !== nome);
  await setDoc(doc(db, 'users', state.user.uid), { datasComemorativasCustom: novas }, { merge: true });
  state.profile = { ...state.profile, datasComemorativasCustom: novas };
  if (editandoDataComemorativaNome === nome) cancelarEdicaoDataComemorativa();
  await carregarDatasComemorativas();
  window.App.refresh(`Data "${nome}" removida`);
}

export async function salvarAutoSyncBaseColetiva(ativo) {
  const hora = $('perAutoSyncHora')?.value || '08:00';
  await setDoc(doc(db, 'users', state.user.uid), { baseColetivaAutoSync: ativo, baseColetivaAutoSyncHora: hora }, { merge: true });
  state.profile = { ...state.profile, baseColetivaAutoSync: ativo, baseColetivaAutoSyncHora: hora };
  toast(ativo ? `Sincronização automática ativada, todo dia às ${hora}` : 'Sincronização automática desativada');
}

// Backup manual: usa só o que já está em memória (state.data, carregado no login) — não faz
// nenhuma leitura extra no Firestore, então não tem custo de banco além do uso normal do app.
export function exportarBackupCompleto() {
  const backup = {
    exportadoEm: new Date().toISOString(),
    consultora: state.profile?.nome || state.user?.email || '',
    dados: state.data
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-crm-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup baixado');
}

// Restaura só estoqueAtual e custoMedio de cada produto a partir de um backup gerado por
// exportarBackupCompleto — recuperação pontual pra quem apagou o estoque sem querer (App.apagarEstoque
// já zera direto no Firestore; isso reverte lendo o snapshot salvo em disco). Casa por código Farmasi
// (fallback nome) em vez de id do documento — o id salvo no backup só bate se nenhum produto foi
// recriado desde então.
// Coleções restauráveis pelo backup completo — mesma lista de state.data.
const COLECOES_BACKUP = ['clientes', 'produtos', 'vendas', 'carrinhos', 'agendamentos', 'movimentacoesEstoque', 'catalogos', 'eventos', 'trocas', 'preEncomenda', 'despesas', 'operadoras'];

// Restaura TODOS os registros de TODAS as coleções presentes no arquivo, recriando pelo mesmo id
// quem foi apagado e sobrescrevendo por completo quem ainda existe (não é merge parcial — o
// documento inteiro volta a ser exatamente o que estava no backup). Ação pesada e ampla: por isso
// pede confirmação mostrando quantos registros de cada coleção serão tocados antes de rodar.
export async function restaurarBackupCompleto() {
  const input = $('restaurarBackupArquivo');
  const arquivo = input?.files?.[0];
  if (!arquivo) return toast('Escolha o arquivo de backup (.json) antes de restaurar');
  let backup;
  try {
    backup = JSON.parse(await arquivo.text());
  } catch (e) { return toast('Arquivo inválido: não é um JSON legível'); }
  const dados = backup?.dados;
  if (!dados || typeof dados !== 'object') return toast('Esse arquivo não tem dados para restaurar');

  const resumo = COLECOES_BACKUP
    .map(n => ({ n, qtd: Array.isArray(dados[n]) ? dados[n].length : 0 }))
    .filter(x => x.qtd > 0);
  if (!resumo.length) return toast('Esse arquivo não tem dados para restaurar');

  const listaResumo = resumo.map(x => `${x.qtd} ${x.n}`).join(', ');
  const dataBackup = backup.exportadoEm ? new Date(backup.exportadoEm).toLocaleString('pt-BR') : 'no arquivo';
  if (!confirm(`Isso vai restaurar exatamente como estava em ${dataBackup}:\n${listaResumo}.\n\nRegistros apagados desde então voltam a existir; registros que ainda existem e mudaram são sobrescritos por completo. Nada que foi criado DEPOIS do backup é apagado. Continuar?`)) return;

  let totalRestaurado = 0;
  for (const { n } of resumo) {
    const docs = dados[n];
    for (let i = 0; i < docs.length; i += 450) {
      const lote = docs.slice(i, i + 450);
      const batch = writeBatch(db);
      lote.forEach(d => {
        const { id, ...rest } = d;
        if (!id) return;
        batch.set(ref(n, id), rest);
      });
      await batch.commit();
      totalRestaurado += lote.length;
    }
  }
  toast(`Backup restaurado: ${listaResumo} (${totalRestaurado} registro(s) no total)`);
  window.App.refresh();
}

export async function restaurarEstoqueDoBackup() {
  const input = $('restaurarEstoqueArquivo');
  const arquivo = input?.files?.[0];
  if (!arquivo) return toast('Escolha o arquivo de backup (.json) antes de restaurar');
  let backup;
  try {
    backup = JSON.parse(await arquivo.text());
  } catch (e) { return toast('Arquivo inválido: não é um JSON legível'); }
  const produtosBackup = backup?.dados?.produtos;
  if (!Array.isArray(produtosBackup) || !produtosBackup.length) return toast('Esse arquivo não tem produtos para restaurar');

  if (!confirm(`Isso vai sobrescrever a quantidade em estoque e o custo médio de todos os produtos com os valores salvos em ${backup.exportadoEm ? new Date(backup.exportadoEm).toLocaleString('pt-BR') : 'no arquivo'}. Continuar?`)) return;

  const norm2 = s => String(s || '').trim().toLowerCase();
  const porCodigo = new Map(produtosBackup.filter(p => p.codigoFarmasi).map(p => [String(p.codigoFarmasi).trim(), p]));
  const porNome = new Map(produtosBackup.filter(p => p.nome).map(p => [norm2(p.nome), p]));

  let restaurados = 0, semCorrespondencia = 0;
  const atuais = state.data.produtos || [];
  for (let i = 0; i < atuais.length; i += 450) {
    const lote = atuais.slice(i, i + 450);
    const batch = writeBatch(db);
    lote.forEach(p => {
      const origem = (p.codigoFarmasi && porCodigo.get(String(p.codigoFarmasi).trim())) || porNome.get(norm2(p.nome));
      if (!origem) { semCorrespondencia++; return; }
      batch.update(ref('produtos', p.id), {
        estoqueAtual: Number(origem.estoqueAtual || 0),
        custoMedio: Number(origem.custoMedio || 0)
      });
      restaurados++;
    });
    await batch.commit();
  }
  toast(`Estoque restaurado em ${restaurados} produto(s)${semCorrespondencia ? ` • ${semCorrespondencia} sem correspondência no backup` : ''}`);
  window.App.refresh();
}

export async function zerarMeusDados() {
  if (!confirm('Isso vai apagar TODOS os seus clientes, produtos, vendas, carrinhos, agenda e estoque. Continuar?')) return;
  const resp = prompt('Confirme digitando ZERAR para apagar todos os dados desta conta:');
  if ((resp || '').trim().toUpperCase() !== 'ZERAR') return;

  const colecoes = Object.keys(state.data);
  for (const nome of colecoes) {
    const snap = await getDocs(col(nome));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  window.App.refresh('Todos os dados foram apagados. Login e plano mantidos.');
}

async function apagarColecao(nome) {
  const snap = await getDocs(col(nome));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// Zera estoque (quantidade e custo médio) e apaga o histórico de movimentações — mantém o
// cadastro dos produtos (nome, preço, imagem etc.), só a parte de estoque em si é resetada.
export async function apagarEstoque() {
  if (!confirm('Isso vai zerar o estoque (quantidade e custo médio) de TODOS os produtos e apagar o histórico de movimentações. Os cadastros dos produtos são mantidos. Continuar?')) return;
  const resp = prompt('Confirme digitando ESTOQUE para apagar:');
  if ((resp || '').trim().toUpperCase() !== 'ESTOQUE') return;

  for (let i = 0; i < state.data.produtos.length; i += 450) {
    const batch = writeBatch(db);
    state.data.produtos.slice(i, i + 450).forEach(p => batch.update(ref('produtos', p.id), { estoqueAtual: 0, custoMedio: 0 }));
    await batch.commit();
  }
  await apagarColecao('movimentacoesEstoque');
  window.App.refresh('Estoque zerado');
}

export async function apagarClientes() {
  if (!confirm('Isso vai apagar TODOS os clientes cadastrados. Continuar?')) return;
  const resp = prompt('Confirme digitando CLIENTES para apagar:');
  if ((resp || '').trim().toUpperCase() !== 'CLIENTES') return;
  await apagarColecao('clientes');
  window.App.refresh('Base de clientes apagada');
}

// "Vendas" abrange tanto o histórico (vendas) quanto os carrinhos (pendentes/finalizados) —
// as duas coleções juntas são o que aparece como "Vendas / Carrinhos" no menu.
export async function apagarVendas() {
  if (!confirm('Isso vai apagar TODO o histórico de vendas e carrinhos (pendentes e finalizados). Continuar?')) return;
  const resp = prompt('Confirme digitando VENDAS para apagar:');
  if ((resp || '').trim().toUpperCase() !== 'VENDAS') return;
  await apagarColecao('vendas');
  await apagarColecao('carrinhos');
  window.App.refresh('Vendas apagadas');
}

// Exclusão definitiva da própria conta (LGPD — Direito de Eliminação), disparada pela própria
// consultora. Apaga por completo tudo que é dado pessoal/operacional dela (clientes, produtos,
// agenda, estoque, catálogo, trocas, eventos, pré-encomenda). Vendas e carrinhos NÃO são apagados
// — são anonimizados (nome do cliente removido) e mantidos por exigência fiscal/auditoria (Marco
// Civil da Internet pede retenção mínima de registros; aqui ficam marcados para expurgo futuro
// depois do prazo, quando houver uma rotina agendada pra isso). O perfil em si vira um registro
// anônimo (mantém só o histórico de plano, pro financeiro da administração continuar batendo).
// Por fim remove o login do Firebase Auth — exige reautenticação recente, por segurança.
export async function excluirMinhaConta() {
  if (!confirm('Isso vai excluir sua conta DEFINITIVAMENTE: apaga clientes, produtos, agenda, estoque e demais dados pessoais; anonimiza (sem apagar) o histórico de vendas por exigência fiscal; e remove seu login para sempre. Não é possível desfazer. Continuar?')) return;
  const resp = prompt('Confirme digitando EXCLUIR MINHA CONTA:');
  if ((resp || '').trim().toUpperCase() !== 'EXCLUIR MINHA CONTA') return;

  try {
    if (ehLoginEmail()) {
      const senha = prompt('Por segurança, digite sua senha atual para confirmar a exclusão:');
      if (!senha) return;
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, senha));
    } else {
      await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
    }
  } catch (e) { return toast(traduzErro(e)); }

  // Coleções puramente pessoais/operacionais: apagadas por completo.
  for (const nome of ['clientes', 'produtos', 'agendamentos', 'movimentacoesEstoque', 'catalogos', 'eventos', 'trocas', 'preEncomenda']) {
    await apagarColecao(nome);
  }

  // Vendas/carrinhos: mantidos (auditoria fiscal), mas o nome do cliente é removido de cada um.
  for (const nome of ['vendas', 'carrinhos']) {
    const snap = await getDocs(col(nome));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach(d => batch.update(d.ref, { clienteNome: 'Cliente removido', clienteId: '' }));
      await batch.commit();
    }
  }

  await setDoc(doc(db, 'users', state.user.uid), {
    nome: 'Conta excluída', email: '', whatsapp: '', instagram: '', linkLoja: '', fotoPerfil: '',
    genero: '', status: 'excluido', contaExcluidaEm: serverTimestamp()
  }, { merge: true });

  await deleteUser(auth.currentUser);
}
