"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button, ButtonProps } from "./button";

/**
 * O que se abre por cima da tela: diálogo, gaveta e confirmação.
 *
 * Todos são o `<dialog>` nativo aberto com `showModal()`. É ele que prende o
 * foco dentro, fecha com Esc, deixa o resto da página inerte para o leitor
 * de tela e devolve o foco ao botão que abriu. Refazer isso à mão é onde
 * modais costumam falhar para quem usa teclado.
 */

type Lado = "centro" | "direita" | "baixo";

const POSICAO: Record<Lado, string> = {
  centro: "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl animate-pop-in",
  // Gaveta: a altura toda, encostada à direita. No celular, a largura toda.
  direita: "m-0 ml-auto h-dvh max-h-none w-full max-w-md rounded-none sm:rounded-l-3xl animate-slide-in-right",
  // Folha que sobe de baixo, o jeito natural de um painel no celular.
  baixo: "m-0 mt-auto w-full max-w-none rounded-t-3xl animate-rise-in",
};

function Base({
  aberto,
  aoFechar,
  lado,
  titulo,
  descricao,
  children,
  rodape,
  className,
}: {
  aberto: boolean;
  aoFechar: () => void;
  lado: Lado;
  titulo: ReactNode;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  const idDaDescricao = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  // A página de trás não rola enquanto há algo por cima: rolar o fundo com o
  // modal aberto desorienta e, no celular, some com a barra do navegador.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = antes;
    };
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idDoTitulo}
      aria-describedby={descricao ? idDaDescricao : undefined}
      onClose={aoFechar}
      // Clique fora (no fundo escuro) fecha. O alvo é o próprio `<dialog>`
      // só quando o clique cai fora do conteúdo.
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
      className={cn(
        "border border-line/70 bg-panel p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
        POSICAO[lado],
        className,
      )}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div className="min-w-0">
            <h2 id={idDoTitulo} className="font-display text-destaque font-semibold tracking-tight text-ink">
              {titulo}
            </h2>
            {descricao ? (
              <p id={idDaDescricao} className="mt-1 text-corpo leading-relaxed text-ink-mute">
                {descricao}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="focus-ring -mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div> : null}
        {rodape ? <footer className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-3">{rodape}</footer> : null}
      </div>
    </dialog>
  );
}

type PropsDoDialogo = Omit<Parameters<typeof Base>[0], "lado">;

/** Uma decisão ou um formulário curto que precisa da atenção toda. */
export function Dialog(props: PropsDoDialogo) {
  return <Base lado="centro" {...props} />;
}

/**
 * Painel lateral, para ver ou editar algo sem sair da tela onde se estava,
 * como o detalhe de um lead a partir da lista.
 */
export function Drawer(props: PropsDoDialogo) {
  return <Base lado="direita" {...props} />;
}

/** Painel que sobe de baixo. No celular, ocupa o lugar do que no computador seria uma gaveta. */
export function Sheet(props: PropsDoDialogo) {
  return <Base lado="baixo" {...props} />;
}

/**
 * Confirmar antes de algo que não tem volta fácil: remover, excluir,
 * desconectar. Diz o que vai acontecer com as palavras da ação ("Remover
 * Ana"), e não "Tem certeza?", porque é a consequência que a pessoa precisa
 * ler. O erro, se houver, aparece aqui dentro, sem fechar.
 */
export function ConfirmationDialog({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotuloConfirmar,
  tom = "danger",
  aoConfirmar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  rotuloConfirmar: string;
  tom?: "danger" | "primary";
  /** Devolve `{ erro }` para mostrar sem fechar; qualquer outra coisa fecha. */
  aoConfirmar: () => Promise<{ erro?: string } | void> | { erro?: string } | void;
}) {
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    setPendente(true);
    try {
      const resultado = await aoConfirmar();
      if (resultado && resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      aoFechar();
    } catch {
      setErro("Não foi possível concluir. Tente de novo.");
    } finally {
      setPendente(false);
    }
  }

  return (
    <Dialog
      aberto={aberto}
      aoFechar={() => {
        if (pendente) return;
        setErro(null);
        aoFechar();
      }}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <>
          {/* O foco começa em Cancelar: um Enter apressado não pode remover ninguém. */}
          <Button type="button" variant="ghost" size="sm" onClick={aoFechar} disabled={pendente} autoFocus>
            Cancelar
          </Button>
          <Button type="button" variant={tom === "danger" ? "danger" : "primary"} size="sm" loading={pendente} onClick={confirmar}>
            {rotuloConfirmar}
          </Button>
        </>
      }
    >
      {erro ? (
        <p role="alert" className="text-apoio text-danger">
          {erro}
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * O botão que pede confirmação antes de agir: o par mais comum, num
 * componente só, para ninguém reinventar o "Confirmar / Cancelar" em linha.
 */
export function ConfirmButton({
  children,
  titulo,
  descricao,
  rotuloConfirmar,
  aoConfirmar,
  tom = "danger",
  ...botao
}: Omit<ButtonProps, "onClick"> & {
  titulo: ReactNode;
  descricao?: ReactNode;
  rotuloConfirmar: string;
  tom?: "danger" | "primary";
  aoConfirmar: () => Promise<{ erro?: string } | void> | { erro?: string } | void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" {...botao} onClick={() => setAberto(true)}>
        {children}
      </Button>
      <ConfirmationDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={titulo}
        descricao={descricao}
        rotuloConfirmar={rotuloConfirmar}
        tom={tom}
        aoConfirmar={aoConfirmar}
      />
    </>
  );
}
