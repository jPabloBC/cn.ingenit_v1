#!/usr/bin/env bash
set -euo pipefail

SRC="ui/icons/logo.svg"
OUT_DIR="ui/icons/generated"
ICONSET_DIR="ui/icons/icon.iconset"
mkdir -p "$OUT_DIR"
rm -rf "$ICONSET_DIR" && mkdir -p "$ICONSET_DIR"

if [ ! -f "$SRC" ]; then
  echo "Source SVG not found: $SRC" >&2
  exit 1
fi

# Helper to render PNG from SVG using rsvg-convert or ImageMagick convert
render_png() {
  local size=$1
  local out=$2
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$SRC" -o "$out"
  else
    convert "$SRC" -background none -resize "${size}x${size}" "$out"
  fi
}

sizes=(16 32 48 64 128 256 512 1024)
for s in "${sizes[@]}"; do
  out="${OUT_DIR}/logo-${s}.png"
  echo "Rendering $out"
  render_png "$s" "$out"
done

# Create ICO (contains multiple sizes)
ICO_OUT="ui/icons/logo.ico"
echo "Generating ICO: $ICO_OUT"
# prefer png2ico if available
if command -v png2ico >/dev/null 2>&1; then
  png2ico "$ICO_OUT" "$OUT_DIR/logo-16.png" "$OUT_DIR/logo-32.png" "$OUT_DIR/logo-48.png" "$OUT_DIR/logo-256.png"
else
  # fallback to ImageMagick convert
  if command -v convert >/dev/null 2>&1; then
    convert "$OUT_DIR/logo-16.png" "$OUT_DIR/logo-32.png" "$OUT_DIR/logo-48.png" "$OUT_DIR/logo-256.png" "$ICO_OUT"
  else
    echo "No tool available to create ICO (install png2ico or ImageMagick)" >&2
  fi
fi

# Create ICNS (macOS)
ICNS_OUT="ui/icons/logo.icns"
echo "Generating ICNS: $ICNS_OUT"
# populate iconset required files
# icon_16x16.png (16)
cp "$OUT_DIR/logo-16.png" "$ICONSET_DIR/icon_16x16.png"
cp "$OUT_DIR/logo-32.png" "$ICONSET_DIR/icon_16x16@2x.png"
cp "$OUT_DIR/logo-32.png" "$ICONSET_DIR/icon_32x32.png"
cp "$OUT_DIR/logo-64.png" "$ICONSET_DIR/icon_32x32@2x.png"
cp "$OUT_DIR/logo-128.png" "$ICONSET_DIR/icon_128x128.png"
cp "$OUT_DIR/logo-256.png" "$ICONSET_DIR/icon_128x128@2x.png"
cp "$OUT_DIR/logo-256.png" "$ICONSET_DIR/icon_256x256.png"
cp "$OUT_DIR/logo-512.png" "$ICONSET_DIR/icon_256x256@2x.png"
cp "$OUT_DIR/logo-512.png" "$ICONSET_DIR/icon_512x512.png"
cp "$OUT_DIR/logo-1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET_DIR" -o "$ICNS_OUT"
else
  echo "iconutil not found; skipping ICNS creation (macOS tool)." >&2
fi

# Optimize PNGs if optipng available
if command -v optipng >/dev/null 2>&1; then
  echo "Optimizing PNGs with optipng"
  optipng -o7 "$OUT_DIR"/*.png >/dev/null 2>&1 || true
fi

echo "Generated assets in $OUT_DIR, ICO: $ICO_OUT, ICNS: $ICNS_OUT (if created)"
