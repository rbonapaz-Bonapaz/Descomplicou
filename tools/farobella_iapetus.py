#!/usr/bin/env python3
"""Gera as locuções do FaroBella com a voz oficial Iapetus do Gemini TTS.

O arquivo lê GEMINI_API_KEY do .env já existente no projeto, sem imprimir a chave.
A saída é dividida em blocos com duração fixa para sincronização com os vídeos.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "farobella_tts_output"
RAW = OUT / "raw"
PROC = OUT / "processed"
OUT.mkdir(exist_ok=True)
RAW.mkdir(exist_ok=True)
PROC.mkdir(exist_ok=True)

SAMPLE_RATE = 24_000
FINAL_RATE = 48_000
MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"]
VOICE = "Iapetus"

FULL_SEGMENTS = [
    (10.0, "Se você vende fár-ma-si e ainda controla clientes, pedidos, pagamentos e entregas entre caderno, planilha e WhatsApp, qualquer esquecimento pode virar perda de tempo, de dinheiro ou de uma nova venda."),
    (11.0, "O Faro Béla foi criado para consultoras e consultores fár-ma-si que querem cuidar de toda a operação em um só lugar. Logo no painel, você enxerga seu dia, seus resultados e o que precisa de atenção."),
    (12.0, "Na visão completa de cada cliente, histórico de compras, agendamentos, interesses e créditos ficam reunidos. O sistema também lembra aniversários e clientes sem contato, com acesso rápido ao WhatsApp."),
    (17.0, "Na hora de vender, monte o carrinho em segundos, aplique descontos por item ou no pedido, escolha entrega imediata ou futura e envie o resumo pelo WhatsApp. O estoque reservado evita que o mesmo produto seja vendido duas vezes."),
    (14.0, "Para receber, gere um código Pix com o valor exato ou calcule o cartão parcelado, já considerando a taxa da maquininha. Sinais, pagamentos parciais e créditos da cliente também ficam registrados."),
    (12.0, "No estoque, veja o que está acabando, parado ou aguardando chegada. A pré-encomenda organiza o que comprar, e a confirmação de chegada atualiza quantidade e custo médio automaticamente."),
    (13.0, "Vai participar de um evento ou fazer uma campanha? Crie um catálogo com link público, personalize descontos e compartilhe. A cliente monta a lista de desejos, e o interesse chega organizado para você atender."),
    (10.0, "Nos relatórios, acompanhe faturamento, tíquete médio, recompra e lucro real, já descontando taxas. Assim, você entende onde está ganhando e onde precisa agir."),
    (9.0, "No celular ou no computador, Faro Béla. Gestão fácil, vendas brilhantes. Fale agora pelo WhatsApp."),
]

TEASER_SEGMENTS = [
    (3.0, "Você vende fár-ma-si, mas ainda controla tudo em vários lugares?"),
    (4.0, "Clientes, estoque, pedidos, pagamentos e entregas também precisam de controle."),
    (5.0, "Com o Faro Béla, tudo fica organizado em um só lugar."),
    (6.0, "Monte pedidos, receba por Pix ou cartão e acompanhe cada entrega."),
    (5.0, "Compartilhe seu catálogo e transforme interesse em oportunidade."),
    (4.0, "E saiba o que realmente está dando resultado."),
    (3.0, "Faro Béla. Gestão fácil, vendas brilhantes. Fale com a gente."),
]


def read_api_key() -> str:
    candidates = [
        ROOT / "Fabi-TO-Gestao" / ".env",
        ROOT / ".env",
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name.strip() == "GEMINI_API_KEY":
                value = value.strip().strip('"').strip("'")
                if value:
                    return value
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    raise RuntimeError("GEMINI_API_KEY não encontrada no ambiente do projeto.")


def request_audio(api_key: str, transcript: str, label: str) -> bytes:
    prompt = f"""SINTETIZE SOMENTE A LOCUÇÃO ABAIXO. NÃO LEIA ESTAS INSTRUÇÕES EM VOZ ALTA.

PERFIL DE ÁUDIO:
- Idioma: português brasileiro nativo.
- Voz selecionada: Iapetus, masculina adulta.
- Estilo: narrador comercial moderno, simpático, confiante e envolvente.
- Ritmo: ágil e natural, sem ficar lento, monótono ou apressado.
- Dicção: clara, com pausas curtas e naturais.
- Leia exatamente o texto; não acrescente, retire ou reformule palavras.

REGRA OBRIGATÓRIA DE PRONÚNCIA:
- A marca escrita como “fár-ma-si” deve soar como uma única palavra de três sílabas: FÁR-ma-si.
- A sílaba forte é FÁR.
- O “s” deve ser suave.
- Não soletrar, não explicar e não falar os hífens.

TRANSCRIÇÃO FALADA — {label}:
{transcript}
"""

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": VOICE}
                }
            },
            "temperature": 0.25,
        },
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error: Exception | None = None

    for model in MODELS:
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={urllib.parse.quote(api_key)}"
        )
        for attempt in range(1, 6):
            try:
                request = urllib.request.Request(
                    endpoint,
                    data=body,
                    headers={"Content-Type": "application/json; charset=utf-8"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=240) as response:
                    result = json.loads(response.read().decode("utf-8"))

                parts = result["candidates"][0]["content"]["parts"]
                chunks: list[bytes] = []
                for part in parts:
                    inline = part.get("inlineData") or part.get("inline_data")
                    if inline and inline.get("data"):
                        chunks.append(base64.b64decode(inline["data"]))
                if not chunks:
                    raise RuntimeError(f"Resposta sem áudio: {json.dumps(result)[:500]}")
                return b"".join(chunks)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, KeyError, RuntimeError) as exc:
                last_error = exc
                status = getattr(exc, "code", None)
                if status in (400, 401, 403, 404) and attempt == 1:
                    break
                if attempt < 5:
                    time.sleep(min(30, 2 ** attempt))
        # tenta o modelo seguinte

    raise RuntimeError(f"Falha ao gerar {label}: {last_error}")


def write_pcm_wav(path: Path, audio: bytes) -> None:
    # Algumas respostas podem vir encapsuladas em WAV; preserva os frames nesse caso.
    if audio.startswith(b"RIFF"):
        with wave.open(io.BytesIO(audio), "rb") as src:
            frames = src.readframes(src.getnframes())
            channels = src.getnchannels()
            rate = src.getframerate()
            width = src.getsampwidth()
        with wave.open(str(path), "wb") as dst:
            dst.setnchannels(channels)
            dst.setsampwidth(width)
            dst.setframerate(rate)
            dst.writeframes(frames)
        return

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / wf.getframerate()


def atempo_chain(value: float) -> str:
    value = max(0.5, value)
    parts: list[float] = []
    while value > 2.0:
        parts.append(2.0)
        value /= 2.0
    while value < 0.5:
        parts.append(0.5)
        value /= 0.5
    parts.append(value)
    return ",".join(f"atempo={part:.6f}" for part in parts)


def process_segment(raw_path: Path, out_path: Path, window: float) -> dict[str, float]:
    raw_duration = wav_duration(raw_path)
    start_pad = 0.10
    end_guard = 0.16
    max_speech = window - start_pad - end_guard

    filters = ["aresample=48000"]
    # Acelera somente se ultrapassar a janela. Quando estiver muito curto,
    # desacelera discretamente para aproveitar melhor o corte sem ficar arrastado.
    if raw_duration > max_speech:
        filters.append(atempo_chain(raw_duration / max_speech))
    elif raw_duration < max_speech * 0.78:
        desired = max_speech * 0.84
        filters.append(atempo_chain(raw_duration / desired))

    filters.extend(
        [
            "highpass=f=70",
            "lowpass=f=14500",
            "equalizer=f=180:t=q:w=1:g=1.5",
            "equalizer=f=3100:t=q:w=1:g=1.8",
            "acompressor=threshold=0.10:ratio=2.8:attack=5:release=90:makeup=1.5",
            "alimiter=limit=0.94",
            f"adelay={int(start_pad * 1000)}",
            f"apad=pad_dur={window}",
        ]
    )

    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(raw_path),
            "-af", ",".join(filters),
            "-ac", "1", "-ar", str(FINAL_RATE),
            "-t", f"{window:.3f}",
            "-c:a", "pcm_s16le", str(out_path),
        ],
        check=True,
    )
    return {"raw_duration": raw_duration, "window": window}


def build_track(api_key: str, name: str, segments: list[tuple[float, str]]) -> Path:
    processed: list[Path] = []
    report: list[dict[str, object]] = []

    for index, (window, transcript) in enumerate(segments, start=1):
        label = f"{name}, bloco {index} de {len(segments)}"
        print(f"Gerando {label}...", flush=True)
        audio = request_audio(api_key, transcript, label)
        raw_path = RAW / f"{name}_{index:02d}.wav"
        proc_path = PROC / f"{name}_{index:02d}.wav"
        write_pcm_wav(raw_path, audio)
        timing = process_segment(raw_path, proc_path, window)
        processed.append(proc_path)
        report.append(
            {
                "segment": index,
                "text": transcript,
                **timing,
            }
        )

    concat_file = OUT / f"{name}_concat.txt"
    concat_file.write_text(
        "\n".join(f"file '{path.as_posix()}'" for path in processed) + "\n",
        encoding="utf-8",
    )
    pre = OUT / f"{name}_iapetus_pre.wav"
    final = OUT / f"{name}_iapetus.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:a", "pcm_s16le", str(pre),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(pre),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=7",
            "-ac", "1", "-ar", str(FINAL_RATE),
            "-c:a", "pcm_s16le", str(final),
        ],
        check=True,
    )
    (OUT / f"{name}_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return final


def main() -> None:
    api_key = read_api_key()
    full = build_track(api_key, "farobella_completo", FULL_SEGMENTS)
    teaser = build_track(api_key, "farobella_teaser", TEASER_SEGMENTS)
    roteiro = OUT / "roteiro_falado_iapetus.txt"
    roteiro.write_text(
        "ROTEIRO COMPLETO\n\n"
        + "\n\n".join(text for _, text in FULL_SEGMENTS)
        + "\n\nROTEIRO TEASER\n\n"
        + "\n\n".join(text for _, text in TEASER_SEGMENTS)
        + "\n",
        encoding="utf-8",
    )
    print(f"Concluído: {full}")
    print(f"Concluído: {teaser}")


if __name__ == "__main__":
    main()
