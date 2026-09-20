'use client';

import { use } from 'react';
import { MolduraPainel } from '@/components/painel/moldura-painel';
import { FormularioPost } from '@/components/painel/formulario-post';

export default function PaginaEditarPublicacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <MolduraPainel>
      <FormularioPost id={id} />
    </MolduraPainel>
  );
}
