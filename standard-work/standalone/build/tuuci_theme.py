#!/usr/bin/env python3
"""Generate the TUUCI-themed build from m3d_head.html + m3d_bundle.js.
Reusable: run after any rebuild to refresh Meritage_3D_Line_TUUCI.html."""
import os
SP = os.path.dirname(os.path.abspath(__file__))                         # standalone/build
OUT = os.path.join(os.path.dirname(SP), 'Meritage_3D_Line_TUUCI.html')  # standalone/…

h = open(os.path.join(SP, 'm3d_head.html'), encoding='utf-8').read()
b64 = open(os.path.join(SP, 'tuuci_logo_white.b64')).read().strip()
logo = 'data:image/png;base64,' + b64

h = h.replace('<title>3D Mezzanine Model</title>', '<title>TUUCI · 3D Mezzanine Model</title>')
h = h.replace(':root{--navy:#15263a;--mut:#6b7785;--rust:#b3502e;--ship:#2f7d52}',
              ':root{--navy:#15263a;--mut:#6b7785;--rust:#b3502e;--ship:#2f7d52;--tuuci:#5f9299;--tuucihi:#7db3ba;--hdr1:#3b4147;--hdr2:#2c3137}')
h = h.replace('header{background:var(--navy);color:#fff;padding:9px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;z-index:5}',
              'header{background:linear-gradient(180deg,var(--hdr1),var(--hdr2));color:#fff;padding:10px 16px 9px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;z-index:5;border-bottom:2px solid var(--tuuci)}'
              '\n  header .logo{height:24px;width:auto;margin-right:2px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}'
              '\n  header .hsub{opacity:.55;font-weight:400}'
              '\n  header h1 .tk{letter-spacing:.15em}')
h = h.replace('    <h1>3D MEZZANINE MODEL</h1>',
              '    <img class="logo" src="' + logo + '" alt="TUUCI"/>\n    <h1><span class="tk">TUUCI</span><span class="hsub"> | 3D Mezzanine Model</span></h1>')

# ---- TUUCI skin: appended overrides (keeps the base stylesheet untouched) ----
SKIN = """
<style id="tuuciSkin">
  /* toolbar groups become soft cards */
  header .tg{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10);border-radius:11px;padding:5px 11px 5px 10px;margin:0}
  header .tgl{color:#93c4ca;margin-right:5px}
  header button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.17)}
  header button:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}
  header button.go{background:var(--tuuci);border-color:var(--tuuci)}
  header button.go:hover{background:var(--tuucihi);border-color:var(--tuucihi)}
  header button.on{background:var(--tuuci);border-color:var(--tuucihi)}
  header .ctl{color:#c3ccd4}
  header input[type=range]{accent-color:var(--tuucihi)}
  /* floor-tools strip reads as its own teal tray */
  #buildRow{background:rgba(95,146,153,.13);border:1px solid rgba(95,146,153,.32);border-radius:11px;padding:8px 11px;margin-top:7px}
  #buildRow .tgl{color:#a5d3d9}
  #floorTools{border-style:dashed}
  /* layouts menu matches the theme */
  #layoutsMenu{border-radius:12px;border-color:#cdd6da}
  #layoutsMenu button.go{background:var(--tuuci);border-color:var(--tuuci);color:#fff}
  #layoutsMenu button:hover{border-color:var(--tuuci)}
  /* readout cards: crisper, teal keyline on the line titles */
  .rd,.rdttl{border-radius:12px;border-color:#dde2e6;box-shadow:0 2px 8px rgba(30,40,50,.10)}
  .rdttl{border-top:2px solid var(--tuuci)}
  .rd .k{color:#61707d}
  /* panels pick up the same corner + shadow language */
  #times,#idlePanel,#helpPanel,#taskPanel{border-radius:14px;box-shadow:0 8px 26px rgba(20,30,40,.16)}
</style>
"""
h = h.replace('</style>', '</style>' + SKIN, 1)

bundle = open(os.path.join(SP, 'm3d_bundle.js'), encoding='utf-8').read()
wasm = open(os.path.join(SP, 'dwg_wasm.gz.b64'), encoding='utf-8').read().strip()
out = h + '<script>window.__DWG_WASM_GZB64="' + wasm + '";</script>\n<script>' + bundle + '</script>\n</body>\n</html>\n'
open(OUT, 'w', encoding='utf-8').write(out)
print('wrote', OUT, len(out))
