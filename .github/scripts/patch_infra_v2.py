from pathlib import Path

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'PATCH FALHOU [{label}]: trecho original não encontrado')
    text = text.replace(old, new, 1)
    print(f'OK: {label}')


replace_once(
"""    .link-hit { fill: none; stroke: rgba(255,255,255,.001); stroke-width: 28; pointer-events: stroke; cursor: pointer; }
    .link-label {
      fill: #f4fbff; font-size: 13px; font-weight: 800; text-anchor: middle; dominant-baseline: middle;
      pointer-events: all; cursor: pointer; paint-order: stroke fill; stroke: rgba(5, 13, 29, .96);
      stroke-width: 5px; stroke-linejoin: round;
    }
    .link-group:hover .link-visible, .link-group.selected .link-visible { stroke-width: 6; filter: drop-shadow(0 0 10px currentColor); }
    .link-group.selected .link-label { fill: #ffffff; font-weight: 900; }
    .link-group.selected .link-hit { stroke: rgba(255,255,255,.02); }
""",
"""    .link-hit { fill: none; stroke: rgba(255,255,255,.001); stroke-width: 34; pointer-events: stroke; cursor: pointer; }
    .link-label {
      fill: #f4fbff; font-size: 13px; font-weight: 800; text-anchor: middle; dominant-baseline: middle;
      pointer-events: all; cursor: pointer; paint-order: stroke fill; stroke: rgba(5, 13, 29, .96);
      stroke-width: 5px; stroke-linejoin: round; transition: opacity .15s ease, fill .15s ease;
    }
    .link-group:hover .link-visible, .link-group.selected .link-visible { stroke-width: 6; filter: drop-shadow(0 0 10px currentColor); }
    .link-group.selected .link-label { fill: #ffffff; font-weight: 900; }
    .link-group.selected .link-hit { stroke: rgba(255,255,255,.02); }
    .link-group.related .link-visible { stroke-width: 5.5; opacity: 1; filter: drop-shadow(0 0 13px currentColor); }
    .link-group.related .link-label { opacity: 1; fill: #fff; font-weight: 900; }
    .link-group.faded .link-visible, .link-group.faded .link-label { opacity: .16; }
""",
'conexoes destaque css')

replace_once(
"""      overflow: hidden; user-select: none; touch-action: none;
      transition: box-shadow .2s ease, border-color .2s ease, transform .2s ease;
""",
"""      overflow: hidden; user-select: none; touch-action: none;
      transition: box-shadow .2s ease, border-color .2s ease, transform .2s ease, opacity .18s ease, filter .18s ease;
""",
'node transition')

replace_once(
"""    .node:hover, .node.selected { border-color: var(--node-color, var(--cyan)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color, var(--cyan)) 20%, transparent), 0 25px 55px rgba(0,0,0,.48); }
    .node.dragging { cursor: grabbing; transition: none; z-index: 20; }
""",
"""    .node:hover, .node.selected { border-color: var(--node-color, var(--cyan)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color, var(--cyan)) 20%, transparent), 0 25px 55px rgba(0,0,0,.48); }
    .node.related { border-color: rgba(236,247,255,.78); box-shadow: 0 0 0 2px rgba(56,216,255,.12), 0 0 24px rgba(56,216,255,.16), 0 25px 55px rgba(0,0,0,.46); }
    .node.faded { opacity: .34; filter: saturate(.62); }
    .node.selected, .node.related { opacity: 1; filter: none; }
    .node.dragging { cursor: grabbing; transition: none; z-index: 20; }
""",
'node destaque css')

replace_once(
"""    .node-body { padding: 11px 13px 13px; display: grid; gap: 5px; }
""",
"""    .node-body { padding: 11px 13px 13px; display: grid; gap: 5px; cursor: pointer; }
""",
'cursor node')

replace_once(
"""    .photo-progress span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--cyan), var(--mint)); transition: width .15s ease; }

    .workspace {
""",
"""    .photo-progress span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--cyan), var(--mint)); transition: width .15s ease; }
    .config-editor { display: grid; gap: 10px; padding: 12px; border: 1px solid rgba(89,241,183,.22); border-radius: 13px; background: rgba(89,241,183,.045); }
    .config-editor-head { display: flex; align-items: flex-start; gap: 10px; }
    .config-editor-icon { width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center; border-radius: 11px; background: rgba(89,241,183,.10); border: 1px solid rgba(89,241,183,.24); color: var(--mint); font-size: 20px; }
    .config-editor-copy { min-width: 0; }
    .config-editor-copy strong { display: block; font-size: 13px; }
    .config-editor-copy span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
    .config-file-meta { padding: 9px 10px; border-radius: 10px; background: rgba(3,9,23,.55); color: #c7d8eb; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
    .config-actions { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
    .config-actions .btn { min-width: 0; min-height: 38px; padding: 7px 9px; white-space: normal; line-height: 1.2; }
    .configUpload { display: none !important; }

    .workspace {
""",
'config css')

replace_once(
"""    .link-card-actions .btn { min-height: 34px; padding: 6px 9px; }
    .device-list-card {
""",
"""    .link-card-actions .btn { min-height: 34px; padding: 6px 9px; }
    .device-links .link-card { border-color: rgba(56,216,255,.22); background: rgba(56,216,255,.045); }
    .device-links .link-card-actions { grid-template-columns: 1fr; }
    .device-list-card {
""",
'conexoes do equipamento css')

replace_once(
"""      .photo-actions .btn { width: 100%; min-height: 46px; }
      .toast {
""",
"""      .photo-actions .btn { width: 100%; min-height: 46px; }
      .config-actions { grid-template-columns: 1fr; }
      .config-actions .btn { width: 100%; min-height: 46px; }
      .toast {
""",
'config mobile css')

replace_once(
"""      .world { position: relative; transform: none !important; width: 1500px; height: 980px; }
      @page { size: landscape; margin: 8mm; }
""",
"""      .world { position: relative; transform: none !important; width: 1500px; height: 980px; }
      .node, .link-visible, .link-label { opacity: 1 !important; filter: none !important; }
      @page { size: landscape; margin: 8mm; }
""",
'print css')

replace_once(
"""            <button class="btn" id="printBtn" type="button" title="Organizar temporariamente e exportar em PDF"><span>▣</span><span class="label">Exportar diagrama em PDF</span></button>
""",
"""            <button class="btn" id="printBtn" type="button" title="Exportar o diagrama mantendo as posições atuais"><span>▣</span><span class="label">Exportar diagrama em PDF</span></button>
""",
'botao pdf')

replace_once(
"""        <li>Arraste os equipamentos pelo cabeçalho.</li>
        <li>Se mover algo por engano, use <b>Desfazer</b> ou <b>Ctrl+Z</b>.</li>
        <li>Em <b>Visualização</b>, você pode organizar automaticamente, ativar o 3D e salvar ou restaurar as posições do mapa.</li>
        <li>Em <b>Relatórios</b>, abra a documentação completa ou exporte o diagrama organizado em PDF.</li>
""",
"""        <li>Arraste os equipamentos pelo cabeçalho. Um clique simples no equipamento destaca as conexões e os equipamentos ligados a ele; duplo clique ou o lápis abre a edição.</li>
        <li>Clique diretamente em uma linha de conexão para destacá-la, destacar os dois equipamentos envolvidos e abrir a edição da conexão.</li>
        <li>Se mover algo por engano, use <b>Desfazer</b> ou <b>Ctrl+Z</b>.</li>
        <li>Em <b>Visualização</b>, você pode organizar automaticamente, ativar o 3D e salvar ou restaurar as posições do mapa.</li>
        <li>Em <b>Relatórios</b>, abra a documentação completa ou exporte o diagrama em PDF mantendo as posições que você organizou no mapa.</li>
""",
'ajuda selecao pdf')

replace_once(
"""        <li>Na ficha do equipamento, use <b>Adicionar foto</b>. A imagem será comprimida e salva no Firebase Storage.</li>
        <li>A <b>Identificação amigável</b> aparece no diagrama; o hostname fica registrado na ficha e no relatório.</li>
""",
"""        <li>Na ficha do equipamento, use <b>Adicionar foto</b>. A imagem será comprimida e salva no Firebase Storage.</li>
        <li>Na ficha do equipamento, use <b>Arquivo de configuração</b> para guardar o backup/configuração original. Depois você pode baixá-lo novamente para restauração ou manutenção.</li>
        <li>A <b>Identificação amigável</b> aparece no diagrama; o hostname fica registrado na ficha e no relatório.</li>
        <li>As conexões relacionadas aparecem em <b>Conexões deste equipamento</b> e podem ser abertas diretamente para edição.</li>
""",
'ajuda config')

replace_once(
"""    let drag = null;
    let panDrag = null;
""",
"""    let drag = null;
    let suppressNodeClickUntil = 0;
    let panDrag = null;
""",
'supress click')

replace_once(
"""          photoUrl: String(raw.photoUrl || ''), photoPath: String(raw.photoPath || ''),
          x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 620,
""",
"""          photoUrl: String(raw.photoUrl || ''), photoPath: String(raw.photoPath || ''),
          configFileName: String(raw.configFileName || ''), configFilePath: String(raw.configFilePath || ''),
          configFileUrl: String(raw.configFileUrl || ''), configFileSize: Number(raw.configFileSize || 0),
          configUploadedAt: String(raw.configUploadedAt || ''),
          x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 620,
""",
'migration config')

replace_once(
"""          lastMaintenance:String(device.lastMaintenance || ''),
          photoUrl:String(device.photoUrl || ''), photoPath:String(device.photoPath || ''),
          x:Number(device.x) || 0, y:Number(device.y) || 0
""",
"""          lastMaintenance:String(device.lastMaintenance || ''),
          photoUrl:String(device.photoUrl || ''), photoPath:String(device.photoPath || ''),
          configFileName:String(device.configFileName || ''), configFilePath:String(device.configFilePath || ''),
          configFileUrl:String(device.configFileUrl || ''), configFileSize:Number(device.configFileSize || 0),
          configUploadedAt:String(device.configUploadedAt || ''),
          x:Number(device.x) || 0, y:Number(device.y) || 0
""",
'sanitize config')

replace_once(
"""        const photoPaths = state.devices.map(device => device.photoPath).filter(Boolean);
        await Promise.allSettled(photoPaths.map(path => storage.ref(path).delete()));
""",
"""        const attachmentPaths = state.devices.flatMap(device => [device.photoPath, device.configFilePath]).filter(Boolean);
        await Promise.allSettled(attachmentPaths.map(path => storage.ref(path).delete()));
""",
'delete map attachments')

replace_once(
"""    function renderNodes() {
      nodesEl.replaceChildren();
      for (const device of state.devices) {
        const info = infoFor(device.type);
        const node = document.createElement('article');
        node.className = 'node' + (selected?.kind === 'device' && selected.id === device.id ? ' selected' : '');
""",
"""    function renderNodes() {
      nodesEl.replaceChildren();
      const selectedLink = selected?.kind === 'link' ? state.links.find(link => link.id === selected.id) : null;
      const selectedDeviceId = selected?.kind === 'device' ? selected.id : null;
      for (const device of state.devices) {
        const info = infoFor(device.type);
        const node = document.createElement('article');
        const isSelectedDevice = selectedDeviceId === device.id;
        const relatedToSelectedLink = Boolean(selectedLink && (selectedLink.from === device.id || selectedLink.to === device.id));
        const relatedToSelectedDevice = Boolean(selectedDeviceId && !isSelectedDevice && state.links.some(link =>
          (link.from === selectedDeviceId && link.to === device.id) || (link.to === selectedDeviceId && link.from === device.id)
        ));
        const isRelated = relatedToSelectedLink || relatedToSelectedDevice;
        const shouldFade = Boolean(selected && !isSelectedDevice && !isRelated);
        node.className = 'node' + (isSelectedDevice ? ' selected' : '') + (isRelated ? ' related' : '') + (shouldFade ? ' faded' : '');
""",
'render nodes destaque')

replace_once(
"""        edit.addEventListener('pointerdown', event => event.stopPropagation());
        edit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openDevice(device.id); });
        node.addEventListener('dblclick', () => openDevice(device.id));
        head.addEventListener('pointerdown', event => {
""",
"""        edit.addEventListener('pointerdown', event => event.stopPropagation());
        edit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openDevice(device.id); });
        node.addEventListener('click', event => {
          if (event.target.closest('.node-edit') || Date.now() < suppressNodeClickUntil) return;
          event.preventDefault(); event.stopPropagation();
          selected = { kind:'device', id:device.id };
          renderNodes(); renderLinks();
        });
        node.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); openDevice(device.id); });
        head.addEventListener('pointerdown', event => {
""",
'click node destaque')

replace_once(
"""        const group = svg('g', { class:`link-group${selected?.kind === 'link' && selected.id === link.id ? ' selected' : ''}` });
""",
"""        const isSelectedLink = selected?.kind === 'link' && selected.id === link.id;
        const isRelatedToDevice = selected?.kind === 'device' && (link.from === selected.id || link.to === selected.id);
        const shouldFade = Boolean(selected && !isSelectedLink && !isRelatedToDevice);
        const group = svg('g', { class:`link-group${isSelectedLink ? ' selected' : ''}${isRelatedToDevice ? ' related' : ''}${shouldFade ? ' faded' : ''}` });
""",
'render links destaque')

replace_once(
"""        hit.addEventListener('pointerdown', selectLink);
        hit.addEventListener('click', selectLink);
""",
"""        hit.addEventListener('pointerdown', event => event.stopPropagation());
        hit.addEventListener('click', selectLink);
""",
'click link')

replace_once(
"""          label.addEventListener('pointerdown', selectLabel);
          label.addEventListener('click', selectLabel);
""",
"""          label.addEventListener('pointerdown', event => event.stopPropagation());
          label.addEventListener('click', selectLabel);
""",
'click link label')

replace_once(
"""      if (finished.moved) {
        pushUndo('mover equipamento', { [finished.id]: { x:finished.x, y:finished.y } });
""",
"""      if (finished.moved) {
        suppressNodeClickUntil = Date.now() + 250;
        pushUndo('mover equipamento', { [finished.id]: { x:finished.x, y:finished.y } });
""",
'drag click suppression')

replace_once(
"""      panelContent.replaceChildren(deviceForm(device));
      renderNodes();
""",
"""      panelContent.replaceChildren(deviceForm(device));
      renderNodes(); renderLinks();
""",
'open device rerender links')

insert_before_device_form = r'''    function safeConfigFileName(name) {
      const original = String(name || 'configuracao').trim();
      const clean = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
      return (clean || 'configuracao').slice(-120);
    }
    function formatBytes(bytes) {
      const value = Number(bytes || 0);
      if (!value) return '0 KB';
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
    async function uploadEquipmentConfig(device, file, form) {
      if (!authUser || !storage || localOnlyMode) return toast('Entre com o Google para sincronizar o arquivo de configuração');
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) return toast('O arquivo de configuração deve ter no máximo 20 MB');
      const chooseButton = form.querySelector('.chooseConfig');
      const oldPath = device.configFilePath;
      chooseButton.disabled = true;
      chooseButton.textContent = 'Enviando…';
      try {
        const safeName = safeConfigFileName(file.name);
        const path = `users/${authUser.uid}/equipment-configs/${currentMapId}/${device.id}/${Date.now()}-${safeName}`;
        const snapshot = await storage.ref(path).put(file, {
          contentType:file.type || 'application/octet-stream',
          cacheControl:'private,max-age=0,no-cache',
          customMetadata:{ mapId:currentMapId, deviceId:device.id, originalName:file.name }
        });
        device.configFileName = file.name;
        device.configFilePath = path;
        device.configFileUrl = await snapshot.ref.getDownloadURL();
        device.configFileSize = file.size;
        device.configUploadedAt = new Date().toISOString();
        saveState('Arquivo de configuração salvo e sincronizado');
        if (oldPath && oldPath !== path) storage.ref(oldPath).delete().catch(() => {});
        if (selected?.kind === 'device' && selected.id === device.id) openDevice(device.id);
        toast('Arquivo de configuração salvo');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Não foi possível enviar o arquivo de configuração');
      } finally {
        chooseButton.disabled = false;
      }
    }
    async function downloadEquipmentConfig(device) {
      if (!device.configFilePath && !device.configFileUrl) return toast('Nenhum arquivo de configuração salvo');
      try {
        const url = device.configFileUrl || await storage.ref(device.configFilePath).getDownloadURL();
        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha ao baixar o arquivo.');
        const blob = await response.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = device.configFileName || 'configuracao-equipamento';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        toast('Download da configuração iniciado');
      } catch (error) {
        console.error(error);
        const url = device.configFileUrl || (storage && device.configFilePath ? await storage.ref(device.configFilePath).getDownloadURL().catch(() => '') : '');
        if (url) window.open(url, '_blank', 'noopener');
        else toast('Não foi possível baixar o arquivo de configuração');
      }
    }
    async function removeEquipmentConfig(device) {
      if (!device.configFilePath && !device.configFileUrl) return;
      if (!authUser || !storage || localOnlyMode) return toast('Entre com o Google para remover o arquivo sincronizado');
      if (!confirm(`Remover o arquivo “${device.configFileName || 'configuração'}” deste equipamento?`)) return;
      const path = device.configFilePath;
      try {
        if (path) await storage.ref(path).delete();
      } catch (error) {
        if (error.code !== 'storage/object-not-found') { console.error(error); return toast('Não foi possível remover o arquivo'); }
      }
      device.configFileName = ''; device.configFilePath = ''; device.configFileUrl = ''; device.configFileSize = 0; device.configUploadedAt = '';
      saveState('Arquivo de configuração removido');
      if (selected?.kind === 'device' && selected.id === device.id) openDevice(device.id);
      toast('Arquivo de configuração removido');
    }
    async function copyEquipmentConfig(device, targetMapId, targetDeviceId) {
      if (!device.configFilePath && !device.configFileUrl) return null;
      if (!authUser || !storage || localOnlyMode) throw new Error('O arquivo de configuração exige conexão com o Firebase Storage.');
      const sourceUrl = device.configFileUrl || await storage.ref(device.configFilePath).getDownloadURL();
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error('Não foi possível baixar o arquivo de configuração original.');
      const blob = await response.blob();
      const safeName = safeConfigFileName(device.configFileName || 'configuracao');
      const targetPath = `users/${authUser.uid}/equipment-configs/${targetMapId}/${targetDeviceId}/${Date.now()}-${safeName}`;
      const snapshot = await storage.ref(targetPath).put(blob, {
        contentType:blob.type || 'application/octet-stream', cacheControl:'private,max-age=0,no-cache',
        customMetadata:{ mapId:targetMapId, deviceId:targetDeviceId, originalName:device.configFileName || safeName }
      });
      return {
        configFileName:device.configFileName || safeName,
        configFilePath:targetPath,
        configFileUrl:await snapshot.ref.getDownloadURL(),
        configFileSize:device.configFileSize || blob.size,
        configUploadedAt:new Date().toISOString()
      };
    }

'''
replace_once(
"""    function deviceForm(device) {
""",
insert_before_device_form + """    function deviceForm(device) {
""",
'funcoes config')

replace_once(
"""        </div>
        <label>Identificação amigável<input name="displayName" maxlength="80" placeholder="Ex.: Câmera Fundos ou Roteador Quarto"></label>
""",
"""        </div>
        <div class="form-section-title">Arquivo de configuração</div>
        <div class="config-editor">
          <div class="config-editor-head">
            <div class="config-editor-icon">⇩</div>
            <div class="config-editor-copy"><strong>Backup / configuração do equipamento</strong><span>Guarde aqui o arquivo exportado pelo próprio equipamento. Em uma manutenção futura, baixe este arquivo e importe novamente no equipamento.</span></div>
          </div>
          <div class="config-file-meta"></div>
          <div class="config-actions">
            <button class="btn chooseConfig" type="button">＋ ${device.configFilePath || device.configFileUrl ? 'Substituir arquivo' : 'Importar arquivo'}</button>
            <button class="btn downloadConfig" type="button" ${device.configFilePath || device.configFileUrl ? '' : 'disabled'}>⇩ Baixar configuração</button>
            <button class="btn danger removeConfig" type="button" ${device.configFilePath || device.configFileUrl ? '' : 'disabled'}>Excluir arquivo</button>
            <input class="configUpload" type="file" hidden>
          </div>
        </div>
        <label>Identificação amigável<input name="displayName" maxlength="80" placeholder="Ex.: Câmera Fundos ou Roteador Quarto"></label>
""",
'config form html')

replace_once(
"""      form.querySelector('.photo-remove').onclick = () => removeEquipmentPhoto(device);
      const targetSelect = form.querySelector('.transfer-map');
""",
"""      form.querySelector('.photo-remove').onclick = () => removeEquipmentPhoto(device);
      const configMeta = form.querySelector('.config-file-meta');
      const chooseConfig = form.querySelector('.chooseConfig');
      const configUpload = form.querySelector('.configUpload');
      const downloadConfig = form.querySelector('.downloadConfig');
      const removeConfig = form.querySelector('.removeConfig');
      const hasConfig = Boolean(device.configFilePath || device.configFileUrl);
      configMeta.textContent = hasConfig
        ? `${device.configFileName || 'Arquivo de configuração'} • ${formatBytes(device.configFileSize)}${device.configUploadedAt ? ' • salvo em ' + new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(device.configUploadedAt)) : ''}`
        : 'Nenhum arquivo de configuração salvo neste equipamento.';
      chooseConfig.disabled = !authUser || localOnlyMode;
      chooseConfig.title = chooseConfig.disabled ? 'Entre com o Google para sincronizar arquivos' : 'Escolher arquivo exportado pelo equipamento';
      chooseConfig.onclick = () => configUpload.click();
      configUpload.onchange = () => { const file = configUpload.files[0]; if (file) uploadEquipmentConfig(device, file, form); configUpload.value = ''; };
      downloadConfig.onclick = () => downloadEquipmentConfig(device);
      removeConfig.onclick = () => removeEquipmentConfig(device);
      const targetSelect = form.querySelector('.transfer-map');
""",
'config form handlers')

replace_once(
"""        let photoCopied = true;
        if (!moving && (device.photoUrl || device.photoPath)) {
          try { Object.assign(targetDevice, await copyEquipmentPhoto(device, targetMapId, targetDeviceId)); }
          catch (error) {
            console.warn('A foto não pôde ser duplicada.', error);
            targetDevice.photoUrl = ''; targetDevice.photoPath = ''; photoCopied = false;
          }
        }

        targetState.devices.push(targetDevice);
""",
"""        let photoCopied = true;
        if (!moving && (device.photoUrl || device.photoPath)) {
          try { Object.assign(targetDevice, await copyEquipmentPhoto(device, targetMapId, targetDeviceId)); }
          catch (error) {
            console.warn('A foto não pôde ser duplicada.', error);
            targetDevice.photoUrl = ''; targetDevice.photoPath = ''; photoCopied = false;
          }
        }
        let configCopied = true;
        if (!moving && (device.configFilePath || device.configFileUrl)) {
          try {
            const copiedConfig = await copyEquipmentConfig(device, targetMapId, targetDeviceId);
            if (copiedConfig) Object.assign(targetDevice, copiedConfig);
          } catch (error) {
            console.warn('O arquivo de configuração não pôde ser duplicado.', error);
            targetDevice.configFileName = ''; targetDevice.configFilePath = ''; targetDevice.configFileUrl = ''; targetDevice.configFileSize = 0; targetDevice.configUploadedAt = '';
            configCopied = false;
          }
        }

        targetState.devices.push(targetDevice);
""",
'copy config transfer')

replace_once(
"""          toast(photoCopied
            ? `Equipamento copiado para “${targetMeta.name}”`
            : `Equipamento copiado sem a foto para “${targetMeta.name}”`);
""",
"""          const missing = [!photoCopied && 'foto', !configCopied && 'arquivo de configuração'].filter(Boolean);
          toast(missing.length
            ? `Equipamento copiado para “${targetMeta.name}” sem ${missing.join(' e ')}`
            : `Equipamento copiado para “${targetMeta.name}”`);
""",
'copy config toast')

replace_once(
"""      form.querySelector('.deleteDevice').onclick = () => {
        if (!confirm(`Excluir “${deviceDisplayName(device)}” e suas conexões?`)) return;
        if (device.photoPath && authUser && storage) storage.ref(device.photoPath).delete().catch(error => {
          if (error.code !== 'storage/object-not-found') console.warn('Não foi possível excluir a foto do Storage.', error);
        });
""",
"""      form.querySelector('.deleteDevice').onclick = () => {
        if (!confirm(`Excluir “${deviceDisplayName(device)}” e suas conexões?`)) return;
        if (device.photoPath && authUser && storage) storage.ref(device.photoPath).delete().catch(error => {
          if (error.code !== 'storage/object-not-found') console.warn('Não foi possível excluir a foto do Storage.', error);
        });
        if (device.configFilePath && authUser && storage) storage.ref(device.configFilePath).delete().catch(error => {
          if (error.code !== 'storage/object-not-found') console.warn('Não foi possível excluir a configuração do Storage.', error);
        });
""",
'delete device config')

# Insere conexões relacionadas antes do return do formulário.
replace_once(
"""      form.onsubmit = event => {
        event.preventDefault();
        validateMacInput();
        if (!form.reportValidity()) return;
        for (const key of editableKeys) device[key] = form.elements[key].value.trim();
        setLocalPassword(device.id, form.elements.password.value);
        saveState(); render(); openDevice(device.id); toast('Equipamento salvo');
      };
      return form;
    }
""",
"""      form.onsubmit = event => {
        event.preventDefault();
        validateMacInput();
        if (!form.reportValidity()) return;
        for (const key of editableKeys) device[key] = form.elements[key].value.trim();
        setLocalPassword(device.id, form.elements.password.value);
        saveState(); render(); openDevice(device.id); toast('Equipamento salvo');
      };
      const relatedLinks = state.links.filter(link => link.from === device.id || link.to === device.id);
      if (relatedLinks.length) {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'form-section-title';
        sectionTitle.textContent = `Conexões deste equipamento (${relatedLinks.length})`;
        const relatedWrap = document.createElement('div'); relatedWrap.className = 'link-list device-links';
        for (const link of relatedLinks) {
          const fromDevice = state.devices.find(d => d.id === link.from);
          const toDevice = state.devices.find(d => d.id === link.to);
          const from = fromDevice ? deviceDisplayName(fromDevice) : 'Equipamento removido';
          const to = toDevice ? deviceDisplayName(toDevice) : 'Equipamento removido';
          const card = document.createElement('div'); card.className = 'link-card';
          const title = document.createElement('div'); title.className = 'link-card-title'; title.textContent = `${from} → ${to}`;
          const portSummary = link.type === 'cable' && [link.fromPort, link.toPort].some(Boolean) ? ` • ${link.fromPort || 'porta não informada'} → ${link.toPort || 'porta não informada'}` : '';
          const meta = document.createElement('div'); meta.className = 'link-card-meta'; meta.textContent = `${link.type === 'wireless' ? 'WiFi / rádio' : 'Cabo'}${link.label ? ' • ' + link.label : ''}${portSummary}`;
          const actions = document.createElement('div'); actions.className = 'link-card-actions';
          const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'btn'; editBtn.textContent = 'Editar conexão'; editBtn.onclick = () => openLink(link.id);
          actions.append(editBtn); card.append(title, meta, actions); relatedWrap.appendChild(card);
        }
        const hint = form.querySelector('.hint');
        form.insertBefore(sectionTitle, hint);
        form.insertBefore(relatedWrap, hint);
      }
      return form;
    }
""",
'related links device form')

replace_once(
"""      state.devices.push({ id, name:'novo-equipamento', displayName:'Novo equipamento', type:'router', mode:'', brand:'', model:'', mac:'', location:'', vlan:'', firmware:'', wanIp:'', lan:'', ipMode:'', username:'', notes:'', lastMaintenance:'', photoUrl:'', photoPath:'', x:620, y:430 });
""",
"""      state.devices.push({ id, name:'novo-equipamento', displayName:'Novo equipamento', type:'router', mode:'', brand:'', model:'', mac:'', location:'', vlan:'', firmware:'', wanIp:'', lan:'', ipMode:'', username:'', notes:'', lastMaintenance:'', photoUrl:'', photoPath:'', configFileName:'', configFilePath:'', configFileUrl:'', configFileSize:0, configUploadedAt:'', x:620, y:430 });
""",
'new device config fields')

replace_once(
"""    function exportOrganizedPdf() {
      const originalPositions = capturePositions();
      const originalMode3d = state.mode3d;
      const originalScale = scale;
      const originalPan = { ...pan };
      let restored = false;
      let fallbackTimer = null;
      const restoreEditor = () => {
        if (restored) return;
        restored = true;
        clearTimeout(fallbackTimer);
        for (const device of state.devices) {
          const pos = originalPositions[device.id];
          if (pos) { device.x = pos.x; device.y = pos.y; }
        }
        state.mode3d = originalMode3d;
        scale = originalScale;
        pan = originalPan;
        render();
        toast('Exportação concluída; posições originais restauradas');
      };
      applyAutoLayout();
      state.mode3d = false;
      render();
      fitView();
      window.addEventListener('afterprint', restoreEditor, { once:true });
      toast('Preparando o mapa organizado…');
      requestAnimationFrame(() => setTimeout(() => {
        fallbackTimer = setTimeout(restoreEditor, 15000);
        window.print();
      }, 180));
    }
""",
"""    function exportOrganizedPdf() {
      const originalMode3d = state.mode3d;
      const originalSelection = selected ? { ...selected } : null;
      let restored = false;
      let fallbackTimer = null;
      const restoreEditor = () => {
        if (restored) return;
        restored = true;
        clearTimeout(fallbackTimer);
        state.mode3d = originalMode3d;
        selected = originalSelection;
        render();
        toast('Exportação concluída; layout mantido');
      };
      state.mode3d = false;
      selected = null;
      render();
      window.addEventListener('afterprint', restoreEditor, { once:true });
      toast('Preparando PDF com as posições atuais…');
      requestAnimationFrame(() => setTimeout(() => {
        fallbackTimer = setTimeout(restoreEditor, 15000);
        window.print();
      }, 180));
    }
""",
'pdf preservar layout')

replace_once(
"""          ['Versão de firmware', device.firmware],
          ['Identificação interna', device.id],
""",
"""          ['Versão de firmware', device.firmware],
          ['Arquivo de configuração salvo', device.configFileName],
          ['Identificação interna', device.id],
""",
'report config filename')

path.write_text(text, encoding='utf-8')
print('PATCH CONCLUÍDO')
