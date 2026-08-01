#!/usr/bin/env python3
"""Gera a locução FaroBella com Iapetus via Gemini TTS no Vertex AI."""

from __future__ import annotations

import os
import wave
from pathlib import Path

from google import genai
from google.genai import types

import farobella_iapetus_cloud as base

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "crm-consultora-de-beleza")
LOCATION = os.environ.get("GOOGLE_CLOUD_REGION", "global")
MODEL = "gemini-2.5-flash-tts"


def write_pcm(path: Path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24_000)
        wf.writeframes(pcm)


def synthesize(client: genai.Client, text: str, output: Path) -> None:
    prompt = f"{base.PROMPT}\n\nTEXTO A SER FALADO:\n{text}"
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=base.VOICE,
                    )
                )
            ),
            temperature=0.25,
        ),
    )

    chunks: list[bytes] = []
    for candidate in response.candidates or []:
        if not candidate.content:
            continue
        for part in candidate.content.parts or []:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                chunks.append(inline.data)
    if not chunks:
        raise RuntimeError("O Vertex AI respondeu sem conteúdo de áudio.")
    write_pcm(output, b"".join(chunks))


def main() -> None:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    base.synthesize = synthesize
    full = base.build(client, "farobella_completo", base.FULL_SEGMENTS)
    teaser = base.build(client, "farobella_teaser", base.TEASER_SEGMENTS)
    (base.OUT / "roteiro_falado_iapetus_vertex.txt").write_text(
        "ROTEIRO COMPLETO\n\n" + "\n\n".join(t for _, t in base.FULL_SEGMENTS)
        + "\n\nROTEIRO TEASER\n\n" + "\n\n".join(t for _, t in base.TEASER_SEGMENTS) + "\n",
        encoding="utf-8",
    )
    print(f"Concluído: {full}")
    print(f"Concluído: {teaser}")


if __name__ == "__main__":
    main()
