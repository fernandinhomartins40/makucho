import { writeFile, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  criarEspacoDeTrabalho,
  comEspacoDeTrabalho,
  verificarLimite,
  nomeSeguro,
  LimiteDeDiscoExcedido,
} from '../src/tmp-dir';

// O pacote compila para CommonJS e o esbuild recusa top-level await
// nesse formato; por isso o corpo do teste vive numa funcao.
async function main() {

  let ok = 0, fail = 0;
  const t = (nome: string, cond: boolean) => {
    cond ? ok++ : fail++;
    console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
  };

  const existe = async (caminho: string) =>
    stat(caminho).then(() => true).catch(() => false);

  // ============================================================
  // Nome de arquivo seguro
  // ============================================================

  // Nomes chegam de metadados do video e do que o usuario enviou.
  t('remove travessia de diretorio',
    !nomeSeguro('../../etc/cron.d/backdoor').includes('..'));

  t('remove separador de caminho',
    !nomeSeguro('pasta/arquivo.mp4').includes('/'));

  t('remove separador do Windows',
    !nomeSeguro('C:\\Windows\\system32').includes('\\'));

  // Byte nulo trunca o caminho em chamadas de sistema.
  t('remove byte nulo', !nomeSeguro('arquivo\0.mp4').includes('\0'));

  t('preserva nome legitimo', nomeSeguro('proxy_720p.mp4') === 'proxy_720p.mp4');
  t('nome vazio vira padrao', nomeSeguro('///') === 'arquivo' || nomeSeguro('///').length > 0);
  t('limita o tamanho', nomeSeguro('a'.repeat(500)).length <= 120);

  // ============================================================
  // Espaço de trabalho
  // ============================================================

  const espaco = await criarEspacoDeTrabalho('teste-');
  t('cria o diretorio', await existe(espaco.caminho));

  // mkdtemp gera sufixo aleatorio: dois jobs nunca compartilham pasta.
  const outro = await criarEspacoDeTrabalho('teste-');
  t('cada job recebe diretorio proprio', espaco.caminho !== outro.caminho);

  await writeFile(espaco.arquivo('proxy.mp4'), Buffer.alloc(1024));
  t('o arquivo fica dentro do espaco',
    espaco.arquivo('proxy.mp4').startsWith(espaco.caminho));

  // O nome perigoso e neutralizado, e o arquivo continua no lugar certo.
  const perigoso = espaco.arquivo('../../fora.txt');
  t('nome perigoso nao escapa do espaco', perigoso.startsWith(espaco.caminho));

  t('soma o tamanho dos arquivos', (await espaco.tamanho()) >= 1024);

  // O render do Remotion cria uma pasta de frames.
  await mkdir(join(espaco.caminho, 'frames'));
  await writeFile(join(espaco.caminho, 'frames', 'f1.png'), Buffer.alloc(2048));
  t('soma subdiretorios', (await espaco.tamanho()) >= 3072);

  await espaco.limpar();
  t('limpar remove o diretorio', !(await existe(espaco.caminho)));

  // Limpar duas vezes nao pode falhar: o erro aqui mascararia o erro
  // real do job.
  let erroAoRelimpar = false;
  try {
    await espaco.limpar();
  } catch {
    erroAoRelimpar = true;
  }
  t('limpar e idempotente', !erroAoRelimpar);

  await outro.limpar();

  // ============================================================
  // Limpeza garantida — a exigência do ADR 0003
  // ============================================================

  let caminhoDoSucesso = '';
  const resultado = await comEspacoDeTrabalho(async (e) => {
    caminhoDoSucesso = e.caminho;
    await writeFile(e.arquivo('saida.mp4'), Buffer.alloc(512));
    return 'pronto';
  });

  t('devolve o resultado da tarefa', resultado === 'pronto');
  t('limpa apos sucesso', !(await existe(caminhoDoSucesso)));

  // Um job que falha no meio e deixa 2 GB para tras nao derruba so o
  // studio: derruba todo mundo quando o disco encher.
  let caminhoDaFalha = '';
  let propagou = false;
  try {
    await comEspacoDeTrabalho(async (e) => {
      caminhoDaFalha = e.caminho;
      await writeFile(e.arquivo('parcial.mp4'), Buffer.alloc(512));
      throw new Error('ffmpeg falhou');
    });
  } catch (e) {
    propagou = (e as Error).message === 'ffmpeg falhou';
  }

  t('propaga o erro da tarefa', propagou);
  t('limpa apos FALHA', !(await existe(caminhoDaFalha)));

  // ============================================================
  // Limite de disco
  // ============================================================

  const comLimite = await criarEspacoDeTrabalho('limite-');
  await writeFile(comLimite.arquivo('grande.bin'), Buffer.alloc(4096));

  let estourou = false;
  try {
    await verificarLimite(comLimite, 1024);
  } catch (e) {
    estourou = e instanceof LimiteDeDiscoExcedido;
  }
  t('detecta estouro do limite', estourou);

  // Estourar nao e disco cheio: e sinal de video grande demais ou de um
  // loop gerando frames sem parar.
  let dentro = true;
  try {
    await verificarLimite(comLimite, 1024 * 1024);
  } catch {
    dentro = false;
  }

  t('nao reclama dentro do limite', dentro);
  await comLimite.limpar();
  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);

}

void main();
