// ============================================================
// Upload de assets — as recusas.
//
// O caminho feliz é uma linha; o que precisa de teste é o que o
// upload deve barrar. Cada caso aqui é um arquivo que passaria por
// uma validação ingênua:
//
//   - um .exe renomeado para .png (extensão mente)
//   - um PNG enviado como audio/mpeg (Content-Type mente)
//   - um SVG com <script> (o conteúdo é o ataque)
//   - um arquivo dentro do teto do tipo, mas acima da cota
//
// Prisma e Storage são dublês: o que está sob teste é a decisão do
// serviço, não o disco.
// ============================================================

import { MIME_POR_TIPO, TAMANHO_MAXIMO } from '@makucho/studio-contracts';
import { AssetsService } from '../src/modules/assets/assets.service';
import type { TenantContext } from '../src/common/tenant';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const tenant = { workspaceId: 'w1', userId: 'u1', role: 'OWNER' } as unknown as TenantContext;

/** PNG mínimo válido: assinatura + IHDR com dimensões e RGBA. */
function pngValido(largura = 512, altura = 256, tipoDeCor = 6): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  b.writeUInt8(8, 24); // profundidade
  b.writeUInt8(tipoDeCor, 25);
  return b;
}

/** MP3 com o frame sync que o detector reconhece. */
function mp3Valido(tamanho = 2048): Buffer {
  const b = Buffer.alloc(tamanho);
  Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]).copy(b, 0); // ID3v2
  return b;
}

function montar(opcoes: { usado?: number; existente?: unknown } = {}) {
  const gravados: string[] = [];
  const criados: Array<Record<string, unknown>> = [];

  const prisma = {
    asset: {
      findMany: async () => [],
      findUnique: async () => opcoes.existente ?? null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        criados.push(data);
        return { id: 'a1', ...data };
      },
      update: async () => ({}),
      aggregate: async () => ({ _sum: { sizeBytes: opcoes.usado ?? 0 } }),
    },
  };

  const storage = {
    gravar: async (chave: string, conteudo: Buffer) => {
      gravados.push(chave);
      return conteudo.byteLength;
    },
    caminho: (c: string) => `/storage/${c}`,
    tamanho: async () => 1024,
  };

  return {
    servico: new AssetsService(prisma as never, storage as never),
    gravados,
    criados,
  };
}

const enviar = (
  servico: AssetsService,
  extra: Partial<{ kind: string; mimeDeclarado: string; conteudo: Buffer; originalName: string }> = {},
) =>
  servico.enviar(tenant, {
    kind: 'LOGO',
    originalName: 'logo.png',
    mimeDeclarado: 'image/png',
    conteudo: pngValido(),
    ...extra,
  });

async function recusa(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'erro';
  }
}

async function main() {
  // ============================================================
  // Caminho feliz
  // ============================================================

  {
    const { servico, gravados, criados } = montar();
    const r = await enviar(servico);

    t('um PNG válido é aceito', r.id === 'a1' && !r.jaExistia);
    t('e vai para o disco', gravados.length === 1);

    // O nome enviado pelo usuário NUNCA vira caminho: ele pode conter
    // "../", separador de diretório ou byte nulo.
    t(
      'a chave não vem do nome do arquivo',
      gravados[0]!.startsWith('assets/w1/logo/') && !gravados[0]!.includes('logo.png'),
    );
    t('o nome original fica como metadado', criados[0]!.originalName === 'logo.png');

    // Dimensões lidas do cabeçalho, sem biblioteca de imagem.
    t('as dimensões são lidas do PNG', criados[0]!.widthPx === 512 && criados[0]!.heightPx === 256);
    // Alfa importa: logo sem transparência ganha retângulo branco
    // quando sobreposta ao vídeo.
    t('o canal alfa é detectado', criados[0]!.hasAlpha === true);
  }

  {
    // Tipo de cor 2 = RGB sem alfa.
    const { servico, criados } = montar();
    await enviar(servico, { conteudo: pngValido(100, 100, 2) });
    t('PNG sem alfa é marcado como opaco', criados[0]!.hasAlpha === false);
  }

  {
    // Cabeçalho deslocado: o IHDR não está onde deveria. Sem conferir
    // isso, os offsets são lidos às cegas e o banco recebe números
    // absurdos — medido: altura 134.610.944 num arquivo de 54 bytes.
    const { servico, criados } = montar();
    const torto = pngValido();
    torto.write('XXXX', 12, 'ascii'); // destrói o marcador IHDR

    await enviar(servico, { conteudo: torto });
    t(
      'PNG com cabeçalho deslocado não grava dimensão inventada',
      criados[0]!.widthPx === null && criados[0]!.heightPx === null,
    );
    t('mas o arquivo ainda é aceito -- dimensão é informativa', criados.length === 1);
  }

  {
    // Dimensão absurda dentro de um cabeçalho bem formado: o formato
    // permite até 2^31-1, mas nenhuma imagem real passa de 65535.
    const { servico, criados } = montar();
    await enviar(servico, { conteudo: pngValido(999_999, 10) });
    t('dimensão fora de qualquer escala real é descartada', criados[0]!.widthPx === null);
  }

  {
    const { servico, criados } = montar();
    await enviar(servico, { conteudo: pngValido(0, 0) });
    t('dimensão zero é descartada', criados[0]!.widthPx === null);
  }

  // ============================================================
  // O MIME vale pelos BYTES
  // ============================================================

  {
    // Um executável renomeado para .png. A extensão mente, o
    // Content-Type mente, e os bytes não.
    const { servico, gravados } = montar();
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(600)]);
    const erro = await recusa(() => enviar(servico, { conteudo: exe }));

    t('um .exe renomeado para .png é recusado', erro !== null);
    t('e nada foi gravado no disco', gravados.length === 0);
  }

  {
    // PNG real, mas declarado como áudio: divergência já é sinal de
    // problema — ou o cliente errou, ou tentou disfarçar.
    const { servico } = montar();
    const erro = await recusa(() =>
      enviar(servico, { kind: 'MUSIC', mimeDeclarado: 'audio/mpeg', conteudo: pngValido() }),
    );
    t('PNG declarado como áudio é recusado', erro !== null);
    t('e a recusa diz o que o arquivo É', (erro ?? '').includes('image/png'));
  }

  {
    // MP3 real, mas o tipo LOGO não aceita áudio.
    const { servico } = montar();
    const erro = await recusa(() =>
      enviar(servico, { mimeDeclarado: 'audio/mpeg', conteudo: mp3Valido() }),
    );
    t('áudio enviado como LOGO é recusado', erro !== null);
  }

  {
    const { servico } = montar();
    const erro = await recusa(() => enviar(servico, { conteudo: Buffer.alloc(0) }));
    t('arquivo vazio é recusado', (erro ?? '').includes('vazio'));
  }

  {
    const { servico } = montar();
    const erro = await recusa(() => enviar(servico, { kind: 'INVENTADO' }));
    t('tipo de asset inventado é recusado', (erro ?? '').includes('desconhecido'));
  }

  // ============================================================
  // SVG: o conteúdo é o ataque
  //
  // Um SVG é documento XML. Servido inline, seu script roda no
  // domínio da aplicação, com acesso ao cookie de sessão. O cliente
  // envia o próprio logo, então o arquivo é confiável na INTENÇÃO e
  // não na FORMA — um editor gráfico embute script sem ninguém ver.
  // ============================================================

  const svg = (interno: string) =>
    Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">${interno}</svg>`);

  {
    const { servico, gravados } = montar();
    const r = await enviar(servico, {
      mimeDeclarado: 'image/svg+xml',
      conteudo: svg('<circle r="10"/>'),
    });
    t('um SVG limpo é aceito', r.id === 'a1');
    t('e vai para o disco com extensão svg', gravados[0]!.endsWith('.svg'));
  }

  for (const [nome, carga] of [
    ['<script>', '<script>alert(1)</script>'],
    ['onload inline', '<circle onload="alert(1)" r="5"/>'],
    ['javascript: em href', '<a href="javascript:alert(1)">x</a>'],
    ['foreignObject', '<foreignObject><body>x</body></foreignObject>'],
    ['use externo', '<use href="https://evil.example.com/x.svg#a"/>'],
    ['ENTITY (XXE)', '<!ENTITY xxe SYSTEM "file:///etc/passwd">'],
  ] as const) {
    const { servico, gravados } = montar();
    const erro = await recusa(() =>
      enviar(servico, { mimeDeclarado: 'image/svg+xml', conteudo: svg(carga) }),
    );
    t(`SVG com ${nome} é recusado`, erro !== null);
    t(`  e ${nome} não chega ao disco`, gravados.length === 0);
  }

  {
    // A mensagem orienta em vez de acusar: a pessoa não colocou o
    // script ali de propósito, foi o editor gráfico.
    const { servico } = montar();
    const erro = await recusa(() =>
      enviar(servico, {
        mimeDeclarado: 'image/svg+xml',
        conteudo: svg('<script>x</script>'),
      }),
    );
    t('a recusa do SVG diz o que fazer', /exporte|PNG/i.test(erro ?? ''));
    t('e não vaza a regex que detectou', !/\\s|regex|\[\\s>\]/.test(erro ?? ''));
  }

  // ============================================================
  // Tamanho e cota
  // ============================================================

  {
    // Dentro do formato, acima do teto do tipo.
    const { servico, gravados } = montar();
    const grande = Buffer.concat([pngValido(), Buffer.alloc(TAMANHO_MAXIMO.LOGO + 1)]);
    const erro = await recusa(() => enviar(servico, { conteudo: grande }));

    t('arquivo acima do teto do tipo é recusado', erro !== null);
    t('e a recusa diz o teto em MB', /\d+ MB/.test(erro ?? ''));
    t('e nada foi gravado', gravados.length === 0);
  }

  {
    // O teto é POR TIPO: um logo de 3 MB estoura, uma imagem não.
    t('o teto de LOGO é menor que o de IMAGE', TAMANHO_MAXIMO.LOGO < TAMANHO_MAXIMO.IMAGE);
  }

  {
    // Dentro do teto do tipo, mas a cota do workspace já está cheia.
    const { servico, gravados } = montar({ usado: 200 * 1024 * 1024 });
    const erro = await recusa(() => enviar(servico));

    t('a cota do workspace é conferida ANTES de gravar', gravados.length === 0);
    t('e a recusa diz o que fazer', /remova/i.test(erro ?? ''));
  }

  {
    const { servico } = montar({ usado: 1024 });
    const c = await servico.cota(tenant);
    t('a cota é consultável antes de o limite bater', c.quotaBytes > 0 && c.usadoBytes === 1024);
    t('com percentual para a tela', typeof c.percentual === 'number');
  }

  // ============================================================
  // Mesmo arquivo duas vezes
  // ============================================================

  {
    // O hash é do CONTEÚDO: reenviar o mesmo arquivo reaproveita a
    // chave em vez de duplicar bytes no disco da VPS.
    const { servico, gravados } = montar({
      existente: { id: 'ja-existe', kind: 'LOGO', isActive: true },
    });
    const r = await enviar(servico);

    t('o mesmo arquivo reenviado reaproveita o registro', r.id === 'ja-existe');
    t('e diz que já existia', r.jaExistia === true);
    t('e NÃO grava de novo', gravados.length === 0);
  }

  {
    // Um asset desativado que é reenviado volta a valer: remover foi
    // uma decisão reversível.
    const { servico } = montar({
      existente: { id: 'desativado', kind: 'LOGO', isActive: false },
    });
    const r = await enviar(servico);
    t('reenviar um asset removido o reativa', r.id === 'desativado');
  }

  // ============================================================
  // Coerência do contrato
  // ============================================================

  {
    // SVG entra como logo e não como imagem comum: é o único tipo em
    // que ele é aceito, justamente porque passa por sanitização.
    t('SVG é aceito em LOGO', MIME_POR_TIPO.LOGO.includes('image/svg+xml'));
    t('SVG NÃO é aceito em IMAGE', !MIME_POR_TIPO.IMAGE.includes('image/svg+xml'));
  }

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
