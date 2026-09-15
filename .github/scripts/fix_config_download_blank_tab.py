from pathlib import Path

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'PATCH FALHOU [{label}]: trecho original não encontrado')
    text = text.replace(old, new, 1)
    print(f'OK: {label}')

# Novos uploads já ficam marcados como anexo, para o navegador baixar em vez de abrir uma aba vazia.
replace_once(
"""          contentType:file.type || 'application/octet-stream',
          cacheControl:'private,max-age=0,no-cache',
          customMetadata:{ mapId:currentMapId, deviceId:device.id, originalName:file.name }
""",
"""          contentType:file.type || 'application/octet-stream',
          contentDisposition:`attachment; filename=\"${safeName}\"`,
          cacheControl:'private,max-age=0,no-cache',
          customMetadata:{ mapId:currentMapId, deviceId:device.id, originalName:file.name }
""",
'upload com content-disposition'
)

old_download = """    async function downloadEquipmentConfig(device) {
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
"""

new_download = """    async function downloadEquipmentConfig(device) {
      if (!device.configFilePath && !device.configFileUrl) return toast('Nenhum arquivo de configuração salvo');
      const fileName = safeConfigFileName(device.configFileName || 'configuracao-equipamento');
      let url = device.configFileUrl || '';
      try {
        if (storage && device.configFilePath) {
          const ref = storage.ref(device.configFilePath);
          try {
            await ref.updateMetadata({
              contentDisposition:`attachment; filename=\"${fileName}\"`,
              cacheControl:'private,max-age=0,no-cache'
            });
          } catch (metadataError) {
            console.warn('Não foi possível atualizar os metadados de download.', metadataError);
          }
          url = await ref.getDownloadURL();
        }
        if (!url) throw new Error('URL do arquivo indisponível.');

        // Primeira opção: baixa como Blob sem sair da aplicação.
        try {
          const response = await fetch(url, { mode:'cors', credentials:'omit', cache:'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = device.configFileName || fileName;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
          toast('Download da configuração iniciado');
          return;
        } catch (fetchError) {
          console.warn('Download via Blob indisponível; usando download direto protegido.', fetchError);
        }

        // Fallback sem nova aba: o arquivo é carregado em um iframe invisível.
        // Com Content-Disposition=attachment, o navegador abre apenas o diálogo de salvar.
        const iframe = document.createElement('iframe');
        iframe.hidden = true;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.src = url;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 15000);
        toast('Download da configuração iniciado');
      } catch (error) {
        console.error(error);
        toast('Não foi possível baixar o arquivo de configuração');
      }
    }
"""
replace_once(old_download, new_download, 'download sem aba branca')

# Cópias entre mapas também preservam o comportamento de download como anexo.
replace_once(
"""      const snapshot = await storage.ref(targetPath).put(blob, {
        contentType:blob.type || 'application/octet-stream', cacheControl:'private,max-age=0,no-cache',
        customMetadata:{ mapId:targetMapId, deviceId:targetDeviceId, originalName:device.configFileName || safeName }
      });
""",
"""      const snapshot = await storage.ref(targetPath).put(blob, {
        contentType:blob.type || 'application/octet-stream',
        contentDisposition:`attachment; filename=\"${safeName}\"`,
        cacheControl:'private,max-age=0,no-cache',
        customMetadata:{ mapId:targetMapId, deviceId:targetDeviceId, originalName:device.configFileName || safeName }
      });
""",
'copia com content-disposition'
)

path.write_text(text, encoding='utf-8')
print('PATCH CONCLUÍDO')
