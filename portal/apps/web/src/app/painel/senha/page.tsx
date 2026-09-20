'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErroApi, painel } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina, rotuloPapel } from '@/components/painel/moldura-painel';
import { Aviso, Botao, Campo, Entrada } from '@/components/painel/ui';

function Conta() {
  const { usuario, sair } = useSessao();
  const router = useRouter();

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    if (nova !== repetir) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }

    setEnviando(true);
    try {
      await painel.alterarSenha(atual, nova);
      // O backend revoga todas as sessoes: e preciso entrar de novo.
      await sair();
      router.replace('/painel/entrar');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível alterar a senha.');
      setEnviando(false);
    }
  }

  return (
    <>
      <TituloPagina titulo="Minha conta" descricao="Seus dados de acesso ao painel." />

      <div className="pn-bloco pn-estreito">
        <dl className="pn-dados">
          <div>
            <dt>Nome</dt>
            <dd>{usuario?.name}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{usuario?.email}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>{usuario ? rotuloPapel(usuario.role) : '—'}</dd>
          </div>
        </dl>
      </div>

      <form className="pn-bloco pn-estreito" onSubmit={enviar}>
        <h2 className="pn-bloco-h2">Alterar a senha</h2>

        {usuario?.mustChangePassword && (
          <Aviso tipo="info">
            Defina uma senha própria antes de continuar. A senha atual foi criada na instalação e é
            conhecida por quem preparou o servidor.
          </Aviso>
        )}

        <Aviso tipo="erro">{erro}</Aviso>

        <Campo rotulo="Senha atual" obrigatorio>
          <Entrada
            type="password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        <Campo
          rotulo="Nova senha"
          obrigatorio
          dica="Ao menos 12 caracteres, com maiúscula, minúscula e número."
        >
          <Entrada
            type="password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Campo>

        <Campo rotulo="Repita a nova senha" obrigatorio>
          <Entrada
            type="password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>

        <Aviso tipo="info">
          Ao trocar a senha, todas as sessões são encerradas e você precisará entrar novamente.
        </Aviso>

        <Botao type="submit" variante="primario" carregando={enviando}>
          Alterar a senha
        </Botao>
      </form>
    </>
  );
}

export default function PaginaConta() {
  return (
    <MolduraPainel>
      <Conta />
    </MolduraPainel>
  );
}
