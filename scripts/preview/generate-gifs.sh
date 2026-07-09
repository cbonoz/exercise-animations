#!/bin/bash
# Regenerate preview GIFs from SVG frame sequences
# Uses 12 frames (every 6th), outputs at 12fps
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PREVIEW_DIR="$ROOT/assets/preview"
FRAMES_DIR="$ROOT/assets/animations"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

EXERCISES=(
  "hamstring-slide"
  "bridge"
  "cat-cow"
  "dead-bugs"
  "clamshells"
  "standing-hamstring-curl"
  "childs-pose"
  "plank:planks"
  "figure-4-stretch"
  "hip-flexor-stretch"
)

for entry in "${EXERCISES[@]}"; do
  IFS=":" read -r gif_name dir_name <<< "$entry"
  [ -z "$dir_name" ] && dir_name="$gif_name"

  echo "Generating $gif_name.gif from $dir_name..."

  # Convert 12 evenly-spaced SVG frames to PNG
  for i in $(seq 0 11); do
    frame_idx=$(( i * 6 ))
    svg="$FRAMES_DIR/$dir_name/frame-$(printf "%03d" $frame_idx).svg"
    png="$TMP_DIR/$(printf "%03d" $i).png"
    if [ -f "$svg" ]; then
      rsvg-convert -w 400 -h 300 "$svg" -o "$png"
    else
      # Create a blank placeholder
      convert -size 400x300 xc:"#0f0f1a" "$png" 2>/dev/null || \
        python3 -c "
from PIL import Image
Image.new('RGB', (400, 300), '#0f0f1a').save('$png')
" 2>/dev/null || true
    fi
  done

  # Create palette for better GIF quality
  ffmpeg -y -framerate 12 -i "$TMP_DIR/%03d.png" \
    -vf "palettegen=stats_mode=diff" \
    "$TMP_DIR/palette.png" 2>/dev/null

  # Generate GIF with palette
  ffmpeg -y -framerate 12 -i "$TMP_DIR/%03d.png" \
    -i "$TMP_DIR/palette.png" \
    -lavfi "paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 "$PREVIEW_DIR/$gif_name.gif" 2>/dev/null

  # Cleanup temp PNGs
  rm -f "$TMP_DIR"/*.png

  echo "  Done: $PREVIEW_DIR/$gif_name.gif ($(du -h "$PREVIEW_DIR/$gif_name.gif" | cut -f1))"
done

echo "All GIFs regenerated in $PREVIEW_DIR"
