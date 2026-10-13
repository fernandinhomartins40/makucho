'use client';

// ============================================================
// Diagnóstico da prévia no aparelho (/editor?projeto=...&diag=1).
//
// Mostra, ao vivo, o que o celular está fazendo com o vídeo (players,
// o que está por cima do centro do quadro) e deixa desligar cada camada
// com um toque -- para achar o que esconde a imagem num aparelho que o
// emulador não reproduz. Não aparece sem o `diag=1` no endereço.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { estadoDoMotor } from './motorDecodificado';

const CAMADAS = [
  ['legendas', 'Legenda'],
  ['animacoes', 'Animações'],
  ['recorte', 'Recorte'],
  ['fundo', 'Fundo desfocado'],
  ['gl', 'WebGL'],
  ['interface', 'Botões'],
] as const;

const CSS = `
html[data-diag-legendas] .palco__quadro canvas:not(.palco__gl):not(.palco__fundo-desfocado):not(.palco__recorte){display:none!important}
html[data-diag-animacoes] .palco__animacoes{display:none!important}
html[data-diag-recorte] .palco__recorte{display:none!important}
html[data-diag-fundo] .palco__fundo-desfocado{display:none!important}
html[data-diag-gl] .palco__gl{display:none!important}
html[data-diag-gl] .palco__player{opacity:1!important}
html[data-diag-interface] .pratico{opacity:0!important}
.diag{position:fixed;left:4px;right:4px;top:4px;z-index:2000;max-height:46vh;overflow:auto;padding:6px 8px;border-radius:8px;background:rgb(0 0 0 / 82%);color:#7CFC9A;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:auto}
.diag button{margin:2px 4px 2px 0;padding:6px 8px;border:1px solid #7CFC9A;border-radius:6px;background:none;color:#fff;font:inherit}
.diag button[aria-pressed=true]{background:#b91c1c;border-color:#b91c1c}
`;

function nome(el: Element): string {
  const c = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
  return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}`;
}

export function DiagnosticoDaPrevia() {
  const [ligado, setLigado] = useState(false);
  const [texto, setTexto] = useState('');
  const [desligadas, setDesligadas] = useState<Set<string>>(new Set());
  const antes = useRef({ d: 0, m: 0, t: 0 });
  useEffect(() => setLigado(new URLSearchParams(window.location.search).get('diag') === '1'), []);

  useEffect(() => {
    if (!ligado) return;
    const id = setInterval(() => {
      const linhas: string[] = [];
      linhas.push(`${navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 90)} · dpr ${window.devicePixelRatio} · toque ${matchMedia('(pointer: coarse)').matches}`);
      const m = estadoDoMotor;
      const agora = performance.now();
      const seg = Math.max(0.001, (agora - antes.current.t) / 1000);
      linhas.push(`MOTOR ${m.ativo ? 'ATIVO' : 'desligado'} · baixou ${(m.baixado / 1e6).toFixed(1)} MB · decodifica ${((m.decodificados - antes.current.d) / seg).toFixed(0)}/s · mostra ${((m.mostrados - antes.current.m) / seg).toFixed(0)}/s · som ${m.som} · leitores ${m.leitores} · WebCodecs ${typeof VideoDecoder === 'function' ? 'sim' : 'NÃO'} · decodificador ${m.decodificador || "?"} (aceita: ${m.opcoes || "?"}) · ${m.codec}${m.trocas ? " · trocou " + m.trocas + "x" : ""}${m.erro ? ' · ERRO ' + m.erro : ''}`);
      antes.current = { d: m.decodificados, m: m.mostrados, t: agora };
      const imagem = document.querySelector('.palco__imagem');
      linhas.push(`webgl ${imagem?.classList.contains('palco__imagem--gl') ? 'LIGADO' : 'desligado'} · editor ${document.querySelector('.editor')?.getAttribute('data-tocando') ? 'TOCANDO' : 'parado'}`);
      document.querySelectorAll<HTMLVideoElement>('.palco__video').forEach((v, i) => {
        const q = v.getVideoPlaybackQuality?.();
        const pai = v.parentElement ? getComputedStyle(v.parentElement) : null;
        linhas.push(
          `player${i}: ${v.paused ? 'parado' : 'toca'} t=${v.currentTime.toFixed(2)} rs=${v.readyState} ns=${v.networkState}${v.seeking ? ' BUSCANDO' : ''} ${v.videoWidth}x${v.videoHeight} quadros=${q?.totalVideoFrames ?? '?'} perdidos=${q?.droppedVideoFrames ?? '?'} opac=${pai?.opacity} vis=${getComputedStyle(v).visibility}${v.error ? ' ERRO ' + v.error.code : ''}`,
        );
      });
      const quadro = document.querySelector('.palco__quadro')?.getBoundingClientRect();
      if (quadro) {
        const pilha = document.elementsFromPoint(quadro.left + quadro.width / 2, quadro.top + quadro.height * 0.35);
        linhas.push(`no centro (de cima p/ baixo): ${pilha.slice(0, 9).map(nome).join(' > ')}`);
        linhas.push(`quadro ${Math.round(quadro.width)}x${Math.round(quadro.height)}`);
      }
      setTexto(linhas.join('\n'));
    }, 500);
    return () => clearInterval(id);
  }, [ligado]);

  if (!ligado) return null;
  const alternar = (c: string) => {
    setDesligadas((d) => {
      const n = new Set(d);
      if (n.has(c)) {
        n.delete(c);
        delete document.documentElement.dataset[`diag${c[0]!.toUpperCase()}${c.slice(1)}`];
      } else {
        n.add(c);
        document.documentElement.setAttribute(`data-diag-${c}`, '');
      }
      return n;
    });
  };
  return (
    <div className="diag">
      <style>{CSS}</style>
      <div>
        Desligar:{' '}
        {CAMADAS.map(([id, rotulo]) => (
          <button key={id} type="button" aria-pressed={desligadas.has(id)} onClick={() => alternar(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      {texto}
    </div>
  );
}
