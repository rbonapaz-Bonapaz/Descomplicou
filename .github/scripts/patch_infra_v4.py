from pathlib import Path
import runpy

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')
normalizations = {
    "    .workspace { min-height: 0; position: relative; display: grid; grid-template-columns: auto minmax(0,1fr); }": "    .workspace {\n      min-height: 0; position: relative; display: grid; grid-template-columns: auto minmax(0,1fr); }",
    "    .device-list-card { border: 1px solid var(--line);": "    .device-list-card {\n      border: 1px solid var(--line);",
    "      .toast { bottom: calc(86px + env(safe-area-inset-bottom));": "      .toast {\n        bottom: calc(86px + env(safe-area-inset-bottom));",
}
for old, new in normalizations.items():
    if old in text:
        text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

runpy.run_path('.github/scripts/patch_infra_v2.py', run_name='__main__')
