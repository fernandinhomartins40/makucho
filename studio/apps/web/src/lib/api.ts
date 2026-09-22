// ============================================================
// Cliente da API.
//
// Uma camada fina, não um wrapper por gosto. Ela existe para três
// coisas que, espalhadas por cada tela, divergiriam:
//
//   - `credentials: 'include'` em toda chamada, porque o token vive
//     num cookie httpOnly e sem isso nada é autenticado;
//   - erro com MENSAGEM, não com status: a tela precisa dizer o que
//     aconteceu, e `Error: 400` não diz nada a ninguém;
//   - 401 tratado uma vez só.
// ============================================================

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }
}

/** A sessão caiu: a tela deve mandar para o login em vez de insistir. */
export class SessaoExpirada extends ErroDaApi {
  constructor() {
    super(401, 'sua sessão expirou. Entre de novo para continuar.');
    this.name = 'SessaoExpirada';
  }
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corpo?: unknown;
  sinal?: AbortSignal;
}

/**
 * Renovacao de sessao, uma por vez.
 *
 * O token de acesso dura 15 minutos e o de renovacao, 7 dias. Sem
 * renovar sozinho, a pessoa seria expulsa quatro vezes por hora --
 * possivelmente no meio de uma edicao nao salva.
 *
 * A promessa e COMPARTILHADA entre chamadas: uma tela que dispara
 * cinco requisicoes ao abrir faria cinco renovacoes simultaneas, e
 * as quatro ultimas usariam um cookie que a primeira ja rotacionou.
 */
let renovacaoEmCurso: Promise<boolean> | null = null;

function renovarSessao(): Promise<boolean> {
  renovacaoEmCurso ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      renovacaoEmCurso = null;
    });

  return renovacaoEmCurso;
}

/** Para a tela decidir mostrar o login sem depender de try/catch. */
export function aoExpirarSessao(acao: () => void): void {
  aoExpirar = acao;
}

let aoExpirar: (() => void) | null = null;

export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, sinal } = opcoes;

  const enviar = () =>
    fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'include',
      signal: sinal,
      ...(corpo !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      }),
    });

  let resposta = await enviar();

  // Um 401 no meio do trabalho quase sempre e o token de 15 minutos
  // expirando, nao a sessao de 7 dias. Renovar e repetir devolve a
  // chamada sem que ninguem perceba.
  //
  // As rotas de auth ficam de fora: renovar para tentar renovar de
  // novo seria um laco, e um 401 no login significa senha errada.
  if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
    if (await renovarSessao()) {
      resposta = await enviar();
    }
  }

  if (resposta.status === 401) {
    // A renovacao tambem falhou: a sessao acabou de verdade.
    aoExpirar?.();
    throw new SessaoExpirada();
  }

  if (!resposta.ok) {
    // A API devolve { message } nos erros tratados. Quando não
    // devolve, o status vira uma frase em português — o usuário não
    // tem como agir sobre "500".
    let mensagem = mensagemPorStatus(resposta.status);
    try {
      const dados = await resposta.json();
      if (typeof dados?.message === 'string') mensagem = dados.message;
      else if (Array.isArray(dados?.message)) mensagem = dados.message.join('; ');
    } catch {
      // Corpo vazio ou não-JSON: fica a mensagem por status.
    }
    throw new ErroDaApi(resposta.status, mensagem);
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

function mensagemPorStatus(status: number): string {
  if (status === 403) return 'você não tem permissão para isso.';
  if (status === 404) return 'não encontrado.';
  if (status === 409) return 'isso entra em conflito com algo que já existe.';
  if (status === 413) return 'o arquivo é grande demais.';
  if (status >= 500) return 'o servidor falhou. Tente de novo em instantes.';
  return 'não foi possível completar a ação.';
}

// ============================================================
// Sessao
// ============================================================

export interface Sessao {
  user: { id: string; email: string; name: string };
  workspace: { id: string; role: string };
}

export const auth = {
  /** O Studio ja tem dono? Decide entre login e primeiro acesso. */
  precisaDeSetup: () => api<{ precisaDeSetup: boolean }>('/auth/setup'),

  entrar: (email: string, password: string) =>
    api<Sessao>('/auth/login', { metodo: 'POST', corpo: { email, password } }),

  // Cria o primeiro usuario E ja autentica: um segundo passo so
  // existiria para repetir a senha recem-digitada.
  criarPrimeiroAcesso: (dados: {
    email: string;
    password: string;
    name?: string;
    workspace?: string;
  }) => api<Sessao>('/auth/setup', { metodo: 'POST', corpo: dados }),

  sair: () => api<{ ok: boolean }>('/auth/logout', { metodo: 'POST' }),

  // Devolve null em vez de lancar: "nao esta logado" e uma resposta,
  // nao um erro, para quem so quer saber se deve mostrar o login.
  atual: () =>
    api<{ userId: string; workspaceId: string; role: string }>('/auth/me').catch(() => null),
};

// ============================================================
// Projetos
// ============================================================

export interface Projeto {
  id: string;
  title: string;
  state: string;
  objective: string | null;
  framework: string | null;
  targetDurationMs: number | null;
  publicError: string | null;
  durationMs: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const projetos = {
  listar: () => api<Projeto[]>('/projects'),
  obter: (id: string) => api<Projeto>(`/projects/${id}`),
  criar: (dados: { title: string; scriptId?: string | null }) =>
    api<Projeto>('/projects', { metodo: 'POST', corpo: dados }),
  atualizar: (id: string, dados: Partial<{ title: string; objective: string | null }>) =>
    api<Projeto>(`/projects/${id}`, { metodo: 'PATCH', corpo: dados }),
  arquivar: (id: string) => api<Projeto>(`/projects/${id}`, { metodo: 'DELETE' }),
  // Recomeça o processamento do ponto mais adiantado que já tem
  // insumo pronto; quem decide isso é o servidor.
  reprocessar: (id: string) => api<Projeto>(`/projects/${id}/retry`, { metodo: 'POST' }),
};

// ============================================================
// Roteiros
// ============================================================

export interface BlocoDeRoteiro {
  id?: string;
  role: string;
  goal?: string | null;
  text: string;
  position: number;
}

export interface Roteiro {
  id: string;
  title: string;
  mode: string;
  framework: string;
  targetDurationMs: number;
  blocks: BlocoDeRoteiro[];
  updatedAt: string;
}

/** O que o scriptInputSchema aceita. */
export interface RoteiroParaSalvar {
  title: string;
  mode: string;
  framework: string;
  targetDurationMs: number;
  blocks: Array<{ role: string; goal?: string; text: string; position: number }>;
}

export const roteiros = {
  listar: () => api<Roteiro[]>('/scripts'),
  obter: (id: string) => api<Roteiro>(`/scripts/${id}`),
  criar: (dados: RoteiroParaSalvar) =>
    api<Roteiro>('/scripts', { metodo: 'POST', corpo: dados }),
  atualizar: (id: string, dados: RoteiroParaSalvar) =>
    api<Roteiro>(`/scripts/${id}`, { metodo: 'PATCH', corpo: dados }),
  remover: (id: string) => api<void>(`/scripts/${id}`, { metodo: 'DELETE' }),
};

// ============================================================
// Marca
// ============================================================

export interface CoresDaMarca {
  primary: string;
  secondary: string;
  accent: string;
  textLight: string;
  textDark: string;
}

export interface PerfilDeMarca {
  id: string;
  name: string;
  colors: CoresDaMarca;
  fontPrimary?: string;
  fontSecond?: string;
  version: number;
}

export interface MarcaParaSalvar {
  name: string;
  colors: CoresDaMarca;
  fontPrimary?: string;
  fontSecond?: string;
}

export const marca = {
  // Devolve null quando o workspace ainda nao tem perfil -- o caso de
  // quem abre a tela pela primeira vez, que nao e erro.
  obter: () =>
    api<PerfilDeMarca | null>('/brand-profile').catch((e) => {
      if (e instanceof ErroDaApi && e.status === 404) return null;
      throw e;
    }),
  // POST e nao PUT: cada salvamento cria uma VERSAO, e e isso que
  // permite saber com que marca um video antigo foi gerado.
  salvar: (dados: MarcaParaSalvar) =>
    api<PerfilDeMarca>('/brand-profile', { metodo: 'POST', corpo: dados }),
};

// ============================================================
// Planos de edição
// ============================================================

export interface VersaoDoPlano {
  id: string;
  version: number;
  origin: string;
  createdAt: string;
  document: unknown;
}

export const planos = {
  atual: (projectId: string) =>
    api<VersaoDoPlano>(`/projects/${projectId}/edit-plans`),
  historico: (projectId: string) =>
    api<Array<Omit<VersaoDoPlano, 'document'> & { isActive: boolean }>>(
      `/projects/${projectId}/edit-plans/history`,
    ),
  salvar: (projectId: string, documento: unknown) =>
    api<VersaoDoPlano>(`/projects/${projectId}/edit-plans`, {
      metodo: 'POST',
      corpo: documento,
    }),
  /** O servidor aplica a mesma função que o navegador: a recusa é
      idêntica nos dois lados. */
  operar: (projectId: string, operacao: unknown) =>
    api<VersaoDoPlano>(`/projects/${projectId}/edit-plans/operations`, {
      metodo: 'POST',
      corpo: operacao,
    }),
  restaurar: (projectId: string, versao: number) =>
    api<VersaoDoPlano>(`/projects/${projectId}/edit-plans/restore/${versao}`, {
      metodo: 'POST',
    }),
};

// ============================================================
// Assets — logo, trilha, fonte, imagem
//
// O upload vai com os BYTES no corpo e os metadados em header, não em
// multipart: o arquivo é o corpo, e multipart acrescentaria um parser
// no caminho para transportar duas strings.
//
// Não passa pelo cliente `api()` porque este envia JSON; aqui o corpo
// é binário.
// ============================================================

export interface Asset {
  id: string;
  kind: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  durationMs: number | null;
  /** Logo sem transparência ganha retângulo branco sobre o vídeo. */
  hasAlpha: boolean;
  createdAt: string;
}

export interface CotaDeAssets {
  usadoBytes: number;
  quotaBytes: number;
  percentual: number;
}

export const assets = {
  listar: (kind?: string) =>
    api<Asset[]>(`/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),

  cota: () => api<CotaDeAssets>('/assets/quota'),

  async enviar(kind: string, arquivo: File): Promise<{ id: string; jaExistia: boolean }> {
    const resposta = await fetch('/api/assets', {
      method: 'POST',
      credentials: 'include',
      headers: {
        // O tipo REAL é verificado pelos bytes no servidor; este é o
        // que o navegador declarou, e a divergência entre os dois é
        // sinal de problema.
        'Content-Type': arquivo.type || 'application/octet-stream',
        'x-asset-kind': kind,
        // Codificado porque header não aceita acento nem espaço, e
        // nome de arquivo tem os dois.
        'x-asset-name': encodeURIComponent(arquivo.name),
      },
      body: arquivo,
    });

    if (resposta.status === 401) throw new SessaoExpirada();

    if (!resposta.ok) {
      let mensagem = mensagemPorStatus(resposta.status);
      try {
        const dados = await resposta.json();
        if (typeof dados?.message === 'string') mensagem = dados.message;
      } catch {
        // Fica a mensagem por status.
      }
      throw new ErroDaApi(resposta.status, mensagem);
    }

    return resposta.json();
  },

  // Desativa, não apaga: um vídeo antigo pode ter sido gerado com
  // esta logo, e apagar tornaria impossível saber com que marca ele
  // foi feito.
  remover: (id: string) => api<{ ok: boolean }>(`/assets/${id}`, { metodo: 'DELETE' }),

  /** URL para exibir. Caminho absoluto pelo nginx, como o vídeo. */
  url: (id: string) => `/api/assets/${id}/file`,
};

// ============================================================
// Transcrição
//
// Existe para a correção manual de legenda. O whisper erra nome
// próprio, jargão e sigla, e sem correção o erro ia queimado no
// arquivo sem recurso.
//
// O `id` de cada palavra é o que importa: a correção se ancora nele,
// nunca num tempo. Um tempo quebraria no primeiro ajuste de corte —
// a fala se move, e a correção passaria a legendar outra palavra.
// ============================================================

export interface PalavraTranscrita {
  id: string;
  startMs: number;
  endMs: number;
  texto: string;
  /** Onde o whisper tem menos certeza é onde ele mais erra. */
  confianca: number;
}

export interface SegmentoTranscrito {
  id: string;
  startMs: number;
  endMs: number;
  texto: string;
  palavras: PalavraTranscrita[];
}

export interface Transcricao {
  existe: boolean;
  idioma?: string;
  segmentos: SegmentoTranscrito[];
}

export const transcricao = {
  obter: (projectId: string) => api<Transcricao>(`/projects/${projectId}/transcript`),
};

/** URL do proxy que o editor toca. Nunca o original (seção 18). */
export function urlDoVideo(projectId: string): string {
  return `/api/projects/${projectId}/video`;
}

// ============================================================
// Armazenamento
// ============================================================

export interface UsoDeCota {
  usadoBytes: number;
  quotaBytes: number;
  percentual: number;
  mensagem: string | null;
}

export interface Armazenamento {
  permanente: UsoDeCota;
  edicao: UsoDeCota;
}

export const armazenamento = {
  obter: () => api<Armazenamento>('/settings/storage'),
};

// ============================================================
// Consumo de IA
//
// O teto existe para ser visto antes de ser atingido: um limite que
// só aparece quando bloqueia é indistinguível de um defeito, do
// ponto de vista de quem está usando.
// ============================================================

export interface ConsumoDeIa {
  periodo: string;
  gastoCentavos: number;
  limiteCentavos: number;
  chamadas: number;
  estado: 'ok' | 'aviso' | 'bloqueado';
  aviso: string | null;
  detalhe: Array<{ chamada: string; rotulo: string; centavos: number }>;
}

// ============================================================
// Exportação
// ============================================================

export interface SituacaoDoRender {
  existe: boolean;
  id?: string;
  estado?: 'na_fila' | 'processando' | 'pronto' | 'falhou';
  tamanhoBytes?: number | null;
  duracaoMs?: number | null;
  erro?: string | null;
}

export const renders = {
  // Por fila: leva minutos, e o usuário pode fechar a aba.
  exportar: (projectId: string, clipsDesligados: string[] = []) =>
    api<{ id: string; estado: string; jaExistia: boolean }>(`/projects/${projectId}/render`, {
      metodo: 'POST',
      corpo: { clipsDesligados },
    }),
  situacao: (projectId: string) => api<SituacaoDoRender>(`/projects/${projectId}/render`),
  // Caminho absoluto pelo nginx, como `urlDoVideo`: o download vai
  // direto no href de um link, fora do cliente de API.
  urlDeDownload: (projectId: string) => `/api/projects/${projectId}/render/download`,
};

export interface ResultadoDaAnalise {
  ok: boolean;
  /** Agregação dos riscos que o modelo classificou, não uma probabilidade. */
  confianca: number;
  avisos: string[];
  problemas: Array<{ code: string; segmentIndex: number; message: string; severity: string }>;
}

/** O que a #1 devolve: um roteiro pronto para a tela, nao salvo. */
export interface RoteiroGeradoPelaIa {
  roteiro: RoteiroParaSalvar;
  custoCentavos: number;
}

export interface SugestaoDaIa {
  blockIndex: number;
  issue: string;
  reason: string;
  /** O texto pronto. Sugestao sem ele e conselho, nao ferramenta. */
  replacementText: string;
}

/** O que a #4 devolve. Vira uma operacao `inserir` num clique. */
export interface CandidatoDaIa {
  sourceStartMs: number;
  sourceEndMs: number;
  role: string;
  score: number;
  /** O que o video GANHA com este trecho. Permite discordar. */
  reason: string;
  semanticRisk: string;
  apos?: number;
  /** A origem na transcricao. Sem ela o contrato recusa a insercao. */
  transcriptSegmentIds: string[];
}

/** O que a #6 devolve. Vira `ajustar_corte`, uma a uma. */
export interface AjusteDaIa {
  clipIndex: number;
  sourceStartMs: number;
  sourceEndMs: number;
  /** O que estava errado, nao o que foi feito. */
  reason: string;
}

export const ia = {
  consumo: () => api<ConsumoDeIa>('/settings/ai-usage'),
  // #1 -- escreve um rascunho a partir do tema. Nao salva nada: o
  // retorno vai para a tela, editavel, e quem decide salvar e quem
  // vai falar o texto.
  gerarRoteiro: (dados: {
    tema: string;
    framework?: string;
    mode?: string;
    targetDurationMs?: number;
  }) => api<RoteiroGeradoPelaIa>('/scripts/generate', { metodo: 'POST', corpo: dados }),
  // #2 -- POST e nao GET porque a chamada custa dinheiro e consome
  // teto; um GET que gasta seria repetido por qualquer prefetch.
  //
  // Nunca falha por causa da IA: devolve lista vazia com o motivo,
  // porque a tela chama isso sozinha e um erro sem clique e defeito.
  sugestoesDeRoteiro: (scriptId: string) =>
    api<{ sugestoes: SugestaoDaIa[]; indisponivel?: string }>(
      `/scripts/${scriptId}/suggestions`,
      { metodo: 'POST' },
    ),
  // Leva dezenas de segundos: é síncrona de propósito, porque o
  // usuário está olhando a tela esperando o resultado.
  analisar: (projectId: string) =>
    api<ResultadoDaAnalise>(`/projects/${projectId}/analyze`, { metodo: 'POST' }),
  // #4 -- procura trechos bons que ficaram de fora. Devolve
  // CANDIDATOS: quem decide e o usuario, e o que entra na timeline e
  // uma operacao `inserir` disparada por um clique.
  candidatos: (projectId: string) =>
    api<{ candidatos: CandidatoDaIa[]; custoCentavos: number }>(
      `/projects/${projectId}/candidates`,
      { metodo: 'POST' },
    ),
  // #6 -- ajustes de borda. Os silencios vem de MEDICAO, nao do
  // modelo: ja estao detectados desde a transcricao.
  refinar: (projectId: string) =>
    api<{ ajustes: AjusteDaIa[]; silenciosRemoviveis: number; custoCentavos: number }>(
      `/projects/${projectId}/refine`,
      { metodo: 'POST' },
    ),
  definirLimite: (monthlyLimitCents: number) =>
    api<{ ok: boolean; motivo?: string }>('/settings/ai-limit', {
      metodo: 'PUT',
      corpo: { monthlyLimitCents },
    }),
};
