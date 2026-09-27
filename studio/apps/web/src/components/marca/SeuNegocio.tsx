'use client';

// ============================================================
// "Seu negócio": o ramo ajusta a montagem da IA -- o que ela procura
// nas cenas de um vídeo sem narração, o tipo de vídeo padrão e a
// chamada final. Salva ao escolher (não entra no "Salvar alterações"
// do kit: é da conta, não da identidade visual).
// ============================================================

import { useEffect, useState } from 'react';
import { RAMOS, RAMOS_DE_NEGOCIO } from '@makucho/studio-contracts';
import { apiNegocio } from '../../lib/api';

export function SeuNegocio() {
  const [ramo, setRamo] = useState<string>('');
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'salvando' | 'salvo' | 'erro'>('carregando');

  useEffect(() => {
    apiNegocio
      .obter()
      .then((r) => {
        setRamo(r.ramo ?? '');
        setEstado('pronto');
      })
      .catch(() => setEstado('pronto'));
  }, []);

  const escolher = async (novo: string) => {
    setRamo(novo);
    setEstado('salvando');
    try {
      await apiNegocio.salvar(novo || null);
      setEstado('salvo');
    } catch {
      setEstado('erro');
    }
  };

  return (
    <section className="cartao seu-negocio">
      <label className="campo" htmlFor="ramo-do-negocio">
        <span className="campo__rotulo">Seu negócio</span>
        <select
          id="ramo-do-negocio"
          className="campo__selecao"
          value={ramo}
          disabled={estado === 'carregando'}
          onChange={(e) => void escolher(e.target.value)}
        >
          <option value="">Escolha o ramo</option>
          {RAMOS_DE_NEGOCIO.map((r) => (
            <option key={r} value={r}>
              {RAMOS[r].rotulo}
            </option>
          ))}
        </select>
        <span className="campo__ajuda">A IA monta os vídeos do jeito do seu ramo, inclusive os sem narração (produto, vitrine, promoção).</span>
      </label>
      <span className="seu-negocio__estado" role="status">
        {estado === 'salvando' ? 'Salvando…' : estado === 'salvo' ? 'Salvo' : estado === 'erro' ? 'Não foi possível salvar' : ''}
      </span>
    </section>
  );
}
