"""
Gera src/metricas-de-fontes.ts a partir das fontes do vídeo.

Os textos de tela desenham um FUNDO (caixa arredondada, pílula, faixa)
atrás do texto, no .ass -- e o libass não sabe desenhar forma no tamanho
do texto sozinho (só retângulo). Então a largura é calculada aqui: a
largura de cada caractere, lida do próprio arquivo da fonte.

O libass dimensiona a fonte de modo que `usWinAscent + usWinDescent`
(tabela OS/2) seja o `\\fs`; a largura de um caractere em pixels é
`avanço / (winAscent + winDescent) * fs`.

Rodar de novo quando uma fonte entrar ou mudar:
    python packages/contracts/scripts/gerar-metricas-de-fontes.py
"""

import json
import os
from fontTools.ttLib import TTFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = os.path.normpath(os.path.join(AQUI, '..', '..', '..', 'assets', 'fonts'))
SAIDA = os.path.normpath(os.path.join(AQUI, '..', 'src', 'metricas-de-fontes.ts'))

# ASCII visível + Latin-1 (acentos do português) + tipografia comum.
CARACTERES = [chr(c) for c in range(32, 256)] + list('‘’“”–—…•€™')

metricas = {}
for arquivo in sorted(os.listdir(FONTES)):
    if not arquivo.endswith('.ttf'):
        continue
    f = TTFont(os.path.join(FONTES, arquivo))
    os2 = f['OS/2']
    altura = os2.usWinAscent + os2.usWinDescent
    cmap = f.getBestCmap()
    hmtx = f['hmtx']
    padrao = hmtx[cmap.get(ord('n'), '.notdef')][0] if ord('n') in cmap else hmtx['.notdef'][0]
    larguras = {}
    for c in CARACTERES:
        glifo = cmap.get(ord(c))
        # Em milésimos da altura de linha: inteiros pequenos, arquivo leve.
        larguras[c] = round((hmtx[glifo][0] if glifo else padrao) * 1000 / altura)
    metricas[arquivo] = {
        'padrao': round(padrao * 1000 / altura),
        'lista': [larguras[c] for c in CARACTERES],
    }

caracteres_js = json.dumps(''.join(CARACTERES), ensure_ascii=False)
linhas = [
    '// GERADO por scripts/gerar-metricas-de-fontes.py -- não edite à mão.',
    '//',
    '// Largura de cada caractere das fontes do vídeo, em milésimos da',
    '// altura de linha (a que o libass usa como `\\fs`).',
    '',
    f'export const CARACTERES_MEDIDOS = {caracteres_js};',
    '',
    'export const METRICAS_DE_FONTES: Record<string, { padrao: number; larguras: readonly number[] }> = {',
]
for arquivo, m in metricas.items():
    linhas.append(f"  '{arquivo}': {{ padrao: {m['padrao']}, larguras: {json.dumps(m['lista'])} }},")
linhas.append('};')
linhas.append('')
with open(SAIDA, 'w', encoding='utf-8') as s:
    s.write('\n'.join(linhas))
print(f'{len(metricas)} fontes -> {SAIDA}')
