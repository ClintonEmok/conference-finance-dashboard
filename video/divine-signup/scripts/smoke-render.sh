#!/usr/bin/env bash

set -euo pipefail

ENTRY="video/divine-signup/src/index.tsx"
OUTPUT="video/divine-signup/out/smoke"
SNAPSHOTS="video/divine-signup/smoke-snapshots.sha256"

mkdir -p "$OUTPUT"

render_frame() {
  local composition="$1"
  local frame="$2"
  local name="$3"
  local expected_dimensions="$4"
  local output_file="$OUTPUT/$name.png"
  local dimensions

  npx remotion still "$ENTRY" "$composition" "$output_file" \
    --frame="$frame" \
    --scale=0.25 \
    --log=error

  dimensions="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$output_file")"
  if [[ "$dimensions" != "$expected_dimensions" ]]; then
    echo "Expected $output_file to be $expected_dimensions, found $dimensions" >&2
    exit 1
  fi
}

render_frame DivineSignupLandscape 30 landscape-intro 480x270
render_frame DivineSignupLandscape 75 landscape-start 480x270
render_frame DivineSignupLandscape 1471 landscape-options 480x270
render_frame DivineSignupLandscape 2214 landscape-review-details 480x270
render_frame DivineSignupLandscape 2264 landscape-review-verification 480x270
render_frame DivineSignupLandscape 2564 landscape-confirmation 480x270
render_frame DivineSignupLandscape 2875 landscape-outro 480x270
render_frame DivineSignupLandscape 2919 landscape-end 480x270
render_frame DivineSignupPortrait 30 portrait-intro 270x480
render_frame DivineSignupPortrait 75 portrait-start 270x480
render_frame DivineSignupPortrait 1471 portrait-options 270x480
render_frame DivineSignupPortrait 2214 portrait-review-details 270x480
render_frame DivineSignupPortrait 2264 portrait-review-verification 270x480
render_frame DivineSignupPortrait 2564 portrait-confirmation 270x480
render_frame DivineSignupPortrait 2875 portrait-outro 270x480
render_frame DivineSignupPortrait 2919 portrait-end 270x480

shasum -a 256 -c "$SNAPSHOTS"
