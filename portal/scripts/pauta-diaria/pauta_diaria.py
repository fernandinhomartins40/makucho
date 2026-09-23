#!/usr/bin/env python3
"""
Pauta diária do MAKUCHO — sem IA.

Cria, por execução, até três publicações com imagem, gravadas pela API do
portal (mesmas validações, sanitização, recorte/compressão de imagem e
auditoria do painel):

1. Boletim de fechamento do mercado (conteúdo ORIGINAL): texto montado por
   regras fixas a partir de dados públicos — Dólar, Euro e Bitcoin
   (AwesomeAPI), Ibovespa (Yahoo Finance), Selic e IPCA (Banco Central/SGS).
   A imagem é um gráfico do dólar em 30 dias gerado aqui (matplotlib).

2. Até duas notícias de economia da Agência Brasil (EBC), republicadas pelo
   feed oficial. A política da agência autoriza a reprodução "para veículos
   de comunicação com fins jornalísticos, mediante indicação da fonte"
   (agenciabrasil.ebc.com.br/sobre): cada texto leva a fonte, o link para o
   original (também como URL canônica) e o crédito da foto.

Nada é reescrito nem inventado: o boletim só descreve os números do dia e
as notícias são reproduzidas como publicadas, com crédito.

Configuração por variáveis de ambiente:
  MAKUCHO_API_URL      ex.: https://makucho.com.br/api (obrigatória)
  MAKUCHO_EMAIL        usuário do painel com papel Editor ou superior
  MAKUCHO_SENHA        senha desse usuário
  PAUTA_STATUS         PUBLISHED | REVIEW | DRAFT (padrão REVIEW: fica
                       "Em revisão" no painel até alguém publicar)
  PAUTA_MAX_AGENCIA    quantas notícias da Agência Brasil (padrão 2)
  PAUTA_CATEGORIA      slug da categoria (padrão economia)
  PAUTA_BOLETIM_FDS    1 para gerar o boletim também no fim de semana
  PAUTA_SIMULAR        1 para só mostrar o que seria criado, sem gravar

Uso:  python pauta_diaria.py
"""

from __future__ import annotations

import html
import io
import os
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

import requests

FUSO_BR = timezone(timedelta(hours=-3))
TIMEOUT = 20
UA = "MakuchoPauta/1.0 (+https://makucho.com.br)"
FEED_AGENCIA = "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml"


def log(msg: str) -> None:
    print(f"[pauta] {msg}", flush=True)


def tipo_imagem(dados: bytes) -> str:
    """Tipo MIME pelos primeiros bytes (a extensão da URL nem sempre é confiável)."""
    if dados.startswith(bytes.fromhex("89504e47")):
        return "image/png"
    if dados.startswith(bytes.fromhex("ffd8")):
        return "image/jpeg"
    if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "image/webp"
    if dados[4:12] in (b"ftypavif", b"ftypavis"):
        return "image/avif"
    if dados[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "application/octet-stream"


# ============================================================
# API do portal
# ============================================================


class Portal:
    """Cliente mínimo da API: login por cookie, JSON e upload multipart."""

    def __init__(self, base: str, email: str, senha: str, simular: bool) -> None:
        self.base = base.rstrip("/")
        self.simular = simular
        self.http = requests.Session()
        self.http.headers["User-Agent"] = UA
        r = self.http.post(f"{self.base}/auth/login", json={"email": email, "password": senha}, timeout=TIMEOUT)
        if r.status_code != 200:
            raise SystemExit(f"Login falhou ({r.status_code}): {r.text[:200]}")
        usuario = r.json().get("user", {})
        if usuario.get("mustChangePassword"):
            raise SystemExit("O usuário da pauta precisa trocar a senha no painel antes de ser usado.")
        log(f"conectado como {usuario.get('email')} ({usuario.get('role')})")

    def get(self, caminho: str, **params):
        r = self.http.get(f"{self.base}{caminho}", params=params, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()

    def post(self, caminho: str, corpo: dict):
        r = self.http.post(f"{self.base}{caminho}", json=corpo, timeout=TIMEOUT)
        if r.status_code >= 400:
            raise RuntimeError(f"POST {caminho} → {r.status_code}: {r.text[:300]}")
        return r.json()

    def enviar_imagem(self, dados: bytes, nome: str, alt: str, credito: str, legenda: str | None = None) -> str:
        """Upload pelo mesmo pipeline do painel (preset HERO: 1600×900, WebP/AVIF)."""
        campos = {"preset": "HERO", "alt": alt[:320], "credit": credito[:160]}
        if legenda:
            campos["caption"] = legenda[:500]
        r = self.http.post(
            f"{self.base}/media/upload",
            # A API recusa arquivos sem tipo de imagem declarado.
            files={"file": (nome, dados, tipo_imagem(dados))},
            data=campos,
            timeout=60,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"upload de imagem → {r.status_code}: {r.text[:300]}")
        return r.json()["id"]

    def ja_existe(self, titulo: str, prefixo: str | None = None) -> bool:
        """Título igual — ou, com `prefixo`, qualquer título que comece com ele."""
        termo = (prefixo or titulo)[:200]
        achados = self.get("/posts/admin", search=termo, perPage=20).get("data", [])
        if prefixo:
            return any(p.get("title", "").startswith(prefixo) for p in achados)
        return any(p.get("title", "").strip().lower() == titulo.strip().lower() for p in achados)

    def categoria(self, slug: str) -> str:
        for c in self.get("/categories/admin"):
            if c["slug"] == slug:
                return c["id"]
        raise SystemExit(f"Categoria '{slug}' não existe no portal.")

    def autor(self, nome: str, funcao: str) -> str:
        for a in self.get("/authors/admin"):
            if a["name"].strip().lower() == nome.lower():
                return a["id"]
        if self.simular:
            return "00000000-0000-0000-0000-000000000000"
        log(f"criando autor '{nome}'")
        return self.post("/authors", {"name": nome, "role": funcao})["id"]


# ============================================================
# HTML → documento do editor (TipTap)
# ============================================================


class ParaTipTap(HTMLParser):
    """
    Converte o HTML das notícias nos nós que a API aceita: parágrafo,
    título, listas, citação, quebra de linha e marcas negrito/itálico/link.
    Imagens, vídeos, scripts e estilos são descartados.
    """

    BLOCOS = {"p": "paragraph", "h2": "heading", "h3": "heading", "h4": "heading", "blockquote": "blockquote"}
    MARCAS = {"strong": "bold", "b": "bold", "em": "italic", "i": "italic"}
    IGNORAR = {"script", "style", "iframe", "figure", "figcaption", "img", "video", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.doc: list[dict] = []
        self.pilha: list[dict] = []  # blocos abertos (listas, itens, citações)
        self.atual: dict | None = None  # parágrafo/título recebendo texto
        self.marcas: list[dict] = []
        self.ignorando = 0

    # -- utilitários --
    def _destino(self) -> list[dict]:
        return self.pilha[-1]["content"] if self.pilha else self.doc

    def _garantir_paragrafo(self) -> dict:
        if self.atual is None:
            self.atual = {"type": "paragraph", "content": []}
            self._destino().append(self.atual)
        return self.atual

    def _fechar_paragrafo(self) -> None:
        self.atual = None

    # -- eventos --
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.IGNORAR:
            if tag not in ("img",):
                self.ignorando += 1
            return
        if self.ignorando:
            return
        if tag in ("p", "h2", "h3", "h4"):
            self._fechar_paragrafo()
            no = {"type": self.BLOCOS[tag], "content": []}
            if no["type"] == "heading":
                no["attrs"] = {"level": 2 if tag == "h2" else 3}
            self._destino().append(no)
            self.atual = no
        elif tag in ("ul", "ol"):
            self._fechar_paragrafo()
            no = {"type": "bulletList" if tag == "ul" else "orderedList", "content": []}
            self._destino().append(no)
            self.pilha.append(no)
        elif tag == "li":
            self._fechar_paragrafo()
            no = {"type": "listItem", "content": []}
            self._destino().append(no)
            self.pilha.append(no)
        elif tag == "blockquote":
            self._fechar_paragrafo()
            no = {"type": "blockquote", "content": []}
            self._destino().append(no)
            self.pilha.append(no)
        elif tag == "br":
            self._garantir_paragrafo()["content"].append({"type": "hardBreak"})
        elif tag in self.MARCAS:
            self.marcas.append({"type": self.MARCAS[tag]})
        elif tag == "a" and a.get("href", "").startswith(("http://", "https://")):
            self.marcas.append({"type": "link", "attrs": {"href": a["href"]}})

    def handle_endtag(self, tag):
        if tag in self.IGNORAR:
            if tag not in ("img",) and self.ignorando:
                self.ignorando -= 1
            return
        if self.ignorando:
            return
        if tag in ("p", "h2", "h3", "h4"):
            self._fechar_paragrafo()
        elif tag in ("ul", "ol", "li", "blockquote"):
            self._fechar_paragrafo()
            if self.pilha:
                self.pilha.pop()
        elif tag in self.MARCAS or tag == "a":
            if self.marcas:
                self.marcas.pop()

    def handle_data(self, data):
        if self.ignorando:
            return
        texto = re.sub(r"\s+", " ", data)
        if not texto.strip():
            if self.atual and self.atual["content"] and texto:
                self.atual["content"].append({"type": "text", "text": " "})
            return
        no = {"type": "text", "text": texto}
        if self.marcas:
            no["marks"] = [dict(m) for m in self.marcas]
        self._garantir_paragrafo()["content"].append(no)

    def documento(self) -> dict:
        def limpo(nos):
            saida = []
            for n in nos:
                if "content" in n:
                    n["content"] = limpo(n["content"])
                    # aparar espaços nas pontas de parágrafos/títulos
                    if n["type"] in ("paragraph", "heading") and n["content"]:
                        if n["content"][0].get("type") == "text":
                            n["content"][0]["text"] = n["content"][0]["text"].lstrip()
                        if n["content"][-1].get("type") == "text":
                            n["content"][-1]["text"] = n["content"][-1]["text"].rstrip()
                        n["content"] = [c for c in n["content"] if c.get("type") != "text" or c["text"]]
                    if not n["content"] and n["type"] != "hardBreak":
                        continue
                saida.append(n)
            return saida

        return {"type": "doc", "content": limpo(self.doc)}


def html_para_tiptap(fragmento: str) -> dict:
    p = ParaTipTap()
    p.feed(fragmento)
    p.close()
    return p.documento()


def texto_puro(fragmento: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragmento))).strip()


def paragrafo(*partes: dict) -> dict:
    return {"type": "paragraph", "content": list(partes)}


def txt(texto: str, *marcas: str, link: str | None = None) -> dict:
    no: dict = {"type": "text", "text": texto}
    ms = [{"type": m} for m in marcas]
    if link:
        ms.append({"type": "link", "attrs": {"href": link}})
    if ms:
        no["marks"] = ms
    return no


# ============================================================
# 1. Boletim de mercado (conteúdo original)
# ============================================================


def _json(url: str, tentativas: int = 1, **kw):
    """GET JSON; a API do Banco Central é lenta e às vezes precisa de outra tentativa."""
    ua = kw.pop("ua", UA)
    for n in range(tentativas):
        try:
            r = requests.get(url, timeout=TIMEOUT + 15 * n, headers={"User-Agent": ua})
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if n == tentativas - 1:
                raise


@dataclass
class Cotacao:
    nome: str
    valor: float
    variacao: float | None
    unidade: str = ""


def coletar_mercado() -> dict[str, Cotacao]:
    dados: dict[str, Cotacao] = {}
    try:
        m = _json("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-USD")
        dados["dolar"] = Cotacao("Dólar", float(m["USDBRL"]["bid"]), float(m["USDBRL"]["pctChange"]), "R$")
        dados["euro"] = Cotacao("Euro", float(m["EURBRL"]["bid"]), float(m["EURBRL"]["pctChange"]), "R$")
        dados["bitcoin"] = Cotacao("Bitcoin", float(m["BTCUSD"]["bid"]), float(m["BTCUSD"]["pctChange"]), "US$")
    except Exception as e:  # noqa: BLE001 - uma fonte fora não derruba o boletim
        log(f"AwesomeAPI indisponível: {e}")
    try:
        meta = _json(
            "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1d&interval=1d",
            ua="Mozilla/5.0 (compatible; MakuchoPauta/1.0)",
        )["chart"]["result"][0]["meta"]
        atual, anterior = meta["regularMarketPrice"], meta.get("chartPreviousClose") or meta.get("previousClose")
        dados["ibovespa"] = Cotacao("Ibovespa", float(atual), (atual - anterior) / anterior * 100 if anterior else None, "pts")
    except Exception as e:  # noqa: BLE001
        log(f"Yahoo Finance indisponível: {e}")
    for chave, serie, nome in (("selic", 432, "Selic"), ("ipca", 13522, "IPCA 12 meses")):
        try:
            v = _json(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/1?formato=json", tentativas=3)
            dados[chave] = Cotacao(nome, float(v[-1]["valor"]), None, "%")
        except Exception as e:  # noqa: BLE001
            log(f"Banco Central ({nome}) indisponível: {e}")
    return dados


def historico_dolar(dias: int = 30) -> list[tuple[datetime, float]]:
    pontos = _json(f"https://economia.awesomeapi.com.br/json/daily/USD-BRL/{dias}")
    serie = [(datetime.fromtimestamp(int(p["timestamp"]), FUSO_BR), float(p["bid"])) for p in pontos]
    return sorted(serie)


def br(valor: float, casas: int = 2) -> str:
    return f"{valor:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def movimento(v: float | None, sobe: str = "subiu", cai: str = "caiu") -> str:
    if v is None:
        return "ficou sem variação informada"
    if abs(v) < 0.05:
        return "ficou estável"
    return f"{sobe if v > 0 else cai} {br(abs(v))}%"


def grafico_dolar(serie: list[tuple[datetime, float]]) -> bytes:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter

    naval, azul = "#0a1f44", "#1f6bff"
    fig, ax = plt.subplots(figsize=(16, 9), dpi=100)
    fig.patch.set_facecolor(naval)
    ax.set_facecolor(naval)
    datas, valores = zip(*serie)
    ax.plot(datas, valores, color=azul, linewidth=4)
    ax.fill_between(datas, valores, min(valores) * 0.998, color=azul, alpha=0.18)
    ax.scatter([datas[-1]], [valores[-1]], color="#ffffff", s=90, zorder=3)
    ax.annotate(f"R$ {br(valores[-1], 4)}", (datas[-1], valores[-1]), textcoords="offset points",
                xytext=(-10, 18), ha="right", color="white", fontsize=26, fontweight="bold")
    ax.set_title("Dólar comercial — últimos 30 dias", color="white", fontsize=34, loc="left", pad=28, fontweight="bold")
    ax.tick_params(colors="#c9d6ea", labelsize=18)
    ax.xaxis.set_major_formatter(DateFormatter("%d/%m"))
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#3a5378")
    ax.grid(axis="y", color="#23406b", linewidth=1)
    fig.text(0.99, 0.02, "MAKUCHO · dados: AwesomeAPI", color="#8fa6c8", fontsize=16, ha="right")
    fig.tight_layout(rect=(0.02, 0.04, 0.98, 0.98))
    saida = io.BytesIO()
    fig.savefig(saida, format="png", facecolor=naval)
    plt.close(fig)
    return saida.getvalue()


def montar_boletim(hoje: datetime) -> dict | None:
    d = coletar_mercado()
    if "dolar" not in d and "ibovespa" not in d:
        log("sem dados de Dólar nem Ibovespa: boletim não será criado")
        return None

    data_txt = hoje.strftime("%d/%m/%Y")
    partes_titulo = []
    if "dolar" in d:
        partes_titulo.append(f"dólar {movimento(d['dolar'].variacao, 'sobe', 'cai').replace('ficou estável', 'fica estável')}")
    if "ibovespa" in d:
        partes_titulo.append(f"Ibovespa {movimento(d['ibovespa'].variacao, 'sobe', 'cai').replace('ficou estável', 'fica estável')}")
    titulo = f"Mercado em {data_txt}: " + " e ".join(partes_titulo)

    corpo: list[dict] = []
    abertura = []
    if "dolar" in d:
        dol = d["dolar"]
        abertura.append(f"o dólar comercial {movimento(dol.variacao)} e era cotado a R$ {br(dol.valor, 4)}")
    if "ibovespa" in d:
        ib = d["ibovespa"]
        abertura.append(f"o Ibovespa {movimento(ib.variacao)}, aos {br(ib.valor, 0)} pontos")
    corpo.append(paragrafo(txt(f"Nesta {['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'][hoje.weekday()]} ({data_txt}), " + "; ".join(abertura) + ".")))

    outros = []
    if "euro" in d:
        outros.append(f"o euro {movimento(d['euro'].variacao)}, a R$ {br(d['euro'].valor, 4)}")
    if "bitcoin" in d:
        outros.append(f"o bitcoin {movimento(d['bitcoin'].variacao)}, a US$ {br(d['bitcoin'].valor, 0)}")
    if outros:
        corpo.append(paragrafo(txt("Entre os demais ativos acompanhados pelo MAKUCHO, " + " e ".join(outros) + ".")))

    juros = []
    if "selic" in d:
        juros.append(f"a meta da taxa Selic está em {br(d['selic'].valor)}% ao ano")
    if "ipca" in d:
        juros.append(f"a inflação oficial acumulada em 12 meses (IPCA) é de {br(d['ipca'].valor)}%")
    if juros:
        corpo.append(paragrafo(txt("No cenário de juros e inflação, " + ", e ".join(juros) + ", segundo o Banco Central.")))

    corpo.append({"type": "heading", "attrs": {"level": 2}, "content": [txt("Resumo do dia")]})
    itens = []
    for chave in ("dolar", "euro", "ibovespa", "bitcoin", "selic", "ipca"):
        if chave not in d:
            continue
        c = d[chave]
        if c.unidade == "%":
            valor = f"{br(c.valor)}%"
        elif c.unidade == "pts":
            valor = f"{br(c.valor, 0)} pontos"
        else:
            valor = f"{c.unidade} {br(c.valor, 4 if c.unidade == 'R$' else 0)}"
        var = f" ({'+' if (c.variacao or 0) > 0 else ''}{br(c.variacao)}% no dia)" if c.variacao is not None else ""
        itens.append({"type": "listItem", "content": [paragrafo(txt(f"{c.nome}: ", "bold"), txt(valor + var))]})
    corpo.append({"type": "bulletList", "content": itens})

    corpo.append(paragrafo(txt(
        "Fontes: AwesomeAPI (moedas e bitcoin), Yahoo Finance (Ibovespa) e Banco Central do Brasil (Selic e IPCA). "
        "Valores coletados automaticamente no fim do dia; podem diferir levemente do fechamento oficial. "
        "Este boletim é informativo e não constitui recomendação de investimento.", "italic")))

    imagem = None
    try:
        imagem = grafico_dolar(historico_dolar())
    except Exception as e:  # noqa: BLE001
        log(f"gráfico do dólar não gerado: {e}")

    resumo = texto_puro(" ".join(n["text"] for n in corpo[0]["content"]))
    return {
        "titulo": titulo,
        # Um boletim por dia: o título muda com a variação, então a data decide.
        "prefixo_unico": f"Mercado em {data_txt}:",
        "resumo": resumo[:600],
        "conteudo": {"type": "doc", "content": corpo},
        "imagem": imagem,
        "imagem_nome": f"boletim-{hoje:%Y%m%d}.png",
        "imagem_alt": f"Gráfico do dólar comercial nos últimos 30 dias, até {data_txt}",
        "imagem_credito": "Arte MAKUCHO com dados da AwesomeAPI",
        "canonica": None,
        "autor": ("Redação MAKUCHO", "Equipe editorial"),
    }


# ============================================================
# 2. Notícias da Agência Brasil (reprodução com fonte)
# ============================================================


@dataclass
class Noticia:
    titulo: str
    link: str
    html: str
    imagem: str | None
    publicada: datetime
    extras: dict = field(default_factory=dict)


def ler_feed_agencia(horas: int = 36) -> list[Noticia]:
    r = requests.get(FEED_AGENCIA, timeout=TIMEOUT, headers={"User-Agent": UA})
    r.raise_for_status()
    raiz = ET.fromstring(r.content)
    limite = datetime.now(timezone.utc) - timedelta(hours=horas)
    noticias = []
    for item in raiz.iter("item"):
        link = (item.findtext("link") or "").strip()
        if "/economia/noticia/" not in link:
            continue
        try:
            publicada = parsedate_to_datetime(item.findtext("pubDate") or "")
        except (TypeError, ValueError):
            publicada = datetime.now(timezone.utc)
        if publicada < limite:
            continue
        noticias.append(Noticia(
            titulo=html.unescape((item.findtext("title") or "").strip()),
            link=link,
            html=item.findtext("description") or "",
            imagem=(item.findtext("imagem-destaque") or "").strip() or None,
            publicada=publicada,
        ))
    return sorted(noticias, key=lambda n: n.publicada, reverse=True)


def detalhes_da_pagina(link: str) -> dict:
    """Imagem maior (og:image), crédito da foto e repórter, quando a página informa."""
    try:
        h = requests.get(link, timeout=TIMEOUT, headers={"User-Agent": UA}).text
    except Exception:  # noqa: BLE001
        return {}
    info: dict = {}
    m = re.search(r'<meta property="og:image" content="([^"]+)"', h)
    if m:
        info["imagem"] = html.unescape(m.group(1))
    m = re.search(r"Foto:\s*([^<\"/]{3,80}?)\s*/\s*Agência Brasil", html.unescape(h))
    if m:
        info["fotografo"] = m.group(1).strip()
    return info


def limpar_html_agencia(fragmento: str) -> str:
    # remove o parágrafo com o logotipo da agência que abre o feed
    fragmento = re.sub(r"<p[^>]*>\s*<p[^>]*>\s*<a[^>]*>\s*<img[^>]*logo-agenciabrasil[^>]*>\s*</a>\s*</p>", "", fragmento, flags=re.S)
    fragmento = re.sub(r"<img[^>]*logo-agenciabrasil[^>]*>", "", fragmento)
    return fragmento


def montar_noticia(n: Noticia) -> dict:
    info = detalhes_da_pagina(n.link)
    conteudo = html_para_tiptap(limpar_html_agencia(n.html))
    conteudo["content"].append(paragrafo(
        txt("Fonte: ", "italic"),
        txt("Agência Brasil", "italic", link=n.link),
        txt(". Reprodução autorizada para veículos com fins jornalísticos, mediante indicação da fonte.", "italic"),
    ))
    primeiro = next((texto_puro(" ".join(c.get("text", "") for c in b.get("content", [])))
                     for b in conteudo["content"] if b["type"] == "paragraph"), "")
    fotografo = info.get("fotografo")
    return {
        "titulo": n.titulo,
        "resumo": primeiro[:600] or None,
        "conteudo": conteudo,
        "imagem_url": info.get("imagem") or n.imagem,
        "imagem_nome": re.sub(r"[^a-z0-9-]", "", n.link.rstrip("/").split("/")[-1])[:80],
        "imagem_alt": n.titulo,
        "imagem_credito": f"Foto: {fotografo}/Agência Brasil" if fotografo else "Foto: Agência Brasil",
        "canonica": n.link,
        "autor": ("Agência Brasil", "Agência pública de notícias (EBC)"),
    }


# ============================================================
# Publicação
# ============================================================


def publicar(portal: Portal, pauta: dict, categoria_id: str, status: str) -> str | None:
    if portal.ja_existe(pauta["titulo"], pauta.get("prefixo_unico")):
        log(f"já existe, pulando: {pauta['titulo']}")
        return None
    if portal.simular:
        log(f"[simulação] criaria ({status}): {pauta['titulo']}")
        return None

    imagem_id = None
    dados = pauta.get("imagem")
    if dados is None and pauta.get("imagem_url"):
        try:
            r = requests.get(pauta["imagem_url"], timeout=TIMEOUT, headers={"User-Agent": UA})
            r.raise_for_status()
            dados = r.content
        except Exception as e:  # noqa: BLE001
            log(f"imagem não baixada ({e}); a publicação sai sem capa")
    if dados:
        try:
            extensao = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(tipo_imagem(dados), "")
            nome = pauta["imagem_nome"] if pauta["imagem_nome"].endswith(extensao) else pauta["imagem_nome"] + extensao
            imagem_id = portal.enviar_imagem(dados, nome, pauta["imagem_alt"], pauta["imagem_credito"])
        except Exception as e:  # noqa: BLE001
            log(f"imagem não enviada ({e}); a publicação sai sem capa")

    corpo = {
        "title": pauta["titulo"][:255],
        "excerpt": pauta.get("resumo"),
        "content": pauta["conteudo"],
        "categoryId": categoria_id,
        "authorId": portal.autor(*pauta["autor"]),
        "coverImageId": imagem_id,
        "status": status,
        "seoDescription": (pauta.get("resumo") or "")[:320] or None,
    }
    if pauta.get("canonica"):
        corpo["canonicalUrl"] = pauta["canonica"]
    criado = portal.post("/posts", corpo)
    log(f"criada ({status}): {criado['title']} → /artigo/{criado['slug']}")
    return criado["id"]


def main() -> int:
    base = os.environ.get("MAKUCHO_API_URL")
    email = os.environ.get("MAKUCHO_EMAIL")
    senha = os.environ.get("MAKUCHO_SENHA")
    if not (base and email and senha):
        print(__doc__)
        return 2

    status = os.environ.get("PAUTA_STATUS", "REVIEW").upper()
    if status not in ("PUBLISHED", "REVIEW", "DRAFT"):
        raise SystemExit("PAUTA_STATUS deve ser PUBLISHED, REVIEW ou DRAFT")
    max_agencia = int(os.environ.get("PAUTA_MAX_AGENCIA", "2"))
    simular = os.environ.get("PAUTA_SIMULAR") == "1"
    hoje = datetime.now(FUSO_BR)

    portal = Portal(base, email, senha, simular)
    categoria_id = portal.categoria(os.environ.get("PAUTA_CATEGORIA", "economia"))

    criadas, falhas = 0, 0
    pautas: list[dict] = []

    if hoje.weekday() < 5 or os.environ.get("PAUTA_BOLETIM_FDS") == "1":
        boletim = montar_boletim(hoje)
        if boletim:
            pautas.append(boletim)
    else:
        log("fim de semana: mercado fechado, boletim não gerado")

    try:
        for n in ler_feed_agencia():
            if len([p for p in pautas if p.get("canonica")]) >= max_agencia:
                break
            if portal.ja_existe(n.titulo):
                continue
            pautas.append(montar_noticia(n))
    except Exception as e:  # noqa: BLE001
        log(f"feed da Agência Brasil indisponível: {e}")
        falhas += 1

    for pauta in pautas:
        try:
            if publicar(portal, pauta, categoria_id, status):
                criadas += 1
        except Exception as e:  # noqa: BLE001
            falhas += 1
            log(f"falha em '{pauta['titulo']}': {e}")

    log(f"fim: {criadas} criada(s), {falhas} falha(s)")
    return 1 if falhas and not criadas else 0


if __name__ == "__main__":
    sys.exit(main())
