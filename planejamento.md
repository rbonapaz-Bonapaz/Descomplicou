# Planejamento Completo — CRM Farmasi

**Data**: 13 de julho de 2026
**Substitui**: roadmap do `progresso_fase0.md` (Fases 0 e A concluídas) e a lista de grupos antiga (`melhorias-crm-planejadas.md`, parcialmente desatualizada)

---

## Já concluído (não replanejamento)

- **Fase 0** — Busca em tempo real (Produtos → Linhas, Estoque), preservação de foco dupla, ordenação alfabética + toggle nas linhas, colunas de ações mais largas (CSS `:last-child`)
- **Fase A** — `nomeAtualDoCliente()` (nome corrigido reflete em vendas/agenda/dashboard), sincronização em tempo real via `onSnapshot` (resolve os dois acessos simultâneos), aviso de pagamento ao reabrir carrinho
- **Grupos antigos A, B, D2 e E-parcial** — edição/exclusão de produtos, base coletiva, catálogo de evento com link público (`evento.html`), cards do dashboard clicáveis

---

## FASE B — Melhorias rápidas de vendas e agenda

### B.1 Agendamento + mapa (sem API paga) — ✅ CONCLUÍDO (13/07/2026, v97)
**Problema**: agendamento não tem local/endereço; consultora precisa ver o ponto no mapa, e em cidades pequenas o endereço nem sempre bate com o local real.

**Solução**:
- Campo **Local / endereço** nos modais de novo/editar agendamento (`openAgendamentoForm`, `editarAgendamento`), salvo como `local` no documento
- Pré-preenchido com o `endereco` do cliente selecionado (campo já existe no cadastro de clientes)
- Botão **📍 Ver no mapa** que abre `https://www.google.com/maps/search/?api=1&query=<endereço>` — URL pública do Google Maps, sem chave de API e sem custo
- O campo também aceita **colar um link do Google Maps** (para o caso do endereço errado no mapa: a consultora localiza o ponto certo no app do Maps, toca em compartilhar, cola o link aqui). Se o valor começar com `http`, o botão abre o link direto em vez de buscar o texto
- Ícone 📍 na coluna de ações da tabela da agenda quando o agendamento tiver local

**Arquivos**: `js/agenda.js` (formulários, `saveAgendamento`, `updateAgendamento`, `tableAgenda`)
**Esforço**: pequeno

### B.2 Expandir linha no histórico de vendas — ✅ CONCLUÍDO (13/07/2026, v97)
**Problema**: para ver o que foi vendido numa compra é preciso abrir o carrinho inteiro.

**Solução**: clicar na linha da venda (ou num botão ▸) expande uma sub-linha com os itens: produto, quantidade, preço unitário, desconto e total — inclusive brindes. Estado local (`Set` de ids expandidos) + re-render.

**Arquivos**: `js/vendas.js`
**Esforço**: pequeno

### B.3 Desconto no pedido (antes de finalizar) — ✅ VERIFICADO (15/07/2026)
Testado no preview: desconto % recalcula o total corretamente (10% sobre 100 → 90,00); desconto R$ maior que o subtotal é limitado (nunca deixa o total negativo — capado em 0,00); reaplicar o mesmo % ao adicionar um item recalcula sobre o novo subtotal (200 → 180,00 com 10%). Sem regressões.
**Problema**: só existe desconto por item (preço original vs. atual). Promoções tipo "10% na primeira compra" exigem desconto sobre o pedido inteiro, com cálculo automático do valor a cobrar.

**Solução**:
- No fechamento do carrinho: campo de desconto em **% ou R$**, recalculando na hora o total a cobrar
- Salvar no carrinho: `descontoPedido: { tipo: 'percent'|'valor', valor, calculado }`
- `totalPedido` líquido passa a ser a base de `statusPagamentoAuto`, lucro, relatórios e PDFs

**Arquivos**: `js/carrinho.js`, `js/pdf-pedido.js`, conferir `salesAgg` em `js/state.js`
**Esforço**: médio

### B.4 Frete no pedido — ↩️ REVERTIDO em 14/07/2026 (substituído por G.2: frete só na Pré-encomenda)
**Problema**: custo de frete ao finalizar pedido não é registrado em lugar nenhum — some dos indicadores.

**Solução**:
- No fechamento: campo **Frete (R$)** registrado como **despesa da consultora** — reduz o lucro do pedido, não altera o total cobrado do cliente *(decidido em 13/07/2026)*
- Salvar `freteCusto` no carrinho; ajustar cálculo de lucro, exibições, relatórios e PDF interno

**Arquivos**: `js/carrinho.js`, `js/pdf-pedido.js`, `js/relatorios.js`
**Esforço**: médio

---

## FASE C — Confiabilidade de pagamento

### B.5 Agendamento sem cliente (compromisso próprio) — ✅ CONCLUÍDO (14/07/2026, v97)
**Pedido**: o campo Cliente do agendamento não deve ser obrigatório — a consultora pode ter compromisso próprio, sem cliente específico (ex: evento de demonstração para várias convidadas em 06/08, num local definido).

**Solução prevista**: opção "— Sem cliente (compromisso próprio) —" no select de cliente + campo de título/descrição livre quando sem cliente; `saveAgendamento`/`updateAgendamento` deixam de exigir cliente (o modelo já suporta `clienteId: ''` — é como os eventos importados do Google Agenda são salvos hoje; a tabela já trata esse caso).

**Arquivos**: `js/agenda.js`
**Esforço**: pequeno

### C.1 = H.2 Tratativa completa ao reabrir venda com pagamento — ✅ CONCLUÍDO (15/07/2026, v99)
**Problema**: reabrir um carrinho apagava a venda **e** o registro de pagamento — comprometia a confiabilidade dos relatórios e histórico de crédito.

**Implementado**:
- `reabrirCarrinho` não apaga mais `valorPago`/`pagamentos` (nunca inclui esses campos no `setDoc` de reabertura — permanecem intactos no documento)
- Confirm de reabertura avisa explicitamente: *"Este pedido já tem R$ X pago — isso é MANTIDO"*
- **Banner visível** no topo do carrinho reaberto (painel amarelo) mostrando o valor já pago; se o valor pago passar do total atual (itens editados após reabrir), aparece alerta vermelho sugerindo crédito ou estorno
- `finalizarCarrinho` recalcula o status (pendente/parcial/pago) contra o **total atual** via `statusPagamentoAuto`, em vez de herdar o status antigo congelado; excedente gera toast avisando o valor exato para tratativa manual

**Arquivos**: `js/carrinho.js` (`reabrirCarrinho`, `openCarrinho`, `finalizarCarrinho`)
**Verificação**: banner testado nos 3 cenários (com pagamento, com excedente após edição de itens, sem pagamento); `statusPagamentoAuto` testado com pago exato/a mais/parcial/pendente. Escrita real no Firestore bloqueada por permissão no ambiente de preview (esperado, sem conta de teste privilegiada) — mensagem do `confirm()` e toda a lógica de cálculo confirmadas.

**Solução (decidida em 13/07/2026)** — manter os pagamentos e **mostrar na tela o valor que já havia sido pago**:
- `reabrirCarrinho` deixa de apagar o registro de pagamentos — guarda `valorPago`/`pagamentos` no carrinho reaberto
- No carrinho reaberto, um **aviso visível na tela** (banner no topo do modal do carrinho): *"Este pedido já teve R$ X pago anteriormente"*
- Ao refinalizar, o status de pagamento é recalculado contra o novo total (`statusPagamentoAuto`); se o valor pago ficar maior que o novo total, o sistema destaca o excedente para tratativa manual (crédito/estorno)

**Arquivos**: `js/carrinho.js` (`reabrirCarrinho`, render do carrinho aberto, fluxo de finalizar, `registrarPagamento`)
**Esforço**: médio

### C.2 = H.15 Cartão, parcelamento e link de pagamento — ✅ CONCLUÍDO (15/07/2026, v99). Ver H.15.
**Solução**:
- Em **Minha Conta**: tabela de taxas da maquininha por número de parcelas + campo de link de pagamento
- No fechamento da venda: seleção de parcelas e **quem assume os juros** (cliente → total ajustado; consultora → reduz lucro); mostrar o valor líquido a receber
- Botão para enviar o link de pagamento pelo WhatsApp junto do resumo

**Arquivos**: `js/perfil.js`, `js/carrinho.js`, `js/whatsapp.js`
**Esforço**: médio-grande

---

## FASE D — PDFs

### D.1 Refazer PDF Cliente e PDF Interno — ✅ CONCLUÍDO via G.6 (14/07/2026, v98)
Ver seção G.6 na Fase G — redesenho completo (resumo em 3 colunas, item em linha com foto/benefícios/desconto, bloco de resultado só no interno) encerrou esta pendência. Cabeçalho desta seção só não tinha sido atualizado — corrigido em 15/07/2026.

---

## FASE E — KITs Farmasi

### E.1 Criar kit no pedido com rateio proporcional — ✅ CONCLUÍDO (14/07/2026, v97)
**Problema**: Farmasi vende kits (ex.: 3 produtos que somam R$ 290 por R$ 185). Precisa entrar no pedido sem distorcer custo/lucro por produto.

**Solução proposta**:
- No carrinho, botão **"Adicionar kit"**: seleciona os produtos que compõem o kit + o valor pago
- O sistema distribui o valor proporcionalmente ao preço original de cada item (`valorKit × preçoOriginal_i / Σ preçosOriginais`) e lança os itens com esse preço unitário
- Itens ganham `kitId`/`kitNome` para agrupar na exibição da venda e nos PDFs
- Estoque baixa por componente, como itens normais
- Kit com valor R$ 0 = brinde (o fluxo de brinde já existe, motivo "brinde")

**Arquivos**: `js/carrinho.js`, `js/vendas.js`, `js/pdf-pedido.js`
**Esforço**: grande

---

## FASE F — Acesso compartilhado (2 usuários, 1 base)

### F.1 Autorizar segundo login na mesma base
**Problema**: casal trabalhando junto — hoje é preciso entrar com o mesmo usuário. Pedido: dois logins na mesma conta, cobrando +10% no plano.

**Viabilidade**: **é viável sem grande refactor**, porque todo acesso a dados passa por `path()`/`col()`/`ref()` centralizados em `state.js`.

**Solução proposta**:
- Doc do dono ganha `usuariosAutorizados: [uid...]` (gerenciado em Minha Conta, mediante plano com o adicional)
- `firestore.rules`: leitura/escrita em `users/{ownerUid}/**` permitida ao dono **ou** a quem estiver em `usuariosAutorizados`
- No login, se o usuário for autorizado em outra base, aparece um seletor "qual conta abrir"; `state.dataOwnerUid` passa a ser usado em `path()` no lugar de `state.user.uid`
- Admin controla o adicional de 10% no plano

**Arquivos**: `firestore.rules` (+ deploy), `js/state.js`, `js/app.js`, `js/perfil.js`, `js/admin.js`
**Esforço**: grande
**Dependência**: deploy das rules (item Infra 1)

---

## FASE G — Rodada 3 (anotações de 14/07/2026)

### G.1 Mover KITs do carrinho para a Pré-encomenda — ✅ CONCLUÍDO (14/07/2026, v98)
**Correção do usuário**: o kit é o que a consultora **compra da Farmasi** (ex: 3 produtos por R$ 185), não o que vende ao cliente. Remover o "🎁 Adicionar kit" do carrinho e recriar o montador de kit dentro de **Pré-encomenda → A comprar**: os componentes entram na lista "a comprar" e, quando o pedido chega, o rateio proporcional vira **custo médio** de cada produto (não preço de venda).
**Arquivos**: `js/carrinho.js` (remover), `js/preencomenda.js` (recriar), `js/estoque.js` (entrada com custo rateado)
**Esforço**: médio

### G.2 Frete na Pré-encomenda — ✅ CONCLUÍDO (14/07/2026, v98)
**Decidido pelo usuário em 14/07/2026**: frete **apenas no pedido Farmasi** (removido do carrinho do cliente — B.4 revertido), registrado como **despesa simples** (opção b). Painel "🚚 Frete pago à Farmasi" em Estoque → Pré-encomenda grava na nova coleção `despesas` (tipo `frete_farmasi`); os Relatórios descontam o total do período no lucro líquido consolidado.

### G.3 Crédito do cliente — ✅ CONCLUÍDO (14/07/2026, v98)
Campo `credito` no cadastro do cliente. Excedente de pagamento (no fechamento do carrinho ou em pagamento posterior) dispara pergunta "guardar como crédito?"; toggle **"Usar créditos"** nos dois fluxos abate o saldo (registrado como forma de pagamento "Créditos do cliente" no histórico). Saldo visível no Cliente 360 e na gestão de pagamento do pedido.

### G.4 Linhas na base coletiva (admin) — ✅ CONCLUÍDO (14/07/2026, v98)
Admin publica linhas em **Admin → Catálogo mestre** (doc `/config/linhasColetivas` — coberto pelas regras existentes de `/config`, sem deploy novo além do já pendente). Consultora com base coletiva ativa vê o botão **"🔄 Sincronizar linhas da base coletiva"** em Produtos → Linhas: as linhas do admin são acrescentadas às dela (comparação normalizada, nada é apagado).

### G.5 Busca por cliente em Vendas — ✅ CONCLUÍDO (14/07/2026, v98)
Campo de busca por digitação abaixo de "Vendas e Carrinhos", acima dos chips — filtra todas as listas pelo nome do cliente, com foco preservado a cada tecla.

### G.6 PDF Cliente e Interno — redesign — ✅ CONCLUÍDO (14/07/2026, v98)
Layout refeito no estilo das referências (Amazon/Shopee): bloco de resumo em 3 colunas no topo (Pedido | Forma de pagamento | Resumo com subtotal/descontos/total geral — sem "Enviar para"), cada produto em **uma linha** com foto, código, quantidade e valores à direita, benefícios e tag de desconto logo abaixo do nome. Cabeçalho e rodapé mantidos. PDF interno ganha custo/lucro por item e bloco "Resultado (interno)" no fim; o do cliente ficou mais curto (totais já estão no topo). Isso encerra o antigo D.1.

### G.7 Catálogo PDF — descrição completa + cabeçalho suave — ✅ CONCLUÍDO (14/07/2026, v98)
Descrição agora ocupa toda a largura do card abaixo da imagem e preço, com até 8 linhas (antes cortava em 3 com "..."). Cabeçalho trocado do rosa forte para tom suave do site (rosa clarinho #FBF3F6, texto navy, título em magenta).

### G.8 Seletor de entrega por item no carrinho — ✅ CONCLUÍDO (14/07/2026, v98)
**Pedido do usuário (14/07)**: escolher por item o que será entregue na finalização e o que fica pendente — mesmo tendo estoque, o item pode ser entregue em outro momento. Toggle "Agora / Depois" na coluna Entrega do carrinho aberto (mesmo seletor visual do "Mostrar itens sem estoque"). Ligar "Agora" exige estoque disponível (item futuro não reserva estoque, a checagem via `estoqueDisponivel()` cobre); o fluxo existente já cuida do resto (pedido finaliza parcial, entrega confirmada pelo 📦 em Vendas).

**Itens das anotações já resolvidos**: item 04 (expandir venda) = B.2 concluído em v97 (o ▸ já aparece na screenshot enviada); item 06 (busca do Estoque) = bug real corrigido em 14/07/2026 — `renderEstoque` não estava exposto no objeto `App`, o erro era silencioso a cada tecla.

## FASE H — Especificação priorizada (anotações reorganizadas, 15/07/2026)

O usuário reescreveu o documento de anotações como uma especificação formal, dividida pelas próprias prioridades dele. Mantenho a organização original (Alta/Média/Baixa/Futuro) para não perder essa priorização.

### PRIORIDADE ALTA — risco de dados e financeiro

**H.1 Blindagem dos KITs na Pré-encomenda** — ✅ CONCLUÍDO (15/07/2026, v99)
**Problema real, confirmado no código**: os componentes de um kit montado em `js/preencomenda.js` (`confirmarKit`) são gravados como itens **independentes** na pré-encomenda — a única coisa que os liga é um texto `"Kit: Nome"` na observação. Removendo/editando um componente, os outros não são afetados: o kit se descaracteriza (perde os valores rateados que batiam com o preço real da Farmasi) exatamente como o usuário descreveu.
**Implementado**: `kitId`/`kitNome` estruturais em cada componente; id do doc virou `${produtoId}_pendente_${kitId}` (não colide com pendências manuais nem com outros kits do mesmo produto). Tela agrupa componentes com cabeçalho "🎁 Kit: Nome (N produtos)" + botão único **"🗑️ Remover kit inteiro"** (confirmação lista os produtos). Quantidade e preço unitário de componentes de kit ficam somente leitura (🔒); remoção/edição individual bloqueada tanto na UI quanto na função (`removerPreEncomenda`/`atualizarItemPreEncomenda` recusam com toast). `kitId` é preservado ao mover pra "aguardando chegada" (`marcarComoPedido`/`voltarParaComprar`), então o agrupamento continua lá também — só "Confirmar chegada" fica livre por componente (é o desfecho normal, produto vira estoque). `btnAdicionarPreEncomenda` corrigido para somar por `produtoId` em vez de um id fixo de doc (senão subcontava itens vindos de kit).
**Arquivos**: `js/preencomenda.js`, `js/app.js`
**Verificação**: cabeçalho do grupo, cadeado nos campos travados, ausência de inputs/botão de remoção nos componentes, soma correta do badge (kit + manual do mesmo produto), bloqueio de edição/remoção individual (nem chega a tentar escrever no Firestore), e mensagem de confirmação do "remover kit inteiro" listando os 2 produtos certos — todos testados no preview. Escrita real bloqueada por permissão (esperado, ambiente sem conta de teste privilegiada).

**H.2 = C.1 (reabrir venda mantendo pagamentos)** — ✅ CONCLUÍDO (15/07/2026, v99). Ver seção C.1 acima.

**H.3 Validar créditos do cliente** — ✅ VALIDADO (15/07/2026). Card "Créditos" aparece corretamente no Cliente 360 com o valor certo; some quando o saldo é zero. Confirmado que já funcionava (G.3).

**H.4 Cadastro manual de produto** — ✅ CONCLUÍDO (15/07/2026, v99)
**Implementado**: botão "+ Novo produto" ao lado do "🔄 Sincronizar com base coletiva" (quando a base coletiva está ativa) ou no topo do toolbar de busca (quando não está — garante que o botão nunca fique escondido). Reutiliza `openProdutoForm()` já existente, que sem `id` abre em modo "Cadastrar".
**Arquivos**: `js/produtos.js`
**Verificação**: testado nos dois cenários (com/sem base coletiva ativa) — botão aparece uma única vez no lugar certo em cada caso; `openProdutoForm()` sem argumento abre "Novo Produto" corretamente.

**H.5 Botão do carrinho: "WhatsApp" → "Enviar pedido"** — ✅ CONCLUÍDO (15/07/2026, v99). Testado no preview.

---

### PRIORIDADE MÉDIA — operação diária e vendas

**H.6 Hora final no agendamento** — ✅ CONCLUÍDO (15/07/2026, v99)
Campo "Hora final" (opcional) em novo/editar/reagendar, grava `horaFim`. Google Agenda usa a duração real quando informada (senão mantém o padrão de 1h); importação do Google também traz `horaFim` de volta (`ev.end.dateTime`). Testado: campo aparece nos 3 modais, pré-preenche ao editar/reagendar, cálculo de duração correto e hora final inválida (menor que a inicial) é ignorada com segurança.
**Arquivos**: `js/agenda.js`, `js/googleAgenda.js`

**H.7 Accordion no histórico de vendas do Cliente 360** — ✅ CONCLUÍDO (15/07/2026, v99)
Reaproveita `detalheVendaHtml` (exportada de `vendas.js`) buscando o carrinho original via `v.carrinhoId`. Testado: chevron abre/fecha, itens aparecem corretamente, fallback correto quando o carrinho original não existe mais (excluído).
**Arquivos**: `js/clientes.js`, `js/vendas.js` (export), `js/app.js`

**H.8 Validar busca de clientes** — ✅ VALIDADO (G.5, Vendas — já testado em rodada anterior).

**H.9 Campo de busca na Pré-encomenda** — ✅ CONCLUÍDO (15/07/2026, v99)
Filtra simultaneamente "A comprar" e "Aguardando chegada" pelo mesmo termo. `estoque.js` ganhou o mesmo padrão multi-campo do `produtos.js` (`FOCUS_IDS_ESTOQUE`) pra preservar foco entre `qestoque` e `qPreEnc`, já que dividem a mesma função de render. Testado: filtro simultâneo nas duas listas, foco preservado, busca principal do Estoque sem regressão.
**Arquivos**: `js/preencomenda.js`, `js/estoque.js`

**H.10 Contador de clientes na tela de Clientes** — ✅ CONCLUÍDO (15/07/2026, v99). Testado.

**H.11 Tooltips em ícones e status** — ✅ CONCLUÍDO (15/07/2026, v99)
`pill()` ganhou 3º parâmetro opcional `title` (retrocompatível). Aplicado nos status circulados pelo usuário: "OK"/"Sem custo"/"Baixo" no Estoque, e pills de status de pagamento (Pendente/Parcial/Pago) em Vendas e no carrinho. Levantamento sistemático (grep de botões ícone-só sem `title`) encontrou e corrigiu 8 gaps reais: editar/excluir de agendamento, remover item do carrinho, remover produto do kit, remover frete, remover/marcar pré-encomenda (2x), remover item de troca. Botões com texto visível ("Sincronizar com base coletiva", "Montar kit") não precisavam de tooltip — já são autoexplicativos.
**Arquivos**: `js/utils.js`, `js/estoque.js`, `js/vendas.js`, `js/carrinho.js`, `js/agenda.js`, `js/preencomenda.js`, `js/trocas.js`
**Verificação**: tooltips testados no Estoque (3 status); `pill()` testada com e sem o parâmetro novo (retrocompatibilidade confirmada).

**H.12 Evolução do link de eventos** — ✅ CONCLUÍDO, revisado em 15/07/2026 (v99)
Primeira leva: toggle "Mostrar todo o catálogo" + `prontaEntrega` na vitrine pública.

**Revisão do usuário (15/07/2026, segunda leva do docx)** — 4 pedidos, todos implementados:
1. **Excluir evento bloqueado até leads tratados**: novo campo `tratado` por lead (toggle na coluna "Tratado" da lista de desejos); `excluirEvento` conta os pendentes e bloqueia com toast antes até de mostrar o `confirm()`, se houver algum não tratado. **Causa raiz do bug "não deixa excluir"**: as regras do Firestore tinham `allow update,delete:if false` hardcoded pra `listasDesejo` — a exclusão sempre falhava no primeiro item. Corrigido em `firestore.rules` (dono do evento agora pode update/delete) — **precisa do deploy das rules (Infra 1) pra funcionar de verdade**.
2. **"Todo o catálogo" marca todas as linhas**: ao ligar o toggle, todos os checkboxes "Participa" da tabela ficam marcados automaticamente (desligar continua manual).
3. **Seletores de personalização + link customizável + desconto em massa**: 3 novos toggles (mostrar preços / benefícios / estoque — todos default ligados, preserva o comportamento antigo pra eventos já existentes); campo "Link personalizado" opcional na criação (sanitizado pra slug seguro, checado contra colisão, não editável depois de criado); campo "% em Todos itens" que preenche o desconto de todas as linhas de uma vez (edição manual posterior numa linha específica prevalece só naquela linha).
**Arquivos**: `js/eventos.js`, `js/evento-publico.js`, `js/app.js`, `firestore.rules`
**Verificação**: 10 cenários testados no preview (campos presentes no form, todo-catálogo marca tudo, desconto em massa aplica e preserva edição manual, exclusão bloqueia sem nem abrir o confirm quando não consegue conferir os leads, `evento-publico.js` carrega sem erro de console). Escritas reais (marcar tratado, criar evento com slug) seguem bloqueadas por permissão no preview até a rules ser deployada — mesmo padrão de todo o resto da sessão.

**H.13 Alerta de novos leads no dashboard** — ✅ CONCLUÍDO (15/07/2026, v99)
Banner amarelo no topo do Painel Inicial quando um evento tem leads não vistos (compara total de `listasDesejo` contra `ev.leadsVisto`, salvo no doc do evento). Verificação é sob demanda — uma vez por sessão ao abrir o dashboard (não em todo refresh, pra não pesar), renderiza só a div `#leadsBanner` quando o resultado chega. "Ver lista" marca como visto e abre a lista do evento.
**Arquivos**: `js/eventos.js`, `js/dashboard.js`, `js/app.js`
**Verificação**: pipeline completo testado sem exceções (div presente, cache null→array, banner não quebra); exibição positiva do banner depende de leads reais no Firestore (não testável no preview sem conta privilegiada — mesma limitação de outros itens desta sessão).

**H.14 Confirmar detalhamento do PDF do pedido** — ✅ VALIDADO (15/07/2026). Gerado PDF de teste com 2 produtos (um com foto, um sem): cada linha mostra foto (ou placeholder "sem foto"), nome, valor unitário e benefícios — exatamente o que faltava na screenshot cortada das anotações. Já estava resolvido pelo G.6 (14/07), sem código novo necessário.

---

### PRIORIDADE BAIXA — expansão, escala e administração

**H.15 = C.2 (cartão/parcelas/link de pagamento)** — ✅ CONCLUÍDO (15/07/2026, v99)
Checado o código: tabela de taxas por parcela, regra automática de quem assume o juro, seleção de parcelas e campo de link de pagamento em Minha Conta **já existiam** (implementados numa rodada anterior, v92-94). Faltava só o botão de **enviar o link via WhatsApp** — que nunca tinha sido conectado a lugar nenhum. Adicionado: template de mensagem com o link + valor restante, botão "💳 Enviar link de pagamento" no carrinho aberto e na gestão de pagamento de pedidos com saldo pendente (só aparece quando há link cadastrado e há valor a receber).
**Arquivos**: `js/whatsapp.js`, `js/carrinho.js`, `js/app.js`
**Verificação**: botão aparece/some corretamente nos 4 cenários (sem link, com link, pendente, totalmente pago); URL do WhatsApp gerada com o link e o valor restante corretos.
**H.16 Alerta de vencimento do plano** — ✅ CONCLUÍDO (15/07/2026, v99)
`planoInfo()` ganhou `diasParaVencer` (só planos pagos com data e ainda não vencidos). Banner vermelho no Painel Inicial quando ≤7 dias, com texto adaptado (hoje/amanhã/em X dias) e atalho pra Minha Conta → Meu Plano. Testado: aparece aos 5 dias, some aos 30, nunca aparece pra teste/gratuito (não vencem por data), texto correto pro "vence hoje".
**Arquivos**: `js/state.js`, `js/dashboard.js`
**H.17 Correção de valores por IPCA — ✅ CONCLUÍDO (15/07/2026, v99)**
**Decidido pelo usuário**: campo manual em Admin (sem API paga) + só lembrete, nunca muda preço sozinho. Admin → Planos ganhou campos de % IPCA e data do reajuste; alerta "já venceu" quando a data chega (some ao marcar como aplicado); consultora vê aviso prévio de transparência em Minha Conta → Meu Plano.
**Arquivos**: `js/admin.js`, `js/perfil.js`, `js/app.js`
**Verificação**: campos presentes, botão "já apliquei" só aparece com reajuste configurado, alerta de vencido só quando a data já passou, consultora vê o aviso — 6 cenários testados.

**H.18 Promoção de indicação — ✅ CONCLUÍDO (15/07/2026, v99)**
**Confirmado pelo usuário**: indicação de novas consultoras (não clientes finais). Toggle liga/desliga em Admin → Planos; cada consultora tem um link próprio (`?ref={uid}`) em Minha Conta → Meu Plano; captura na URL vai pro `localStorage` e é gravada no perfil só na criação de conta nova (`indicadoPorUid`, com proteção contra autoindicação). Quando o admin muda o plano da indicada de não-pago pra pago (mensal/semestral/anual) pela primeira vez, quem indicou ganha **+30 dias** automaticamente (uma vez só por indicação, via `indicacaoRecompensada`) e vê um banner de "você ganhou".
**Arquivos**: `js/admin.js`, `js/perfil.js`, `js/app.js`
**Verificação**: captura do `?ref=` na URL, bloqueio de autoindicação, seção "Indique e ganhe" aparece/some com o toggle, banner de "você ganhou" renderiza certo, fórmula de +30 dias confirmada, função não quebra sem dados em cache. Escrita real da recompensa segue o mesmo padrão (try/catch) já validado nesta sessão pra chamadas bloqueadas por permissão no preview.
**H.19 = F.1 (acesso compartilhado)** — já estava no plano, sem mudanças

---

### ETAPAS FINAIS E FUTURAS (registrado, não planejado em detalhe agora)

Conteúdo da aba "Sobre" (manuais com GIFs, vídeos de divulgação) e funcionalidades estratégicas futuras: alertas de reposição por ciclo de vida do produto, controle de validade/vencimento no estoque, tags de clientes, "dinheiro parado", assistente de IA pro WhatsApp (expansão do Gemini já configurado). Todos fazem sentido só depois que a Fase H (uso diário) estiver estável — não há decisão de arquitetura pendente ainda, só volume de trabalho.

**Relatórios avançados com cards configuráveis — ✅ CONCLUÍDO (15/07/2026, v99)**
6 novos "Cards de Inteligência" em Relatórios: **Taxa de Recompra** (% clientes que compraram mais de 1x), **Curva ABC de Estoque** (classificação Pareto por faturamento — A até 80%, B até 95%, C o resto), **Taxa de Ruptura** (% do catálogo ativo sem estoque agora), **Análise de Descontos** (% de vendas com desconto no pedido + valor médio), **Ticket Médio por Linha** (ranking das linhas com maior valor médio de pedido) e **Conversão de Agendamentos** (reaproveita `ag.conversaoVenda` já existente). Nova seção "Relatórios" em Minha Conta com um toggle por card — todos ativados por padrão (padrão pedido no docx). Painel mostra aviso quando a consultora desliga todos.
**Arquivos**: `js/relatorios.js`, `js/perfil.js`, `js/app.js`, `js/state.js` (nova aba `SECTIONS.perfil`)
**Verificação**: 6 valores calculados conferidos com dados controlados (recompra 50%/1 de 2, ruptura 50%/1 de 2, desconto 33%/média R$20, ticket R$200/Nutriplus); config completa (6 toggles presentes); desligar 1 card some só com ele, outros continuam; desligar todos mostra a mensagem certa.

**Painel de aniversariantes — ✅ CONCLUÍDO (15/07/2026, v99, já existia + completado)**: o painel "🎂 Aniversariantes próximos" já existia no dashboard (janela de 30 dias, ordenado por proximidade, botão de WhatsApp, atalho de carrinho) — só faltava a mensagem mencionar oferta de presente, conforme pedido. Adicionado convite pra "condição especial de presente" na mensagem de WhatsApp. Testado: painel filtra corretamente (mostra "hoje" e "3 dias", exclui aniversário distante), mensagem inclui o texto novo.
**Arquivos**: `js/whatsapp.js`

**Datas comemorativas (feriados + datas comerciais) — ✅ CONCLUÍDO (15/07/2026, v99)**
**Pedido do usuário**: card mostrando feriados nacionais e datas comerciais (Namorados, Mães, etc.) próximas — boas ocasiões de presente.

**Decisões tomadas** (usuário confirmou feriados + datas comerciais; segui minha recomendação de fonte/local):
- **Feriados nacionais**: buscados da **BrasilAPI** (`brasilapi.com.br/api/feriados/v1/{ano}`, gratuita, sem chave) — se falhar (sem internet), o card segue só com as datas comerciais, sem quebrar nada
- **Datas comerciais**: calculadas localmente — fixas (Dia da Mulher 08/03, Namorados 12/06, Crianças 12/10, Natal 25/12) e móveis (Páscoa via algoritmo de Gauss/Meeus; Mães = 2º domingo de maio; Pais = 2º domingo de agosto; Black Friday = dia seguinte à 4ª quinta de novembro — **não** "4ª sexta do mês", que dá data errada em alguns anos, ex: 2024 seria 22/11 em vez do 29/11 real)
- **Local/janela**: novo card "🎁 Datas comemorativas" no Painel Inicial, ao lado de "Aniversariantes próximos", próximos 30 dias, carregado uma vez por sessão (mesmo padrão assíncrono do alerta de leads)

**Bug encontrado e corrigido durante a verificação**: a primeira versão gerava data comercial duplicada (ex: "Dia dos Pais" aparecendo duas vezes, em dias próximos mas diferentes) porque datas de anos diferentes eram misturadas sem guardar o ano de origem, e a lógica de "rolar pro próximo ano" reaproveitava o dia/mês entre anos — errado pra datas móveis, que mudam de dia ano a ano. Corrigido guardando o ano em cada candidato e deduplicando por nome (mantém só a ocorrência mais próxima).

**Arquivos**: `js/datasComemorativas.js` (novo), `js/dashboard.js`, `js/app.js`
**Verificação**: fórmulas de Páscoa/Mães/Pais validadas contra datas reais conhecidas de 2024/2025; Black Friday validado contra 2024/2025/2026 (29/11, 28/11, 27/11 — todos corretos); BrasilAPI confirmada acessível e retornando dados reais; integração completa testada no dashboard sem duplicatas.

---

## FASE I — Rodada 15/07/2026 (segunda leva do docx no mesmo dia)

**I.1 Importar PDF: montar kits e ratear preço — ✅ CONCLUÍDO (v100)**
Detecta blocos de kit no PDF (marcador "Esconder Detalhes" + cabeçalho "Quantidade" dos componentes, tolerante a glifos corrompidos da fonte da Farmasi) e rateia o valor total do kit entre os componentes, igual à montagem manual de kit da Pré-encomenda. Também preenche custo unitário de produtos avulsos quando o valor está legível (só confia no valor se nenhum dígito da faixa 4/6/9 tiver se perdido na extração — melhor não preencher do que preencher errado).
**Testado** com os dois PDFs reais de pedido fornecidos pelo usuário via harness Node isolado antes de integrar.
**Arquivos**: `js/estoque.js`

**I.2 Bug do relatório "Pedido" — ✅ CONCLUÍDO (v100)**
Causa raiz: um doc de "venda" representa o pedido inteiro (pode ter vários produtos), nunca teve `produtoId`/`produtoNome` — o ranking por produto usava um fallback genérico "Pedido" sempre. Corrigido: `salesAgg()` agora busca os itens do carrinho original de cada venda pra montar o ranking por produto de verdade.
**Arquivos**: `js/state.js`

**I.3 Status de evento por data — ✅ CONCLUÍDO (v100)**: "Aguardando início" / "Ativo" / "Expirado" calculado pela vigência; lista sempre ordenada por data do evento.
**I.4 WhatsApp na lista de desejos + foto da consultora no link público — ✅ CONCLUÍDO (v100)**
**I.5 Campo "como deseja ser chamado(a)" — ✅ CONCLUÍDO (v100)**: cliente + link de evento; usado em todas as mensagens de WhatsApp do sistema (`nomeChamado()` em `state.js`).
**I.6 Recomendações → atalho de pré-encomenda — ✅ CONCLUÍDO (v100)**
**I.7 Agenda do Painel Inicial configurável — ✅ CONCLUÍDO (v100)**: campo em Minha Conta pra mostrar 0/3/7/15 dias além de hoje, expansível com endereço (link de mapa) e observações.
**I.14 Reabrir troca — ✅ CONCLUÍDO (v100)**: estorna os lançamentos de estoque já processados (saída volta a entrar, entrada volta a sair) e volta o status pra "aberta". Reversão de item "entrada" pode falhar se o produto já foi consumido em outro lugar depois — nesse caso avisa e segue com os demais.
**I.15 Lista de interesse permanente do cliente — ✅ CONCLUÍDO (v100)**: campo `interesses` no doc do cliente (distinto da lista de desejos do evento, que é temporária). Botão "⭐ Lista de interesse" na lista de desejos do evento copia os produtos pro cadastro do cliente pra sempre; painel novo no Cliente 360 lista/remove.
**I.16 Remover importação por JSON de Produtos/Catálogo/Estoque — ✅ CONCLUÍDO (v100)**: removidas as abas "Importar" de Produtos e Catálogo (cadastro manual + base coletiva já cobrem o caso de uso); no Estoque, a aba "Importar pedido" ficou só com o PDF (kits + custo automático), removido o textarea/upload de JSON. Funções órfãs (`readProductFiles`, `previewImportProdutos`, `confirmImportProdutos`, `editarItemImportProduto`, `importPanelHtml`, `readCatalogoFiles`, `importarCatalogoTexto`, `readPedidoFile`, `previewPedidoEstoque`, `normalizePedido`) removidas de `importar.js`/`catalogo.js`/`produtos.js`/`estoque.js`. Admin → Catálogo mestre não foi afetado (import próprio, mantido).

**Pendente desta rodada** (adiado a pedido do usuário — "itens rápidos primeiro"):
- **I.8** Cores de entrada/saída no estoque (azul/verde) + % lucro/prejuízo — precisa esclarecer com o usuário qual tela ele tem em mente, não achei uma lista de "histórico de movimentações" visível no código atual
- **I.9** Drag-and-drop pra reordenar os cards de Relatórios (além do toggle liga/desliga que já existe nos Cards de Inteligência) — estender pra Novas clientes por origem/Produtos/Estoque/Clientes/Agenda/Pagamentos/Trocas também
- **I.10** Debug do "Gerar com IA" (Gemini) no cadastro de produto — usuário criou chave nova e continua falhando; precisa investigar com uma chave real (não reproduzível no preview sem credencial)
- **I.11** Numeração de pedido com sufixo -01/-02 por cliente, aplicado retroativamente nas vendas existentes
- **I.12** Auditoria de responsividade mobile (revisão ampla, ainda não iniciada)
- **I.13** (respondido, não é código) Viabilidade de Cowork monitorar a base e avisar por WhatsApp — depende de agente agendado + WhatsApp Business API; não é algo que o CRM resolve sozinho hoje

---

## INFRA (ações fora do código, paralelas)

1. **Deploy do `firestore.rules`** — as regras de multi-admin/base coletiva/eventos estão escritas mas nunca publicadas. Rodar `firebase deploy --only firestore:rules` ou colar no Console. Sem isso, telas de admin/config de planos falham por permissão, o F.1 depende disso, e **excluir eventos e marcar leads como "Tratado" também ficam bloqueados** (correção de 15/07/2026 no bloco de `listasDesejo`)
2. **Limpar conta de teste** — `preview.teste.crm@example.com` no Firebase Auth + doc `users/{uid}` correspondente (apagar pelo Console, se desejar)

---

## Ordem de execução sugerida

| # | Item | Esforço | Observação |
|---|------|---------|------------|
| 1 | B.1 Agendamento + mapa | Pequeno | ✅ Concluído (v97) |
| 2 | B.2 Expandir venda | Pequeno | ✅ Concluído (v97) |
| 3 | B.3 Desconto no pedido | Médio | ✅ Verificado (15/07/2026) |
| 4 | B.4 Frete | Médio | ↩️ Revertido — substituído por G.2 (frete só na Pré-encomenda) |
| 5 | B.5 Agendamento sem cliente | Pequeno | ✅ Concluído (v97) |
| 6 | C.1 Reabrir venda | Médio | Manter pagamentos + aviso na tela |
| 7 | C.2 Cartão/parcelas/link | Médio-grande | |
| 8 | D.1 PDFs | Médio | Depois de B.3/B.4 |
| 9 | E.1 KITs | Grande | ✅ Concluído (v97) |
| 10 | F.1 Acesso compartilhado | Grande | Depende do deploy das rules |

**Correção extra (14/07/2026)**: menu lateral — `#nav{flex:1;min-height:0}` fazia o nav encolher e o conteúdo excedente (Sobre) vazar por baixo do botão Sair em telas baixas; trocado para `flex:1 0 auto` (a sidebar rola, ordem preservada). Verificado em desktop, 900px e mobile.

**Decisões tomadas em 13/07/2026**: B.4 = frete só como despesa da consultora; C.1 = manter pagamentos e mostrar na tela o valor já pago.
