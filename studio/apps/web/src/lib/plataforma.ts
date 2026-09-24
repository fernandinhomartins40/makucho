// ============================================================
// Detecção da plataforma, para instalar o app do jeito certo.
//
// Cada combinação instala de um jeito diferente, e o banner só ajuda se
// disser o caminho EXATO:
//
//   - Android/desktop (Chrome, Edge, Samsung): o navegador dispara
//     `beforeinstallprompt` e o app abre o diálogo nativo de instalação;
//   - iOS/iPadOS: não há evento. Instala-se pelo menu Compartilhar, que
//     muda de lugar conforme a versão e o navegador:
//       · Safari no iOS 26+: botão "•••" ao lado do endereço → Compartilhar;
//       · Safari até o iOS 18 (iPhone): Compartilhar na barra de baixo;
//       · Safari no iPad: Compartilhar no alto, à direita;
//       · Chrome no iOS 16.4+: Compartilhar à direita do endereço;
//       · Edge/Firefox no iOS 16.4+: menu → Compartilhar;
//       · qualquer outro antes do iOS 16.4, ou dentro do Instagram,
//         Facebook, TikTok...: só pelo Safari.
//
// A partir do Safari 26 o `User-Agent` congela a versão do sistema
// ("iPhone OS 18_6" num iOS 26); a versão real vem de `Version/26`.
// ============================================================

export type Sistema = 'ios' | 'ipados' | 'android' | 'desktop';
export type Navegador = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'app' | 'outro';

export interface Plataforma {
  sistema: Sistema;
  navegador: Navegador;
  /** Versão do iOS/iPadOS (maior, menor), quando é Apple. */
  versaoIos: [number, number] | null;
}

interface Entrada {
  ua: string;
  maxTouchPoints: number;
}

export function detectarPlataforma({ ua, maxTouchPoints }: Entrada): Plataforma {
  const iphone = /iPhone|iPod/.test(ua);
  // iPadOS 13+ se apresenta como Mac; o toque denuncia.
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const android = /Android/i.test(ua);

  const sistema: Sistema = iphone ? 'ios' : ipad ? 'ipados' : android ? 'android' : 'desktop';

  // Navegadores embutidos em apps (não instalam nada).
  const embutido = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\//.test(ua);

  let navegador: Navegador = 'outro';
  if (embutido) navegador = 'app';
  else if (/CriOS/.test(ua)) navegador = 'chrome';
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) navegador = 'edge';
  else if (/FxiOS|Firefox\//.test(ua)) navegador = 'firefox';
  else if (/SamsungBrowser/.test(ua)) navegador = 'samsung';
  else if (/Chrome\//.test(ua)) navegador = 'chrome';
  else if (/Safari\//.test(ua) && (iphone || ipad || /Macintosh/.test(ua))) navegador = 'safari';

  let versaoIos: [number, number] | null = null;
  if (sistema === 'ios' || sistema === 'ipados') {
    const doSistema = /OS (\d+)_(\d+)/.exec(ua);
    const doSafari = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
    const candidatos: Array<[number, number]> = [];
    if (doSistema) candidatos.push([Number(doSistema[1]), Number(doSistema[2])]);
    if (doSafari) candidatos.push([Number(doSafari[1]), Number(doSafari[2] ?? 0)]);
    // A maior: o Safari 26 congela "OS 18_6" mas diz "Version/26".
    versaoIos = candidatos.sort((a, b) => b[0] - a[0] || b[1] - a[1])[0] ?? null;
  }

  return { sistema, navegador, versaoIos };
}

/** `versao >= alvo`. */
export function versaoAtinge(versao: [number, number] | null, maior: number, menor = 0): boolean {
  if (!versao) return false;
  return versao[0] > maior || (versao[0] === maior && versao[1] >= menor);
}

export interface PassoDeInstalacao {
  /** Qual desenho acompanha o passo. */
  icone: 'compartilhar' | 'mais' | 'menu' | 'adicionar' | 'confirmar' | 'safari' | 'instalar';
  texto: string;
}

export interface GuiaDeInstalacao {
  titulo: string;
  passos: PassoDeInstalacao[];
  /** Quando é preciso abrir o endereço em outro navegador. */
  abrirNoSafari?: boolean;
  dica?: string;
}

/** O passo a passo para iPhone/iPad, conforme versão e navegador. */
export function guiaParaApple(p: Plataforma): GuiaDeInstalacao {
  const ipad = p.sistema === 'ipados';
  const aparelho = ipad ? 'iPad' : 'iPhone';
  const moderno = versaoAtinge(p.versaoIos, 16, 4);
  const adicionar: PassoDeInstalacao = { icone: 'adicionar', texto: 'Toque em "Adicionar à Tela de Início"' };
  const confirmar: PassoDeInstalacao = { icone: 'confirmar', texto: 'Confirme em "Adicionar", no canto de cima' };
  const dica = 'Não achou a opção? Role o menu até o fim, toque em "Editar Ações" e ative "Adicionar à Tela de Início".';

  if (p.navegador === 'app') {
    return {
      titulo: `Abra no Safari para instalar no ${aparelho}`,
      abrirNoSafari: true,
      passos: [
        { icone: 'mais', texto: 'Toque em ••• (ou no ícone de navegador) no canto da tela' },
        { icone: 'safari', texto: 'Escolha "Abrir no navegador" ou "Abrir no Safari"' },
        { icone: 'compartilhar', texto: 'No Safari, siga as instruções que vão aparecer' },
      ],
    };
  }

  if (p.navegador !== 'safari' && !moderno) {
    return {
      titulo: `Abra no Safari para instalar no ${aparelho}`,
      abrirNoSafari: true,
      passos: [
        { icone: 'safari', texto: 'Copie o endereço abaixo e abra no Safari' },
        { icone: 'compartilhar', texto: 'No Safari, toque em Compartilhar' },
        adicionar,
      ],
      dica: `Antes do iOS 16.4, só o Safari instala apps da web. Seu ${aparelho} está no iOS ${p.versaoIos?.join('.') ?? 'antigo'}.`,
    };
  }

  if (p.navegador === 'chrome') {
    return {
      titulo: `Instale o Studio no seu ${aparelho}`,
      passos: [
        { icone: 'compartilhar', texto: 'Toque em Compartilhar, à direita da barra de endereço' },
        adicionar,
        confirmar,
      ],
      dica,
    };
  }

  if (p.navegador === 'edge' || p.navegador === 'firefox') {
    return {
      titulo: `Instale o Studio no seu ${aparelho}`,
      passos: [
        { icone: 'menu', texto: 'Toque no menu (≡ ou •••) do navegador' },
        { icone: 'compartilhar', texto: 'Toque em Compartilhar' },
        adicionar,
        confirmar,
      ],
      dica,
    };
  }

  // Safari
  if (versaoAtinge(p.versaoIos, 26)) {
    return {
      titulo: `Instale o Studio no seu ${aparelho}`,
      passos: [
        { icone: 'mais', texto: 'Toque em ••• ao lado da barra de endereço' },
        { icone: 'compartilhar', texto: 'Toque em Compartilhar' },
        adicionar,
        { icone: 'confirmar', texto: 'Deixe "Abrir como App Web" ligado e toque em "Adicionar"' },
      ],
      dica,
    };
  }

  return {
    titulo: `Instale o Studio no seu ${aparelho}`,
    passos: [
      {
        icone: 'compartilhar',
        texto: ipad
          ? 'Toque em Compartilhar (quadrado com seta), no alto, à direita do endereço'
          : 'Toque em Compartilhar (quadrado com seta), na barra de baixo',
      },
      adicionar,
      confirmar,
    ],
    dica,
  };
}

/** Passo a passo para Android/desktop quando o navegador não oferece o diálogo. */
export function guiaSemDialogo(p: Plataforma): GuiaDeInstalacao {
  if (p.sistema === 'android') {
    if (p.navegador === 'firefox') {
      return {
        titulo: 'Instale o Studio no seu Android',
        passos: [
          { icone: 'menu', texto: 'Toque no menu ⋮ do Firefox' },
          { icone: 'instalar', texto: 'Toque em "Instalar" ou "Adicionar à tela inicial"' },
        ],
      };
    }
    return {
      titulo: 'Instale o Studio no seu Android',
      passos: [
        { icone: 'menu', texto: 'Toque no menu ⋮ do navegador, no canto de cima' },
        { icone: 'instalar', texto: 'Toque em "Instalar app" ou "Adicionar à tela inicial"' },
        { icone: 'confirmar', texto: 'Confirme em "Instalar"' },
      ],
    };
  }
  return {
    titulo: 'Instale o Studio no computador',
    passos: [
      { icone: 'instalar', texto: 'Clique no ícone de instalar, no fim da barra de endereço do Chrome ou do Edge' },
      { icone: 'confirmar', texto: 'Confirme em "Instalar"' },
    ],
  };
}
