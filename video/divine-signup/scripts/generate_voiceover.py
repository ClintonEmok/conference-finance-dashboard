from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from importlib.metadata import version
from pathlib import Path

import numpy as np
from huggingface_hub import snapshot_download
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model

MODEL_REPO = "mlx-community/Kokoro-82M-bf16"
MODEL_REVISION = "a71e4d38b236d968966a2002c4c895dbd12b1c3c"
VOICE_REPO = "prince-canuma/Kokoro-82M"
VOICE_REVISION = "e02c9eada7ce7416798af36b190a8a2dd2ecd566"
ENGINE_VERSION = "0.5.0"
ENCODER_SAMPLE_RATE = 24_000
ENCODER_BIT_RATE = 128_000
VOICE = os.environ.get("KOKORO_VOICE", "af_heart")
LANG_CODE = os.environ.get("KOKORO_LANG_CODE", "a")
SPEED = float(os.environ.get("KOKORO_SPEED", "0.96"))
NARRATION_FILES = (
    "01-welcome",
    "02-tickets",
    "03-details",
    "04-included-stay",
    "05-options",
    "06-night-before",
    "07-review",
    "08-confirmation",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_mp3(path: Path) -> None:
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=sample_rate,bit_rate",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout).get("streams", [])
    expected = {
        "sample_rate": str(ENCODER_SAMPLE_RATE),
        "bit_rate": str(ENCODER_BIT_RATE),
    }
    if len(streams) != 1 or streams[0] != expected:
        raise RuntimeError(f"Expected {path} to have stream {expected}, found {streams}")


def main(root: Path) -> None:
    narration_dir = root / "video/divine-signup/narration"
    output_dir = root / "public/video/divine-signup"
    source_names = tuple(path.stem for path in sorted(narration_dir.glob("*.txt")))
    installed_engine_version = version("mlx-audio")

    if source_names != NARRATION_FILES:
        raise RuntimeError(
            f"Expected narration files {NARRATION_FILES}, found {source_names}"
        )
    if installed_engine_version != ENGINE_VERSION:
        raise RuntimeError(
            f"Expected mlx-audio {ENGINE_VERSION}, found {installed_engine_version}"
        )

    model_snapshot = Path(
        snapshot_download(MODEL_REPO, revision=MODEL_REVISION)
    )
    voice_snapshot = Path(
        snapshot_download(
            VOICE_REPO,
            revision=VOICE_REVISION,
            allow_patterns=[f"voices/{VOICE}.safetensors"],
        )
    )
    voice_path = voice_snapshot / "voices" / f"{VOICE}.safetensors"
    model = load_model(model_snapshot, model_type="kokoro")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(
        tempfile.mkdtemp(
            prefix=".divine-signup-staging-", dir=output_dir.parent
        )
    )
    backup_dir = output_dir.with_name(f".{output_dir.name}-backup")
    durations: dict[str, float] = {}

    try:
        for name in NARRATION_FILES:
            text = (narration_dir / f"{name}.txt").read_text().strip()
            results = list(
                model.generate(
                    text=text,
                    voice=str(voice_path),
                    speed=SPEED,
                    lang_code=LANG_CODE,
                )
            )
            if not results:
                raise RuntimeError(f"Kokoro generated no audio for {name}")

            sample_rates = {result.sample_rate for result in results}
            if len(sample_rates) != 1:
                raise RuntimeError(f"Kokoro returned mixed sample rates for {name}")

            sample_rate = sample_rates.pop()
            audio = np.concatenate(
                [np.asarray(result.audio).reshape(-1) for result in results]
            )
            target = staging_dir / f"{name}.mp3"
            audio_write(str(target), audio, sample_rate, format="mp3")
            validate_mp3(target)
            durations[target.name] = round(len(audio) / sample_rate, 6)

        files = {
            name: {
                "durationSeconds": durations[name],
                "sha256": sha256(staging_dir / name),
                "sizeBytes": (staging_dir / name).stat().st_size,
            }
            for name in sorted(durations)
        }
        ffmpeg_version = subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()[0]
        metadata = {
            "engine": {"name": "mlx-audio", "version": installed_engine_version},
            "encoder": {
                "name": "ffmpeg",
                "version": ffmpeg_version,
                "format": "mp3",
                "bitrate": f"{ENCODER_BIT_RATE // 1000}k",
                "sampleRate": ENCODER_SAMPLE_RATE,
            },
            "model": {"repository": MODEL_REPO, "revision": MODEL_REVISION},
            "voice": {
                "repository": VOICE_REPO,
                "revision": VOICE_REVISION,
                "id": VOICE,
                "languageCode": LANG_CODE,
                "speed": SPEED,
            },
            "files": files,
        }
        (staging_dir / "voiceover-metadata.json").write_text(
            json.dumps(metadata, indent=2) + "\n"
        )

        expected_outputs = {
            *(f"{name}.mp3" for name in NARRATION_FILES),
            "voiceover-metadata.json",
        }
        actual_outputs = {path.name for path in staging_dir.iterdir()}
        if actual_outputs != expected_outputs:
            raise RuntimeError(
                f"Expected generated outputs {expected_outputs}, found {actual_outputs}"
            )

        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        if output_dir.exists():
            output_dir.rename(backup_dir)
        try:
            staging_dir.rename(output_dir)
        except Exception:
            if backup_dir.exists() and not output_dir.exists():
                backup_dir.rename(output_dir)
            raise
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)

    print(f"Generated pinned Kokoro voiceovers with {VOICE} in {output_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: generate_voiceover.py <project-root>")
    main(Path(sys.argv[1]).resolve())
