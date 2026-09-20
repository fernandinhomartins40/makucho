import {
  estadoDaRetencao,
  avaliarPermanente,
  avaliarEdicao,
  planejarLiberacao,
  cabeNaEdicao,
  cabeNoPermanente,
  resumoDeArmazenamento,
  baldeDe,
  expiraPorTempo,
  RETENCAO_DIAS,
  AVISOS_DIAS_ANTES,
  QUOTA_TOTAL_BYTES,
  QUOTA_PERMANENTE_BYTES,
  QUOTA_EDICAO_BYTES,
} from '../src/index';
import type { ArquivoCandidato } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const DIA = 24 * 60 * 60 * 1000;
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const agora = new Date('2026-09-20T12:00:00Z');
const diasAtras = (n: number) => new Date(agora.getTime() - n * DIA);

// ============================================================
// Cotas: 10 GB = 4 permanente + 6 edição
// ============================================================

t('cota total e 10 GB', QUOTA_TOTAL_BYTES === 10 * GB);
t('permanente tem 4 GB', QUOTA_PERMANENTE_BYTES === 4 * GB);
t('edicao tem 6 GB', QUOTA_EDICAO_BYTES === 6 * GB);
t('os baldes somam o total',
  QUOTA_PERMANENTE_BYTES + QUOTA_EDICAO_BYTES === QUOTA_TOTAL_BYTES);

// ============================================================
// Baldes
// ============================================================

// Material de apoio e insumo de TODO video: apagar quebraria
// projetos futuros.
t('musica e material permanente', baldeDe('MUSIC') === 'permanente');
t('logo e material permanente', baldeDe('LOGO') === 'permanente');
t('intro e material permanente', baldeDe('INTRO') === 'permanente');

t('video original e de edicao', baldeDe('ORIGINAL') === 'edicao');
t('proxy e de edicao', baldeDe('PROXY') === 'edicao');
t('render e de edicao', baldeDe('RENDER') === 'edicao');

t('permanente nao expira por tempo', !expiraPorTempo('MUSIC'));
t('edicao expira por tempo', expiraPorTempo('ORIGINAL'));

// ============================================================
// Retenção por tempo (só no balde de edição)
// ============================================================

t('original dura mais que o audio', RETENCAO_DIAS.ORIGINAL > RETENCAO_DIAS.AUDIO);
t('render tem o prazo mais longo',
  RETENCAO_DIAS.RENDER >= Math.max(...Object.values(RETENCAO_DIAS)));

const musicaAntiga = estadoDaRetencao('MUSIC', diasAtras(500), false, agora);
t('musica de 500 dias nao expira', !musicaAntiga.expirado);
t('material permanente nao tem data de expiracao', musicaAntiga.expiresAt === null);

const recem = estadoDaRetencao('ORIGINAL', diasAtras(1), false, agora);
t('video recente nao avisa', !recem.deveAvisar && recem.diasRestantes === 29);

// Tres avisos: quem abre o app uma vez por semana perderia um só.
t('avisa 7 dias antes',
  estadoDaRetencao('ORIGINAL', diasAtras(23), false, agora).deveAvisar);
t('avisa 3 dias antes',
  estadoDaRetencao('ORIGINAL', diasAtras(27), false, agora).deveAvisar);

const um = estadoDaRetencao('ORIGINAL', diasAtras(29), false, agora);
t('avisa 1 dia antes', um.deveAvisar);
t('mensagem de 1 dia usa "amanha"', um.mensagem?.includes('amanhã') === true);

// Avisar todo dia vira ruido e o usuario para de ler.
t('nao avisa entre os marcos',
  !estadoDaRetencao('ORIGINAL', diasAtras(25), false, agora).deveAvisar);
t('marcos sao 7, 3 e 1', AVISOS_DIAS_ANTES.length === 3);

const vencido = estadoDaRetencao('ORIGINAL', diasAtras(40), false, agora);
t('video vencido esta expirado', vencido.expirado && vencido.diasRestantes === 0);

const fixado = estadoDaRetencao('ORIGINAL', diasAtras(100), true, agora);
t('projeto fixado nunca expira', !fixado.expirado && fixado.expiresAt === null);

// Um aviso sem saida deixa o usuario sem acao.
const sete = estadoDaRetencao('ORIGINAL', diasAtras(23), false, agora);
t('aviso oferece uma saida',
  sete.mensagem !== null &&
  (sete.mensagem.includes('Baixe') || sete.mensagem.includes('fixe')));

// ============================================================
// Balde permanente: enche e recusa, sem apagar nada sozinho
// ============================================================

t('permanente tranquilo fica ok',
  avaliarPermanente(1 * GB).nivel === 'ok');

t('permanente em 75% avisa',
  avaliarPermanente(3 * GB).nivel === 'atencao');

const permCheio = avaliarPermanente(4 * GB);
t('permanente cheio', permCheio.nivel === 'cheio');

// O sistema nao escolhe qual logo ou trilha do cliente descartar.
t('permanente cheio explica que nao apaga sozinho',
  permCheio.mensagem?.includes('não são apagados automaticamente') === true);

t('permanente recusa o que nao cabe',
  !cabeNoPermanente(QUOTA_PERMANENTE_BYTES - 100 * MB, 500 * MB));

t('permanente aceita o que cabe',
  cabeNoPermanente(1 * GB, 500 * MB));

// ============================================================
// Balde de edição: o espaço não acaba, os antigos cedem lugar
// ============================================================

t('edicao tranquila fica ok', avaliarEdicao(1 * GB).nivel === 'ok');

const edAtencao = avaliarEdicao(4.6 * GB);
t('edicao em 75% avisa', edAtencao.nivel === 'atencao');

// O ponto que o usuario precisa entender ANTES de perder algo.
t('aviso de 75% explica que os antigos darao lugar aos novos',
  edAtencao.mensagem?.includes('mais antigos') === true);

const edCritico = avaliarEdicao(5.5 * GB);
t('edicao em 90% e critico', edCritico.nivel === 'critico');
t('aviso critico diz que os antigos serao removidos',
  edCritico.mensagem?.includes('serão removidos') === true);
t('aviso critico oferece baixar ou fixar',
  edCritico.mensagem?.includes('Baixe') === true &&
  edCritico.mensagem?.includes('fixe') === true);

// Arquivo fixado nao cede lugar: e o unico jeito de travar o balde.
const travado = avaliarEdicao(5.8 * GB, 5.5 * GB);
t('edicao travada por projetos fixados', travado.nivel === 'cheio');
t('aviso de travamento manda desafixar',
  travado.mensagem?.includes('Desafixe') === true);

// ============================================================
// Plano de liberação
// ============================================================

const candidatos: ArquivoCandidato[] = [
  { id: 'a', tipo: 'ORIGINAL', sizeBytes: 400 * MB, createdAt: diasAtras(20), pinned: false },
  { id: 'b', tipo: 'ORIGINAL', sizeBytes: 300 * MB, createdAt: diasAtras(10), pinned: false },
  { id: 'c', tipo: 'ORIGINAL', sizeBytes: 500 * MB, createdAt: diasAtras(25), pinned: true },
  { id: 'd', tipo: 'MUSIC', sizeBytes: 200 * MB, createdAt: diasAtras(30), pinned: false },
];

// Com espaco sobrando, nada e removido.
const semNecessidade = planejarLiberacao(500 * MB, 1 * GB, candidatos);
t('com espaco livre nao remove nada',
  semNecessidade.viavel && semNecessidade.remover.length === 0);
t('sem remocao nao ha aviso', semNecessidade.aviso === null);

// Faltando espaco, o mais antigo sai primeiro.
const precisa = planejarLiberacao(500 * MB, QUOTA_EDICAO_BYTES - 200 * MB, candidatos);
t('libera espaco quando falta', precisa.viavel && precisa.remover.length > 0);
t('remove o mais antigo primeiro', precisa.remover[0]?.id === 'a');

// Remover mais do que precisa apagaria trabalho que ainda caberia.
t('remove apenas o necessario', precisa.remover.length === 1);

// Fixado nao cede lugar.
t('nunca remove arquivo fixado',
  !precisa.remover.some((a) => a.pinned));

// Material de apoio nao entra na liberacao do balde de edicao.
t('nunca remove material permanente',
  !precisa.remover.some((a) => baldeDe(a.tipo) === 'permanente'));

// O usuario precisa saber o que vai perder ANTES de confirmar.
t('aviso diz quantos arquivos e desde quando',
  precisa.aviso !== null &&
  precisa.aviso.includes('arquivo') &&
  precisa.aviso.includes('fixados não são afetados'));

// Nada a remover: recusa em vez de apagar o que nao pode.
const impossivel = planejarLiberacao(
  5 * GB,
  QUOTA_EDICAO_BYTES - 100 * MB,
  [{ id: 'x', tipo: 'ORIGINAL', sizeBytes: 50 * MB, createdAt: diasAtras(1), pinned: true }],
);
t('recusa quando nao ha o que remover', !impossivel.viavel);
t('recusa explica o motivo',
  impossivel.aviso?.includes('Desafixe') === true);

t('cabeNaEdicao concorda com o plano',
  cabeNaEdicao(1 * GB, 500 * MB, candidatos));

// ============================================================
// Resumo
// ============================================================

const resumo = resumoDeArmazenamento({
  permanenteBytes: 2 * GB,
  edicaoBytes: 5 * GB,
  fixadoBytes: 1 * GB,
});

t('resumo soma os dois baldes', resumo.totalBytes === 7 * GB);
t('resumo reporta a cota total', resumo.totalQuotaBytes === 10 * GB);
t('resumo traz o estado de cada balde',
  resumo.permanente.balde === 'permanente' && resumo.edicao.balde === 'edicao');
t('resumo alerta o balde em 83%', resumo.edicao.nivel === 'atencao');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
