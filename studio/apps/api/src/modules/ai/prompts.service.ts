// ============================================================
// Prompts versionados (seção 26.8).
//
// Cada chamada tem prompt em arquivo próprio, com versão no nome. A
// versão vai gravada junto da resposta, em `AiAnalysis.promptVersion`.
//
// Isso não é organização: é o que permite responder "por que este
// vídeo ficou diferente do outro" três meses depois. Sem a versão
// registrada, um prompt ajustado torna todo resultado anterior
// inexplicável — e o ajuste é justamente o que mais se faz.
//
// Os arquivos são lidos uma vez e ficam em memória: são pequenos, não
// mudam em execução, e lê-los a cada chamada colocaria disco no
// caminho quente sem motivo.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A versão em uso de cada prompt.
 *
 * Mudar um prompt em produção significa criar `-v2.md` e trocar aqui,
 * nunca editar o `-v1.md` no lugar: o histórico já gravado aponta para
 * a v1, e reescrevê-la faria o registro mentir sobre o que foi pedido.
 */
export const VERSAO_DO_PROMPT = {
  // v3: os valores aceitos listados (papel, framework, risco) e motivos
  // curtos -- e o que deixa a selecao funcionar SEM raciocinio.
  // v4: protocolo dos vídeos que retêm (gancho, promessa, entrega,
  // recompensa, CTA), `analysis` antes dos cortes e acabamento obrigatório.
  // v5: corte com intenção (frase, reação e demonstração inteiras),
  // corte seco como padrão e conferência de começo, meio e conclusão.
  selecionar_trechos: 'selecao-v5',
  gerar_roteiro: 'roteiro-v1',
  sugerir_melhorias: 'sugestoes-v1',
  propor_candidatos: 'candidatos-v1',
  refinar_cortes: 'refino-v1',
  // v3: vocabulário completo do Studio (textos com estilo, cor, efeitos
  // de tela, stickers, pacotes), glossário para pedidos vagos, contexto
  // do editor (selecionado, cursor, conversa) e atalhos expandidos no
  // servidor -- a IA age em vez de perguntar.
  // v4: biblioteca da marca (logos, trilhas, sons, vinhetas, imagens e
  // vídeos com "para que serve") e as vinhetas de abertura/encerramento.
  comandar_edicao: 'comando-v4',
  // v2: além do visual, o acabamento e o kit criativo (Suno, GPT Image,
  // vídeo, vinhetas passo a passo) com a cara da marca.
  configurar_marca: 'marca-v3',
  // Roteiro por pedido livre: a IA entende o contexto e aplica as técnicas
  // de retenção sozinha (ai-roteiro-livre.ts).
  gerar_roteiro_livre: 'roteiro-v2',
  editar_roteiro: 'edicao-roteiro-v2',
  // Imagens, ícones e vídeos que ilustram a fala (midias-da-ia.ts).
  sugerir_midias: 'midias-v2',
} as const;

export type NomeDePrompt = keyof typeof VERSAO_DO_PROMPT;

@Injectable()
export class PromptsService {
  private readonly log = new Logger(PromptsService.name);
  private readonly cache = new Map<string, string>();

  /** O texto do prompt e a versão que ficará registrada com a resposta. */
  obter(nome: NomeDePrompt): { texto: string; versao: string } {
    const versao = VERSAO_DO_PROMPT[nome];

    let texto = this.cache.get(versao);
    if (!texto) {
      // `__dirname` e não cwd: o processo é iniciado da raiz do app,
      // e resolver por cwd quebraria em produção, onde o dist mora em
      // outro nível.
      const caminho = join(__dirname, 'prompts', `${versao}.md`);
      try {
        texto = readFileSync(caminho, 'utf8');
      } catch (e) {
        // Prompt ausente é erro de empacotamento, não de uso: vale
        // falhar alto em vez de mandar instrução vazia ao modelo.
        this.log.error(`prompt ${versao} não encontrado em ${caminho}`);
        throw new Error(`prompt ${versao} não está na imagem`);
      }
      this.cache.set(versao, texto);
    }

    return { texto, versao };
  }
}
