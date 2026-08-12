#!/usr/bin/env bash
#
# Export every page of opt-out-typology.drawio to png/ at print resolution.
#
# Needs the draw.io desktop app, which ships the same renderer the editor uses,
# so the PNGs match what you see when you open the file:
#
#   brew install --cask drawio
#
#   ./export-png.sh
#
set -euo pipefail

cd "$(dirname "$0")"

DRAWIO="${DRAWIO:-/Applications/draw.io.app/Contents/MacOS/draw.io}"
SCALE="${SCALE:-3}"

if [ ! -x "$DRAWIO" ]; then
  echo "draw.io not found at $DRAWIO" >&2
  echo "Install it with: brew install --cask drawio" >&2
  echo "Or point DRAWIO at your copy." >&2
  exit 1
fi

node generate.js

mkdir -p png
rm -f png/*.png

# Page order and file names come from diagrams.js, so the numbering always
# matches the tab order in the editor. Pages are numbered from 1.
node -e "
const { DIAGRAMS } = require('./diagrams');
DIAGRAMS.forEach((d, i) => {
  const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-\$/g, '');
  console.log(\`\${i + 1} \${String(i + 1).padStart(2, '0')}-\${slug}\`);
});
" | while read -r index name; do
  "$DRAWIO" --export --format png --page-index "$index" \
    --scale "$SCALE" --border 12 \
    --output "png/${name}.png" opt-out-typology.drawio > /dev/null 2>&1
  [ -f "png/${name}.png" ] || { echo "failed: ${name}.png" >&2; exit 1; }
  echo "  ${name}.png"
done

echo "Exported $(ls png/*.png | wc -l | tr -d ' ') pages at ${SCALE}x to png/"
