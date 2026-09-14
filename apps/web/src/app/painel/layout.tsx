import type { Metadata } from 'next';
import { ProvedorSessao } from '@/components/painel/sessao';
import '@/app/painel/painel.css';

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Painel MAKUCHO' },
  // O painel nunca deve aparecer em buscador.
  robots: { index: false, follow: false, nocache: true },
};

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return <ProvedorSessao>{children}</ProvedorSessao>;
}
