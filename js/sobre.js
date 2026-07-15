import { state, SECTIONS } from './state.js';
import { $, esc, sectionTabsHtml, formatDateBR } from './utils.js';

// Versão exibida em Sobre → Dados do sistema. Mantida manualmente em sincronia com o
// "?v=" de index.html/evento.html a cada alteração relevante (mesmo padrão de cache-busting).
export const APP_VERSION = 'v99';

// Changelog manual — cada entrada é uma rodada de melhorias já concluída.
const NOVIDADES = [
  { versao: 'v99', itens: [
    '⚠️ Reabrir uma venda com pagamento registrado deixou de apagar o pagamento — agora ele é mantido e aparece um aviso bem visível no topo do carrinho reaberto com o valor já pago. Ao finalizar de novo, o status (pendente/parcial/pago) é recalculado sozinho contra o total atual; se o valor pago passar do novo total, o sistema avisa o excedente para você decidir (crédito ou estorno).',
    '🎁 Kits da Pré-encomenda blindados: agora um kit é tratado como produto único de verdade — não dá mais pra editar ou remover um componente sozinho (isso descaracterizava o kit e perdia os valores rateados). Um novo botão "🗑️ Remover kit inteiro" tira todos os produtos do kit de uma vez, com confirmação listando o que será removido.',
    'Produtos: novo botão "+ Novo produto" pra cadastrar manualmente, sem precisar de importação ou sincronização.',
    'Carrinho: botão "WhatsApp" virou "Enviar pedido" (mesmo ícone) — deixa claro o que o botão faz.',
    'Agenda: novo campo "Hora final" (opcional) — melhora a duração do evento espelhado no Google Agenda.',
    'Cliente 360: histórico de vendas agora expande (▸) e mostra os itens da compra, igual à tela de Vendas.',
    'Estoque → Pré-encomenda: novo campo de busca, filtra "A comprar" e "Aguardando chegada" ao mesmo tempo.',
    'Clientes: novo card "Total de clientes" no topo da tela.',
    'Tooltips explicando "OK", "Sem custo", "Baixo" e status de pagamento — passe o mouse por cima. Vários ícones de ação que só tinham símbolo ganharam texto explicativo também.',
    'Catálogo de Eventos: novo toggle "Mostrar todo o catálogo Farmasi no link" (desconto continua só nas linhas participantes) e tag de "X em pronta entrega" / "Sob encomenda" em cada produto da vitrine pública.',
    'Painel Inicial: aviso quando um link de evento capta um lead novo (lista de desejos), com atalho pra ver e atender.',
    'Carrinho: novo botão "💳 Enviar link de pagamento" (aparece quando há link cadastrado em Minha Conta e saldo pendente) — manda o link certo com o valor que falta receber.',
    'Painel Inicial: alerta quando o plano está a 7 dias ou menos do vencimento, com atalho pra renovar.',
    'Mensagem de aniversário no WhatsApp agora convida pra uma condição especial de presente, não só os parabéns.',
    'Painel Inicial: novo card "🎁 Datas comemorativas" — feriados nacionais (buscados automaticamente) + datas comerciais (Dia das Mães, Namorados, Pais, Crianças, Black Friday, Páscoa, Natal, Dia da Mulher) nos próximos 30 dias. Ótimas datas pra oferecer presente.'
  ] },
  { versao: 'v98', itens: [
    '🎁 Kits mudaram de lugar: agora são montados em Estoque → Pré-encomenda, porque o kit é o que você compra da Farmasi (não o que vende ao cliente). O valor pago é rateado como custo previsto de cada produto na lista "A comprar" e vira custo médio do estoque quando o pedido chega.',
    '🚚 Frete também mudou: registrado na Pré-encomenda (frete pago à Farmasi no pedido de compra), como despesa simples — aparece descontado no lucro líquido dos Relatórios. O campo de frete saiu do carrinho do cliente.',
    'Vendas: nova busca por cliente acima dos filtros — digite o nome pra achar o pedido na hora.',
    '💳 Créditos do cliente: recebeu a mais que o devido? O sistema pergunta se quer guardar o excedente como crédito no cadastro. Na próxima compra (ou num pagamento pendente), é só marcar "Usar créditos" — o saldo aparece no Cliente 360 e na gestão de pagamento.',
    'Base coletiva: a administração agora publica também as LINHAS de produto (Admin → Catálogo mestre). Em Produtos → Linhas, o botão "🔄 Sincronizar linhas da base coletiva" acrescenta as linhas do admin às suas — as que você já tem permanecem.',
    '📄 PDF do pedido (cliente e interno) refeito: resumo compacto no topo (pedido, pagamento e totais lado a lado), cada produto em uma linha com foto, quantidade e valores, e os benefícios e o desconto logo abaixo do nome — bem menos espaço desperdiçado.',
    '📄 PDF do catálogo: a descrição do produto agora preenche todo o espaço do quadro (não corta mais com "..." em 3 linhas) e o cabeçalho ficou num tom suave, combinando com o restante do sistema.',
    'Carrinho: coluna "Entrega" (status do produto no estoque: Pronta/Futura) e nova coluna "Quando", com seletor "Agora / Depois" — decisão do consultor, independente do estoque. Mesmo com o produto em pronta entrega, dá pra desativar e deixar pendente pra entregar em outro momento (o pedido finaliza como parcial; a entrega é confirmada depois pelo botão 📦 em Vendas). Ligar "Agora" exige estoque disponível.'
  ] },
  { versao: 'v97', itens: [
    'Sincronização em tempo real: lançamentos feitos em outro aparelho/aba aparecem sozinhos, sem precisar atualizar o navegador.',
    'Nome do cliente corrigido no cadastro agora atualiza também nas vendas, agenda e painel (registros antigos mostram sempre o nome atual).',
    'Agenda: novo campo "Local / endereço" no agendamento, pré-preenchido com o endereço do cliente, com botão 📍 que abre o Google Maps. Endereço errado no mapa? Cole um link do Maps no campo que ele abre direto no ponto certo. O local também vai junto pro Google Agenda.',
    'Vendas: clique no ▸ (ou no número de itens) para expandir a venda e ver os produtos, quantidades e valores dali mesmo, sem abrir o carrinho.',
    'Carrinho: novo desconto sobre o pedido inteiro (% ou R$, ex: 10% na primeira compra) — o total a cobrar recalcula sozinho e o desconto aparece no PDF e no resumo de WhatsApp.',
    'Corrigido: em telas mais baixas, o botão "Sair" invadia o menu lateral e aparecia antes do "Sobre".',
    'Agenda: cliente deixou de ser obrigatório — dá pra criar um compromisso só seu, sem cliente vinculado (ex: um evento de demonstração), com título próprio no lugar do nome.',
    'Corrigido: a busca do Estoque não filtrava a cada letra digitada (a função de render não estava exposta pro campo — o erro era silencioso). Agora filtra igual à de Produtos.',
    'Reabrir venda com pagamento registrado agora avisa o valor que já tinha sido pago antes de reabrir.',
    'Produtos → Linhas: busca filtra a cada letra, produtos em ordem alfabética e seletor visual igual ao "Ativo no catálogo".',
    'Coluna de ações das tabelas ficou mais larga — botões não ficam mais espremidos.'
  ] },
  { versao: 'v96', itens: [
    'Todas as janelas do sistema agora têm botão de minimizar (─ no canto superior direito): dá pra navegar por outras telas no meio de um carrinho, troca ou formulário e voltar depois pela barrinha "Janela minimizada" no canto inferior.',
    'Trocas: novo toggle "Mostrar itens sem estoque" no lado dos produtos que saem — itens sem estoque entram como "vou entregar depois" e a baixa acontece sozinha quando chegar estoque.',
    'Trocas: o lado "produtos que entram" agora tem busca de produtos existentes igual ao lado que sai — o texto livre fica só pra produto realmente novo.',
    'Trocas: novo botão "💾 Salvar" pra guardar e fechar a troca sem finalizar (os itens já eram salvos automaticamente; agora tem a saída explícita).'
  ] },
  { versao: 'v95', itens: [
    'Trocas: agora dá pra registrar a saída de um produto como "vou entregar depois" mesmo sem ter estoque suficiente agora (antes isso era bloqueado, mesmo escolhendo essa opção).',
    'Quando chega estoque novo, os itens de troca pendentes de entrega são baixados sozinhos automaticamente — mesma automação que já existia pra carrinhos de venda.',
    'Corrigido: itens de troca "entrega futura" não contavam mais como reservados incorretamente (só pronta entrega conta, igual ao carrinho).'
  ] },
  { versao: 'v94', itens: [
    'Minha Conta → Meu plano: semestral e anual agora mostram o % de desconto em relação ao mensal, calculado automaticamente pelos preços cadastrados.'
  ] },
  { versao: 'v93', itens: [
    'Estoque: filtro "Todas as linhas" igual ao de Produtos, funcionando junto com a busca.',
    'Corrigido alinhamento dos cards de Estoque/Produtos: a coluna de ações tinha largura variável (dependia de quantos botões o card tinha), o que desalinhava as colunas entre os cards. Agora tem largura fixa e os botões quebram em duas linhas quando precisa.'
  ] },
  { versao: 'v92', itens: [
    'Corrigido: "Registrar pagamento" de um pedido pendente agora habilita Débito/Crédito + parcelas quando a forma é Cartão, com o mesmo cálculo de taxa/juro usado no carrinho na hora da venda.',
    'O custo de cartão desse pagamento atualiza o lucro real da venda nos Relatórios, mesmo quando o pagamento chega depois do pedido já ter sido finalizado.',
    'Histórico de pagamentos agora mostra o tipo de cartão e as parcelas usadas em cada pagamento.'
  ] },
  { versao: 'v91', itens: [
    'Corrigido bug: itens "entrega futura" em carrinhos abertos agora convertem sozinhos para "pronta entrega" assim que chega estoque novo (entrada manual, importação ou pré-encomenda) — os mais antigos primeiro, só até onde o estoque der conta.',
    'Se o carrinho já estava finalizado com entrega pendente, a entrega é feita de verdade na hora (baixa o estoque e marca como entregue), sem precisar fazer isso manualmente depois.',
    'Isso também corrige o "reservado" não aparecer certo em Estoque/Produtos depois que um item de entrega futura vira pronta entrega.'
  ] },
  { versao: 'v90', itens: [
    'Corrigido bug da pré-encomenda: marcar um item como "pedido" agora cria um registro separado de "a comprar" — clicar em Pré-encomendar de novo no mesmo produto não soma mais na quantidade errada de "chegando".',
    'Os selos "X na lista" / "X chegando" agora aparecem em todos os produtos do Estoque (antes só em estoque baixo), igual já era em Produtos.',
    'Confirmar chegada na pré-encomenda agora ativa "pronta entrega" automaticamente. Se você tinha desativado isso manualmente, o sistema pergunta antes de reativar.',
    'Entrada/saída de estoque (manual, importação, pré-encomenda) agora liga/desliga "pronta entrega" sozinha: ativa quando o estoque fica positivo, desativa quando zera — respeitando quando você desativou manualmente.'
  ] },
  { versao: 'v89', itens: [
    'Relatórios: novo painel "Saídas de estoque (sem venda)" — mostra brinde, parceria, consumo próprio, perda e ajuste, agrupados com quantidade e valor.',
    'Novo "Relatório completo por produto": tabela com todos os produtos vendidos no período (não só top 5), com quantidade, preço médio, faturamento e lucro — ordenável clicando no cabeçalho.',
    'Card "Itens vendidos" renomeado para "Unidades vendidas" (o nome antigo dava a entender que era número de vendas, mas sempre foi soma de unidades).'
  ] },
  { versao: 'v88', itens: [
    'Nova aba "Linhas" em Produtos: cadastre suas próprias linhas (em vez de vir automático do arquivo importado) e atribua em massa a vários produtos de uma vez, marcando/desmarcando numa lista.',
    'No cadastro de produto, o campo Linha agora vira uma lista de seleção (checkbox) baseada nas suas linhas cadastradas, em vez de texto livre.',
    'Importação de produtos não sobrescreve mais a linha automaticamente — a coluna "Linha" na conferência agora é só informativa; a linha real é definida por você em Produtos → Linhas.'
  ] },
  { versao: 'v87', itens: [
    'Corrigido bug importante: reserva de estoque. Antes, dois carrinhos abertos (ou um carrinho + uma troca) podiam vender a mesma última unidade em estoque ao mesmo tempo, porque o sistema só descontava o estoque de verdade ao finalizar. Agora, enquanto o carrinho/troca está aberto, a quantidade já fica "reservada" e não pode ser vendida de novo em outro lugar.',
    'Produtos e Estoque agora mostram um selo "🛒 X reservado" quando parte do estoque já está comprometida em carrinhos/trocas abertos.',
    'Os seletores de produto (carrinho e trocas) agora mostram "disponível" já descontando as reservas, em vez do estoque bruto.'
  ] },
  { versao: 'v86', itens: [
    'Pré-encomenda: novo campo "Preço unit." na lista "A comprar" — ao marcar como pedido, esse valor já vem preenchido no "Custo unit. pago" da tela de chegada (só confirma ou corrige se precisar).',
    'Botão "📋 Pré-encomendar" agora mostra "X na lista" (ainda precisa comprar) e "X chegando" (já pedido, aguardando chegar) em linhas separadas, em vez de só "X na lista" pra tudo.'
  ] },
  { versao: 'v85', itens: [
    'Produtos: novo filtro "Todas as linhas" pra mostrar só os produtos de uma linha específica.',
    'Sincronizar com base coletiva: agora dá para escolher importar só uma linha específica, em vez de trazer o catálogo inteiro toda vez.',
    'Corrigido bug de duplicação ao sincronizar a base coletiva (o código do produto não era comparado de forma padronizada, então o mesmo produto podia gerar duas entradas).',
    'Corrigido bug do toggle "Sincronizar automaticamente" (Base coletiva): mudar o horário logo depois de ligar o toggle podia desativar a sincronização automática sem querer.'
  ] },
  { versao: 'v84', itens: [
    'Redesenho do pagamento no carrinho: o select "Pendente/Pago/Parcial" saiu — agora é um campo único "Valor recebido agora", já vindo preenchido com o total do pedido (edite pra menos se for receber só uma parte). O status pendente/parcial/pago passa a ser calculado sozinho a partir desse valor, direto no fechamento da venda — sem precisar editar depois em outra tela.',
    'Cartão agora tem opção Débito/Crédito — débito não parcela e usa uma taxa própria (configurável em Minha Conta → Pagamento), diferente da taxa de crédito.'
  ] },
  { versao: 'v83', itens: [
    'Vendas/Carrinhos: agora dá para ordenar clicando no cabeçalho das colunas (Cliente, Itens, Total, Lucro, Status), igual já funcionava em Produtos/Estoque.'
  ] },
  { versao: 'v82', itens: [
    'Corrigido bug importante: ao finalizar uma venda no cartão parcelado onde o juro é da cliente, o sistema podia cobrar esse juro do lucro da consultora por engano (usava uma configuração desatualizada em vez da regra automática de "quem assume o juro"). Agora sempre usa a regra atual na hora de finalizar.'
  ] },
  { versao: 'v81', itens: [
    'Pré-encomenda dividida em duas listas: "A comprar" (o que ainda falta pedir) e "Pedido — aguardando chegada" (o que já foi comprado no site da Farmasi, esperando entrega).',
    'Botão "✅ Pedido" move o item para "aguardando chegada". Quando os produtos chegarem, informe a quantidade recebida e o preço pago e clique em "📦 Confirmar chegada" — o estoque é atualizado na hora.',
    'Novo botão "🎁 Adicionar brinde": registra produtos que a Farmasi manda de brinde (conforme o valor do pedido) direto na lista de chegada, com custo padrão zero.'
  ] },
  { versao: 'v80', itens: [
    'Gestão de pagamento parcial: pedidos finalizados agora mostram "R$ recebido de R$ total" e têm um histórico de pagamentos (data, valor, forma, observação).',
    'Novo botão "💰 Registrar pagamento" (em Vendas/Carrinhos e na ficha do pedido) — registra um valor recebido (sinal, parcela, quitação) e o status (Pendente/Parcial/Pago) passa a ser calculado sozinho a partir do que já foi recebido.',
    'Resolve o caso de pedido com entrega parcial onde a cliente já pagou parte antecipado (ex: Pix de sinal) e o restante fica pra depois.'
  ] },
  { versao: 'v79', itens: [
    'Corrigido: o toggle "Benefícios no PDF" do Catálogo não tinha efeito nenhum na prévia da tela — só valia pro PDF gerado de fato. Agora a prévia já mostra/oculta os benefícios igual ao PDF final.'
  ] },
  { versao: 'v78', itens: [
    'Corrigido: o botão 🔄 de sincronizar Google Agenda no Painel Inicial estava reabrindo a tela de conexão/consentimento do Google toda vez, mesmo já conectado. Agora só puxa os eventos novos, sem abrir nada.'
  ] },
  { versao: 'v77', itens: [
    'Corrigido: ao criar senha numa conta Google (tela de bloqueio após 1h do primeiro acesso), a tela não fechava mesmo com a senha salva com sucesso.',
    'Buscadores de produto (carrinho, entrada/saída de estoque, trocas) agora também encontram pelo código Farmasi, não só pelo nome.',
    'Corrigida a linha fictícia "Importado pedido" criada por importações antigas de pedido/estoque — novas importações não criam mais essa linha, e um botão "🔧 Corrigir linha" em Produtos remove ela dos produtos que já ficaram com esse valor.',
    'Sincronização automática da base coletiva agora avisa quando falha (antes falhava em silêncio, dando a impressão de que não fazia nada).',
    'Pré-encomenda: imagem do produto adicionada antes do nome na lista.'
  ] },
  { versao: 'v76', itens: [
    'Novo botão "📤 Exportar JSON" em Produtos: baixa toda a sua base de produtos num arquivo JSON compatível com a importação — dá pra mandar pra outra consultora ou pro admin publicar na base coletiva.',
    'Esse JSON exportado já pode ser importado direto em Produtos ou em Admin → Catálogo mestre — os dois já pedem conferência e confirmação antes de salvar (nada entra na base sem você revisar e clicar em Salvar).'
  ] },
  { versao: 'v75', itens: [
    'Admin → Catálogo mestre: importação de JSON agora mostra uma tela de conferência antes de salvar (igual à importação de Produtos), com contagem de novos/atualizações e nada é salvo até clicar em "Salvar".',
    'Nas duas telas de importação (Produtos e Catálogo mestre), todos os campos da conferência (nome, código, linha, preço original/atual) agora são editáveis direto na tabela antes de confirmar.'
  ] },
  { versao: 'v74', itens: [
    'Nova opção em Minha Conta → Segurança: "Excluir minha conta definitivamente" (Direito de Eliminação da LGPD). Apaga clientes, produtos, agenda, estoque e demais dados pessoais; anonimiza (sem apagar) o histórico de vendas por exigência fiscal; e remove o login do Firebase Auth para sempre, após confirmar senha/Google.'
  ] },
  { versao: 'v73', itens: [
    'Botão "📋 Pré-encomendar" agora funciona como contador: cada clique soma +1 na quantidade do produto na pré-encomenda, em vez de travar depois do primeiro clique.',
    'Mostra ao lado do botão quantas unidades desse produto já estão na pré-encomenda, pra não perder a conta.'
  ] },
  { versao: 'v72', itens: [
    'Nova lista "Pré-encomenda" (Estoque → aba Pré-encomenda): o que você precisa comprar no site da Farmasi, com nome, código, estoque atual, quantidade reservada em carrinhos abertos, quantidade a comprar (editável) e observações (editável).',
    'Botão "📋 Pré-encomendar" em Produtos e nos itens de Estoque baixo, pra adicionar qualquer produto à lista.',
    'Ao vender um produto sem estoque (entrega futura), ele entra sozinho na pré-encomenda — sem sobrescrever se você já tiver ajustado a quantidade/observação manualmente.'
  ] },
  { versao: 'v71', itens: [
    'Catálogo de evento público: fonte base maior (nome, benefícios, código e preço) para facilitar a leitura, principalmente no celular.',
    'Novo botão flutuante A+/A- no catálogo de evento para a visitante ajustar o tamanho da letra na hora — a preferência fica salva no aparelho dela para as próximas visitas.'
  ] },
  { versao: 'v70', itens: [
    'Importação de produtos/estoque: quando o mesmo produto (por código Farmasi) aparece com benefícios em uma importação e sem (ou com texto mais curto) em outra, o sistema agora sempre mantém o texto de benefícios mais completo já cadastrado, em vez de sobrescrever com um mais pobre.'
  ] },
  { versao: 'v69', itens: [
    'Rótulos de papel (Consultor(a), Administrador(a), Usuário(a)) agora respeitam o gênero cadastrado no perfil de cada pessoa, em vez de assumir sempre o feminino. Sem gênero definido, usa a forma neutra "Consultor(a)"/"Administrador(a)".',
    'Aplicado em: saudação do painel, nome exibido no topo, gestão de consultoras (Admin), regra de juro do cartão no carrinho e catálogo de evento público.'
  ] },
  { versao: 'v68', itens: [
    'Novas regras de cartão em Minha Conta → Pagamento: defina até quantas parcelas você assume o juro e o valor mínimo do pedido para liberar parcelamento — o sistema agora decide sozinho quem paga o juro em cada venda, sem precisar escolher manualmente.',
    'Pedidos parcelados abaixo do valor mínimo configurado sempre jogam o juro para a cliente, com aviso na tela do carrinho.'
  ] },
  { versao: 'v67', itens: [
    'Contas que entram com Google agora podem criar uma senha em Minha Conta → Segurança (assim também passam a poder entrar com e-mail e senha).',
    'Depois de 1 hora do primeiro acesso via Google sem senha criada, o sistema passa a pedir a criação da senha antes de liberar o uso (aviso, não bloqueia na primeira hora).',
    'Regra de senha forte aplicada em toda criação/alteração de senha: mínimo 8 caracteres, com número e caractere especial.',
    'Ícone de mostrar/ocultar senha em todos os campos de senha do sistema.'
  ] },
  { versao: 'v66', itens: [
    'Vendas/Carrinhos: novo botão "💰 Marcar pago" em pedidos finalizados (antes não havia como mudar o status de pagamento pela tela).',
    'Novo botão "↩️ Reabrir" em pedido finalizado — devolve os itens ao estoque, apaga a venda registrada e volta o carrinho para edição (corrige finalizações feitas por engano).',
    'Novo botão "🗑️ Excluir" para apagar um carrinho finalizado/cancelado definitivamente.',
    'Importação de produtos JSON agora também aceita o formato com "valorUnitarioNumero"/"valorUnitario" (além dos formatos já suportados).',
    'Catálogo → Filtros PDF: novo toggle para mostrar/ocultar os benefícios no PDF do catálogo (antes era automático conforme a densidade da página).',
    'Nova opção de origem do cliente: "Já era conhecida/contato".',
    'Corrigido: menu lateral não rolava em zoom alto, deixando o botão "Sair" inacessível.'
  ] },
  { versao: 'v65', itens: [
    '"Lucro potencial" agora mostra o % junto do valor em R$ (pequeno, ao lado) — no card do Estoque, em cada produto, no Painel Inicial e nos Relatórios.',
    'Corrigido: produto sem preço de venda cadastrado mostrava "0%" de margem mesmo com prejuízo — agora mostra "-100%" (deixa claro que falta preço pra cobrir o custo).'
  ] },
  { versao: 'v63', itens: [
    'Importar pedido/estoque: nova coluna "Preço de venda cadastrado" mostrando o preço já registrado do produto ao lado do custo da nota, com aviso "lucro"/"prejuízo" — facilita conferir a margem antes de confirmar a importação.'
  ] },
  { versao: 'v62', itens: [
    'Corrigido bug: quando o mesmo produto aparecia duas vezes no arquivo de importação de pedido, cada linha virava um toggle "pronta entrega"/"monitorar" separado para o mesmo produto — a última linha processada podia sobrescrever com desativado. Agora as linhas duplicadas são somadas em uma só antes da conferência.',
    'Novo botão "✅ Ativar pronta entrega (em estoque)" no Estoque: liga a flag de uma vez para todos os produtos que já têm estoque, sem precisar abrir um por um.'
  ] },
  { versao: 'v61', itens: [
    'Nome da consultora agora aparece no canto superior direito (em vez do rótulo genérico "Consultora"), puxado de Minha Conta.',
    'Botão "Excluir" removido da ficha Cliente 360 — continua só na listagem de clientes.',
    'Excluir cliente agora pede confirmação por digitação ("EXCLUIR"), igual ao padrão da Zona de risco.'
  ] },
  { versao: 'v60', itens: [
    'Trocas: campo "parceira" agora busca entre as clientes já cadastradas (com opção de texto livre pra quem ainda não é cliente).',
    'Trocas: agora dá pra editar a parceira e excluir uma troca inteira, direto na lista ou de dentro dela.'
  ] },
  { versao: 'v59', itens: [
    'Google Agenda agora sincroniza nos dois sentidos: eventos criados/editados direto no celular são puxados pro CRM automaticamente ao conectar/reconectar, e também dá pra puxar a qualquer momento pelo botão "📥 Puxar do Google Agenda" na tela de Agenda.'
  ] },
  { versao: 'v58', itens: [
    'Corrigido bug sério: importar pedido/estoque estava zerando o preço original/atual e apagando a foto de produtos já cadastrados. Agora só mexe nesses campos quando a importação realmente traz essa informação.',
    '"Lucro potencial" no estoque agora usa o preço original como referência quando ainda não há preço de venda definido, em vez de mostrar prejuízo.',
    'Mensagem de erro do Gemini mais clara quando a chave está sem cota disponível.',
    'Zona de risco (Minha Conta): opções separadas para apagar só o estoque, só os clientes ou só as vendas/carrinhos — cada uma com confirmação por digitação.',
    'Base coletiva: aviso sobre possível divergência de preço com o site da Farmasi, data/hora da última sincronização, e opção de sincronizar automaticamente todo dia num horário escolhido.'
  ] },
  { versao: 'v57', itens: [
    'Ícone de sincronizar/conectar Google Agenda direto no painel "Agenda de hoje" do Painel Inicial.'
  ] },
  { versao: 'v56', itens: [
    'Botão "✨ Gerar com IA" no cadastro de produto (e no Catálogo mestre do Admin): sugere um texto de benefícios usando o Gemini, com a chave de API da própria consultora (configurada em Minha Conta).'
  ] },
  { versao: 'v55', itens: [
    'Data e hora ao vivo no Painel Inicial.',
    'Sincronização com Google Agenda: crie um calendário dedicado (nome escolhido em Minha Conta) e os agendamentos passam a aparecer lá automaticamente ao criar/editar/cancelar.'
  ] },
  { versao: 'v54', itens: [
    'Cards e itens dos Relatórios agora são clicáveis — levam direto para a tela relacionada (Estoque, Clientes, Agenda, Vendas, Trocas).',
    'Novo campo "Como conheceu você?" no cadastro de cliente (Evento, Indicação, Instagram, WhatsApp, Parceria/Troca, etc.) — preenchido automaticamente como "Evento" quando vem de uma lista de desejos.',
    'Novo relatório "Novas clientes por origem": quantas e qual % vieram de cada canal no período, com destaque para as vindas de eventos.'
  ] },
  { versao: 'v53', itens: [
    'Novo gráfico de tendência de faturamento por dia nos Relatórios.',
    'Comparação com o período anterior (▲/▼ %) no Faturamento e Lucro real.',
    'Painel de "Lucro líquido consolidado": lucro real das vendas menos o custo de brindes/parcerias/consumo/perdas, num só número.'
  ] },
  { versao: 'v52', itens: [
    'Trocas evoluiu para um "carrinho" completo: vários produtos de cada lado, busca de produto e valor unitário como no carrinho de vendas, e opção de entrega futura por item (entrega/recebe na hora ou depois).',
    'Novo relatório de Trocas: total, pendentes, finalizadas, valor saído/recebido e diferença.'
  ] },
  { versao: 'v51', itens: [
    'Novo botão "🔁 Trocas" no Estoque: registra a baixa de um produto e a entrada de outro recebido em troca com outra consultora, sem gerar receita/lucro no relatório.'
  ] },
  { versao: 'v50', itens: [
    'Menu "Sobre" com dados do sistema e novidades (manual ainda em preparação).',
    'Logo do link público do evento agora mostra as iniciais reais da consultora.',
    '% de economia exibido junto do valor economizado na lista de desejos do evento.'
  ] },
  { versao: 'v49', itens: [
    'Todos os campos de liga/desliga do sistema (carrinho, produtos, admin, importação, eventos) agora usam um toggle switch, no lugar do checkbox quadrado do navegador.'
  ] },
  { versao: 'v47–v48', itens: [
    'Produtos com mais de uma linha (ex: "Cuidados-pele, Cuidados-cabelo") não poluem mais os filtros — cada linha aparece separada e organizada, no Catálogo e no link público de eventos.',
    'Nomes de linha exibidos de forma mais natural (ex: "Cuidados com a Pele").',
    '% de desconto exibido ao lado do preço em todos os locais com "De/Por": Catálogo, PDF, link de evento, Produtos e Admin.'
  ] },
  { versao: 'v41–v46', itens: [
    'Regra de "cliente frio" configurável por consultora (padrão 30 dias).',
    'Lucro real dos pedidos considerando taxa de cartão/maquininha e juros de parcelamento, com detalhamento nos Relatórios e no PDF interno.',
    'Novo plano "Gratuito" (separado do plano de teste), com opção de limite ilimitado de clientes por consultora.',
    'Bloqueio automático de acesso quando o plano vence ou a conta é suspensa pela administração.',
    'Painel financeiro no Admin: receita estimada por plano e consultoras a vencer nos próximos 15 dias.'
  ] },
  { versao: 'v33–v40', itens: [
    'Catálogo de Eventos redesenhado: cabeçalho com nome/Instagram/site da consultora, resumo de economia em tempo real e QR Code do link.',
    'Campo de aniversário como texto livre na lista de desejos pública, com conversão automática ao virar cliente.',
    'Busca com filtro nos seletores de produto (carrinho, estoque).',
    'Correção do bug de status de pagamento (case-sensitive) e do fluxo de entrega futura.',
    'Carrinho: preço original, desconto e retorno agendado em X dias.'
  ] }
];

function dadosSistemaHtml() {
  const p = state.profile || {};
  const u = state.user || {};
  const d = state.data;
  const criadoEm = p.criadoEm?.toDate ? formatDateBR(p.criadoEm.toDate().toISOString().slice(0, 10)) : '-';
  return `<div class="panel">
      <h3>Sobre o sistema</h3>
      <div class="grid">
        <div class="field"><label>Versão</label><b>${esc(APP_VERSION)}</b></div>
        <div class="field"><label>Conta</label><b>${esc(u.email || '-')}</b></div>
        <div class="field"><label>Consultora desde</label><b>${criadoEm}</b></div>
        <div class="field"><label>Plano atual</label><b>${esc(p.plano || 'teste')}</b></div>
      </div>
    </div>
    <div class="panel">
      <h3>Seus dados nesta conta</h3>
      <div class="cards">
        <div class="card"><span>Clientes</span><b>${d.clientes.length}</b></div>
        <div class="card"><span>Produtos</span><b>${d.produtos.length}</b></div>
        <div class="card"><span>Vendas</span><b>${d.vendas.length}</b></div>
        <div class="card"><span>Carrinhos</span><b>${d.carrinhos.length}</b></div>
        <div class="card"><span>Agendamentos</span><b>${d.agendamentos.length}</b></div>
        <div class="card"><span>Eventos</span><b>${d.eventos.length}</b></div>
      </div>
    </div>`;
}

function novidadesHtml() {
  return `<div class="panel">
    <h3>Novidades</h3>
    <p class="muted">O que mudou no sistema, das versões mais recentes para as mais antigas.</p>
    <div class="list">
      ${NOVIDADES.map(n => `<div class="list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
        <b>${esc(n.versao)}</b>
        <ul style="margin:0;padding-left:18px;color:var(--muted);font-size:13px;line-height:1.6">
          ${n.itens.map(i => `<li>${esc(i)}</li>`).join('')}
        </ul>
      </div>`).join('')}
    </div>
  </div>`;
}

function manualHtml() {
  return `<div class="panel">
    <h3>Manual do sistema</h3>
    <p class="muted">Ainda não disponível — o manual será gerado quando o sistema estiver concluído.</p>
  </div>`;
}

export function renderSobre() {
  const sec = state.section.sobre;
  let html = sectionTabsHtml('sobre', SECTIONS.sobre, sec);
  if (sec === 'dados') html += dadosSistemaHtml();
  if (sec === 'novidades') html += novidadesHtml();
  if (sec === 'manual') html += manualHtml();
  $('sobre').innerHTML = html;
}
