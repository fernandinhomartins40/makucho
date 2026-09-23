'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErroApi, painel } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina, rotuloPapel } from '@/components/painel/moldura-painel';
import { Aviso, Botao, Campo, Entrada } from '@/components/painel/ui';

/**
 * Regras do senhaSchema de @makucho/validation, repetidas aqui para dar
 * retorno enquanto a pessoa digita. A API continua sendo quem decide.
 */
const REGRAS: Array<{ rotulo: string; ok: (senha: string) => boolean }> = [
  { rotulo: 'Ao menos 10 caracteres', ok: (s) => s.length >= 10 },
  { rotulo: 'Uma letra maiúscula', ok: (s) => /[A-Z]/.test(s) },
  { rotulo: 'Uma letra minúscula', ok: (s) => /[a-z]/.test(s) },
  { rotulo: 'Um número', ok: (s) => /[0-9]/.test(s) },
];

function EntradaSenha({
  valor,
  aoMudar,
  autoComplete,
  invalido,
  descricao,
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  autoComplete: string;
  invalido?: boolean;
  descricao?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="pn-senha">
      <Entrada
        type={visivel ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalido || undefined}
        aria-describedby={descricao}
        required
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar a senha' : 'Mostrar a senha'}
        aria-pressed={visivel}
      >
        {visivel ? 'ocultar' : 'mostrar'}
      </button>
    </div>
  );
}

function Conta() {
  const { usuario, sair } = useSessao();
  const router = useRouter();

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const regras = REGRAS.map((r) => ({ ...r, cumprida: r.ok(nova) }));
  const regrasOk = regras.every((r) => r.cumprida);
  const diferenteDaAtual = nova.length > 0 && nova !== atual;
  const coincidem = repetir.length > 0 && nova === repetir;
  const podeEnviar = atual.length > 0 && regrasOk && diferenteDaAtual && coincidem;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setErrosCampo({});
    if (!podeEnviar) return;

    setEnviando(true);
    try {
      await painel.alterarSenha(atual, nova, repetir);
      // O backend revoga todas as sessoes: e preciso entrar de novo.
      await sair();
      router.replace('/painel/entrar?senha=alterada');
    } catch (e) {
      if (e instanceof ErroApi) {
        setErro(e.message);
        setErrosCampo(e.fields ?? {});
      } else {
        setErro('Não foi possível alterar a senha.');
      }
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

      <form className="pn-bloco pn-estreito" onSubmit={enviar} noValidate>
        <h2 className="pn-bloco-h2">Alterar a senha</h2>

        {usuario?.mustChangePassword && (
          <Aviso tipo="info">
            Defina uma senha própria antes de continuar. A senha atual foi criada na instalação e é
            conhecida por quem preparou o servidor.
          </Aviso>
        )}

        <Aviso tipo="erro">{erro}</Aviso>

        <Campo rotulo="Senha atual" obrigatorio erro={errosCampo.currentPassword}>
          <EntradaSenha
            valor={atual}
            aoMudar={setAtual}
            autoComplete="current-password"
            invalido={Boolean(errosCampo.currentPassword)}
          />
        </Campo>

        <Campo rotulo="Nova senha" obrigatorio erro={errosCampo.newPassword}>
          <EntradaSenha
            valor={nova}
            aoMudar={setNova}
            autoComplete="new-password"
            invalido={nova.length > 0 && (!regrasOk || !diferenteDaAtual)}
            descricao="regras-senha"
          />
        </Campo>

        <ul className="pn-regras" id="regras-senha" aria-live="polite">
          {regras.map((r) => (
            <li key={r.rotulo} className={r.cumprida ? 'ok' : undefined}>
              <span aria-hidden="true">{r.cumprida ? '✓' : '○'}</span>
              {r.rotulo}
              <span className="so-leitor-de-tela">{r.cumprida ? ' (cumprida)' : ' (pendente)'}</span>
            </li>
          ))}
          {nova.length > 0 && atual.length > 0 && (
            <li className={diferenteDaAtual ? 'ok' : 'falha'}>
              <span aria-hidden="true">{diferenteDaAtual ? '✓' : '✕'}</span>
              Diferente da senha atual
            </li>
          )}
        </ul>

        <Campo rotulo="Repita a nova senha" obrigatorio erro={errosCampo.confirmPassword}>
          <EntradaSenha
            valor={repetir}
            aoMudar={setRepetir}
            autoComplete="new-password"
            invalido={repetir.length > 0 && !coincidem}
            descricao="confere-senha"
          />
        </Campo>

        {repetir.length > 0 && (
          <p
            id="confere-senha"
            className={`pn-confere ${coincidem ? 'ok' : 'falha'}`}
            aria-live="polite"
          >
            {coincidem ? '✓ As senhas coincidem' : '✕ As senhas não coincidem'}
          </p>
        )}

        <Aviso tipo="info">
          Ao trocar a senha, todas as sessões são encerradas e você precisará entrar novamente.
        </Aviso>

        <Botao type="submit" variante="primario" carregando={enviando} disabled={!podeEnviar}>
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
