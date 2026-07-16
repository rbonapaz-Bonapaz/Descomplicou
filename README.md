# Descomplicou

Projeto com múltiplas aplicações e ferramentas.

## Anotações por Voz (`web-app/`)

App para registrar anotações **falando** ou **digitando**, com **login do Google**
e cada pessoa com as suas anotações. Funciona no **iPhone e no Android** pelo
navegador — é só abrir um link, sem loja de apps.

### O que ele faz

- 🔐 **Entrar com Google** — cada conta vê só as próprias anotações.
- 🎤 **Voz** — no Android, toque no microfone e fale; vira texto e salva sozinho.
  No iPhone, toque no campo e use o microfone do teclado para ditar.
- ⌨️ **Texto** — digite e toque em enviar.
- ☁️ **Sincroniza na nuvem (Firebase)** — abra em qualquer aparelho e suas
  anotações estão lá.
- 📶 **Offline** — funciona sem internet e sincroniza quando voltar.
- 📱 **Instalável** — dá para adicionar à tela inicial e usar como um app.

### Endereço do app

Depois de configurado e publicado, o app fica em:
`https://rbonapaz-bonapaz.github.io/descomplicou/web-app/`

### Como colocar no ar

Todo o passo a passo (criar o projeto no Firebase, ligar o login Google,
publicar no GitHub Pages) está em **[`web-app/CONFIGURAR.md`](web-app/CONFIGURAR.md)**.

---

## CRM de Vendas — Completo v11

Foco da versão: relatórios inteligentes, gestão visual de estoque/produtos e custo médio correto.

### Principais melhorias
- Estoque mostra apenas produtos com estoque positivo.
- Custo médio ponderado nas entradas.
- Venda usa custo médio no momento da venda.
- Relatórios por período: 7, 30, 90 dias ou tudo.
- Indicadores de vendas, estoque, produtos, clientes e agenda.
- Produto mais vendido, mais lucrativo, estoque baixo, produto parado, sem custo.
- Valor investido em estoque, lucro potencial, saúde do estoque e recomendações automáticas.
- Produtos com cards e filtros visuais: todos, em estoque, sem estoque, promoção, sem custo e estoque baixo.
