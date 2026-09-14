/**
 * Conteudo inicial do portal (secao 42).
 *
 * Reproduz a home do layout aprovado: seis editorias, doze artigos com
 * texto real de economia, videos das redes e os indicadores do ticker.
 * Nada aqui e hardcoded no frontend — tudo entra no banco pelo seed e
 * passa a ser editavel pelo CMS.
 */

export interface PautaSeed {
  titulo: string;
  subtitulo?: string;
  categoria: string;
  tags: string[];
  paragrafos: string[];
  intertitulo?: string;
  destaque?: boolean;
  emAlta?: boolean;
  fixado?: boolean;
  /** Dias atrás em que foi publicada; controla a ordem na home. */
  diasAtras: number;
  /** Plataforma do video complementar, exibida no botao do card. */
  plataformaVideo?: 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE';
  urlVideo?: string;
}

export const CATEGORIAS = [
  {
    nome: 'Economia',
    descricao: 'Indicadores, política monetária e o rumo da atividade no Brasil.',
    cor: '#0B5FFF',
    icone: 'trending-up',
  },
  {
    nome: 'Mercado',
    descricao: 'Bolsa, câmbio, renda fixa e o que move os investidores.',
    cor: '#1A73FF',
    icone: 'line-chart',
  },
  {
    nome: 'Negócios',
    descricao: 'Empresas, fusões, resultados e estratégia corporativa.',
    cor: '#0047D6',
    icone: 'briefcase',
  },
  {
    nome: 'Finanças Pessoais',
    descricao: 'Onde colocar o seu dinheiro e como organizar o orçamento.',
    cor: '#2B82FF',
    icone: 'wallet',
  },
  {
    nome: 'Tecnologia',
    descricao: 'Inovação, startups e o impacto da tecnologia na economia.',
    cor: '#0037A8',
    icone: 'cpu',
  },
  {
    nome: 'Internacional',
    descricao: 'Economia global, geopolítica e seus reflexos por aqui.',
    cor: '#06215C',
    icone: 'globe',
  },
];

export const TAGS = [
  'Selic',
  'Inflação',
  'Copom',
  'Dólar',
  'Ibovespa',
  'PIB',
  'Juros',
  'Investimentos',
  'Renda fixa',
  'Startups',
  'Fed',
  'Petrobras',
  'Varejo',
  'Tesouro Direto',
];

export const AUTORES = [
  {
    nome: 'Helena Braga',
    funcao: 'Editora de Economia',
    bio: 'Cobre política monetária e contas públicas há doze anos. Passou por redações de economia em São Paulo e Brasília.',
    instagram: 'https://instagram.com/makucho',
    linkedin: 'https://linkedin.com/company/makucho',
  },
  {
    nome: 'Rafael Nogueira',
    funcao: 'Repórter de Mercado',
    bio: 'Acompanha bolsa, câmbio e renda fixa. Escreve a análise diária de fechamento do mercado.',
    twitter: 'https://twitter.com/makucho',
  },
  {
    nome: 'Redação MAKUCHO',
    funcao: 'Equipe editorial',
    bio: 'Time de jornalistas do MAKUCHO dedicado a economia, mercado e negócios.',
  },
];

export const PAUTAS: PautaSeed[] = [
  {
    titulo: 'Copom mantém a Selic e sinaliza cautela com a inflação de serviços',
    subtitulo:
      'Comitê avalia que o núcleo da inflação ainda roda acima da meta e prefere esperar mais dados antes de cortar juros',
    categoria: 'Economia',
    tags: ['Selic', 'Copom', 'Juros', 'Inflação'],
    destaque: true,
    fixado: true,
    diasAtras: 0,
    plataformaVideo: 'YOUTUBE',
    urlVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    paragrafos: [
      'O Comitê de Política Monetária do Banco Central decidiu manter a taxa Selic no patamar atual, em decisão unânime. No comunicado, o colegiado afirmou que a desinflação segue em curso, mas destacou a resistência dos preços de serviços, o item mais sensível ao mercado de trabalho aquecido.',
      'A leitura do comitê é que o cenário externo segue incerto e que a atividade doméstica surpreendeu positivamente no trimestre, o que reduz a pressa por novos cortes. Economistas ouvidos pelo MAKUCHO avaliam que a porta segue aberta, mas que o próximo passo depende dos dados de inflação dos próximos dois meses.',
      'Para quem investe, a manutenção prolonga a janela de juro real elevado. Títulos atrelados à inflação e pós-fixados continuam competitivos, enquanto ativos de risco seguem dependendo de sinais mais claros de afrouxamento.',
    ],
    intertitulo: 'O que muda para o investidor',
  },
  {
    titulo: 'Ibovespa renova máxima histórica puxado por bancos e commodities',
    subtitulo: 'Fluxo estrangeiro volta a entrar na bolsa brasileira após três meses de saídas',
    categoria: 'Mercado',
    tags: ['Ibovespa', 'Investimentos'],
    destaque: true,
    emAlta: true,
    diasAtras: 0,
    plataformaVideo: 'INSTAGRAM',
    urlVideo: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    paragrafos: [
      'O principal índice da B3 fechou em alta e renovou a máxima histórica, sustentado pelo desempenho das ações de bancos e pela recuperação dos preços das commodities no exterior.',
      'O movimento acompanha a retomada do apetite por mercados emergentes. Dados da própria bolsa mostram entrada líquida de capital estrangeiro no mês, revertendo a tendência do trimestre anterior.',
      'Gestores ponderam que o índice já embute expectativa relevante de corte de juros, o que deixa o mercado vulnerável a frustrações no cenário fiscal.',
    ],
    intertitulo: 'Até onde vai o rali',
  },
  {
    titulo: 'Dólar recua e fecha no menor patamar do semestre',
    categoria: 'Mercado',
    tags: ['Dólar', 'Ibovespa'],
    emAlta: true,
    diasAtras: 1,
    plataformaVideo: 'TIKTOK',
    urlVideo: 'https://www.tiktok.com/@makucho/video/7300000000000000000',
    paragrafos: [
      'A moeda americana encerrou o pregão em queda, no menor nível desde o início do semestre, refletindo o enfraquecimento global do dólar e a entrada de recursos na bolsa local.',
      'O real acumula valorização no ano e figura entre as moedas de melhor desempenho entre os emergentes, apesar da volatilidade provocada pelo debate fiscal.',
    ],
  },
  {
    titulo: 'PIB cresce acima do esperado e reacende debate sobre o ritmo dos juros',
    subtitulo: 'Serviços e consumo das famílias puxaram o resultado do trimestre',
    categoria: 'Economia',
    tags: ['PIB', 'Juros'],
    destaque: true,
    diasAtras: 1,
    plataformaVideo: 'YOUTUBE',
    urlVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    paragrafos: [
      'A economia brasileira cresceu acima das projeções do mercado no trimestre, impulsionada pelo setor de serviços e pelo consumo das famílias, segundo os dados divulgados nesta semana.',
      'O resultado leva casas de análise a revisar para cima a projeção do ano. Por outro lado, atividade mais forte pressiona a inflação de serviços e complica o calendário de cortes da Selic.',
      'O investimento seguiu praticamente estável, o que analistas apontam como o ponto frágil do resultado: sem formação bruta de capital, o crescimento tende a perder fôlego adiante.',
    ],
    intertitulo: 'O ponto fraco do resultado',
  },
  {
    titulo: 'Como montar uma reserva de emergência com o juro nas alturas',
    subtitulo: 'Tesouro Selic, CDB de liquidez diária e fundos DI: as diferenças que importam',
    categoria: 'Finanças Pessoais',
    tags: ['Renda fixa', 'Tesouro Direto', 'Investimentos'],
    emAlta: true,
    diasAtras: 2,
    plataformaVideo: 'INSTAGRAM',
    urlVideo: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    paragrafos: [
      'Com a Selic elevada, a reserva de emergência voltou a render de forma relevante. A escolha do produto, porém, faz diferença no resultado líquido — sobretudo por causa da tributação e das taxas.',
      'O Tesouro Selic é o mais previsível: acompanha a taxa básica e tem liquidez diária garantida pelo Tesouro Nacional. CDBs de bancos médios pagam mais, mas exigem atenção ao limite de cobertura do FGC.',
      'A regra prática é simples: a reserva precisa estar disponível no dia em que você precisar dela, sem risco de perda no resgate. Rentabilidade vem depois da liquidez e da segurança.',
    ],
    intertitulo: 'A ordem das prioridades',
  },
  {
    titulo: 'Fusões e aquisições aceleram no varejo brasileiro',
    categoria: 'Negócios',
    tags: ['Varejo'],
    diasAtras: 2,
    plataformaVideo: 'TIKTOK',
    urlVideo: 'https://www.tiktok.com/@makucho/video/7300000000000000000',
    paragrafos: [
      'O número de operações de fusões e aquisições no varejo cresceu de forma expressiva no ano, com destaque para a consolidação de redes regionais de supermercados e farmácias.',
      'Especialistas atribuem o movimento à combinação de margens pressionadas e custo de capital ainda alto, que empurra empresas menores para a mesa de negociação.',
    ],
  },
  {
    titulo: 'Startups brasileiras captam mais em rodadas menores',
    subtitulo: 'Investidores privilegiam empresas com caminho claro para a lucratividade',
    categoria: 'Tecnologia',
    tags: ['Startups', 'Investimentos'],
    diasAtras: 3,
    plataformaVideo: 'YOUTUBE',
    urlVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    paragrafos: [
      'O volume de capital investido em startups brasileiras voltou a crescer, mas o padrão mudou: rodadas menores, avaliações mais conservadoras e exigência de métricas de rentabilidade.',
      'Fundos que antes priorizavam crescimento a qualquer custo agora pedem previsibilidade de receita e controle de queima de caixa antes de assinar um cheque.',
    ],
    intertitulo: 'O novo critério dos fundos',
  },
  {
    titulo: 'Fed mantém juros e mercado recalibra aposta para o próximo ano',
    categoria: 'Internacional',
    tags: ['Fed', 'Juros'],
    diasAtras: 3,
    plataformaVideo: 'INSTAGRAM',
    urlVideo: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    paragrafos: [
      'O banco central americano manteve a taxa de juros inalterada e reforçou que decisões futuras dependerão dos dados de inflação e do mercado de trabalho.',
      'A leitura levou investidores a adiar a expectativa do primeiro corte, movimento que se refletiu nos juros dos títulos de dez anos e, por tabela, nos mercados emergentes.',
    ],
  },
  {
    titulo: 'Petrobras anuncia novo plano de investimentos com foco em exploração',
    categoria: 'Negócios',
    tags: ['Petrobras', 'Investimentos'],
    diasAtras: 4,
    plataformaVideo: 'TIKTOK',
    urlVideo: 'https://www.tiktok.com/@makucho/video/7300000000000000000',
    paragrafos: [
      'A companhia apresentou o plano de investimentos para os próximos cinco anos, com a maior parte dos recursos destinada a exploração e produção, especialmente no pré-sal.',
      'O documento também detalha metas de redução de emissões e a política de distribuição de dividendos, tema acompanhado de perto pelos acionistas minoritários.',
    ],
  },
  {
    titulo: 'Inflação de alimentos desacelera e alivia o orçamento das famílias',
    categoria: 'Economia',
    tags: ['Inflação'],
    diasAtras: 5,
    plataformaVideo: 'YOUTUBE',
    urlVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    paragrafos: [
      'O grupo alimentação registrou a menor variação dos últimos meses, puxado pela safra e pela queda dos preços de itens in natura.',
      'O alívio é sentido com mais força nas faixas de menor renda, onde a alimentação pesa proporcionalmente mais no orçamento doméstico.',
    ],
  },
  {
    titulo: 'Renda fixa atrai investidor pessoa física e bate recorde de captação',
    categoria: 'Finanças Pessoais',
    tags: ['Renda fixa', 'Tesouro Direto'],
    diasAtras: 6,
    plataformaVideo: 'INSTAGRAM',
    urlVideo: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    paragrafos: [
      'A captação líquida em produtos de renda fixa alcançou o maior valor da série histórica, com destaque para títulos isentos de imposto de renda.',
      'O movimento acompanha o juro elevado, que permite ganhos reais expressivos com risco baixo — algo raro no histórico recente do investidor brasileiro.',
    ],
  },
  {
    titulo: 'Inteligência artificial já responde por parte relevante do ganho de produtividade',
    subtitulo: 'Levantamento mostra adoção acelerada em serviços financeiros e atendimento',
    categoria: 'Tecnologia',
    tags: ['Startups'],
    diasAtras: 7,
    plataformaVideo: 'TIKTOK',
    urlVideo: 'https://www.tiktok.com/@makucho/video/7300000000000000000',
    paragrafos: [
      'Empresas brasileiras que adotaram ferramentas de inteligência artificial em processos internos relatam ganhos de produtividade acima de dois dígitos, segundo levantamento setorial.',
      'Os setores financeiro e de atendimento lideram a adoção. O gargalo apontado pelas companhias não é tecnológico, mas de qualificação das equipes.',
    ],
    intertitulo: 'O gargalo não é a tecnologia',
  },
];

export const VIDEOS = [
  {
    titulo: 'Selic parada: o que fazer com o seu dinheiro agora',
    plataforma: 'YOUTUBE' as const,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duracao: 504,
    categoria: 'Finanças Pessoais',
    destaque: true,
  },
  {
    titulo: 'Bolsa em máxima: ainda dá tempo de entrar?',
    plataforma: 'YOUTUBE' as const,
    url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    duracao: 372,
    categoria: 'Mercado',
    destaque: true,
  },
  {
    titulo: 'Três erros que destroem a sua reserva de emergência',
    plataforma: 'INSTAGRAM' as const,
    url: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    duracao: 68,
    categoria: 'Finanças Pessoais',
  },
  {
    titulo: 'Dólar em queda explicado em 60 segundos',
    plataforma: 'TIKTOK' as const,
    url: 'https://www.tiktok.com/@makucho/video/7300000000000000000',
    duracao: 59,
    categoria: 'Mercado',
  },
  {
    titulo: 'PIB acima do esperado: o que isso significa na prática',
    plataforma: 'YOUTUBE' as const,
    url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    duracao: 615,
    categoria: 'Economia',
  },
  {
    titulo: 'O que o Fed decidiu e por que importa para o Brasil',
    plataforma: 'INSTAGRAM' as const,
    url: 'https://www.instagram.com/reel/CxYzHiJkLmN/',
    duracao: 74,
    categoria: 'Internacional',
  },
];

export const INDICADORES = [
  { symbol: 'IBOVESPA', label: 'Ibovespa', unit: 'pts', value: 134280.55, changePercent: 0.87 },
  { symbol: 'USD', label: 'Dólar', unit: 'R$', value: 5.12, changePercent: -0.43 },
  { symbol: 'EUR', label: 'Euro', unit: 'R$', value: 5.58, changePercent: -0.21 },
  { symbol: 'BTC', label: 'Bitcoin', unit: 'US$', value: 91240.0, changePercent: 2.15 },
  { symbol: 'SELIC', label: 'Selic', unit: 'a.a.', value: 10.5, changePercent: 0 },
  { symbol: 'IPCA', label: 'IPCA 12m', unit: '%', value: 4.23, changePercent: -0.12 },
];

export const REDES_SOCIAIS = [
  {
    platform: 'instagram',
    label: 'Instagram',
    url: 'https://instagram.com/makucho',
    handle: '@makucho',
    icon: 'instagram',
    followerCount: 128000,
    followerLabel: '128 mil seguidores',
    position: 0,
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    url: 'https://youtube.com/@makucho',
    handle: '@makucho',
    icon: 'youtube',
    followerCount: 84000,
    followerLabel: '84 mil inscritos',
    position: 1,
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    url: 'https://tiktok.com/@makucho',
    handle: '@makucho',
    icon: 'tiktok',
    followerCount: 96000,
    followerLabel: '96 mil seguidores',
    position: 2,
  },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    url: 'https://linkedin.com/company/makucho',
    icon: 'linkedin',
    followerCount: 23000,
    followerLabel: '23 mil seguidores',
    position: 3,
  },
  {
    platform: 'twitter',
    label: 'X',
    url: 'https://twitter.com/makucho',
    handle: '@makucho',
    icon: 'twitter',
    position: 4,
  },
];

/** Configurações do site — tudo o que o portal exibe fora do editorial. */
export const CONFIGURACOES = [
  { key: 'site.name', value: 'MAKUCHO', group: 'general', label: 'Nome do site' },
  {
    key: 'site.tagline',
    value: 'Economia, mercado e negócios sem rodeio',
    group: 'general',
    label: 'Slogan',
  },
  {
    key: 'site.description',
    value:
      'Portal de economia, finanças e negócios do Brasil. Análises de mercado, indicadores e o que muda no seu bolso.',
    group: 'seo',
    label: 'Descrição padrão',
  },
  { key: 'site.url', value: 'https://makucho.com.br', group: 'general', label: 'Endereço' },
  { key: 'site.email', value: 'contato@makucho.com.br', group: 'general', label: 'E-mail' },
  {
    key: 'seo.defaultTitle',
    value: 'MAKUCHO — Economia, mercado e negócios',
    group: 'seo',
    label: 'Título padrão',
  },
  { key: 'seo.titleTemplate', value: '%s | MAKUCHO', group: 'seo', label: 'Modelo de título' },
  { key: 'seo.robots', value: 'index,follow', group: 'seo', label: 'Robots' },
  {
    key: 'newsletter.title',
    value: 'Receba as análises do MAKUCHO',
    group: 'newsletter',
    label: 'Título da newsletter',
  },
  {
    key: 'newsletter.description',
    value: 'Um resumo diário do que move a economia, direto no seu e-mail.',
    group: 'newsletter',
    label: 'Chamada da newsletter',
  },
  {
    key: 'footer.copyright',
    value: 'MAKUCHO. Todos os direitos reservados.',
    group: 'general',
    label: 'Rodapé',
  },
  {
    key: 'ticker.enabled',
    value: true,
    group: 'general',
    label: 'Exibir ticker de mercado',
  },
];

/** Seções da home, na ordem do layout aprovado. */
export const SECOES_HOME = [
  { type: 'HERO' as const, title: 'Destaque', position: 0, config: { limit: 1 } },
  { type: 'AD_SLOT' as const, title: null, position: 1, config: { placement: 'HOME_AFTER_HERO' } },
  {
    type: 'LATEST_POSTS' as const,
    title: 'Últimas publicações',
    subtitle: 'O que acabou de sair na redação',
    position: 2,
    config: { limit: 6 },
  },
  {
    type: 'TRENDING' as const,
    title: 'Em alta',
    subtitle: 'Os assuntos mais comentados agora',
    position: 3,
    config: { limit: 4 },
  },
  {
    type: 'VIDEOS' as const,
    title: 'Vídeos MAKUCHO',
    subtitle: 'Análises rápidas no YouTube, Instagram e TikTok',
    position: 4,
    config: { limit: 6 },
  },
  {
    type: 'CATEGORIES' as const,
    title: 'Editorias',
    subtitle: 'Navegue por assunto',
    position: 5,
    config: {},
  },
  { type: 'NEWSLETTER' as const, title: null, position: 6, config: {} },
];
