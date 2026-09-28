"""
Baixa fontes de licença aberta do repositório oficial do Google Fonts,
gera a instância estática do peso escolhido (fontes variáveis) e dá a
cada arquivo um nome de família único -- o que o .ass declara e o
libass procura.
"""
import io
import os
import sys
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

DESTINO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'assets', 'fonts'))
LICENCAS = os.path.join(DESTINO, 'licencas')
BASE = 'https://raw.githubusercontent.com/google/fonts/main/'

# (id, caminho no repo, peso para instanciar (ou dict de eixos, ou None), família final, arquivo final, licença)
# Rodar com --novas baixa só o que ainda não está na pasta.
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
    # ---------- Leva 2: sem serifa premium, condensadas, display, serifas e manuscritas ----------
    ('sora', 'ofl/sora/Sora[wght].ttf', 800, 'Sora ExtraBold', 'Sora-ExtraBold.ttf', 'ofl/sora/OFL.txt'),
    ('outfit', 'ofl/outfit/Outfit[wght].ttf', 800, 'Outfit ExtraBold', 'Outfit-ExtraBold.ttf', 'ofl/outfit/OFL.txt'),
    ('plus-jakarta', 'ofl/plusjakartasans/PlusJakartaSans[wght].ttf', 800, 'Plus Jakarta Sans ExtraBold', 'PlusJakartaSans-ExtraBold.ttf', 'ofl/plusjakartasans/OFL.txt'),
    ('manrope', 'ofl/manrope/Manrope[wght].ttf', 800, 'Manrope ExtraBold', 'Manrope-ExtraBold.ttf', 'ofl/manrope/OFL.txt'),
    ('dm-sans', 'ofl/dmsans/DMSans[opsz,wght].ttf', {'wght': 800, 'opsz': 24}, 'DM Sans ExtraBold', 'DMSans-ExtraBold.ttf', 'ofl/dmsans/OFL.txt'),
    ('urbanist', 'ofl/urbanist/Urbanist[wght].ttf', 900, 'Urbanist Black', 'Urbanist-Black.ttf', 'ofl/urbanist/OFL.txt'),
    ('figtree', 'ofl/figtree/Figtree[wght].ttf', 800, 'Figtree ExtraBold', 'Figtree-ExtraBold.ttf', 'ofl/figtree/OFL.txt'),
    ('lexend', 'ofl/lexend/Lexend[wght].ttf', 700, 'Lexend Bold', 'Lexend-Bold.ttf', 'ofl/lexend/OFL.txt'),
    ('league-spartan', 'ofl/leaguespartan/LeagueSpartan[wght].ttf', 800, 'League Spartan ExtraBold', 'LeagueSpartan-ExtraBold.ttf', 'ofl/leaguespartan/OFL.txt'),
    ('work-sans', 'ofl/worksans/WorkSans[wght].ttf', 800, 'Work Sans ExtraBold', 'WorkSans-ExtraBold.ttf', 'ofl/worksans/OFL.txt'),
    ('teko', 'ofl/teko/Teko[wght].ttf', 600, 'Teko SemiBold', 'Teko-SemiBold.ttf', 'ofl/teko/OFL.txt'),
    ('fjalla', 'ofl/fjallaone/FjallaOne-Regular.ttf', None, 'Fjalla One', 'FjallaOne-Regular.ttf', 'ofl/fjallaone/OFL.txt'),
    ('big-shoulders', 'ofl/bigshouldersdisplay/BigShouldersDisplay[wght].ttf', 900, 'Big Shoulders Display Black', 'BigShouldersDisplay-Black.ttf', 'ofl/bigshouldersdisplay/OFL.txt'),
    ('league-gothic', 'ofl/leaguegothic/LeagueGothic[wdth].ttf', {'wdth': 100}, 'League Gothic', 'LeagueGothic-Regular.ttf', 'ofl/leaguegothic/OFL.txt'),
    ('antonio', 'ofl/antonio/Antonio[wght].ttf', 700, 'Antonio Bold', 'Antonio-Bold.ttf', 'ofl/antonio/OFL.txt'),
    ('syne', 'ofl/syne/Syne[wght].ttf', 800, 'Syne ExtraBold', 'Syne-ExtraBold.ttf', 'ofl/syne/OFL.txt'),
    ('alfa-slab', 'ofl/alfaslabone/AlfaSlabOne-Regular.ttf', None, 'Alfa Slab One', 'AlfaSlabOne-Regular.ttf', 'ofl/alfaslabone/OFL.txt'),
    ('orbitron', 'ofl/orbitron/Orbitron[wght].ttf', 800, 'Orbitron ExtraBold', 'Orbitron-ExtraBold.ttf', 'ofl/orbitron/OFL.txt'),
    ('audiowide', 'ofl/audiowide/Audiowide-Regular.ttf', None, 'Audiowide', 'Audiowide-Regular.ttf', 'ofl/audiowide/OFL.txt'),
    ('press-start', 'ofl/pressstart2p/PressStart2P-Regular.ttf', None, 'Press Start 2P', 'PressStart2P-Regular.ttf', 'ofl/pressstart2p/OFL.txt'),
    ('bowlby', 'ofl/bowlbyone/BowlbyOne-Regular.ttf', None, 'Bowlby One', 'BowlbyOne-Regular.ttf', 'ofl/bowlbyone/OFL.txt'),
    ('passion-one', 'ofl/passionone/PassionOne-Bold.ttf', None, 'Passion One Bold', 'PassionOne-Bold.ttf', 'ofl/passionone/OFL.txt'),
    ('fraunces', 'ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf', {'wght': 800, 'opsz': 72, 'SOFT': 0, 'WONK': 0}, 'Fraunces ExtraBold', 'Fraunces-ExtraBold.ttf', 'ofl/fraunces/OFL.txt'),
    ('cormorant', 'ofl/cormorantgaramond/CormorantGaramond[wght].ttf', 700, 'Cormorant Garamond Bold', 'CormorantGaramond-Bold.ttf', 'ofl/cormorantgaramond/OFL.txt'),
    ('lora', 'ofl/lora/Lora[wght].ttf', 700, 'Lora Bold', 'Lora-Bold.ttf', 'ofl/lora/OFL.txt'),
    ('cinzel', 'ofl/cinzel/Cinzel[wght].ttf', 800, 'Cinzel ExtraBold', 'Cinzel-ExtraBold.ttf', 'ofl/cinzel/OFL.txt'),
    ('libre-baskerville', 'ofl/librebaskerville/LibreBaskerville[wght].ttf', 700, 'Libre Baskerville Bold', 'LibreBaskerville-Bold.ttf', 'ofl/librebaskerville/OFL.txt'),
    ('bodoni', 'ofl/bodonimoda/BodoniModa[opsz,wght].ttf', {'wght': 800, 'opsz': 72}, 'Bodoni Moda ExtraBold', 'BodoniModa-ExtraBold.ttf', 'ofl/bodonimoda/OFL.txt'),
    ('great-vibes', 'ofl/greatvibes/GreatVibes-Regular.ttf', None, 'Great Vibes', 'GreatVibes-Regular.ttf', 'ofl/greatvibes/OFL.txt'),
    ('satisfy', 'apache/satisfy/Satisfy-Regular.ttf', None, 'Satisfy', 'Satisfy-Regular.ttf', 'apache/satisfy/LICENSE.txt'),
    ('kalam', 'ofl/kalam/Kalam-Bold.ttf', None, 'Kalam Bold', 'Kalam-Bold.ttf', 'ofl/kalam/OFL.txt'),
    ('caveat', 'ofl/caveat/Caveat[wght].ttf', 700, 'Caveat Bold', 'Caveat-Bold.ttf', 'ofl/caveat/OFL.txt'),
    ('shadows', 'ofl/shadowsintolight/ShadowsIntoLight.ttf', None, 'Shadows Into Light', 'ShadowsIntoLight-Regular.ttf', 'ofl/shadowsintolight/OFL.txt'),
    ('rock-salt', 'apache/rocksalt/RockSalt-Regular.ttf', None, 'Rock Salt', 'RockSalt-Regular.ttf', 'apache/rocksalt/LICENSE.txt'),
    ('sacramento', 'ofl/sacramento/Sacramento-Regular.ttf', None, 'Sacramento', 'Sacramento-Regular.ttf', 'ofl/sacramento/OFL.txt'),
    ('yellowtail', 'apache/yellowtail/Yellowtail-Regular.ttf', None, 'Yellowtail', 'Yellowtail-Regular.ttf', 'apache/yellowtail/LICENSE.txt'),
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
SO_NOVAS = '--novas' in sys.argv
for fid, caminho, peso, familia, arquivo, licenca in FONTES:
    if SO_NOVAS and os.path.exists(os.path.join(DESTINO, arquivo)):
        continue
    dados = baixar(caminho)
    font = TTFont(io.BytesIO(dados))
    if peso is not None:
        eixos = peso if isinstance(peso, dict) else {'wght': peso}
        # Todo eixo variável fica fixo (o padrão, se não foi pedido): o
        # libass recebe uma fonte estática, igual no render e na prévia.
        if 'fvar' in font:
            for eixo in font['fvar'].axes:
                eixos.setdefault(eixo.axisTag, eixo.defaultValue)
        font = instancer.instantiateVariableFont(font, eixos)
        if 'wght' in eixos:
            font['OS/2'].usWeightClass = int(eixos['wght'])
    renomear(font, familia)
    font.save(os.path.join(DESTINO, arquivo))
    texto = baixar(licenca)
    with open(os.path.join(LICENCAS, f"{fid.replace('-', '')}-{'OFL' if licenca.endswith('OFL.txt') else 'LICENSE'}.txt"), 'wb') as f:
        f.write(texto)
    print(f'{fid:18} {familia:28} {arquivo}')
