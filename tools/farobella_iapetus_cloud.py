#!/usr/bin/env python3
"""Gera novas locuções FaroBella com Gemini Cloud TTS e voz Iapetus."""

from __future__ import annotations

import json
import subprocess
import time
import wave
from pathlib import Path

from google.api_core import exceptions as google_exceptions
from google.cloud import texttospeech

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "farobella_tts_output"
RAW = OUT / "raw_cloud"
PROC = OUT / "processed_cloud"
OUT.mkdir(exist_ok=True)
RAW.mkdir(exist_ok=True)
PROC.mkdir(exist_ok=True)

FINAL_RATE = 48_000
VOICE = "Iapetus"
MODEL = "gemini-2.5-flash-tts"
LANGUAGE = "pt-BR"
MAX_SYNTHESIS_ATTEMPTS = 6

RETRIABLE_TTS_ERRORS = (
    google_exceptions.Aborted,
    google_exceptions.Cancelled,
    google_exceptions.DeadlineExceeded,
    google_exceptions.InternalServerError,
    google_exceptions.ResourceExhausted,
    google_exceptions.ServiceUnavailable,
    google_exceptions.Unknown,
)

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
    (6.0, "Você vende fár-ma-si, mas ainda controla clientes, estoque, pedidos, pagamentos e entregas em vários lugares?"),
    (5.0, "Com o Faro Béla, sua operação fica organizada em um só sistema."),
    (8.0, "Monte carrinhos, receba por Pix ou cartão, compartilhe catálogos e acompanhe cada entrega."),
    (5.0, "Veja seu lucro real e saiba onde agir."),
    (6.0, "Faro Béla. Gestão fácil, vendas brilhantes. Fale agora pelo WhatsApp."),
]

PROMPT = """
Fale em português brasileiro nativo com a voz masculina Iapetus.
Use estilo de locução comercial moderno, simpático, confiante e envolvente.
O ritmo deve ser ágil e natural, com energia, sem soar lento, monótono ou robótico.
Use dicção clara e pausas curtas. Leia somente o texto fornecido, sem acrescentar explicações.
REGRA DE PRONÚNCIA OBRIGATÓRIA: a marca escrita como fár-ma-si deve ser pronunciada
como uma única palavra de três sílabas: FÁR-ma-si, com tonicidade forte na primeira sílaba FÁR
e som de S suave. Não leia os hífens, não soletre a palavra, não use pronúncia inglesa
e nunca diga far-má-zi.
Pronuncie Faro Béla naturalmente em português brasileiro.
""".strip()


def duration(path: Path) -> float:
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


def synthesize(client: texttospeech.TextToSpeechClient, text: str, output: Path) -> None:
    last_error: Exception | None = None

    for attempt in range(1, MAX_SYNTHESIS_ATTEMPTS + 1):
        try:
            response = client.synthesize_speech(
                input=texttospeech.SynthesisInput(text=text, prompt=PROMPT),
                voice=texttospeech.VoiceSelectionParams(
                    language_code=LANGUAGE,
                    name=VOICE,
                    model_name=MODEL,
                ),
                audio_config=texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                    sample_rate_hertz=24_000,
                ),
                timeout=180,
            )
            if not response.audio_content:
                raise RuntimeError("A API respondeu sem conteúdo de áudio.")
            output.write_bytes(response.audio_content)
            return
        except RETRIABLE_TTS_ERRORS as exc:
            last_error = exc
            if attempt >= MAX_SYNTHESIS_ATTEMPTS:
                break
            delay = min(30, 2 ** attempt)
            print(
                f"Falha temporária na síntese ({type(exc).__name__}). "
                f"Nova tentativa {attempt + 1}/{MAX_SYNTHESIS_ATTEMPTS} em {delay}s.",
                flush=True,
            )
            time.sleep(delay)

    raise RuntimeError(
        f"Falha ao sintetizar o trecho após {MAX_SYNTHESIS_ATTEMPTS} tentativas: {last_error}"
    ) from last_error


def process_segment(source: Path, target: Path, window: float) -> dict[str, float]:
    raw_duration = duration(source)
    start_pad = 0.08
    end_guard = 0.14
    available = window - start_pad - end_guard
    filters = ["aresample=48000"]

    if raw_duration > available:
        filters.append(atempo_chain(raw_duration / available))
    elif raw_duration < available * 0.74:
        desired = available * 0.82
        filters.append(atempo_chain(raw_duration / desired))

    filters.extend([
        "highpass=f=70",
        "lowpass=f=14500",
        "equalizer=f=180:t=q:w=1:g=1.2",
        "equalizer=f=3200:t=q:w=1:g=1.6",
        "acompressor=threshold=0.10:ratio=2.6:attack=5:release=90:makeup=1.4",
        "alimiter=limit=0.94",
        f"adelay={int(start_pad * 1000)}",
        f"apad=pad_dur={window}",
    ])

    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(source), "-af", ",".join(filters),
        "-ac", "1", "-ar", str(FINAL_RATE), "-t", f"{window:.3f}",
        "-c:a", "pcm_s16le", str(target),
    ], check=True)
    return {"raw_duration": raw_duration, "window": window}


def build(client: texttospeech.TextToSpeechClient, name: str, segments: list[tuple[float, str]]) -> Path:
    processed: list[Path] = []
    report: list[dict[str, object]] = []

    for index, (window, text) in enumerate(segments, 1):
        print(f"Gerando {name}: bloco {index}/{len(segments)}", flush=True)
        raw = RAW / f"{name}_{index:02d}.wav"
        proc = PROC / f"{name}_{index:02d}.wav"
        synthesize(client, text, raw)
        timing = process_segment(raw, proc, window)
        processed.append(proc)
        report.append({"segment": index, "text": text, **timing})
        time.sleep(0.8)

    concat = OUT / f"{name}_cloud_concat.txt"
    concat.write_text("\n".join(f"file '{p.as_posix()}'" for p in processed) + "\n", encoding="utf-8")
    preliminary = OUT / f"{name}_iapetus_cloud_pre.wav"
    final = OUT / f"{name}_iapetus_cloud.wav"

    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(concat),
        "-c:a", "pcm_s16le", str(preliminary),
    ], check=True)
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(preliminary), "-af", "loudnorm=I=-16:TP=-1.5:LRA=7",
        "-ac", "1", "-ar", str(FINAL_RATE), "-c:a", "pcm_s16le", str(final),
    ], check=True)

    (OUT / f"{name}_cloud_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return final


def main() -> None:
    client = texttospeech.TextToSpeechClient()
    full = build(client, "farobella_completo", FULL_SEGMENTS)
    teaser = build(client, "farobella_teaser", TEASER_SEGMENTS)
    (OUT / "roteiro_falado_iapetus_cloud.txt").write_text(
        "ROTEIRO COMPLETO\n\n" + "\n\n".join(t for _, t in FULL_SEGMENTS)
        + "\n\nROTEIRO TEASER\n\n" + "\n\n".join(t for _, t in TEASER_SEGMENTS) + "\n",
        encoding="utf-8",
    )
    print(f"Concluído: {full}")
    print(f"Concluído: {teaser}")


if __name__ == "__main__":
    main()
