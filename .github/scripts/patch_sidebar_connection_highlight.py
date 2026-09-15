from pathlib import Path

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'PATCH FALHOU [{label}]: trecho original não encontrado')
    text = text.replace(old, new, 1)
    print(f'OK: {label}')

# 1) Destaque visual também nos cards da lateral.
replace_once(
"""    .link-card { border: 1px solid var(--line); border-radius: 12px; padding: 11px; background: rgba(16,31,57,.45); display: grid; gap: 8px; }\n    .link-card-title { font-weight: 800; font-size: 13px; color: var(--text); }""",
"""    .link-card { border: 1px solid var(--line); border-radius: 12px; padding: 11px; background: rgba(16,31,57,.45); display: grid; gap: 8px; transition: border-color .16s ease, box-shadow .16s ease, background .16s ease, opacity .16s ease; }\n    .link-card.related { border-color: rgba(89,241,183,.72); background: rgba(89,241,183,.09); box-shadow: 0 0 0 2px rgba(89,241,183,.10), 0 0 22px rgba(89,241,183,.12); }\n    .link-card.related::before { content: 'Ligada ao equipamento selecionado'; color: var(--mint); font-size: 10px; font-weight: 900; letter-spacing: .055em; text-transform: uppercase; }\n    .link-card.selected { border-color: rgba(56,216,255,.85); background: rgba(56,216,255,.10); box-shadow: 0 0 0 2px rgba(56,216,255,.12), 0 0 22px rgba(56,216,255,.14); }\n    .link-card.selected::before { content: 'Conexão selecionada'; color: var(--cyan); font-size: 10px; font-weight: 900; letter-spacing: .055em; text-transform: uppercase; }\n    .link-card-title { font-weight: 800; font-size: 13px; color: var(--text); }""",
'css cards conexoes'
)

# 2) Ao clicar em um equipamento, atualizar imediatamente o destaque da lista lateral de conexões.
replace_once(
"""          selected = { kind:'device', id:device.id };\n          renderNodes(); renderLinks();\n        });""",
"""          selected = { kind:'device', id:device.id };\n          renderNodes(); renderLinks();\n          refreshConnectionManagerSelection(true);\n        });""",
'click equipamento atualiza lateral'
)

# 3) Adicionar helper para sincronizar a lista lateral com a seleção do mapa.
marker = """    function openLinkManager() {\n      selected = null;\n      $('panelTitle').textContent = 'Conexões';"""
helper = """    function refreshConnectionManagerSelection(scrollToMatch = false) {\n      if (!sidepanel.classList.contains('open') || $('panelTitle').textContent !== 'Conexões') return;\n      const cards = [...panelContent.querySelectorAll('.link-card[data-link-id]')];\n      if (!cards.length) return;\n      const selectedDeviceId = selected?.kind === 'device' ? selected.id : '';\n      const selectedLinkId = selected?.kind === 'link' ? selected.id : '';\n      let firstMatch = null;\n      for (const card of cards) {\n        const link = state.links.find(item => item.id === card.dataset.linkId);\n        const related = Boolean(link && selectedDeviceId && (link.from === selectedDeviceId || link.to === selectedDeviceId));\n        const active = Boolean(link && selectedLinkId && link.id === selectedLinkId);\n        card.classList.toggle('related', related);\n        card.classList.toggle('selected', active);\n        if (!firstMatch && (related || active)) firstMatch = card;\n      }\n      if (scrollToMatch && firstMatch) {\n        requestAnimationFrame(() => firstMatch.scrollIntoView({ behavior:'smooth', block:'nearest' }));\n      }\n    }\n\n    function openLinkManager() {\n      selected = null;\n      $('panelTitle').textContent = 'Conexões';"""
replace_once(marker, helper, 'helper destaque lateral')

# 4) Marcar cada card com o id da conexão, para o helper localizar a relação certa.
replace_once(
"""          const card = document.createElement('div');\n          card.className = 'link-card';\n          const title = document.createElement('div'); title.className = 'link-card-title'; title.textContent = `${from} → ${to}`;""",
"""          const card = document.createElement('div');\n          card.className = 'link-card';\n          card.dataset.linkId = link.id;\n          const title = document.createElement('div'); title.className = 'link-card-title'; title.textContent = `${from} → ${to}`;""",
'atributo id card conexao'
)

# 5) Sincronizar estado visual logo após abrir o gerenciador de conexões.
replace_once(
"""      panelContent.replaceChildren(wrap);\n      renderNodes(); renderLinks();\n    }\n\n    function linkForm(link) {""",
"""      panelContent.replaceChildren(wrap);\n      renderNodes(); renderLinks();\n      refreshConnectionManagerSelection(false);\n    }\n\n    function linkForm(link) {""",
'abrir gerenciador sincronizado'
)

path.write_text(text, encoding='utf-8')
print('PATCH CONCLUÍDO')
