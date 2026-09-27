// ============================================================
// Busca de mídia SEM IA: o português vira inglês por glossário.
//
// Os bancos de imagem (Pexels, Pixabay, Openverse, Iconify, os ícones
// 3D) são indexados em inglês: "consigamos controlar três" não acha
// nada, "control three" acha. A busca manual não gasta IA -- um
// glossário local do vocabulário de quem grava (negócio, dinheiro,
// comida, loja, sentimentos, números) traduz as palavras que importam,
// descarta as vazias e deixa passar o que já está em inglês.
//
// Plural e verbo flexionado caem na mesma raiz: "controlar",
// "controlamos" e "controle" achando "control".
// ============================================================

/** Palavras que não descrevem imagem nenhuma. */
const VAZIAS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em na no nas nos por pra pro para pelo pela pelos pelas com sem que se e ou mas ' +
    'eu voce vc ele ela nos eles elas isso isto aquilo esse essa este esta esses essas estes estas meu minha meus minhas seu sua seus suas ' +
    'nosso nossa teu tua lhe me te ja nao sim tambem so muito muita muitos muitas mais menos bem mal entao aqui ali la quando onde como ' +
    'porque porque qual quais quem ai agora hoje ontem amanha depois antes sempre nunca coisa coisas gente tipo ne ta tah ter tem tinha ' +
    'ser sou era foi sao esta estao estar estou vai vou vamos fazer faz fez fiz ir ver dar dizer diz disse falar fala pode posso podemos ' +
    'consigo consegue conseguimos consigamos conseguir deve devo precisa preciso quer quero queremos todo toda todos todas cada outro outra ' +
    'mesmo mesma algum alguma nenhum nenhuma tanto tanta tudo nada ate apos sobre entre contra desde durante via ha havia fica ficar'
  ).split(' '),
);

/**
 * Português (sem acento) -> termo em inglês que os bancos entendem.
 * A raiz de cada chave também vale ("controle" acha "controlar").
 */
const GLOSSARIO: Record<string, string> = {
  // números
  zero: 'zero', um: 'one', dois: 'two', duas: 'two', tres: 'three', quatro: 'four', cinco: 'five', seis: 'six', sete: 'seven', oito: 'eight', nove: 'nine', dez: 'ten', cem: 'hundred', mil: 'thousand', milhao: 'million', primeiro: 'first', segundo: 'second', terceiro: 'third',
  // dinheiro e negócio
  dinheiro: 'money', grana: 'money', real: 'money', reais: 'money', moeda: 'coin', moedas: 'coins', nota: 'banknote', cartao: 'credit card', pix: 'payment', pagamento: 'payment', pagar: 'pay', preco: 'price tag', precos: 'price tag', valor: 'value', custo: 'cost', barato: 'cheap', caro: 'expensive', desconto: 'discount', promocao: 'sale', oferta: 'offer', liquidacao: 'sale', cupom: 'coupon', gratis: 'free', brinde: 'gift', presente: 'gift',
  lucro: 'profit', venda: 'sales', vender: 'sell', comprar: 'shopping', compra: 'shopping', cliente: 'customer', consumidor: 'customer', loja: 'store', mercado: 'market', supermercado: 'supermarket', conveniencia: 'convenience store', negocio: 'business', empresa: 'company', empreender: 'entrepreneur', empreendedor: 'entrepreneur', trabalho: 'work', emprego: 'job', escritorio: 'office', reuniao: 'meeting', equipe: 'team', chefe: 'boss', lider: 'leader', lideranca: 'leadership',
  investimento: 'investment', investir: 'invest', banco: 'bank', poupanca: 'savings', economia: 'economy', economizar: 'save money', divida: 'debt', imposto: 'tax', grafico: 'chart', crescimento: 'growth', crescer: 'growth', meta: 'target', objetivo: 'goal', resultado: 'result', sucesso: 'success', fracasso: 'failure', estrategia: 'strategy', plano: 'plan', marketing: 'marketing', marca: 'brand', anuncio: 'advertising', propaganda: 'advertising', contrato: 'contract', entrega: 'delivery', pedido: 'order', caixa: 'box', pacote: 'package', estoque: 'stock',
  // tecnologia e redes
  celular: 'smartphone', telefone: 'phone', computador: 'computer', notebook: 'laptop', internet: 'internet', site: 'website', aplicativo: 'app', app: 'app', rede: 'network', instagram: 'instagram', whatsapp: 'whatsapp', youtube: 'youtube', tiktok: 'tiktok', facebook: 'facebook', mensagem: 'message', email: 'email', video: 'video', foto: 'photo', camera: 'camera', microfone: 'microphone', dados: 'data', inteligencia: 'intelligence', robo: 'robot', seguidor: 'followers', curtida: 'like', comentario: 'comment', compartilhar: 'share', link: 'link', senha: 'password', seguranca: 'security',
  // comida e bebida
  comida: 'food', comer: 'food', almoco: 'lunch', jantar: 'dinner', cafe: 'coffee', lanche: 'snack', lanches: 'snacks', salgadinho: 'chips', salgado: 'snack', doce: 'candy', doces: 'sweets', chocolate: 'chocolate', bala: 'candy', bolo: 'cake', pao: 'bread', pizza: 'pizza', hamburguer: 'burger', sanduiche: 'sandwich', batata: 'fries', carne: 'meat', frango: 'chicken', peixe: 'fish', churrasco: 'barbecue', salada: 'salad', fruta: 'fruit', sorvete: 'ice cream', acai: 'acai bowl', leite: 'milk', queijo: 'cheese', ovo: 'egg', arroz: 'rice',
  bebida: 'drinks', beber: 'drink', cerveja: 'beer', chope: 'draft beer', vinho: 'wine', refrigerante: 'soda', refri: 'soda', agua: 'water', suco: 'juice', energetico: 'energy drink', whisky: 'whiskey', vodka: 'vodka', drink: 'cocktail', gelo: 'ice', gelada: 'cold drink', gelado: 'cold', copo: 'glass', garrafa: 'bottle', lata: 'can', cigarro: 'cigarette', gas: 'gas',
  // lugares e coisas
  casa: 'house', apartamento: 'apartment', imovel: 'real estate', cidade: 'city', rua: 'street', praia: 'beach', viagem: 'travel', viajar: 'travel', carro: 'car', moto: 'motorcycle', onibus: 'bus', aviao: 'airplane', escola: 'school', faculdade: 'university', hospital: 'hospital', academia: 'gym', igreja: 'church', restaurante: 'restaurant', bar: 'bar', cozinha: 'kitchen', quarto: 'bedroom', sala: 'living room', banheiro: 'bathroom', prateleira: 'shelf', geladeira: 'refrigerator', freezer: 'freezer', vitrine: 'shop window', balcao: 'counter', fachada: 'storefront', porta: 'door', relogio: 'clock', calendario: 'calendar', livro: 'book', caneta: 'pen', papel: 'paper', chave: 'key', cadeado: 'lock', foguete: 'rocket', trofeu: 'trophy', medalha: 'medal', coroa: 'crown', diamante: 'diamond', fogo: 'fire', luz: 'light', lampada: 'light bulb', estrela: 'star', sol: 'sun', lua: 'moon', chuva: 'rain', planta: 'plant', flor: 'flower', arvore: 'tree', mundo: 'world', mapa: 'map', bandeira: 'flag',
  roupa: 'clothes', camisa: 'shirt', vestido: 'dress', sapato: 'shoes', tenis: 'sneakers', bolsa: 'bag', bolso: 'pocket', carteira: 'wallet', oculos: 'glasses', maquiagem: 'makeup', cabelo: 'hair', unha: 'nails', perfume: 'perfume', joia: 'jewelry',
  // pessoas e corpo
  pessoa: 'person', pessoas: 'people', homem: 'man', mulher: 'woman', crianca: 'child', filho: 'child', filha: 'daughter', familia: 'family', pai: 'father', mae: 'mother', amigo: 'friend', casal: 'couple', bebe: 'baby', idoso: 'elderly', jovem: 'young person', medico: 'doctor', professor: 'teacher', aluno: 'student', atleta: 'athlete',
  cabeca: 'head', cerebro: 'brain', mente: 'mind', coracao: 'heart', olho: 'eye', olhos: 'eyes', boca: 'mouth', mao: 'hand', maos: 'hands', corpo: 'body', saude: 'health', doenca: 'illness', remedio: 'medicine', exercicio: 'exercise', treino: 'workout', correr: 'running', dormir: 'sleep', sono: 'sleep',
  // sentimentos e ideias
  amor: 'love', feliz: 'happy', felicidade: 'happiness', alegria: 'joy', triste: 'sad', tristeza: 'sadness', raiva: 'anger', medo: 'fear', ansiedade: 'anxiety', estresse: 'stress', calma: 'calm', paz: 'peace', confianca: 'confidence', coragem: 'courage', forca: 'strength', fe: 'faith', esperanca: 'hope', gratidao: 'gratitude', sorriso: 'smile', rir: 'laugh', chorar: 'cry', surpresa: 'surprise', duvida: 'question', pergunta: 'question', resposta: 'answer', ideia: 'idea', pensamento: 'thinking', pensar: 'thinking', decisao: 'decision', escolha: 'choice', atitude: 'attitude', comportamento: 'behavior', habito: 'habit', disciplina: 'discipline', foco: 'focus', atencao: 'attention', controle: 'control', controlar: 'control', liberdade: 'freedom', tempo: 'time', vida: 'life', morte: 'death', futuro: 'future', passado: 'past', sonho: 'dream', mudanca: 'change', mudar: 'change', problema: 'problem', solucao: 'solution', erro: 'mistake', errado: 'wrong', certo: 'check mark', verdade: 'truth', mentira: 'lie', segredo: 'secret', dica: 'tip', passo: 'steps', regra: 'rule', lei: 'law', justica: 'justice', conhecimento: 'knowledge', aprender: 'learning', estudar: 'study', ensinar: 'teaching', comunicacao: 'communication', conversa: 'conversation', palavra: 'word', voz: 'voice', ouvir: 'listen', silencio: 'silence', musica: 'music', festa: 'party', aniversario: 'birthday', natal: 'christmas', ferias: 'vacation', fim: 'end', inicio: 'start', novo: 'new', novidade: 'new', lancamento: 'launch', rapido: 'fast', devagar: 'slow', grande: 'big', pequeno: 'small', alto: 'high', baixo: 'low', aviso: 'warning', perigo: 'danger', alerta: 'alert', proibido: 'forbidden', ok: 'check mark', vitoria: 'victory', ganhar: 'winning', perder: 'losing',
  // animais
  cachorro: 'dog', gato: 'cat', passaro: 'bird', cavalo: 'horse', leao: 'lion',
};

/** Minúsculas, sem acento, só letras e números. */
function normalizar(p: string): string {
  return p
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** As formas que uma palavra flexionada pode ter no dicionário. */
function formas(w: string): string[] {
  return [
    w,
    w.replace(/oes$/, 'ao'),
    w.replace(/aes$/, 'ao'),
    w.replace(/ns$/, 'm'),
    w.replace(/is$/, 'l'),
    w.replace(/es$/, ''),
    w.replace(/s$/, ''),
    w.replace(/(inho|inha|inhos|inhas)$/, 'o'),
    w.replace(/(amos|emos|imos|ando|endo|indo|ados|adas|ado|ada|idos|idas|ido|ida|aram|eram|iram|avam|ava|aria|eria|iria|ou|eu|iu|ei|am|em)$/, ''),
  ].filter((f, i, l) => f.length > 1 && l.indexOf(f) === i);
}

const RAIZES = Object.keys(GLOSSARIO)
  .filter((k) => k.length >= 5)
  .map((k) => ({ raiz: k.slice(0, Math.max(4, k.length - 2)), k }))
  .sort((a, b) => b.raiz.length - a.raiz.length);

function traduzirPalavra(w: string): string | null {
  for (const f of formas(w)) if (GLOSSARIO[f]) return GLOSSARIO[f]!;
  for (const f of formas(w)) {
    const achada = RAIZES.find((r) => f.startsWith(r.raiz));
    if (achada) return GLOSSARIO[achada.k]!;
  }
  return null;
}

/** Terminações que denunciam português (a palavra não serve como está). */
const PORTUGUES = /(cao|coes|mente|amos|emos|imos|ando|endo|indo|ado|ada|ido|ida|inho|inha|oes|aes|ar|er|ir|os|as|ou|ei|am|em|iam)$/;

export interface BuscaTraduzida {
  /** A busca que vai aos bancos (em inglês quando deu). */
  consulta: string;
  /** Os termos, um a um (para a busca palavra por palavra). */
  termos: string[];
  /** Mudou alguma coisa em relação ao que foi digitado? */
  traduziu: boolean;
}

/**
 * O que a pessoa digitou (ou a fala do cursor) vira a busca que os
 * bancos entendem. Sem nada traduzível, a busca vai como foi digitada.
 */
export function traduzirBusca(q: string): BuscaTraduzida {
  const original = q.replace(/\s+/g, ' ').trim();
  const termos: string[] = [];
  for (const cru of original.split(' ')) {
    const w = normalizar(cru);
    // Número solto ("3 por 10") não descreve imagem.
    if (w.length < 2 || VAZIAS.has(w) || /^\d+$/.test(w)) continue;
    const t = traduzirPalavra(w);
    if (t) termos.push(t);
    // Palavra que não parece português (já em inglês, nome, marca): vai como está.
    else if (!PORTUGUES.test(w) && !/[À-ſ]/i.test(cru)) termos.push(w);
  }
  const unicos = [...new Set(termos)].slice(0, 5);
  if (!unicos.length) return { consulta: original, termos: [original], traduziu: false };
  const consulta = unicos.join(' ');
  return { consulta, termos: unicos, traduziu: consulta.toLowerCase() !== original.toLowerCase() };
}
