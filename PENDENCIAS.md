# Pendências e Tarefas Futuras - Descomplicou CRM

**Data**: 2026-07-16  
**Ambiente**: GitHub + Firestore  
**Status**: 25+ commits, sincronização automática de preço validada, datas comemorativas editáveis com ano opcional

---

## ✅ Concluído nesta sessão

1. **Deduplicação de linhas de produtos** - Normalização de grafia (maiúscula, hífens, variações)
2. **Backup manual de dados** - Botão em Minha Conta → Segurança para baixar JSON completo
3. **Sugestão de descrição sem permissão de escrita** - Consultora sugere, admin aprova
4. **Datas comemorativas** - Lista automática (feriados nacionais + comerciais fixas/móveis) + adição manual
5. **Texto justificado** - Benefícios dos produtos alinhados no PDF e link de evento
6. **Responsividade mobile** - Cards do carrinho e cliente360 ajustados (2 colunas mobile, 3-4 desktop)
7. **Font scaling** - Botões A+/A- ajustam página toda (cabeçalho, filtros, produtos)
8. **Foto do consultor com fallback** - Se URL falha, mostra iniciais
9. **Sincronização automática de preço** - ✅ **VALIDADO** - Quando produto muda preço, atualiza automático e em tempo real em eventos ativos (via `onSnapshot`)
10. **Tag de linha discreta** - Mostra qual linha cada produto pertence no link do evento
11. **Botão de re-sincronização manual** - "🔄 Atualizar preços" como fallback determinístico
12. **Correção de fallback em eventos antigos** - Casa produtos por código Farmasi/nome quando `id` não existe (eventos criados antes da mudança)
13. **Erro visível na replicação** - Falhas de sincronização agora alertam consultora em vez de falhar em silêncio
14. **Sincronização de código** - Código local sincronizado com GitHub (25+ commits no total)
15. **Restauração de estoque via backup** - Upload de backup JSON e restaura estoqueAtual + custoMedio de cada produto (matching por código Farmasi)
16. **Datas comemorativas com edição** - ✅ Permite editar datas adicionadas manualmente
17. **Ano opcional em datas** - ✅ Data sem ano se repete todo ano; com ano definido é data única
18. **Correção de sugestão de descrição** - ✅ Condição dupla: filtra divergência de benefícios + compara tamanho de descrição

---

## ⚠️ Pendências Técnicas

### 1. **Publicar regras do Firestore no console Firebase**
   - **O que**: A coleção `sugestoesBeneficios` foi implementada em código, mas as regras de segurança não foram publicadas no console do Firebase
   - **Por quê**: A nova regra de Firestore (`firestore.rules`) precisa ser publicada manualmente via `firebase deploy --only firestore:rules`
   - **Impacto**: Sem isso, a feature de sugestão de descrição não vai funcionar em produção (erros de permissão)
   - **Quem**: Admin do Firebase
   - **Prioridade**: 🔴 ALTA - Bloqueia feature em produção

### 2. **Testar sugestão de descrição em ambiente de produção**
   - **O que**: Consultora edita produto local com benefícios mais completos → sugestão aparece no painel Admin → admin aprova/rejeita
   - **Como testar**:
     1. Consultora entra em Catálogo Pessoal → seleciona um produto
     2. Modifica o campo "Benefícios" com uma descrição bem mais completa que no Catálogo Mestre
     3. Clica "Salvar"
     4. Admin entra em Admin → Catálogo Mestre → seção "Sugestões de descrição"
     5. Deve aparecer a sugestão com nome do produto e consultora
     6. Admin clica "✅ Aprovar" ou "❌ Rejeitar"
   - **Esperado**: Se aprovado, benefício atualiza no mestre; se rejeitado, sugestão sumida
   - **Prioridade**: 🟡 MÉDIA - Feature importante, precisa validação real


### 3. **Testar foto do consultor com URL quebrada**
   - **O que**: Logo/foto no topo do link de evento agora tem fallback para iniciais quando URL falha
   - **Como testar**:
     1. Simular URL quebrada: editar evento e colocar URL da foto inválida
     2. Compartilhar link público
     3. Logo deve exibir iniciais em vez de imagem quebrada
   - **Esperado**: Página não quebra, iniciais aparecem com estilo consistente
   - **Prioridade**: 🟢 BAIXA - Feature defensiva, melhora UX em caso de erro

### 4. **Revisar responsividade mobile completa**
   - **O que**: Verificar que TODAS as páginas (não apenas carrinho/cliente360) ficam boas no mobile
   - **Páginas a revisar**:
     - [ ] Catálogo Pessoal (2-3 colunas em mobile)
     - [ ] Catálogo Mestre (Admin)
     - [ ] Histórico de Vendas
     - [ ] Link de evento compartilhado (zoom, touch, scroll)
     - [ ] Minha Conta / Perfil
     - [ ] Configurações
   - **Tamanhos a testar**: 320px (smartphone pequeno), 480px (smartphone médio), 768px (tablet)
   - **Prioridade**: 🟡 MÉDIA - Evita má experiência em mobile

### 5. **Testar datas comemorativas em produção**
   - **O que**: Validar que datas automáticas (Páscoa, Dia da Mulher, etc.) e manuais aparecem corretamente
   - **Como testar**:
     1. Admin entra em Minha Conta → Datas Comemorativas
     2. Deve listar automaticamente as datas dos próximos 30 dias (feriados nacionais + comerciais fixas)
     3. Clicar "+ Adicionar data manual" e preencher (ex: "Aniversário loja - 15/08")
     4. Data manual deve aparecer na lista
     5. Clicar "✖️" em qualquer data manual deve remover
   - **Esperado**: Listagem correta, adição/remoção sem erros
   - **Prioridade**: 🟢 BAIXA - Feature estável em código

### 6. **Validar backup manual de dados**
   - **O que**: Botão "📥 Baixar backup" em Minha Conta → Segurança gera JSON completo
   - **Como testar**:
     1. Admin entra em Minha Conta → Segurança
     2. Clica "📥 Baixar backup"
     3. Deve baixar arquivo JSON nomeado `descomplicou-backup-YYYYMMDD.json`
     4. Abrir arquivo e validar que contém: usuários, consultoras, produtos, eventos
   - **Esperado**: JSON válido, completo, sem erros
   - **Prioridade**: 🟢 BAIXA - Feature estável

---

## 💡 Ideias Futuras (Não Iniciadas)

Estas são ideias mencionadas mas ainda não priorizadas:

1. **Integração com API de cálculo automático de comissão**
   - Calcular % de comissão por consultora automaticamente
   
2. **Dashboard com gráficos de vendas por período**
   - Visualizar trends, produtos top, consultoras top
   
3. **Notificações automáticas por email**
   - Quando evento recebe novo pedido, consultora é notificada
   
4. **Exportação em múltiplos formatos**
   - CSV, Excel, PDF com resumo de vendas
   
5. **Versionamento de preços**
   - Histórico de mudanças de preço de cada produto
   
6. **Controle de validade de eventos**
   - Auto-desativar evento após data limite

---

## 📋 Checklist de Publicação para Produção

- [ ] **Publicar Firestore rules** (bloqueia sugestão de descrição) — 🔴 CRÍTICA
- [ ] **Validar sugestão de descrição** em staging/produção
- [x] **Validar sync de preço** em staging/produção (✅ Testado e funcionando)
- [x] **Validar restauração de estoque** (✅ Testado e funcionando)
- [x] **Validar datas comemorativas** (✅ Automáticas + manuais + edição implementados)
- [ ] **Testar mobile** em todos os tamanhos
- [ ] **Testar foto fallback** com URLs quebradas
- [ ] **Revisar performance** do Firestore (se muitos eventos, sync pode ficar lento)
- [x] **Backup dos dados** (✅ Feature de backup manual implementada)
- [ ] **Documentar** novas features para consultoras/admins

---

## 🔗 Referências

- **Branch principal**: `main` (25+ commits com todas as features)
- **Último commit**: `34f6e9d` - Permite editar data comemorativa e torna o ano opcional
- **Commits principais recentes**:
  - `34f6e9d` - Edição de datas + ano opcional
  - `da16b9f` - Corrige condição que impedia sugestão de descrição
  - `1cab972` - Restauração de estoque via backup JSON
  - `6811c7c` - Divergência de descrição na conferência
  - `05140aa` - Aumenta foto da consultora
  - `c72fecc` - Sincronização de preço validada
  - `8aecd91` - Botão re-sincronização + erro visível
  - `39c7071` - Fix cache + fallback em eventos antigos
  - `576279e` - Tag de linha discreta nos cards
- **Firestore rules**: `/firestore.rules` (contém nova coleção `sugestoesBeneficios`)
- **Arquivos-chave**:
  - `js/utils.js` - `canonLinha()`, `combinarLinhas()`
  - `js/datasComemorativas.js` - lógica de datas automáticas/manuais
  - `js/perfil.js` - painéis de datas e backup
  - `js/admin.js` - aprovação de sugestões
  - `js/produtos.js` - `sugerirBeneficioCatalogoMestre()`
  - `js/eventos.js` - `sincronizarProdutoNosEventos()`

---

**Próximos passos**: 
1. **Publicar Firestore rules** no console Firebase (`firebase deploy --only firestore:rules`) — isso libera a feature de sugestão de descrição
2. Testar sugestão de descrição end-to-end
3. Revisar responsividade mobile em todas as páginas
4. Validar datas comemorativas e backup de dados
5. Deploy final em produção com testes de performance do Firestore
