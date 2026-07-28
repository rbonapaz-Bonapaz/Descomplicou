# Descomplicou — regras do repositório

Guarda-chuva dos sistemas vendidos como SaaS. Cada pasta é um produto independente:

| Pasta | Produto | Stack |
|---|---|---|
| `CRM-Farmasi/` | **FaroBella** — gestão para consultoras de venda direta | HTML/JS puro + Firebase + Cloud Functions |
| `Fabi-TO-Gestao/` | **Prontta** — gestão para clínicas de saúde | Next.js (export estático) + Firebase + Cloud Functions |

Idioma de código, comentário e commit: **português do Brasil**.

---

## LINHA DE BASE OBRIGATÓRIA

**Vale para todo sistema deste repositório e para qualquer sistema novo.** Não é
sugestão: é o mínimo para o produto poder ser vendido. Antes de dar uma tarefa por
concluída, confira esta lista.

### 1. Isolamento entre clientes (multi-tenant)

- Todo dado de cliente vive sob a raiz do inquilino (`users/{uid}/...` no FaroBella,
  `clinicas/{clinicaId}/...` no Prontta). **Nunca em coleção raiz.**
- Nenhuma tela monta caminho de banco na mão. Existe uma camada única de caminhos
  (`state.js` no FaroBella, `src/lib/tenancy.ts` no Prontta) e todo acesso passa por ela.
- A identidade do inquilino vem do **custom claim do token**, nunca de um campo que o
  navegador possa editar.
- O dono do sistema administra planos. Ele **não** lê dado de cliente. Nenhuma regra
  de dado de cliente pode conter `|| superadmin()`.

### 2. A regra de segurança é a única barreira

Esconder botão não é segurança. Em app estático, toda tela é HTML público e o banco é
chamado direto do navegador.

- Coleção nova **nasce negada**. O `match /{document=**} { allow read, write: if false; }`
  no fim do arquivo é obrigatório.
- Ninguém edita o próprio papel, o próprio salário nem a própria assinatura.
- Registro que serve de prova (ponto, auditoria, consentimento, evolução assinada) é
  **imutável**: cria e nunca mais muda. Correção se faz por novo registro, não reescrevendo.
- Hora que vale como prova vem do servidor (`serverTimestamp`), e a regra exige isso.
- **Toda mudança em regra exige teste.** Ver `Fabi-TO-Gestao/tests/firestore.rules.test.ts`
  e `npm run test:rules`. Regra sem teste é regra que ninguém sabe se funciona.

### 3. Dado sensível fica separado

Dado de saúde é **dado pessoal sensível** (LGPD art. 11).

- Conteúdo clínico vive em **coleção própria**, nunca como campo dentro de um documento
  que outro papel lê. Regra sabe negar uma coleção; não sabe esconder um campo.
- Perfil administrativo não é perfil assistencial: administrar a clínica **não** dá
  acesso a prontuário. Quem administra e também atende recebe os dois papéis.
- Todo acesso a dado sensível gera registro em trilha de auditoria imutável (art. 37).

### 4. LGPD e conteúdo — todo sistema precisa ter

- Página de **Termos de Uso** e de **Política de Privacidade**, públicas (sem login).
- **Aceite versionado e imutável**, gravado por usuário e por versão do texto. Mudou o
  texto, sobe a versão, pede aceite de novo.
- **Responsabilidade de conteúdo por usuário**, escrita nos termos: quem insere responde
  pelo que inseriu; nós somos operador, não revisamos conteúdo.
- **Direito de acesso** (exportar tudo do titular) e **direito de eliminação**.
  Atenção ao limite do art. 16, I: o que a lei obriga a guardar não se apaga — anonimiza-se
  o cadastro e preserva-se o registro obrigatório (prontuário tem guarda mínima legal).
- Papéis declarados: quem é **controlador** e quem é **operador**.
- Canal do encarregado (DPO) publicado.

### 5. Segredos

- `.env` **nunca** vai para o git. Mantenha `.env.example` só com os nomes.
- Chave de servidor (Gemini, gateway de pagamento, token de webhook) vive como
  **secret da Cloud Function**, nunca no bundle do navegador.
- Prefixo `NEXT_PUBLIC_` significa "vai para o navegador". Nunca use em segredo.
- As chaves do Firebase no cliente são públicas por natureza — a proteção vem das
  regras, não de esconder a chave.

### 6. Comercialização

Todo sistema nasce preparado para ser vendido a vários clientes:

- Planos: teste (por dias), mensal, semestral, anual, vencido, cancelado.
- Plano vencido = **somente leitura**. O cliente continua consultando e exportando o
  que já registrou. Não se retém dado de ninguém como forma de cobrança.
- Configuração global de preços e dias de teste, editável só pelo dono do sistema.
- Módulos e relatórios ligáveis/desligáveis por cliente.
- Personalização visual (cor, logo, nome) por cliente.

### 7. Interface

- Mobile é requisito, não adaptação posterior.
- O menu obedece à **mesma matriz** de permissões que o servidor aplica, para o usuário
  nunca ver um atalho que resultaria em erro de permissão.
- Texto de erro de login é genérico. Dizer "este e-mail não existe" entrega quais contas
  são válidas a quem está sondando.

---

## Antes de entregar

```bash
npm run typecheck     # não pode aumentar a contagem de erros
npm run test:rules    # tem que passar inteiro
npm run build         # tem que compilar
```

Quando mexer em segurança, rode a skill `conformidade-lgpd` para a auditoria completa.
