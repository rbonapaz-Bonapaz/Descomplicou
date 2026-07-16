# Progresso da Fase 0 — Correções rápidas de UI

**Data**: 13 de julho de 2026  
**Status**: Em execução  
**Versão do Plano**: v2 (revisado com base no código real)

---

## 0.1 ✅ Busca em tempo real na sub-aba "Linhas"

### Problema
Campo de busca `qLinhaAssoc` (dentro de "Produtos → Linhas → atribuir produtos a uma linha") tinha `onchange`, acionado só ao perder o foco. Precisava ser `oninput` para filtrar **a cada tecla**, igual ao campo de busca principal de Produtos (`qprod`).

### Solução Implementada
Alterado `produtos.js:188`:
```diff
- <input id="qLinhaAssoc" placeholder="Buscar produto..." onchange="App.filtrarLinhaAssoc(this.value)" value="${esc(qLinhaAssoc)}">
+ <input id="qLinhaAssoc" placeholder="Buscar produto..." oninput="App.filtrarLinhaAssoc(this.value)" value="${esc(qLinhaAssoc)}">
```

**Resultado**: Agora o filtro responde a cada caractere digitado, sem exigir que o usuário saia do campo.

---

## 0.2 🔄 Preservação de foco em dois campos de busca na mesma função de render

### Problema
A função `renderProdutos()` renderiza a aba de "Produtos" (com busca `qprod`) e também a aba de "Linhas" (com busca `qLinhaAssoc`). Ambas convivem no mesmo `innerHTML`.

Antes da mudança: a função usava `withFocusPreserved('qprod', ...)`, que só guardava o foco/cursor de `qprod`. Isso significava que ao digitar rápido em `qLinhaAssoc`, o re-render causava perda de foco no campo (comportamento ruim com `oninput` em cada tecla).

### Solução Implementada
Refatorada a função em duas partes:

1. **`renderProdutos()` (nova versão)** — função wrapper que:
   - Detecta qual dos dois campos (`qprod` ou `qLinhaAssoc`) está ativo no momento
   - Guarda a posição do cursor de cada um
   - Chama a função de render interna
   - Restaura o foco e a posição do cursor no campo que estava ativo

2. **`renderProdutosInner()` (novo nome)** — contém toda a lógica original de render, sem wrapper

### Código Alterado
**produtos.js:49-65:**
```javascript
// A busca de Produtos (qprod) e a busca de atribuir linhas (qLinhaAssoc) convivem na mesma
// função de render, em abas diferentes — por isso preserva foco/cursor de qualquer uma das
// duas que estiver ativa (withFocusPreserved de utils.js só cobre um id por vez).
const FOCUS_IDS_PRODUTOS = ['qprod', 'qLinhaAssoc'];
export function renderProdutos() {
  const idAtivo = FOCUS_IDS_PRODUTOS.find(id => document.activeElement?.id === id);
  const elAtivo = idAtivo ? document.getElementById(idAtivo) : null;
  const cursorPos = elAtivo ? elAtivo.selectionStart : null;
  renderProdutosInner();
  if (idAtivo) {
    const el = document.getElementById(idAtivo);
    if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
  }
}

function renderProdutosInner() {
  // ... código original da renderProdutos aqui ...
}
```

**Mudança adicional no import:**
Adicionado `toggleBareHtml` (para o próximo item, 0.3) e removido `withFocusPreserved` (agora não utilizado):
```diff
- import { ..., withFocusPreserved, ..., toggleHtml, ... }
+ import { ..., toggleHtml, toggleBareHtml, ... }
```

**Resultado**: Ao digitar em qualquer um dos dois campos de busca, o foco é mantido e o cursor continua na posição correta, mesmo com o re-render acontecendo a cada tecla.

---

## 0.3 ⏳ Ordenação alfabética + toggle "Ativo no catálogo" — Pendente

### Próxima ação
Será implementado na continuação (ainda nesta Fase 0):

1. **Ordenar alfabeticamente** a lista de produtos na tabela de atribuição de linhas (`linhasTabHtml()`, por volta de `produtos.js:190`):
   ```javascript
   // Adicionar antes do .map:
   prods = [...prods].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
   ```

2. **Trocar checkbox por toggle visual**:
   ```diff
   - <td><input type="checkbox" ${linhasDe(p).includes(linhaSelecionadaAtribuir) ? 'checked' : ''} onchange="App.toggleProdutoNaLinha('${p.id}','${esc(linhaSelecionadaAtribuir)}',this.checked)"></td>
   + <td>${toggleBareHtml('toggle_' + p.id, linhasDe(p).includes(linhaSelecionadaAtribuir), `App.toggleProdutoNaLinha('${p.id}','${esc(linhaSelecionadaAtribuir)}',this.checked)`)}</td>
   ```

---

## Arquivos Editados

| Arquivo | Função | Mudanças |
|---------|--------|----------|
| `produtos.js` | `renderProdutos()` (refatorada) | Preservação de foco dupla; mudança de `onchange` → `oninput` em busca de Linhas |
| `produtos.js` | Import | Adicionado `toggleBareHtml`; removido `withFocusPreserved` |

---

## Comandos Executados

```bash
# Copiar arquivos originais para área de trabalho editável
cp /mnt/user-data/uploads/produtos.js /home/claude/work/produtos.js
cp /mnt/user-data/uploads/style.css /home/claude/work/style.css

# Editagens via str_replace (tools Claude):
# 1. Trocar onchange por oninput em qLinhaAssoc
# 2. Refatorar renderProdutos em wrapper + renderProdutosInner
# 3. Trocar imports (remover withFocusPreserved, adicionar toggleBareHtml)
```

---

## Próximos Passos

### Fase 0 (continuação)
- [ ] **0.2**: Implementar ordenação alfabética em `linhasTabHtml()` (linha ~184–197)
- [ ] **0.3**: Trocar `<input type="checkbox">` por `toggleBareHtml()` na tabela de linhas

### Fase 0 (finalização)
- [ ] **0.4**: Ajustar CSS (`style.css`) para colunas de ações mais largas (usando `:last-child` nas tabelas de `vendas.js`, `agenda.js`, `clientes.js`)

### Fase A (após Fase 0)
- [ ] **A.2**: Implementar sincronização em tempo real (`onSnapshot` em `state.js` e `app.js`)
- [ ] **A.3**: Adicionar lógica de confirmação de pagamento em `reabrirCarrinho()`
- [ ] **A.1**: Criar função `nomeAtualDoCliente()` em `agenda.js`, `vendas.js`, `dashboard.js`

---

## Status de Compilação

- ✅ `produtos.js` editado (não compilado, será testado ao deploy)
- ⏳ `style.css` pendente (será editado em próxima etapa)
- ⏳ Testes de aceite pendentes até ter arquivos finais

---

## Observações

1. A preservação de foco dupla (`renderProdutos` + `renderProdutosInner`) é um padrão que pode ser reutilizado em outras abas/telas do projeto se necessário.
2. O `toggleBareHtml` já importado em `utils.js` é o mesmo componente usado em "Ativo no catálogo" (`produtos.js:286`), garantindo consistência visual.
3. Nenhuma mudança de lógica foi feita — apenas refatoração de UI para melhor experiência de digitação contínua.
