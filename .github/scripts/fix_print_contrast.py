from pathlib import Path

path = Path('infraestrutura/index.html')
text = path.read_text(encoding='utf-8')

old = """    @media print {
      .topbar, .side-tools, .mobile-bottom-tools, .sidepanel, .zoom-controls, .toast { display: none !important; }
      html, body, .app, .workspace, .viewport { height: auto; overflow: visible; background: #071020; }
      .workspace { display: block; }
      .world { position: relative; transform: none !important; width: 1500px; height: 980px; }
      .node, .link-visible, .link-label { opacity: 1 !important; filter: none !important; }
      @page { size: landscape; margin: 8mm; }
    }
"""

new = """    @media print {
      .topbar, .side-tools, .mobile-bottom-tools, .sidepanel, .zoom-controls, .toast { display: none !important; }
      html, body, .app, .workspace, .viewport { height: auto; overflow: visible; background: #fff !important; }
      .workspace { display: block; }
      .world { position: relative; transform: none !important; width: 1500px; height: 980px; }
      .board {
        background: #fff !important;
        border-color: #a9b7c8 !important;
        box-shadow: none !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .board::after { display: none !important; }
      .node, .link-visible, .link-label { opacity: 1 !important; filter: none !important; }
      .node {
        color: #071020 !important;
        background: #fff !important;
        border: 1.5px solid #66798f !important;
        box-shadow: 0 2px 5px rgba(0,0,0,.12) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .node-head {
        background: #eef3f8 !important;
        border-bottom: 1px solid #aebdcd !important;
      }
      .node-title strong {
        color: #071020 !important;
        font-weight: 900 !important;
      }
      .node-title span {
        color: #17324f !important;
        font-weight: 900 !important;
      }
      .node-body,
      .field-line,
      .field-line span {
        color: #071020 !important;
        font-weight: 750 !important;
      }
      .field-line b {
        color: #26394f !important;
        font-weight: 900 !important;
      }
      .node-icon img { opacity: 1 !important; }
      .link-label {
        fill: #071020 !important;
        stroke: #fff !important;
        stroke-width: 5px !important;
        font-weight: 900 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @page { size: landscape; margin: 8mm; }
    }
"""

if old not in text:
    raise SystemExit('Bloco @media print esperado não encontrado')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Contraste de impressão ajustado')
