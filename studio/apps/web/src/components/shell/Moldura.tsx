'use client';

// ============================================================
// Moldura do app.
//
// Duas formas, e a rota decide qual:
//
//   navegação  Projetos, Roteiro, Gravar e Marca — sidebar de 232px
//              à esquerda, idêntica em todas;
//   foco       o Editor — a sidebar sai e o rail de ferramentas
//              ocupa o lugar dela, porque ali a coluna esquerda
//              pertence ao trabalho, não à navegação. A volta fica
//              na seta da topbar.
//
// Sem essa distinção, o editor teria duas colunas de ícones lado a
// lado disputando a mesma função.
//
// Abaixo de 900px a sidebar dá lugar à barra inferior (o CSS decide
// qual aparece), e o banner de instalação do app entra nas telas de
// navegação -- nunca no editor, onde atrapalharia o trabalho.
// ============================================================

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { BarraInferior } from './BarraInferior';
import { BannerDeInstalacao } from '../pwa/GuiaDeInstalacao';
import { aoExpirarSessao } from '../../lib/api';
import { ExportacoesEmAndamento } from '../exportacao/ExportacoesEmAndamento';

/** Telas de foco: ocupam a largura toda, sem sidebar. */
const TELAS_DE_FOCO = ['/editor'];

/** Telas que nao exigem sessao -- e nao podem ganhar sidebar. */
const TELAS_ABERTAS = ['/entrar', '/offline'];

export function Moldura({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();

  const aberta = TELAS_ABERTAS.some((rota) => caminho.startsWith(rota));

  // A guarda de sessao, em um lugar so.
  //
  // Antes, um 401 virava "sua sessao expirou" em cada tela, sem
  // caminho de volta: a API tinha login desde a Fase 1 e o front
  // nunca teve tela, entao a mensagem era um beco sem saida.
  //
  // O cliente de API ja tenta renovar sozinho num 401; isto aqui so
  // roda quando a renovacao TAMBEM falha, ou seja, quando a sessao
  // acabou de verdade.
  useEffect(() => {
    if (aberta) return;

    aoExpirarSessao(() => {
      // Leva de onde a pessoa estava, para voltar depois de entrar.
      // Sem isso, quem estava no editor cairia no painel e teria de
      // navegar de novo -- com o trabalho ainda aberto na cabeca.
      const de = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/entrar?de=${de}`);
    });

    // A tela de entrar nao deve herdar o redirecionamento: sem
    // limpar, um 401 do proprio login recarregaria a tela em laco.
    return () => aoExpirarSessao(() => undefined);
  }, [aberta, router]);

  // Sem sidebar nem moldura: a tela de entrar e a unica que aparece
  // para quem ainda nao tem sessao, e uma navegacao que nao leva a
  // lugar nenhum so confunde.
  if (aberta) {
    return <>{children}</>;
  }

  const foco = TELAS_DE_FOCO.some((rota) => caminho.startsWith(rota));

  if (foco) {
    return (
      <>
        <div className="principal principal--foco">{children}</div>
        <ExportacoesEmAndamento />
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="principal">{children}</div>
      <BarraInferior />
      <BannerDeInstalacao />
      {/* A exportação roda no navegador: o progresso acompanha em qualquer página. */}
      <ExportacoesEmAndamento />
    </div>
  );
}
