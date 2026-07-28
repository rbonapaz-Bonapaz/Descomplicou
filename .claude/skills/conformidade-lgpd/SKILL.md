---
name: conformidade-lgpd
description: Audita um sistema deste repositório contra a linha de base obrigatória de segurança, multi-tenant e LGPD. Use ao criar um sistema novo, ao mexer em regras do Firestore, permissões, papéis, prontuário ou dado sensível, e antes de liberar qualquer versão para cliente pagante. Também responde "está seguro?", "os dados estão expostos?", "cumpre a LGPD?".
---

# Auditoria de segurança e LGPD

Roteiro de verificação para os sistemas do repositório Descomplicou. A linha de base
está em `CLAUDE.md`; aqui está **como verificar** que ela foi cumprida.

Regra de ouro da auditoria: **não confie na leitura do código, prove**. Botão escondido,
aba desabilitada e `if` na tela não protegem nada — o app é estático e o banco é chamado
direto do navegador. Só a regra do servidor protege, e só o teste prova que a regra funciona.

## Como conduzir

Percorra os seis blocos abaixo. Para cada item: **confirmado**, **falho** ou
**não se aplica**. Item falho vira achado com arquivo, linha e o cenário concreto de
exploração — "a recepcionista abre o F12 e lê a evolução", não "possível risco de exposição".

Ordene os achados por gravidade real. Vazamento de dado de paciente e mistura entre
clientes vêm sempre primeiro.

---

## 1. Isolamento entre clientes

```bash
# Caminho de banco fora da camada de tenancy — cada resultado é suspeito
grep -rn "collection(db\|collection(firestore\|doc(db\|doc(firestore" src/ --include=*.tsx --include=*.ts | grep -v tenancy

# Regra de dado de cliente que dá acesso ao dono do sistema — não pode existir
grep -n "superadmin()" firestore.rules
```

- [ ] Todo dado de cliente está sob a raiz do inquilino, nunca em coleção raiz
- [ ] Nenhuma tela monta caminho na mão; tudo passa pela camada única
- [ ] O identificador do inquilino vem do custom claim, não de documento do banco
- [ ] Nenhuma regra de dado de cliente contém `|| superadmin()`
- [ ] Existe teste provando que o cliente A não lê dado do cliente B

## 2. Regras do Firestore e do Storage

```bash
grep -n "document=\*\*" firestore.rules   # tem que terminar com allow read, write: if false
ls storage.rules                          # existe? o padrão do Firebase é aberto demais
npm run test:rules
```

- [ ] Fecho `match /{document=**} { allow read, write: if false; }` presente
- [ ] `storage.rules` existe e escopa anexo sensível pelo mesmo papel do banco
- [ ] Ninguém edita os próprios papéis (teste explícito)
- [ ] Ninguém edita a própria remuneração (teste explícito)
- [ ] Ninguém estende a própria assinatura (teste explícito)
- [ ] Ponto, auditoria, consentimento e registro assinado são imutáveis
- [ ] Hora que serve de prova vem de `serverTimestamp` e a regra exige
- [ ] Todos os testes de regra passam

## 3. Dado sensível

- [ ] Conteúdo clínico está em coleção separada, não como campo do documento que
      outro papel lê
- [ ] Existe trava estrutural impedindo reintroduzir conteúdo sensível no documento
      compartilhado (`!request.resource.data.keys().hasAny([...])`)
- [ ] Perfil administrativo **não** dá acesso a conteúdo clínico
- [ ] Todo acesso a dado sensível gera registro de auditoria
- [ ] Registro assinado não pode ser alterado nem apagado; correção é por retificação

**Teste decisivo:** um usuário só com papel de recepção consegue ler o prontuário
consultando o banco direto? Se sim, todo o resto é irrelevante — este é o achado.

## 4. LGPD

- [ ] Página de Termos de Uso, pública
- [ ] Página de Política de Privacidade, pública
- [ ] Aceite gravado por usuário **e por versão**, imutável
- [ ] Responsabilidade de conteúdo por usuário, escrita nos termos
- [ ] Papéis de controlador e operador declarados
- [ ] Direito de acesso: exportação completa dos dados do titular
- [ ] Direito de eliminação, respeitando o art. 16, I (o que a lei manda guardar é
      anonimizado, não apagado)
- [ ] Trilha de auditoria de operações sobre dado pessoal (art. 37)
- [ ] Canal do encarregado publicado
- [ ] Base legal declarada para tratar dado de saúde (art. 11)

## 5. Segredos e autenticação

```bash
git ls-files | grep -iE "\.env|service-account|serviceAccount"   # tem que voltar vazio
git log --all --diff-filter=A --name-only | grep -iE "\.env$"    # já esteve no histórico?
grep -rn "NEXT_PUBLIC_" .env.example                             # nenhum segredo aqui
grep -rniE "apiKey|secret|token" src/ --include=*.ts --include=*.tsx | grep -v firebaseConfig
```

- [ ] `.env` fora do git e listado no `.gitignore`
- [ ] Nenhum segredo de servidor no bundle do navegador
- [ ] Chave já versionada no histórico foi **rotacionada** (tirar do git não desfaz o vazamento)
- [ ] Nenhum caminho de login que dispense autenticação real (modo demo, biometria
      simulada, sessão em `localStorage`)
- [ ] Ninguém escolhe o próprio nível de acesso ao se cadastrar
- [ ] Mensagem de erro de login é genérica
- [ ] Existe guarda de rota, e ele não é a única proteção

## 6. Comercialização

- [ ] Planos com teste por dias e vigência controlada pelo servidor
- [ ] Plano vencido deixa somente leitura, sem reter dado do cliente
- [ ] Só o dono do sistema altera plano e vigência
- [ ] Preços e dias de teste em configuração global
- [ ] Módulos ligáveis/desligáveis por cliente, respeitados também nas regras

---

## Formato do relatório

Comece respondendo em uma frase se o sistema pode ir para cliente pagante. Depois:

**Achados críticos** — vazamento de dado pessoal, mistura entre clientes, escalada de
privilégio, segredo exposto. Cada um com arquivo, linha e cenário concreto.

**Achados relevantes** — falhas de conformidade que não vazam dado agora mas impedem
a venda ou expõem a multa.

**Pendências** — o que falta da linha de base, sem urgência imediata.

**Verificado e correto** — o que foi conferido e está certo. Serve para o próximo
auditor não refazer o mesmo caminho.

Não classifique como "resolvido" nada que você não tenha provado com teste ou com
verificação direta. Se não deu para verificar, diga que não deu.
