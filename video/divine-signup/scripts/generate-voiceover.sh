#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
NARRATION_DIR="$ROOT_DIR/video/divine-signup/narration"
OUTPUT_DIR="$ROOT_DIR/public/video/divine-signup"
TEMP_DIR="${TMPDIR:-/tmp}/divine-signup-voiceover"

command -v say >/dev/null 2>&1 || {
  echo "Voiceover generation requires the macOS 'say' command." >&2
  exit 1
}
command -v ffmpeg >/dev/null 2>&1 || {
  echo "Voiceover generation requires ffmpeg." >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"

for source in "$NARRATION_DIR"/*.txt; do
  name="$(basename "$source" .txt)"
  aiff="$TEMP_DIR/$name.aiff"
  mp3="$OUTPUT_DIR/$name.mp3"

  say -v Daniel -r 168 -f "$source" -o "$aiff"
  ffmpeg -hide_banner -loglevel error -y -i "$aiff" -codec:a libmp3lame -b:a 192k "$mp3"
done

echo "Generated voiceover files in $OUTPUT_DIR"
