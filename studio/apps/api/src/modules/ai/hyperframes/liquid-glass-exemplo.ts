// ============================================================
// O exemplo completo do Liquid Glass (já no formato da resposta da IA):
// painel meio_a_meio com o fundo vivo, um cartão de vidro com o número
// que conta, a barra com a gota de vidro deslizando e o selo tingido.
// Conferido no Chrome (o material aparece e o texto lê).
// ============================================================

export const EXEMPLO_LIQUID_GLASS = JSON.stringify({
  titulo: '87% das lojas',
  html: `<div class="lg-fundo"><div class="lg-bolha" id="b1" style="left:-120px;top:-80px;width:560px;height:560px;background:var(--lg-blue)"></div><div class="lg-bolha" id="b2" style="right:-140px;top:120px;width:520px;height:520px;background:var(--lg-pink)"></div><div class="lg-bolha" id="b3" style="left:260px;bottom:-220px;width:600px;height:600px;background:var(--lg-orange)"></div></div>
<div class="conteudo"><div class="vidro-tinta selo" id="selo">Dado da pesquisa</div>
<div class="vidro cartao" id="cartao" style="--ta:90,160,255;--tb:255,120,170"><span class="lg-rotulo">Lojas que perdem vendas</span><div class="numero lg-titulo"><span id="num">87</span>%</div><p class="lg-texto" id="det">por demorar a responder no WhatsApp</p>
<div class="lg-trilho" id="trilho"><div class="lg-enche" id="enche"></div><div class="vidro gota" id="gota" style="--ta:90,160,255;--tb:60,120,230"></div></div></div></div>`,
  css: `.conteudo { position:absolute; left:var(--util-x); top:var(--util-y); width:var(--util-w); height:var(--util-h); display:flex; flex-direction:column; justify-content:center; align-items:flex-start; gap:36px; }
.selo { padding:18px 34px; font-family:var(--fonte-texto); font-size:30px; }
.cartao { width:100%; padding:56px 60px 64px; display:flex; flex-direction:column; gap:14px; }
.numero { font-size:200px; line-height:1; }
.lg-texto { font-size:38px; margin:0 0 30px; }
.lg-enche { width:87%; }
.gota { position:absolute; top:-18px; left:calc(87% - 70px); width:140px; height:96px; border-radius:999px; }`,
  script: `var percurso = document.getElementById('trilho').offsetWidth * 0.87;
tl.to('#b1', { x: 90, y: 60, duration: 6, ease: 'sine.inOut' }, 0)
  .to('#b2', { x: -80, y: 70, duration: 6, ease: 'sine.inOut' }, 0)
  .to('#b3', { x: 60, y: -90, duration: 6, ease: 'sine.inOut' }, 0)
  .fromTo('#cartao', { scale: 0.86, borderRadius: 999, opacity: 0 }, { scale: 1, borderRadius: 56, opacity: 1, duration: 0.75, ease: 'back.out(1.4)' }, 0.2)
  .fromTo('#selo', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0.5)
  .from('#num', { textContent: 0, duration: 1.4, ease: 'power2.out', snap: { textContent: 1 } }, 0.9)
  .fromTo('#enche', { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power3.inOut' }, 0.9)
  .fromTo('#gota', { x: -percurso }, { x: 0, duration: 1.4, ease: 'power3.inOut' }, 0.9)
  .fromTo('#det', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 1.6)
  .to('#cartao', { opacity: 0, y: -30, duration: 0.3, ease: 'power2.in' }, 5.6);`,
});
