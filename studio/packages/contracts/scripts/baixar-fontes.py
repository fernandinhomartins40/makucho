"""
Baixa fontes de licença aberta do repositório oficial do Google Fonts,
gera a instância estática do peso escolhido (fontes variáveis) e dá a
cada arquivo um nome de família único -- o que o .ass declara e o
libass procura.
"""
import io
import os
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

DESTINO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'assets', 'fonts'))
LICENCAS = os.path.join(DESTINO, 'licencas')
BASE = 'https://raw.githubusercontent.com/google/fonts/main/'

# (id, caminho no repo, peso para instanciar ou None, família final, arquivo final, licença)
FONTES = [
    ('oswald', 'ofl/oswald/Oswald[wght].ttf', 700, 'Oswald Bold', 'Oswald-Bold.ttf', 'ofl/oswald/OFL.txt'),
    ('raleway', 'ofl/raleway/Raleway[wght].ttf', 900, 'Raleway Black', 'Raleway-Black.ttf', 'ofl/raleway/OFL.txt'),
    ('nunito', 'ofl/nunito/Nunito[wght].ttf', 900, 'Nunito Black', 'Nunito-Black.ttf', 'ofl/nunito/OFL.txt'),
    ('rubik', 'ofl/rubik/Rubik[wght].ttf', 800, 'Rubik ExtraBold', 'Rubik-ExtraBold.ttf', 'ofl/rubik/OFL.txt'),
    ('space-grotesk', 'ofl/spacegrotesk/SpaceGrotesk[wght].ttf', 700, 'Space Grotesk Bold', 'SpaceGrotesk-Bold.ttf', 'ofl/spacegrotesk/OFL.txt'),
    ('dancing', 'ofl/dancingscript/DancingScript[wght].ttf', 700, 'Dancing Script Bold', 'DancingScript-Bold.ttf', 'ofl/dancingscript/OFL.txt'),
    ('lato', 'ofl/lato/Lato-Black.ttf', None, 'Lato Black', 'Lato-Black.ttf', 'ofl/lato/OFL.txt'),
    ('kanit', 'ofl/kanit/Kanit-Black.ttf', None, 'Kanit Black', 'Kanit-Black.ttf', 'ofl/kanit/OFL.txt'),
    ('barlow-condensed', 'ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf', None, 'Barlow Condensed ExtraBold', 'BarlowCondensed-ExtraBold.ttf', 'ofl/barlowcondensed/OFL.txt'),
    ('lobster', 'ofl/lobster/Lobster-Regular.ttf', None, 'Lobster', 'Lobster-Regular.ttf', 'ofl/lobster/OFL.txt'),
    ('pacifico', 'ofl/pacifico/Pacifico-Regular.ttf', None, 'Pacifico', 'Pacifico-Regular.ttf', 'ofl/pacifico/OFL.txt'),
    ('permanent-marker', 'apache/permanentmarker/PermanentMarker-Regular.ttf', None, 'Permanent Marker', 'PermanentMarker-Regular.ttf', 'apache/permanentmarker/LICENSE.txt'),
    ('righteous', 'ofl/righteous/Righteous-Regular.ttf', None, 'Righteous', 'Righteous-Regular.ttf', 'ofl/righteous/OFL.txt'),
    ('luckiest-guy', 'apache/luckiestguy/LuckiestGuy-Regular.ttf', None, 'Luckiest Guy', 'LuckiestGuy-Regular.ttf', 'apache/luckiestguy/LICENSE.txt'),
    ('titan-one', 'ofl/titanone/TitanOne-Regular.ttf', None, 'Titan One', 'TitanOne-Regular.ttf', 'ofl/titanone/OFL.txt'),
    ('russo-one', 'ofl/russoone/RussoOne-Regular.ttf', None, 'Russo One', 'RussoOne-Regular.ttf', 'ofl/russoone/OFL.txt'),
    ('black-ops', 'ofl/blackopsone/BlackOpsOne-Regular.ttf', None, 'Black Ops One', 'BlackOpsOne-Regular.ttf', 'ofl/blackopsone/OFL.txt'),
    ('staatliches', 'ofl/staatliches/Staatliches-Regular.ttf', None, 'Staatliches', 'Staatliches-Regular.ttf', 'ofl/staatliches/OFL.txt'),
    ('bungee', 'ofl/bungee/Bungee-Regular.ttf', None, 'Bungee', 'Bungee-Regular.ttf', 'ofl/bungee/OFL.txt'),
    ('caveat-brush', 'ofl/caveatbrush/CaveatBrush-Regular.ttf', None, 'Caveat Brush', 'CaveatBrush-Regular.ttf', 'ofl/caveatbrush/OFL.txt'),
    ('dm-serif', 'ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf', None, 'DM Serif Display', 'DMSerifDisplay-Regular.ttf', 'ofl/dmserifdisplay/OFL.txt'),
    ('abril', 'ofl/abrilfatface/AbrilFatface-Regular.ttf', None, 'Abril Fatface', 'AbrilFatface-Regular.ttf', 'ofl/abrilfatface/OFL.txt'),
]


def baixar(caminho):
    url = BASE + urllib.request.quote(caminho)
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def renomear(font, familia):
    """Família única, subfamília Regular: o libass acha pelo nome e não
    engrossa por conta própria (peso já está no desenho)."""
    nome = font['name']
    ps = familia.replace(' ', '')
    for rec in list(nome.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17):
            nome.removeNames(nameID=rec.nameID)
    for nid, valor in ((1, familia), (2, 'Regular'), (3, f'{ps}-makucho'), (4, familia), (6, ps)):
        nome.setName(valor, nid, 3, 1, 0x409)
        nome.setName(valor, nid, 1, 0, 0)
    os2 = font['OS/2']
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | 0b1000000  # REGULAR
    font['head'].macStyle = 0


os.makedirs(LICENCAS, exist_ok=True)
for fid, caminho, peso, familia, arquivo, licenca in FONTES:
    dados = baixar(caminho)
    font = TTFont(io.BytesIO(dados))
    if peso is not None:
        font = instancer.instantiateVariableFont(font, {'wght': peso})
        font['OS/2'].usWeightClass = peso
    renomear(font, familia)
    font.save(os.path.join(DESTINO, arquivo))
    texto = baixar(licenca)
    with open(os.path.join(LICENCAS, f"{fid.replace('-', '')}-{'OFL' if licenca.endswith('OFL.txt') else 'LICENSE'}.txt"), 'wb') as f:
        f.write(texto)
    print(f'{fid:18} {familia:28} {arquivo}')
