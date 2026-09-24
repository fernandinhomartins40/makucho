// ============================================================
// MAKUCHO STUDIO - Legendas queimadas.
//
// O gerador do .ass mora no pacote de contratos
// (`legendas-ass.ts`): a previa do editor desenha o MESMO arquivo no
// navegador, com o libass compilado para WebAssembly, e por isso ele
// nao pode depender de nada que so exista no Node. Este modulo
// reexporta o gerador para quem ja o importava do worker-core.
// ============================================================

export {
  gerarAss,
  montarBlocos,
  planoPrecisaDeAss,
  type BlocoDeLegenda,
  type OpcoesDoAss as OpcoesDasLegendas,
  type PalavraDaTranscricao,
} from '@makucho/studio-contracts';
