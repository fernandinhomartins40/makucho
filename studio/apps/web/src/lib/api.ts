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

export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, sinal } = opcoes;

  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    credentials: 'include',
    signal: sinal,
    ...(corpo !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }),
  });

  if (resposta.status === 401) throw new SessaoExpirada();

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
