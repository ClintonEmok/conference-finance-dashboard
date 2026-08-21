#!/usr/bin/env bash

set -euo pipefail

ENTRY="video/divine-signup/src/index.tsx"
OUTPUT="video/divine-signup/out/smoke"

mkdir -p "$OUTPUT"

render_frame() {
  local composition="$1"
  local frame="$2"
  local name="$3"

  npx remotion still "$ENTRY" "$composition" "$OUTPUT/$name.png" \
    --frame="$frame" \
    --scale=0.25 \
    --log=error
}

render_frame DivineSignupLandscape 0 landscape-start
render_frame DivineSignupLandscape 1480 landscape-options
render_frame DivineSignupLandscape 2200 landscape-review
render_frame DivineSignupLandscape 2500 landscape-confirmation
render_frame DivineSignupLandscape 2717 landscape-end
render_frame DivineSignupPortrait 0 portrait-start
render_frame DivineSignupPortrait 1480 portrait-options
render_frame DivineSignupPortrait 2200 portrait-review
render_frame DivineSignupPortrait 2500 portrait-confirmation
render_frame DivineSignupPortrait 2717 portrait-end
