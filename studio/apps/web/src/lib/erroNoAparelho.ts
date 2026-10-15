// ============================================================
// Os erros de JavaScript no aparelho de quem usa o Studio vão para o log do
// servidor (POST /api/health/erro): defeitos de um celular que a gente não
// tem na mão -- um iPhone com iOS mais antigo, por exemplo -- ficam visíveis.
//
// É um script inline no <head>, em ES5: roda antes de qualquer arquivo do
// app, e pega até o erro de sintaxe de um arquivo que o navegador não sabe
// ler (que derrubaria um relator escrito em React antes de ele existir).
// Pega também o arquivo JS que não carregou (o fetch de uma parte do app
// sob demanda, como uma gaveta). No máximo 15 relatos por página, sem
// repetir a mesma mensagem.
// ============================================================

export const SCRIPT_DO_RELATOR_DE_ERROS = `(function () {
  var enviados = 0, vistos = {};
  function relatar(tipo, mensagem, extra) {
    try {
      mensagem = String(mensagem || '').slice(0, 500);
      if (enviados >= 15 || vistos[tipo + mensagem]) return;
      vistos[tipo + mensagem] = 1;
      enviados++;
      var ed = document.querySelector('.editor');
      var corpo = JSON.stringify({
        tipo: tipo,
        mensagem: mensagem,
        extra: String(extra || '').slice(0, 1500),
        pagina: location.pathname,
        gaveta: ed ? ed.getAttribute('data-folha') : null,
        modo: ed ? ed.getAttribute('data-modo') : null,
        tela: window.innerWidth + 'x' + window.innerHeight + '@' + (window.devicePixelRatio || 1),
        ua: navigator.userAgent,
        em: new Date().toISOString()
      });
      if (window.fetch) {
        fetch('/api/health/erro', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: corpo })['catch'](function () {});
      }
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    var alvo = e && e.target;
    // Um arquivo que não carregou (script, folha de estilo): o evento vem do elemento, sem mensagem.
    if (alvo && alvo !== window && (alvo.src || alvo.href)) return relatar('arquivo', alvo.src || alvo.href, alvo.tagName);
    relatar('erro', e && e.message, (e && e.error && e.error.stack) || ((e && e.filename) + ':' + (e && e.lineno) + ':' + (e && e.colno)));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    relatar('promessa', (r && (r.name ? r.name + ': ' + r.message : r.message)) || r, r && r.stack);
  });
  // O que o React e o Next registram como erro (a tela que quebrou dentro de uma parte do app).
  var original = console.error;
  console.error = function () {
    try {
      var partes = [];
      for (var i = 0; i < arguments.length && i < 3; i++) {
        var a = arguments[i];
        // No Safari, o stack não traz a mensagem: vai o nome e a mensagem na frente.
        partes.push(a && a.stack ? (a.name || 'Error') + ': ' + a.message + '\\n' + a.stack : typeof a === 'string' ? a : (function () { try { return JSON.stringify(a); } catch (x) { return String(a); } })());
      }
      var texto = partes.join(' | ');
      if (!/Failed to load resource|favicon/.test(texto)) relatar('console', texto.split('\\n')[0], texto);
    } catch (e) {}
    return original.apply(console, arguments);
  };
})();`;
