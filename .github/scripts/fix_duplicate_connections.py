from pathlib import Path
import re

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'PATCH FALHOU [{label}]: trecho original não encontrado')
    text = text.replace(old, new, 1)
    print(f'OK: {label}')

# 1) Funções de deduplicação conservadora.
marker = "    function migrateState(input, mapName = '') {"
helper = r'''    function normalizedLinkText(value) {
      return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    function linkDedupeKey(link) {
      const from = String(link?.from || '');
      const to = String(link?.to || '');
      const type = link?.type === 'cable' ? 'cable' : 'wireless';
      if (type === 'wireless') return `${from}|${to}|wireless`;
      return `${from}|${to}|cable|${normalizedLinkText(link?.fromPort)}|${normalizedLinkText(link?.toPort)}`;
    }
    function dedupeLinks(links) {
      const unique = new Map();
      for (const raw of Array.isArray(links) ? links : []) {
        const link = { ...raw };
        const key = linkDedupeKey(link);
        const current = unique.get(key);
        if (!current) {
          unique.set(key, link);
          continue;
        }
        for (const field of ['label','notes','fromPort','toPort']) {
          if (!String(current[field] || '').trim() && String(link[field] || '').trim()) current[field] = link[field];
        }
        if ((!current.color || current.color === '#38d8ff') && link.color && link.color !== '#38d8ff') current.color = link.color;
      }
      return [...unique.values()];
    }

    function migrateState(input, mapName = '') {'''
replace_once(marker, helper, 'helpers dedupe')

# 2) Limpar duplicadas ao carregar/migrar o mapa.
replace_once(
    "      source.links = source.links.map(raw => ({",
    "      source.links = dedupeLinks(source.links.map(raw => ({",
    'abre dedupe migrate'
)
replace_once(
    "      })).filter(link => source.devices.some(d => d.id === link.from) && source.devices.some(d => d.id === link.to));",
    "      })).filter(link => source.devices.some(d => d.id === link.from) && source.devices.some(d => d.id === link.to)));
",
    'fecha dedupe migrate'
)

# 3) No painel do equipamento mostrar somente conexões únicas.
replace_once(
    "      const relatedLinks = state.links.filter(link => link.from === device.id || link.to === device.id);",
    "      const relatedLinks = dedupeLinks(state.links.filter(link => link.from === device.id || link.to === device.id));",
    'lista equipamento sem duplicadas'
)

# 4) No gerenciador lateral de conexões também listar somente conexões únicas.
pattern = re.compile(r"(    function openLinkManager\(\) \{.*?)(        for \(const link of state\.links\) \{)(.*?\n    \}\n\n    function linkForm)", re.S)
m = pattern.search(text)
if not m:
    raise SystemExit('PATCH FALHOU [gerenciador conexoes]: trecho não encontrado')
text = text[:m.start()] + m.group(1) + "        for (const link of dedupeLinks(state.links)) {" + m.group(3) + text[m.end():]
print('OK: gerenciador conexoes sem duplicadas')

# 5) No desenho do mapa não renderizar várias linhas sobrepostas.
pattern = re.compile(r"(    function renderLinks\(\) \{\n      linksEl\.replaceChildren\(\);\n)      for \(const link of state\.links\) \{")
text, count = pattern.subn(r"\1      for (const link of dedupeLinks(state.links)) {", text, count=1)
if count != 1:
    raise SystemExit('PATCH FALHOU [render links]')
print('OK: render links sem duplicadas')

# 6) Relatório completo também não repete conexões.
replace_once(
    "      const connectionRows = state.links.map((link, index) => {",
    "      const connectionRows = dedupeLinks(state.links).map((link, index) => {",
    'relatorio sem duplicadas'
)

# 7) Persistir a limpeza no Firestore quando o mapa carregado da nuvem tinha duplicadas.
old = """        const doc = await collection.doc(currentMapId).get();
        applyMap(doc.data(), currentMapId, mapsMeta.find(map => map.id === currentMapId)?.name);
        cloudReady = true;
"""
new = """        const doc = await collection.doc(currentMapId).get();
        const cloudData = doc.data();
        const incomingLinkCount = Array.isArray(cloudData?.links) ? cloudData.links.length : 0;
        applyMap(cloudData, currentMapId, mapsMeta.find(map => map.id === currentMapId)?.name);
        cloudReady = true;
        if (state.links.length < incomingLinkCount) {
          await saveCloudNow();
          toast(`${incomingLinkCount - state.links.length} conexão(ões) duplicada(s) removida(s)`);
        }
"""
replace_once(old, new, 'sincroniza limpeza na nuvem')

# 8) Ao salvar uma conexão, não permitir uma duplicata equivalente.
old = """      form.onsubmit = event => {
        event.preventDefault();
        if (form.elements.from.value === form.elements.to.value) return toast('Escolha dois equipamentos diferentes');
        for (const key of linkKeys) link[key] = form.elements[key].value.trim();
        saveState(); render(); openLink(link.id); toast('Conexão salva');
      };
"""
new = """      form.onsubmit = event => {
        event.preventDefault();
        if (form.elements.from.value === form.elements.to.value) return toast('Escolha dois equipamentos diferentes');
        for (const key of linkKeys) link[key] = form.elements[key].value.trim();
        const duplicate = state.links.find(other => other.id !== link.id && linkDedupeKey(other) === linkDedupeKey(link));
        if (duplicate) {
          for (const field of ['label','notes','fromPort','toPort']) {
            if (!String(duplicate[field] || '').trim() && String(link[field] || '').trim()) duplicate[field] = link[field];
          }
          if ((!duplicate.color || duplicate.color === '#38d8ff') && link.color && link.color !== '#38d8ff') duplicate.color = link.color;
          state.links = state.links.filter(other => other.id !== link.id);
          saveState(); render(); openLink(duplicate.id);
          return toast('Essa conexão já existia; os dados foram reunidos em um único cadastro');
        }
        saveState(); render(); openLink(link.id); toast('Conexão salva');
      };
"""
replace_once(old, new, 'bloqueia duplicata ao salvar')

path.write_text(text, encoding='utf-8')
print('PATCH CONCLUÍDO')
