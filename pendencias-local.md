# Pendências locais (ainda não viraram código)

Levantado numa sessão de Claude Code local (não a que roda na nuvem), a partir de pedidos do
usuário que ainda não foram implementados até o momento deste commit.

## 1. Auditoria de responsividade mobile (completa)

**Problema:** foi corrigido um caso concreto de overflow no mobile — o campo "Desconto no
pedido" do carrinho aberto extrapolava a largura da tela — e aplicada uma correção genérica
(`min-width:0` em `input,select,textarea` no CSS global) que deve prevenir a mesma classe de bug
em outros lugares. Mas isso não é uma auditoria completa: não foi feita uma varredura tela por
tela (Clientes, Agenda, Vendas, Estoque, Produtos, Relatórios, Catálogo, Catálogo de Eventos,
Cliente 360, telas de modal) checando comportamento em larguras estreitas (320–400px), rotação,
teclado virtual cobrindo campos, etc.

**Tela/arquivo envolvido:** todo o app (`css/style.css` + telas em `js/*.js`).

## 2. Vínculo automático de linha na importação de produtos (confirmar se ainda é bug)

**Problema relatado pelo usuário:** "se o nome da linha vinda do produto coincidir exatamente
com uma linha existente no sistema do cliente, o vínculo deve ser feito de forma 100%
automática, sem precisar desmarcar e marcar a linha de novo para salvar a relação."

O bug concreto e comprovado (duplicidade de nomes de linha se acumulando, tipo "Maquiagem,
Cremoso, Maquiagem, Cremoso") já foi corrigido na raiz em `mesclarLinhas()` (`js/produtos.js`).
Não ficou claro, porém, se existe *também* um problema separado de UI (algum checkbox/toggle de
associação de linha que exige desmarcar e marcar de novo para persistir) — não foi encontrado
nenhum código correspondente a esse sintoma específico. Fica como item para o usuário confirmar,
testando na prática, se o problema ainda ocorre depois da correção de duplicidade — se sim,
precisa de investigação adicional.

**Tela/arquivo envolvido:** Produtos → aba "Linhas" (`js/produtos.js`, função `linhasTabHtml` e
`toggleProdutoNaLinha`).

## 3. Automação do WhatsApp via APK (dependência externa, fora deste repositório)

**Problema/dúvida do usuário:** ele perguntou se a "função automática" do WhatsApp vai funcionar
com uma "APK corrigida" — ou seja, um empacotamento deste CRM como app Android (WebView/wrapper),
possivelmente com algum tipo de automação de envio (ex: serviço de acessibilidade que aperta
"enviar" sozinho). Esse empacotamento Android não existe neste repositório (não há pasta
`android/` nem config de Capacitor/Cordova) — vive em outro projeto que a sessão de nuvem também
não tem visibilidade, a menos que o próprio código do wrapper esteja em outro lugar do
repositório remoto.

**O que o CRM web faz hoje:** abre um link `wa.me` com a mensagem pré-preenchida — quem aperta
"enviar" é sempre a consultora, dentro do WhatsApp. Não há automação de envio no lado web.

**Atenção:** automação que aperta "enviar" sozinha (via serviço de acessibilidade) viola os
termos de uso do WhatsApp e corre risco real de banimento do número usado — vale essa ressalva
se o usuário insistir nessa direção.

**Tela/arquivo envolvido:** nenhum neste repositório — é sobre um projeto/empacotamento externo.
