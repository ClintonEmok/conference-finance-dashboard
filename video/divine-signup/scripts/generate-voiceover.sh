#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
GENERATOR="$ROOT_DIR/video/divine-signup/scripts/generate_voiceover.py"
PYTHON="${KOKORO_PYTHON:-}"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "Voiceover generation requires ffmpeg." >&2
  exit 1
}

if [[ -z "$PYTHON" ]] && command -v uv >/dev/null 2>&1; then
  UV_TOOL_ENV="$(uv tool dir)/mlx-audio"
  if [[ -d "$UV_TOOL_ENV" ]]; then
    export VIRTUAL_ENV="$UV_TOOL_ENV"
    export PATH="$UV_TOOL_ENV/bin:$PATH"
    PYTHON="$UV_TOOL_ENV/bin/python"
  fi
fi

if [[ -z "$PYTHON" ]] || ! "$PYTHON" -c "import mlx_audio, misaki" >/dev/null 2>&1; then
  echo "Voiceover generation requires the pinned local MLX-Audio environment." >&2
  echo "Install it with: uv tool install --force 'mlx-audio==0.5.0' --with 'misaki[en]==0.9.4' --with 'numpy<2' --with 'spacy<4' --prerelease=allow" >&2
  exit 1
fi

"$PYTHON" "$GENERATOR" "$ROOT_DIR"
