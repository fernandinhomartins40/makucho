// ============================================================
// A bancada de comparação das animações (não é teste: gasta crédito).
//
// Roda as animações do MESMO vídeo em várias configurações e monta uma
// página para ver lado a lado -- é o que decide, com evidência, qual
// modelo dirige e desenha:
//
//   hoje            estilo do catálogo, cartões por gatilho, Flash sem raciocínio
//   livre-flash     direção livre, Flash pensando, com a crítica
//   livre-pro       direção livre, Pro pensando, com a crítica (o padrão novo)
//
// NÃO mexe no projeto: lê o plano e a fala, e nada é salvo (nem o plano,
// nem a nota, nem o vídeo das animações). O gasto de IA é real e entra no
// uso do workspace.
//
// Precisa do banco do Studio (o projeto já montado, com a chave de IA do
// workspace cadastrada) e, para a crítica, do Redis com o worker de render
// no ar (sem ele as cenas saem sem nota).
//
// Rodar, na pasta studio/apps/api:
//   npx tsx test/bancada-de-animacoes.manual.ts <projectId> [pasta-de-saida] [config,config]
// Ex.: npx tsx test/bancada-de-animacoes.manual.ts clx123 ./bancada hoje,livre-pro
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@makucho/studio-database';
import { FONTES_DOS_COMPONENTES } from '@makucho/studio-contracts/dist/componentes-hyperframes';
import { documentoDaComposicao, type EditPlanV1, type RelatorioDasAnimacoes } from '@makucho/studio-contracts';
import { CryptoService } from '../src/common/crypto.service';
import { FilaService } from '../src/common/fila.service';
import type { PrismaService } from '../src/common/prisma.service';
import { StorageService } from '../src/common/storage.service';
import { AiService, type PedidoDeIa, type ResultadoDeIa } from '../src/modules/ai/ai.service';
import { AnimacoesDaFalaService, type OpcoesDasAnimacoes } from '../src/modules/ai/animacoes-da-fala.service';
import { UsoDeIaService } from '../src/modules/ai/uso.service';
import { AnimacoesService } from '../src/modules/animacoes/animacoes.service';
import { EditPlansService } from '../src/modules/edit-plans/edit-plans.service';

const CONFIGS: Record<string, { nome: string; opcoes: OpcoesDasAnimacoes }> = {
  hoje: { nome: 'Hoje (catálogo, Flash sem raciocínio)', opcoes: { modo: 'classico' } },
  'livre-flash': {
    nome: 'Direção livre, Flash pensando',
    opcoes: { modo: 'livre', direcao: { modelo: 'deepseek-flash', raciocinio: 'high' }, desenho: { modelo: 'deepseek-flash', raciocinio: 'high' } },
  },
  'livre-pro': {
    nome: 'Direção livre, Pro pensando',
    opcoes: { modo: 'livre', direcao: { modelo: 'deepseek-v4-pro', raciocinio: 'high' }, desenho: { modelo: 'deepseek-v4-pro', raciocinio: 'high' } },
  },
};

const GSAP = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Resultado {
  chave: string;
  nome: string;
  segundos: number;
  centavos: number;
  chamadas: number;
  tokensDeSaida: number;
  nota: string;
  relatorio: RelatorioDasAnimacoes | null;
  cenas: Array<{ arquivo: string; inicioS: number; duracaoS: number; titulo: string; layout: string }>;
}

async function main() {
  const [projectId, pasta = './bancada-de-animacoes', quais] = process.argv.slice(2);
  if (!projectId) {
    console.error('uso: npx tsx test/bancada-de-animacoes.manual.ts <projectId> [pasta-de-saida] [hoje,livre-flash,livre-pro]');
    process.exit(2);
  }
  const chaves = (quais ? quais.split(',') : Object.keys(CONFIGS)).filter((c) => CONFIGS[c]);
  const saida = resolve(pasta);
  mkdirSync(saida, { recursive: true });

  const banco = new PrismaClient();
  const projeto = await banco.project.findUnique({ where: { id: projectId }, select: { id: true, workspaceId: true, title: true } });
  if (!projeto) throw new Error(`projeto ${projectId} não encontrado`);
  const sistema = { userId: 'sistema', workspaceId: projeto.workspaceId, role: 'OWNER' } as const;
  const p = banco as unknown as PrismaService;
  const planoReal = (await new EditPlansService(p).atual(sistema as never, projectId)).document as EditPlanV1;
  // A bancada parte do vídeo SEM animações: cada configuração cria as suas.
  const planoBase: EditPlanV1 = { ...planoReal, mediaLayers: (planoReal.mediaLayers ?? []).filter((m) => m.kind !== 'html') };

  const filas = new FilaService();
  const animacoesReais = new AnimacoesService(p, filas, new StorageService());
  const fontes = `${pathToFileURL(resolve(__dirname, '../../web/public/fonts')).href}/`;
  const resultados: Resultado[] = [];

  for (const chave of chaves) {
    const config = CONFIGS[chave]!;
    console.log(`\n=== ${config.nome} ===`);
    let centavos = 0;
    let chamadas = 0;
    let tokensDeSaida = 0;
    const ai = new AiService(p, new CryptoService(), new UsoDeIaService(p));
    const chamar = ai.chamar.bind(ai);
    ai.chamar = async (pedido: PedidoDeIa): Promise<ResultadoDeIa> => {
      const r = await chamar(pedido);
      centavos += r.custoCentavos;
      chamadas += 1;
      tokensDeSaida += r.outputTokens;
      console.log(`  ${pedido.chamada} (${r.modelo}): ${r.outputTokens} tokens de saída, US$ ${(r.custoCentavos / 100).toFixed(4)}`);
      return r;
    };

    // Nada é salvo: o plano fica em memória e as escritas no projeto são capturadas.
    let plano: EditPlanV1 = JSON.parse(JSON.stringify(planoBase));
    let relatorio: RelatorioDasAnimacoes | null = null;
    let nota = '';
    const prismaDaBancada = new Proxy(p, {
      get(alvo, prop, receptor) {
        if (prop !== 'project') return Reflect.get(alvo, prop, receptor);
        return {
          // Sem estilo fixo: a bancada compara as direções, não o estilo que a pessoa escolheu.
          findUnique: async () => ({ id: projectId, animationStyle: null, animationPalette: null, animationReport: relatorio }),
          update: async (a: { data: { animationNote?: string; animationReport?: RelatorioDasAnimacoes } }) => {
            if (a.data.animationNote) nota = a.data.animationNote;
            if (a.data.animationReport) relatorio = JSON.parse(JSON.stringify(a.data.animationReport));
          },
        };
      },
    });
    const planos = { atual: async () => ({ document: plano }), salvar: async (_t: unknown, _id: string, doc: EditPlanV1) => void (plano = doc) };
    const animacoes = {
      corDaMarca: (w: string) => animacoesReais.corDaMarca(w),
      problemas: animacoesReais.problemas.bind(animacoesReais),
      problemasDeLayout: animacoesReais.problemasDeLayout.bind(animacoesReais),
      fotografar: animacoesReais.fotografar.bind(animacoesReais),
      preparar: async () => ({}),
    };
    const servico = new AnimacoesDaFalaService(prismaDaBancada, ai, planos as never, animacoes as never);

    const inicio = Date.now();
    await servico.criarNaMontagem(sistema as never, projectId, (pct) => process.stdout.write(`\r  ${Math.round(pct)}%   `), undefined, config.opcoes);
    const segundos = (Date.now() - inicio) / 1000;
    console.log(`\n  ${nota}`);

    const cor = await animacoesReais.corDaMarca(projeto.workspaceId);
    const cenas = (plano.mediaLayers ?? [])
      .filter((m) => m.kind === 'html' && m.composicao)
      .map((m, i) => {
        const arquivo = `${chave}-${i + 1}.html`;
        writeFileSync(
          join(saida, arquivo),
          documentoDaComposicao(m.composicao!, { duracaoMs: m.durationMs, gsap: GSAP, fontes, origens: 'file: https://cdnjs.cloudflare.com', previa: true, corDaMarca: cor, componentes: FONTES_DOS_COMPONENTES }),
        );
        return { arquivo, inicioS: m.timelineStartMs / 1000, duracaoS: m.durationMs / 1000, titulo: m.composicao!.titulo ?? '', layout: m.composicao!.layout };
      });
    resultados.push({ chave, nome: config.nome, segundos, centavos, chamadas, tokensDeSaida, nota, relatorio, cenas });
  }

  writeFileSync(join(saida, 'index.html'), pagina(projeto.title, resultados));
  writeFileSync(join(saida, 'resultados.json'), JSON.stringify(resultados, null, 2));
  console.log(`\nPronto: abra ${join(saida, 'index.html')} no navegador.`);
  await filas.onModuleDestroy().catch(() => undefined);
  await banco.$disconnect();
  process.exit(0);
}

/** A página de comparação: uma coluna por configuração, as cenas tocando em laço. */
function pagina(titulo: string, resultados: Resultado[]): string {
  const colunas = resultados
    .map((r) => {
      const notas = (r.relatorio?.escrita ?? []).map((e) => e.critica?.nota).filter((n): n is number => typeof n === 'number');
      const media = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : '—';
      const design = r.relatorio?.design;
      const cenas = r.cenas
        .map((c) => {
          const critica = r.relatorio?.escrita.find((e) => Math.abs(e.inicioS - c.inicioS) < 0.01)?.critica;
          return `<figure><div class="quadro"><iframe src="${esc(c.arquivo)}" data-dur="${c.duracaoS}" loading="lazy"></iframe></div><figcaption><b>${Math.round(c.inicioS)}s · ${esc(c.titulo)}</b> (${esc(c.layout)}, ${c.duracaoS.toFixed(1)} s)${critica ? `<br>revisão: ${critica.nota}/10${critica.refeita ? `, refeita ${critica.refeita}x` : ''}${critica.problemas.length ? `<br><small>${esc(critica.problemas.join(' · '))}</small>` : ''}` : ''}</figcaption></figure>`;
        })
        .join('');
      const fora = (r.relatorio?.descartados ?? []).map((d) => `<li>${Math.round(d.inicioS)}s · ${esc(d.tipo)} — ${esc(d.motivo)}</li>`).join('');
      return `<section><h2>${esc(r.nome)}</h2>
<p class="numeros">${r.cenas.length} cenas · US$ ${(r.centavos / 100).toFixed(3)} · ${Math.round(r.segundos)} s · ${r.chamadas} chamadas · nota média ${media}</p>
<p>${esc(r.nota)}</p>
${design ? `<details open><summary>Design escrito pela IA</summary><p><b>${esc(design.conceito)}</b></p><p>${esc(design.linguagem)}</p><p>${esc(design.movimento)}</p><p class="cores">${[design.tema.fundo, design.tema.texto, design.tema.destaque, design.tema.destaque2, design.tema.destaque3].map((c) => `<i style="background:${esc(c)}" title="${esc(c)}"></i>`).join('')} ${esc(design.tema.fonteTitulo)} / ${esc(design.tema.fonteTexto)}</p></details>` : ''}
<div class="cenas">${cenas || '<p>Nenhuma cena.</p>'}</div>
${fora ? `<details><summary>Ficaram de fora</summary><ul>${fora}</ul></details>` : ''}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Bancada de animações</title>
<style>
body { margin: 0; padding: 24px; font: 15px/1.5 system-ui, sans-serif; background: #14161a; color: #e8eaed; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 0 0 6px; }
main { display: grid; grid-template-columns: repeat(${Math.max(1, resultados.length)}, minmax(300px, 1fr)); gap: 20px; align-items: start; }
section { background: #1d2026; border-radius: 12px; padding: 16px; min-width: 0; }
.numeros { color: #9aa0a6; margin: 0 0 8px; } .cenas { display: grid; grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); gap: 14px; margin-top: 12px; }
figure { margin: 0; } figcaption { font-size: 13px; margin-top: 6px; } small { color: #9aa0a6; }
.quadro { width: 216px; height: 384px; overflow: hidden; border-radius: 8px; background: #6b6f76; }
iframe { width: 1080px; height: 1920px; border: 0; transform: scale(0.2); transform-origin: 0 0; }
.cores i { display: inline-block; width: 18px; height: 18px; border-radius: 4px; margin-right: 4px; vertical-align: middle; border: 1px solid #fff3; }
details { margin-top: 8px; } summary { cursor: pointer; color: #9aa0a6; }
</style></head><body>
<h1>Bancada de animações — ${esc(titulo)}</h1>
<p class="numeros">O cinza é onde aparece o vídeo da pessoa. As cenas tocam em laço; nada disto foi salvo no projeto.</p>
<main>${colunas}</main>
<script>
// Cada cena toca em laço no próprio tempo (a prévia do Studio manda o instante do mesmo jeito).
var inicio = performance.now();
function tocar() {
  var agora = (performance.now() - inicio) / 1000;
  document.querySelectorAll('iframe').forEach(function (f) {
    var dur = parseFloat(f.getAttribute('data-dur')) || 5;
    try { f.contentWindow.postMessage({ hfT: agora % (dur + 0.8) }, '*'); } catch (e) {}
  });
  requestAnimationFrame(tocar);
}
tocar();
</script></body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
