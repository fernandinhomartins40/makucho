// ============================================================
// MAKUCHO STUDIO - O que ilustra cada palavra, sem IA.
//
// A IA barata quase nunca preenche "objeto" e "icones": as cenas saíam
// só com texto. Aqui um dicionário de raízes em português liga o que a
// fala diz ao objeto animado (motion-assets.ts) e ao ícone (Phosphor) que
// mostram aquilo: "gráfico" vira o gráfico de linha subindo, "dinheiro"
// as moedas caindo, "mapa" o mapa com o pino, "imagem" a foto na moldura.
// Determinístico e de graça; o que não casa fica como está.
// ============================================================

import { iconeExiste } from './motion-presets';

interface Sentido {
  /** Começos de palavra (sem acento, minúsculos). */
  raizes: readonly string[];
  /** O objeto animado que mostra isso (quando há um). */
  objeto?: string;
  /** Os ícones, do preferido ao reserva (o primeiro que existir). */
  icones: readonly string[];
}

const SENTIDOS: readonly Sentido[] = [
  { raizes: ['grafic', 'dados', 'metrica', 'analytic', 'estatistic', 'evolucao', 'chartograph'], objeto: 'linha_subindo', icones: ['chart-line-up', 'chart-bar'] },
  { raizes: ['cresc', 'aument', 'subiu', 'subir', 'escal', 'dobr', 'triplic', 'resultado'], objeto: 'grafico', icones: ['trend-up', 'chart-line-up'] },
  { raizes: ['dinheir', 'lucr', 'fatur', 'vend', 'grana', 'renda', 'pagar', 'pagament', 'reais', 'invest', 'econom', 'salario'], objeto: 'moedas', icones: ['coins', 'money', 'currency-dollar'] },
  { raizes: ['preco', 'oferta', 'desconto', 'promoc', 'barat', 'caro', 'cara'], icones: ['tag', 'percent'] },
  { raizes: ['mapa', 'lugar', 'cidade', 'rota', 'viag', 'local', 'endereco', 'pais'], objeto: 'mapa', icones: ['map-trifold', 'map-pin'] },
  { raizes: ['imagem', 'imagens', 'foto', 'visual', 'camera', 'design', 'thumbnail', 'capa'], objeto: 'foto', icones: ['image', 'camera'] },
  { raizes: ['porcent', 'fatia', 'divis', 'metade', 'mercado'], objeto: 'pizza', icones: ['chart-pie-slice', 'chart-pie'] },
  { raizes: ['dia', 'dias', 'semana', 'mes', 'meses', 'agenda', 'data', 'calendario', 'rotina', 'prazo'], objeto: 'calendario', icones: ['calendar-check', 'calendar'] },
  { raizes: ['tempo', 'hora', 'minut', 'segund', 'rapid', 'demor', 'relogio'], objeto: 'relogio', icones: ['clock', 'timer'] },
  { raizes: ['pessoa', 'publico', 'cliente', 'equipe', 'time', 'seguidor', 'comunidade', 'gente', 'usuario', 'audiencia'], objeto: 'pessoas', icones: ['users-three', 'users'] },
  { raizes: ['convers', 'chat', 'respond', 'pergunt', 'atendiment', 'assistente'], objeto: 'conversa', icones: ['chat-circle-dots', 'chats'] },
  { raizes: ['mensag', 'whatsapp', 'direct', 'notific', 'celular', 'app', 'aplicativo'], objeto: 'celular', icones: ['device-mobile', 'chat-circle-text'] },
  { raizes: ['email', 'e-mail', 'convite', 'newsletter'], objeto: 'envelope', icones: ['envelope', 'envelope-open'] },
  { raizes: ['texto', 'roteiro', 'contrato', 'guia', 'material', 'documento', 'ebook', 'pdf', 'arquivo', 'legenda'], objeto: 'documento', icones: ['file-text', 'notepad'] },
  { raizes: ['pesquis', 'busc', 'analis', 'detalh', 'descobr', 'investig', 'procur'], objeto: 'lupa', icones: ['magnifying-glass'] },
  { raizes: ['video', 'videos', 'edicao', 'editar', 'editor', 'reels', 'youtube', 'conteudo', 'filme', 'gravar'], objeto: 'video', icones: ['play-circle', 'film-slate', 'video-camera'] },
  { raizes: ['produto', '3d', 'estrutura', 'bloco', 'construi', 'profundidade', 'camada'], objeto: 'cubo', icones: ['cube', 'stack'] },
  { raizes: ['site', 'pagina', 'internet', 'online', 'navegador', 'plataforma', 'ferrament', 'sistema'], objeto: 'navegador', icones: ['browser', 'globe'] },
  { raizes: ['clic', 'botao', 'aperta', 'toque', 'tutorial'], objeto: 'cursor', icones: ['cursor-click', 'hand-tap'] },
  { raizes: ['aviso', 'lembr', 'alarm'], objeto: 'sino', icones: ['bell-ringing', 'bell'] },
  { raizes: ['segur', 'senha', 'proteg', 'privac', 'bloque', 'acesso', 'liber'], objeto: 'cadeado', icones: ['lock-key', 'shield-check'] },
  { raizes: ['lanc', 'comec', 'decol', 'aceler', 'estrei'], objeto: 'foguete', icones: ['rocket-launch', 'rocket'] },
  { raizes: ['melhor', 'venc', 'vitori', 'campe', 'conquist', 'premio', 'primeiro', 'top'], objeto: 'trofeu', icones: ['trophy', 'crown', 'medal'] },
  { raizes: ['energi', 'descans', 'recarreg', 'bateria', 'cansa'], objeto: 'bateria', icones: ['battery-charging', 'lightning'] },
  { raizes: ['ligar', 'liga', 'modo', 'mudar', 'mudanc', 'automat'], objeto: 'interruptor', icones: ['power', 'lightning'] },
  { raizes: ['curt', 'like', 'engaj', 'amor', 'gost', 'coracao', 'viral', 'casament', 'casad', 'relacion', 'namor', 'paixao'], objeto: 'curtida', icones: ['heart', 'hand-heart'] },
  { raizes: ['familia', 'filho', 'filha', 'pai', 'mae', 'esposa', 'marido'], objeto: 'pessoas', icones: ['users-three', 'baby'] },
  { raizes: ['ideia', 'dica', 'segredo', 'insight', 'criativ', 'concei'], objeto: 'lampada', icones: ['lightbulb', 'sparkle'] },
  { raizes: ['meta', 'objetiv', 'foco', 'alvo', 'acert'], objeto: 'alvo', icones: ['target'] },
  { raizes: ['inteligenc', 'ia', 'ai', 'robo', 'claude', 'chatgpt', 'gemini', 'modelo', 'automa'], icones: ['robot', 'brain', 'sparkle'] },
  { raizes: ['cerebr', 'mente', 'pens', 'aprend', 'estud', 'curso', 'aula'], icones: ['brain', 'graduation-cap', 'book-open'] },
  { raizes: ['codigo', 'program', 'dev', 'software'], icones: ['code', 'terminal-window'] },
  { raizes: ['loja', 'compra', 'carrinho', 'pedido', 'ecommerce'], icones: ['shopping-cart', 'storefront'] },
  { raizes: ['saude', 'corpo', 'treino', 'academ', 'exercic'], icones: ['barbell', 'heartbeat'] },
  { raizes: ['casa', 'imovel', 'apartament', 'lar'], icones: ['house-line', 'house'] },
  { raizes: ['musica', 'som', 'audio', 'voz', 'podcast'], icones: ['microphone', 'waveform', 'music-notes'] },
  { raizes: ['erro', 'errad', 'problema', 'cuidado', 'perig'], icones: ['warning', 'x-circle'] },
  { raizes: ['pront', 'feito', 'aprov', 'funcion', 'simples', 'facil'], icones: ['check-circle', 'seal-check'] },
  { raizes: ['fogo', 'quente', 'hype', 'bomb', 'explod'], icones: ['fire', 'lightning'] },
  { raizes: ['estrela', 'nota', 'avaliac', 'qualidade', 'premium'], icones: ['star', 'sparkle'] },
  { raizes: ['negocio', 'empresa', 'trabalh', 'carreira', 'emprego', 'parceri', 'chefe', 'patrao', 'socio'], objeto: 'cubo', icones: ['briefcase', 'buildings', 'handshake'] },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** As palavras do texto, na ordem, sem acento. */
function palavrasDe(texto: string): string[] {
  return semAcento(texto)
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 2);
}

/** Os sentidos do texto, na ordem em que aparecem (uma palavra, um sentido). */
function sentidosDe(texto: string): Sentido[] {
  const achados: Sentido[] = [];
  for (const w of palavrasDe(texto)) {
    const s = SENTIDOS.find((x) => x.raizes.some((r) => (r.length <= 3 ? w === r : w.startsWith(r))));
    if (s && !achados.includes(s)) achados.push(s);
  }
  return achados;
}

/** O ícone que mostra o texto (o primeiro que existe no catálogo registrado), ou `undefined`. */
export function iconeDoTexto(texto: string | undefined): string | undefined {
  for (const s of sentidosDe(texto ?? '')) {
    const i = s.icones.find((n) => iconeExiste(n));
    if (i) return i;
  }
  return undefined;
}

/** O objeto animado que mostra o texto, fora os já usados; `undefined` se nada casa. */
export function objetoDoTexto(texto: string | undefined, usados: ReadonlySet<string> = new Set()): string | undefined {
  for (const s of sentidosDe(texto ?? '')) if (s.objeto && !usados.has(s.objeto)) return s.objeto;
  return undefined;
}

/** Os ícones do dicionário (os mais úteis para o vídeo de alguém falando): o seletor do editor mostra estes. */
export const ICONES_SUGERIDOS: readonly string[] = [...new Set(SENTIDOS.flatMap((s) => s.icones))];
