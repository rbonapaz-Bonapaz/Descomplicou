# v12

## Arquitetura modular
- `js/app.js` — orquestrador (auth, nav, loadAll, window.App)
- `js/state.js` — Firebase, state, helpers compartilhados, analytics
- `js/utils.js` — funções puras (money, norm, esc, today, etc.)
- `js/dashboard.js` — painel inicial, recomendações
- `js/clientes.js` — CRUD clientes, Cliente 360
- `js/agenda.js` — CRUD agenda avançada (conclusão, reagendamento)
- `js/carrinho.js` — sistema de carrinhos multi-item
- `js/vendas.js` — tela unificada vendas/carrinhos/pedidos
- `js/estoque.js` — estoque com múltiplos motivos de saída
- `js/produtos.js` — CRUD produtos, upsert, flags catálogo
- `js/importar.js` — importação JSON de produtos
- `js/catalogo.js` — catálogo PDF com dedup e gestão ativoCatalogo
- `js/relatorios.js` — relatórios avançados
- `js/perfil.js` — personalização da conta
- `js/admin.js` — gestão de consultoras e planos
- `js/whatsapp.js` — templates e abertura WhatsApp
- `js/pdf-pedido.js` — PDF do pedido (cliente e interno)

## Campos importantes
- Produto: estoqueAtual, custoMedio, precoOriginal, precoAtual, precoVenda, estoqueMinimo, ativoCatalogo, produtoProntaEntrega, monitorarEstoqueBaixo
- Carrinho/Pedido: clienteId, status, itens[], totalPedido, custoTotal, lucroTotal, pagamento, statusPagamento, possuiEntregaFutura
- Item do carrinho: produtoId, quantidade, precoUnitario, totalItem, custoMedioUsado, tipoEntrega, baixouEstoque, entregue
- Movimentação estoque: tipo (entrada/saida), motivo, geraLucro, custoMedioAntes/Depois
- Venda: carrinhoId, receita, custoTotal, lucroTotal, margem
