# ============================================================
# MAKUCHO STUDIO - Transcricao com faster-whisper.
#
# Invocado pelo Node como processo filho. Recebe o caminho do audio
# por argumento e escreve UM JSON em stdout, no formato do
# `transcriptionResultSchema` dos contratos.
#
# Por que processo separado, e nao um binding: o faster-whisper e
# Python, carrega um modelo de centenas de MB e ocasionalmente morre
# por falta de memoria. Num processo filho, essa morte e um codigo de
# saida que o Node trata como falha de job -- no mesmo processo, ela
# derrubaria o worker inteiro e pararia a fila.
#
# REGRA DE SAIDA: stdout carrega SOMENTE o JSON. Todo log vai para
# stderr. O faster-whisper escreve avisos por conta propria, e um
# aviso no meio do stdout quebraria o parse do lado do Node.
# ============================================================

import json
import os
import sys


def log(mensagem: str) -> None:
    """Diagnostico vai para stderr: stdout e do JSON."""
    print(mensagem, file=sys.stderr, flush=True)


def ms(segundos: float) -> int:
    """Segundos do whisper para milissegundos do contrato.

    O contrato inteiro trabalha em inteiros de milissegundo; manter
    float ate o banco produziria cortes em posicoes que o player nao
    consegue buscar.
    """
    return max(0, int(round(segundos * 1000)))


def main() -> int:
    if len(sys.argv) < 2:
        log('uso: transcrever.py <caminho-do-audio>')
        return 2

    audio = sys.argv[1]
    if not os.path.isfile(audio):
        log(f'audio nao encontrado: {audio}')
        return 2

    modelo = os.environ.get('WHISPER_MODEL', 'small')
    compute = os.environ.get('WHISPER_COMPUTE_TYPE', 'int8')
    device = os.environ.get('WHISPER_DEVICE', 'cpu')
    threads = int(os.environ.get('WHISPER_THREADS', '2'))
    # pt fixo por padrao: deixar o whisper detectar idioma num audio
    # curto de portugues ocasionalmente devolve espanhol, e uma
    # transcricao no idioma errado nao e recuperavel por edicao.
    idioma = os.environ.get('WHISPER_LANGUAGE', 'pt')

    from faster_whisper import WhisperModel

    log(f'carregando {modelo} ({compute}, {device}, {threads} threads)')
    wm = WhisperModel(modelo, device=device, compute_type=compute, cpu_threads=threads)

    segmentos, info = wm.transcribe(
        audio,
        language=idioma,
        # Timestamps por palavra: a seguranca semantica precisa deles
        # para recusar um corte que cai no meio de uma silaba.
        word_timestamps=True,
        # VAD remove o silencio antes do modelo ve-lo. Sem isto o
        # whisper alucina texto em trechos mudos -- e alucinacao aqui
        # viraria fala que a pessoa nunca disse, que e exatamente o
        # que o produto promete nao fazer.
        vad_filter=True,
        vad_parameters={'min_silence_duration_ms': 500},
        # Beam 5 e o padrao da biblioteca: mais que isso custa tempo
        # de CPU sem ganho audivel em fala corrida.
        beam_size=5,
        # `condition_on_previous_text` desligado: quando o modelo
        # repete uma frase, com ela ligada ele se prende ao proprio
        # erro e repete ate o fim do audio.
        condition_on_previous_text=False,
    )

    saida = []
    posicao = 0

    for seg in segmentos:
        texto = (seg.text or '').strip()
        # O contrato exige texto nao vazio, e o VAD as vezes devolve um
        # segmento so com pontuacao. Descartar aqui e melhor que ver o
        # Zod recusar a transcricao inteira por causa de um segmento.
        if not texto:
            continue

        inicio, fim = ms(seg.start), ms(seg.end)
        if fim <= inicio:
            continue

        palavras = []
        for p in (seg.words or []):
            termo = (p.word or '').strip()
            if not termo:
                continue
            pi, pf = ms(p.start), ms(p.end)
            if pf <= pi:
                continue
            palavras.append({
                'word': termo[:100],
                'startMs': pi,
                'endMs': pf,
                # O whisper devolve probabilidade por palavra; quando
                # falta, 0.5 diz "incerto" sem fingir confianca.
                'confidence': max(0.0, min(1.0, float(getattr(p, 'probability', 0.5)))),
            })

        # avg_logprob e log-probabilidade (negativa). exp() a traz para
        # 0..1 -- nao e uma probabilidade calibrada, e sim uma ordem de
        # grandeza comparavel entre segmentos do mesmo audio.
        import math
        confianca = None
        if getattr(seg, 'avg_logprob', None) is not None:
            confianca = max(0.0, min(1.0, math.exp(seg.avg_logprob)))

        item = {
            'startMs': inicio,
            'endMs': fim,
            'text': texto,
            'position': posicao,
            'words': palavras,
        }
        if confianca is not None:
            item['confidence'] = confianca

        saida.append(item)
        posicao += 1
        log(f'segmento {posicao}: {inicio}ms-{fim}ms')

    if not saida:
        # O schema exige ao menos um segmento. Um audio sem fala e um
        # caso real (gravacao mudo, microfone errado), e precisa de
        # mensagem propria em vez de um erro de validacao do Zod.
        log('nenhuma fala reconhecida no audio')
        return 3

    resultado = {
        'language': getattr(info, 'language', idioma) or idioma,
        'model': modelo,
        'segments': saida,
    }

    media = [s['confidence'] for s in saida if 'confidence' in s]
    if media:
        resultado['confidence'] = sum(media) / len(media)

    json.dump(resultado, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        log(f'falha na transcricao: {type(e).__name__}: {e}')
        sys.exit(1)
