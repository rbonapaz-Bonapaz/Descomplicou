from pathlib import Path
import re
import subprocess

html = Path('infraestrutura/index.html').read_text(encoding='utf-8')
inline = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', html, flags=re.S)
code = max(inline, key=len)
Path('/tmp/infra-inline.js').write_text(code, encoding='utf-8')
subprocess.run(['node', '--check', '/tmp/infra-inline.js'], check=True)
required = [
    'uploadEquipmentConfig',
    'downloadEquipmentConfig',
    'Conexões deste equipamento',
    'Preparando PDF com as posições atuais',
    'link-group.related',
]
missing = [item for item in required if item not in html]
if missing:
    raise SystemExit('Recursos ausentes: ' + ', '.join(missing))
print('HTML/JavaScript validado com sucesso.')
