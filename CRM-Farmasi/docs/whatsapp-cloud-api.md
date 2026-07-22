# WhatsApp automático (Cloud API oficial da Meta)

Este documento explica como ligar o **envio automático de WhatsApp** — a mensagem sai sozinha,
sem abrir o app e sem a consultora apertar "enviar". É a forma **oficial e permitida** pela Meta
(sem risco de banimento, ao contrário de automações via serviço de acessibilidade).

O código já está pronto no repositório:

- **Cloud Function** `enviarWhatsAppTemplate` (`functions/index.js`) — faz o envio pela API da Meta
  com o token guardado só no servidor.
- **Frontend** `enviarWhatsAppAuto(context, data)` (`js/whatsapp.js`) — dispara o envio a partir de
  um botão/fluxo do app.

Enquanto os passos abaixo não forem feitos, o envio automático responde com um erro claro e o
**envio manual via `wa.me` continua funcionando normalmente** — nada quebra.

---

## Como a API oficial funciona (a regra que mais importa)

Mensagens **iniciadas pela empresa** (as que a automação dispara) só podem usar **templates
pré-aprovados** pela Meta. Texto livre só é permitido dentro da **janela de 24h** depois que a
cliente te mandou uma mensagem primeiro.

Por isso a automação sempre envia por *template* (ex: `Olá {{1}}, feliz aniversário! 🎉`), onde
`{{1}}` é preenchido com o nome da cliente na hora do envio.

---

## Passo a passo (feito uma vez, no painel da Meta)

### 1. Criar a conta e o número
1. Acesse <https://business.facebook.com> e crie/entre numa **Conta Comercial (Business)**.
2. Em <https://developers.facebook.com>, crie um **App** do tipo *Business*.
3. Adicione o produto **WhatsApp** ao app.
4. Cadastre e **verifique um número de telefone** para a conta WhatsApp Business (WABA).
   > Atenção: esse número passa a ser da API — não pode estar ativo no WhatsApp/WhatsApp Business
   > comum ao mesmo tempo.
5. Anote o **Phone Number ID** (aparece na tela "Configuração da API" do WhatsApp) — **não** é o
   número em si, é um ID numérico.

### 2. Gerar um token permanente
1. Em **Configurações do Business → Usuários → Usuários do sistema**, crie um *System User*.
2. Dê a ele a permissão **`whatsapp_business_messaging`** (e acesso ao ativo do WhatsApp).
3. Gere um **token de acesso permanente** (não expira). Guarde com segurança.

### 3. Criar e aprovar os templates
No **Gerenciador do WhatsApp → Modelos de mensagem**, crie um template para cada tipo de mensagem
automática. Os nomes abaixo são os que o código espera (em `js/whatsapp.js`, mapa `WA_TEMPLATES`) —
se você usar outros nomes na Meta, ajuste lá:

| Contexto no app | Nome do template   | Variáveis do corpo         |
|-----------------|--------------------|----------------------------|
| Aniversário     | `aniversario_cliente` | `{{1}}` = nome           |
| Contato frio    | `contato_frio`        | `{{1}}` = nome           |
| Confirmar agenda| `confirmacao_agenda`  | `{{1}}` = nome, `{{2}}` = hora |
| Pós-venda       | `pos_venda`           | `{{1}}` = nome           |
| Retorno         | `retorno_cliente`     | `{{1}}` = nome           |

- Categoria: **Marketing** ou **Utility** conforme o caso (aniversário/retorno = Marketing;
  confirmação de agenda = Utility).
- Idioma: **Português (BR)** → código `pt_BR`.
- A Meta revisa cada template (de minutos até ~24h). Só depois de **Aprovado** ele pode ser enviado.

### 4. Configurar as credenciais no Firebase (no seu computador)
Com a [Firebase CLI](https://firebase.google.com/docs/cli) instalada e logada:

```bash
firebase functions:secrets:set WHATSAPP_TOKEN
# cole o token permanente do System User quando pedir

firebase functions:secrets:set WHATSAPP_PHONE_ID
# cole o Phone Number ID (o ID numérico, não o telefone)

firebase deploy --only functions
```

Pronto — a partir daí o envio automático funciona.

---

## Como usar no app (para quem desenvolve)

```js
// context = um dos definidos em WA_TEMPLATES; data traz nome + telefone (e hora, se agenda)
App.enviarWhatsAppAuto('aniversario', { nome: 'Maria', telefone: '11999998888' });
```

O telefone é normalizado no servidor (só dígitos, com DDI 55 na frente). O botão manual de sempre
(`App.sendWhatsApp(...)`, que abre o `wa.me`) continua existindo como alternativa.

---

## Custo e limites

- A Meta cobra **por conversa** (não por mensagem), com uma faixa mensal gratuita. Valores e regras
  mudam com o tempo — confira em <https://developers.facebook.com/docs/whatsapp/pricing>.
- Números novos começam com **limite diário** de destinatários, que sobe conforme o uso saudável.

## Se algo falhar

- Erro "template não existe / não aprovado": confira o nome exato e o status **Aprovado** na Meta.
- Erro de token: o token pode ter expirado (use sempre o **permanente** do System User) ou faltar a
  permissão `whatsapp_business_messaging`.
- Logs detalhados: `firebase functions:log` (procure por `enviarWhatsAppTemplate`).
