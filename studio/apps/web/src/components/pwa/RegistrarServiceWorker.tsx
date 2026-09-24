'use client';

// Registra o service worker (só em produção: em desenvolvimento ele
// guardaria versões velhas das páginas e confundiria quem programa).
// Sem o service worker, o Chrome no Android não oferece instalar.

import { useEffect } from 'react';

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && !window.location.search.includes('sw=1')) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
