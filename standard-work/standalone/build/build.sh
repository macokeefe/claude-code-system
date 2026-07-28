#!/bin/bash
# Build both single-file apps from source.
#   standalone/Meritage_3D_Line.entry.js   (the app logic)
# + standalone/build/m3d_head.html         (the <head> + toolbar markup)
# + standalone/build/dwg_wasm.gz.b64        (LibreDWG wasm, for DWG import)
#   -> standalone/Meritage_3D_Line.html           (plain build)
#   -> standalone/Meritage_3D_Line_TUUCI.html     (TUUCI-branded build)
#
# Requires the client's node_modules (three, @azure/msal-browser,
# @mlightcad/libredwg-web, esbuild). Run `npm install` in ../client first.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # standalone/build
STANDALONE="$(dirname "$HERE")"                         # standalone
ROOT="$(cd "$STANDALONE/.." && pwd)"                    # standard-work
NM="$ROOT/client/node_modules"

"$NM/.bin/esbuild" "$STANDALONE/Meritage_3D_Line.entry.js" \
  --bundle --format=iife --minify \
  --alias:three="$NM/three" \
  --alias:@azure/msal-browser="$NM/@azure/msal-browser" \
  --alias:@mlightcad/libredwg-web="$NM/@mlightcad/libredwg-web" \
  --external:fs --external:path --external:module \
  --external:node:module --external:node:fs --external:node:path --external:crypto \
  --outfile="$HERE/m3d_bundle.js" 2>&1 | tail -3

python3 - "$HERE" "$STANDALONE" <<'PY'
import sys, os
HERE, STANDALONE = sys.argv[1], sys.argv[2]
head   = open(os.path.join(HERE, 'm3d_head.html'), encoding='utf-8').read()
bundle = open(os.path.join(HERE, 'm3d_bundle.js'), encoding='utf-8').read()
wasm   = open(os.path.join(HERE, 'dwg_wasm.gz.b64'), encoding='utf-8').read().strip()
out = head + '<script>window.__DWG_WASM_GZB64="' + wasm + '";</script>\n<script>' + bundle + '</script>\n</body>\n</html>\n'
open(os.path.join(STANDALONE, 'Meritage_3D_Line.html'), 'w', encoding='utf-8').write(out)
print('wrote Meritage_3D_Line.html', len(out))
PY

python3 "$HERE/tuuci_theme.py"
