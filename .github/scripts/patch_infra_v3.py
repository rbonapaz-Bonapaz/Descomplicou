from pathlib import Path
import runpy

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')
old = "    .workspace { min-height: 0; position: relative; display: grid; grid-template-columns: auto minmax(0,1fr); }"
new = "    .workspace {\n      min-height: 0; position: relative; display: grid; grid-template-columns: auto minmax(0,1fr); }"
if old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

runpy.run_path('.github/scripts/patch_infra_v2.py', run_name='__main__')
