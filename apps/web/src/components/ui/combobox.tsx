"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CAMPO } from "./input";

/**
 * Escolher uma opção digitando, quando a lista é longa demais para um
 * `Select`: clientes, campanhas, pessoas.
 *
 * Segue o padrão ARIA de combobox: o foco fica no campo, as setas andam pela
 * lista (`aria-activedescendant`), Enter escolhe, Esc fecha e devolve o
 * texto escolhido. A busca ignora acento e maiúscula, porque ninguém digita
 * "Conceição" com cedilha para achar a Conceição.
 */
export interface OpcaoDoCombobox {
  valor: string;
  rotulo: string;
  descricao?: string;
}

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Combobox({
  opcoes,
  valor,
  aoMudar,
  name,
  id,
  placeholder = "Digite para buscar",
  vazio = "Nada encontrado",
  className,
  ...aria
}: {
  opcoes: OpcaoDoCombobox[];
  valor: string | null;
  aoMudar: (valor: string) => void;
  /** Com `name`, o valor escolhido vai junto no envio de um formulário comum. */
  name?: string;
  id?: string;
  placeholder?: string;
  vazio?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}) {
  const base = useId();
  const idDaLista = `${base}-lista`;
  const escolhida = opcoes.find((o) => o.valor === valor) ?? null;
  const [texto, setTexto] = useState(escolhida?.rotulo ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  // Trocou de fora (outro controle, um reset): o texto acompanha.
  useEffect(() => {
    setTexto(escolhida?.rotulo ?? "");
  }, [escolhida?.rotulo]);

  const filtradas = useMemo(() => {
    const busca = semAcento(texto.trim());
    if (!busca || busca === semAcento(escolhida?.rotulo ?? "")) return opcoes;
    return opcoes.filter((o) => semAcento(`${o.rotulo} ${o.descricao ?? ""}`).includes(busca));
  }, [texto, opcoes, escolhida?.rotulo]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function escolhe(opcao: OpcaoDoCombobox) {
    aoMudar(opcao.valor);
    setTexto(opcao.rotulo);
    setAberto(false);
  }

  return (
    <div className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={valor ?? ""} /> : null}
      <input
        id={id}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && filtradas[ativo] ? `${base}-opcao-${ativo}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={() => setAberto(true)}
        // Espera o clique numa opção chegar antes de fechar.
        onBlur={() => setTimeout(() => {
          setAberto(false);
          setTexto(escolhida?.rotulo ?? "");
        }, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((i) => Math.min(i + 1, filtradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && aberto && filtradas[ativo]) {
            e.preventDefault();
            escolhe(filtradas[ativo]);
          } else if (e.key === "Escape") {
            setAberto(false);
            setTexto(escolhida?.rotulo ?? "");
          }
        }}
        className={cn(CAMPO, "h-10 pr-9")}
        {...aria}
      />
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
        aria-hidden
      >
        <path d="m6 8 4 4 4-4" />
      </svg>

      {aberto ? (
        <ul
          ref={lista}
          id={idDaLista}
          role="listbox"
          className="animate-pop-in absolute z-40 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-line/70 bg-panel p-1 shadow-pop"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-apoio text-ink-mute">{vazio}</li>
          ) : (
            filtradas.map((opcao, i) => (
              <li
                key={opcao.valor}
                id={`${base}-opcao-${i}`}
                data-indice={i}
                role="option"
                aria-selected={opcao.valor === valor}
                // `mousedown` e não `click`: o clique chegaria depois do blur do campo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolhe(opcao);
                }}
                onMouseEnter={() => setAtivo(i)}
                className={cn(
                  "flex cursor-pointer flex-col rounded-lg px-3 py-2 text-corpo",
                  i === ativo ? "bg-ink/[0.06]" : null,
                  opcao.valor === valor ? "font-medium text-ink" : "text-ink-soft",
                )}
              >
                {opcao.rotulo}
                {opcao.descricao ? <span className="text-apoio text-ink-mute">{opcao.descricao}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
