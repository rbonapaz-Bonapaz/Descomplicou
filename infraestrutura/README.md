# Infraestrutura da Rede 3D

Editor visual portátil de infraestrutura de rede, pronto para uso em computador e celular.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie `index.html` e `.nojekyll` para a raiz do repositório.
3. Abra **Settings > Pages**.
4. Em **Source**, selecione **Deploy from a branch**.
5. Escolha a branch `main`, a pasta `/(root)` e clique em **Save**.

O endereço ficará no formato `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Funcionamento dos dados

- As alterações são salvas automaticamente no navegador usado.
- O botão **Salvar HTML** baixa uma cópia portátil com os dados incorporados.
- O botão **Backup** baixa os dados em JSON.
- O GitHub Pages hospeda a aplicação, mas não grava alterações no repositório.
- Para sincronizar automaticamente entre celulares e computadores, conecte a aplicação a um banco como Firebase Firestore.

## Segurança

Não envie para um repositório ou GitHub Pages um HTML exportado que contenha usuários e senhas. Sites do GitHub Pages podem ficar públicos na internet. O `index.html` deste pacote não contém credenciais preenchidas.

## Arquivos

- `index.html`: aplicação completa.
- `.nojekyll`: impede o processamento do arquivo pelo Jekyll.

