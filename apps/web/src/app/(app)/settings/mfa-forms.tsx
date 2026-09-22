"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { BotaoCopiar } from "@/components/ui/copy-button";
import {
  cancelarInscricao,
  confirmarInscricao,
  desativarMfa,
  EstadoDoMfa,
  iniciarInscricao,
  regenerarCodigos,
} from "./mfa-actions";
import { desenhaQr } from "./mfa-qr";

const inicial: EstadoDoMfa = {};

const CAMPO =
  "h-11 w-full rounded-xl border border-line bg-panel px-3 text-corpo text-ink transition-colors " +
  "placeholder:text-ink-mute/60 focus:border-accent focus:outline-none";
const ROTULO = "mb-1.5 block text-apoio font-medium uppercase tracking-[0.12em] text-ink-mute";
const BOTAO =
  "h-11 rounded-xl bg-accent px-5 text-corpo font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60";

interface Situacao {
  ativo: boolean;
  pendente: boolean;
  codigosRestantes: number;
  exigido: boolean;
}

/**
 * A verificação em duas etapas, do ponto de vista de quem configura.
 *
 * A tela tem três estados e eles não se misturam: desligado convida a ligar,
 * configurando mostra o QR, e ligado mostra o que fazer com os códigos.
 * Mostrar tudo de uma vez faria a pessoa procurar em qual pedaço ela está.
 */
export function SegundaEtapa({ situacao }: { situacao: Situacao }) {
  const [qr, setQr] = useState<{ imagem: string; segredo: string } | null>(null);
  const [erroInicio, setErroInicio] = useState<string | null>(null);
  const [iniciando, iniciar] = useTransition();

  function comecar() {
    setErroInicio(null);
    iniciar(async () => {
      const resposta = await iniciarInscricao();
      if ("erro" in resposta) return setErroInicio(resposta.erro);
      setQr({ imagem: await desenhaQr(resposta.endereco), segredo: resposta.segredo });
    });
  }

  if (situacao.ativo) {
    return <Ativa situacao={situacao} />;
  }

  if (qr) {
    return <Configurando qr={qr} aoCancelar={() => setQr(null)} />;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-corpo leading-relaxed text-ink-mute">
        Com ela ligada, entrar passa a exigir um código de seis dígitos do seu aplicativo autenticador, além da
        senha. Quem descobrir sua senha ainda não entra.
      </p>

      {/*
        Operador da plataforma é obrigado, e a tela diz isso em vez de deixar a
        pessoa descobrir tomando 403 na administração.
      */}
      {situacao.exigido ? (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-apoio leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Sua conta opera a plataforma, e a administração exige esta verificação. O restante do sistema continua
          acessível enquanto você não configura.
        </p>
      ) : null}

      {situacao.pendente ? (
        <p className="text-apoio text-ink-mute">
          Há uma configuração começada e não concluída. Começar de novo gera um código novo e descarta o anterior.
        </p>
      ) : null}

      {erroInicio ? <p className="text-apoio text-red-700 dark:text-red-300">{erroInicio}</p> : null}

      <button type="button" onClick={comecar} disabled={iniciando} className={BOTAO}>
        {iniciando ? "Preparando" : "Ativar verificação em duas etapas"}
      </button>
    </div>
  );
}

function Configurando({
  qr,
  aoCancelar,
}: {
  qr: { imagem: string; segredo: string };
  aoCancelar: () => void;
}) {
  const [estado, acao, enviando] = useActionState(confirmarInscricao, inicial);
  const [, cancelar] = useTransition();

  if (estado.codigos) {
    return <CodigosEntregues codigos={estado.codigos} />;
  }

  return (
    <div className="space-y-5">
      <ol className="max-w-prose space-y-1.5 text-corpo leading-relaxed text-ink-soft">
        <li>1. Abra seu aplicativo autenticador.</li>
        <li>2. Aponte a câmera para o código abaixo.</li>
        <li>3. Digite aqui os seis dígitos que ele mostrar.</li>
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        {/* Fundo branco fixo: a câmera precisa de contraste real, e um QR que
            acompanha o tema escuro é um QR que não lê. */}
        <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
          <Image src={qr.imagem} alt="Código QR da verificação em duas etapas" width={220} height={220} unoptimized />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className={ROTULO}>Sem câmera? Digite esta chave</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-panel-soft px-3 py-2 font-mono text-apoio text-ink">
                {qr.segredo}
              </code>
              <BotaoCopiar texto={qr.segredo} rotulo="Copiar a chave" />
            </div>
          </div>

          <form action={acao} className="space-y-3">
            <div>
              <label htmlFor="mfa-codigo" className={ROTULO}>
                Código do aplicativo
              </label>
              <input
                id="mfa-codigo"
                name="codigo"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={7}
                className={`${CAMPO} font-mono tracking-[0.3em]`}
              />
            </div>

            {estado.erro ? <p className="text-apoio text-red-700 dark:text-red-300">{estado.erro}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={enviando} className={BOTAO}>
                {enviando ? "Confirmando" : "Confirmar e ativar"}
              </button>
              <button
                type="button"
                onClick={() => cancelar(async () => {
                  await cancelarInscricao();
                  aoCancelar();
                })}
                className="focus-ring h-11 rounded-xl px-4 text-corpo text-ink-mute transition-colors hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Os códigos de recuperação, na única vez em que existem em texto.
 *
 * A tela insiste nisso porque é verdade: eles não são recuperáveis. Quem
 * fechar sem guardar precisa gerar outros, e quem perder o telefone sem tê-los
 * perde a conta.
 */
function CodigosEntregues({ codigos }: { codigos: string[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/40">
        <p className="text-corpo font-medium text-amber-900 dark:text-amber-100">
          Guarde estes códigos agora. Eles não aparecem de novo.
        </p>
        <p className="mt-1 max-w-prose text-apoio leading-relaxed text-amber-800 dark:text-amber-200/90">
          Cada um serve uma vez, para entrar quando você não tiver o telefone em mãos. Sem eles, perder o aparelho
          significa perder o acesso à conta.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {codigos.map((codigo) => (
          <li
            key={codigo}
            className="rounded-xl border border-line bg-panel-soft px-3 py-2 text-center font-mono text-corpo tabular-nums text-ink"
          >
            {codigo}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 text-apoio text-ink-mute">
        <BotaoCopiar texto={codigos.join("\n")} rotulo="Copiar todos os códigos" />
        <span>Copiar todos</span>
      </div>
    </div>
  );
}

function Ativa({ situacao }: { situacao: Situacao }) {
  const [regenerando, setRegenerando] = useState(false);
  const [desativando, setDesativando] = useState(false);

  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-corpo text-ink">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
          Ativa
        </span>
        <span className="text-ink-mute">
          {situacao.codigosRestantes}{" "}
          {situacao.codigosRestantes === 1 ? "código de recuperação restante" : "códigos de recuperação restantes"}
        </span>
      </p>

      {/*
        Aviso antes de acabar, e não quando acabou: com zero, a pessoa já está
        dependendo só do telefone e pode nem perceber.
      */}
      {situacao.codigosRestantes <= 3 ? (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-apoio leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Restam poucos códigos. Gere um lote novo enquanto ainda tem um para confirmar a operação.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setRegenerando((v) => !v); setDesativando(false); }}
          className="focus-ring h-11 rounded-xl border border-line px-4 text-corpo text-ink transition-colors hover:bg-panel-soft"
        >
          Gerar códigos novos
        </button>
        <button
          type="button"
          onClick={() => { setDesativando((v) => !v); setRegenerando(false); }}
          className="focus-ring h-11 rounded-xl px-4 text-corpo text-ink-mute transition-colors hover:text-ink"
        >
          Desativar
        </button>
      </div>

      {regenerando ? <FormularioDeRegeneracao /> : null}
      {desativando ? <FormularioDeDesativacao /> : null}
    </div>
  );
}

function FormularioDeRegeneracao() {
  const [estado, acao, enviando] = useActionState(regenerarCodigos, inicial);

  if (estado.codigos) return <CodigosEntregues codigos={estado.codigos} />;

  return (
    <form action={acao} className="max-w-md space-y-3 border-t border-line/70 pt-5">
      <p className="max-w-prose text-apoio leading-relaxed text-ink-mute">
        O lote novo invalida todos os códigos anteriores. Quem pede códigos novos é porque os antigos podem ter sido
        vistos, e manter os dois valendo conservaria justamente esse risco.
      </p>
      <div>
        <label htmlFor="regen-codigo" className={ROTULO}>
          Confirme com o código do aplicativo
        </label>
        <input id="regen-codigo" name="codigo" required inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className={`${CAMPO} font-mono tracking-[0.3em]`} />
      </div>
      {estado.erro ? <p className="text-apoio text-red-700 dark:text-red-300">{estado.erro}</p> : null}
      <button type="submit" disabled={enviando} className={BOTAO}>
        {enviando ? "Gerando" : "Gerar lote novo"}
      </button>
    </form>
  );
}

function FormularioDeDesativacao() {
  const [estado, acao, enviando] = useActionState(desativarMfa, inicial);

  return (
    <form action={acao} className="max-w-md space-y-3 border-t border-line/70 pt-5">
      <p className="max-w-prose text-apoio leading-relaxed text-ink-mute">
        Desativar pede a senha além do código. Só o código bastaria para quem estivesse com esta sessão aberta, e só
        a senha bastaria para quem a tivesse roubado.
      </p>
      <div>
        <label htmlFor="off-senha" className={ROTULO}>
          Sua senha
        </label>
        <input id="off-senha" name="senha" type="password" required autoComplete="current-password" className={CAMPO} />
      </div>
      <div>
        <label htmlFor="off-codigo" className={ROTULO}>
          Código do aplicativo ou de recuperação
        </label>
        <input id="off-codigo" name="codigo" required autoComplete="one-time-code" placeholder="000000" className={`${CAMPO} font-mono`} />
      </div>
      {estado.erro ? <p className="text-apoio text-red-700 dark:text-red-300">{estado.erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="h-11 rounded-xl bg-red-600 px-5 text-corpo font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Desativando" : "Desativar verificação"}
      </button>
    </form>
  );
}
