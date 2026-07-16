# Guia rápido: ligar o login com Google

São 3 partes. Faça na ordem. Leva ~10 minutos e é só uma vez.

O endereço do seu app (site) será:
`https://rbonapaz-bonapaz.github.io/descomplicou/web-app/`

---

## PARTE 1 — Criar o projeto no Firebase (grátis)

1. Acesse **https://console.firebase.google.com** e faça login com sua conta Google.
2. Clique em **Adicionar projeto** (Add project). Dê um nome, ex.: `anotacoes-voz`.
   Pode desativar o Google Analytics (não é necessário). Clique em **Criar projeto**.
3. Quando abrir o projeto, clique no ícone **</>** (Web) para "Adicionar um app Web".
   - Apelido do app: `anotacoes-web`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
4. Vai aparecer um bloco de código com `const firebaseConfig = { ... }`.
   **Copie esses valores** (apiKey, authDomain, projectId, etc.).
   Você vai usar na PARTE 3.

## PARTE 2 — Ligar o Login Google e o banco de dados

1. No menu da esquerda: **Build > Authentication** > botão **Começar** (Get started).
2. Na aba **Sign-in method**, clique em **Google** > ative (**Enable**) > escolha um
   e-mail de suporte > **Salvar**.
3. Ainda em Authentication, aba **Settings > Authorized domains** (Domínios autorizados),
   clique em **Add domain** e adicione:
   `rbonapaz-bonapaz.github.io`
4. No menu da esquerda: **Build > Firestore Database** > **Criar banco de dados**.
   - Escolha o modo **produção** e uma localização próxima (ex.: `southamerica-east1`).
5. Na aba **Rules** (Regras) do Firestore, apague o que estiver lá, cole o conteúdo do
   arquivo `firestore.rules` (está neste repositório) e clique em **Publicar**.

## PARTE 3 — Colocar sua configuração no app

Abra o arquivo `web-app/index.html` e ache o trecho:

```js
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI",
  ...
};
```

Troque os `"COLE_AQUI"` pelos valores que você copiou na PARTE 1 e salve.

> Não tem problema esses valores ficarem visíveis no código: eles não são senha.
> A segurança vem das regras do Firestore (PARTE 2, passo 5) e dos domínios
> autorizados (PARTE 2, passo 3).

---

## Publicar o site (GitHub Pages)

1. No GitHub, abra o repositório **Descomplicou** > **Settings** (Configurações).
2. Se o repositório for privado, o GitHub Pages pode exigir conta paga.
   O mais simples: em **Settings > General**, no rodapé (Danger Zone),
   **Change visibility > Make public** (tornar público).
   *(O código fica público, mas suas anotações NÃO — elas ficam no Firebase, protegidas por login.)*
3. Em **Settings > Pages**, no campo **Source**, escolha **GitHub Actions**.
4. Pronto: a cada alteração na pasta `web-app/`, o site é publicado sozinho em
   `https://rbonapaz-bonapaz.github.io/descomplicou/web-app/`.

Abra esse endereço no celular, toque em **Entrar com Google** e use.
Para virar "app" na tela: iPhone (Safari) > Compartilhar > Adicionar a Tela de Inicio;
Android (Chrome) > menu > Adicionar a tela inicial.
