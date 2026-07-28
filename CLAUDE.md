# Diretrizes globais de desenvolvimento (Rodrigo)

Aplicam-se a todos os sistemas neste espaço de trabalho — atualmente FaroBella
(`CRM-Farmasi/`) e Corre Junto — e a qualquer sistema novo que venha a ser
criado aqui. Regras definidas pelo Rodrigo em 2026-07-28; usar como padrão
mínimo em todo código novo e como meta de migração progressiva no código já
existente.

## 1. Otimização de custos e desempenho (Firebase)

- **Paginação obrigatória**: nunca buscar todos os documentos de uma coleção
  sem limite. Usar `.limit(15)`/`.limit(20)` + paginação por cursor
  (`startAfter`) em qualquer tabela/lista.
- **Cache local**: configurar persistência offline do SDK
  (`enableIndexedDbPersistence` / `persistentLocalCache`) para reaproveitar
  dados já buscados e evitar leituras repetidas.
- **Agregação para totais**: dashboards/estatísticas não devem somar dezenas
  de documentos no cliente via `.get()` — usar documentos de agregação
  dedicados, mantidos com `FieldValue.increment`.
- **Tempo real só quando necessário**: `onSnapshot` só para telas que
  realmente precisam de atualização ao vivo (chat, agenda ativa). Relatórios e
  listagens comuns devem usar `getDocs` sob demanda.

## 2. Arquitetura multi-tenant (SaaS) e acessos

- **Isolamento de dados**: todo documento deve carregar `tenantId`; nenhuma
  consulta/gravação pode acontecer sem validar esse campo.
- **Hierarquia de perfis (RBAC)**:
  - **Super Admin** (dono do sistema): gestão de assinaturas/locatários, sem
    acesso a dados de negócio/operacionais dos assinantes.
  - **Admin** (dono da empresa/organização): acesso total, mas só ao próprio
    `tenantId`.
  - **Usuário comum/operacional**: acesso granular restrito à função —
    dados financeiros/gerenciais de outros setores bloqueados por padrão.

## 3. Segurança, privacidade e LGPD

- **Security Rules do Firestore** sempre presentes e rigorosas — nunca banco
  aberto; padrão de rigor é o já definido no projeto Prontta.
- **Conformidade LGPD**: sempre prever Termos de Uso, Política de Privacidade
  e Termo de Responsabilidade.
- **Proteção de dados**: nunca expor dados sensíveis (pessoais, faturamento,
  documentos sigilosos) nem chaves de API no frontend.

---

## Nota de aplicação ao FaroBella (CRM-Farmasi/)

FaroBella já está em produção com dados reais. O modelo de dados atual isola
cada consultora por `users/{uid}/...` (o próprio uid já funciona como
fronteira de tenant — mais forte que um campo `tenantId` filtrável, já que
nem chega a existir consulta cross-tenant possível). Não é o mesmo desenho de
Prontta (multi-organização com papéis dentro da mesma empresa), então a
migração pra "campo `tenantId` + RBAC de 3 níveis" só faz sentido se/quando o
FaroBella ganhar contas com múltiplos usuários por consultora — hoje não tem.

Pontos que valem migração progressiva mesmo assim, em ordem de prioridade
sugerida (a confirmar com o Rodrigo antes de começar cada um):
1. Paginação nas listas grandes (produtos, clientes, vendas, movimentações de
   estoque) — hoje `loadAll()` busca as ~12 coleções inteiras de uma vez.
2. Agregação de totais de dashboard/relatórios em vez de somar no cliente.
3. Revisão de quais coleções realmente precisam de `onSnapshot` vs `getDocs`
   sob demanda.
4. Persistência offline do SDK.

Cada um desses itens muda o comportamento de telas que já funcionam para
usuárias reais — não iniciar sem alinhar escopo e sem plano de teste.
