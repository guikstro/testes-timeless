"use client";

import { InputHTMLAttributes, ReactNode, forwardRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CAMPO_SEM_LARGURA } from "./input";
import { GrupoDePilulas } from "./pill-group";

/**
 * Datas, sempre como dia civil ("2026-09-28"), que é como o produto guarda
 * e compara períodos. O seletor é o nativo: no celular abre o calendário do
 * próprio sistema, que a pessoa já sabe usar, e no teclado aceita digitar.
 */
export const DatePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  function DatePicker({ className, ...props }, ref) {
    return <input ref={ref} type="date" className={cn(CAMPO_SEM_LARGURA, "tnum h-10 w-[10.5rem]", className)} {...props} />;
  },
);

export interface Intervalo {
  de: string;
  ate: string;
}

export interface AtalhoDeIntervalo extends Intervalo {
  rotulo: ReactNode;
}

/**
 * De e até, com o fim nunca antes do começo: cada campo limita o outro
 * (`min`/`max`), então o calendário nem oferece a data que não faz sentido.
 *
 * Funciona dentro de um formulário comum (`nomeDe`/`nomeAte` viram os campos
 * enviados) ou controlado (`aoMudar`). Atalhos opcionais, como "Este mês",
 * para o caso mais comum não precisar de quatro cliques.
 */
export function DateRangePicker({
  de: deInicial = "",
  ate: ateInicial = "",
  nomeDe = "de",
  nomeAte = "ate",
  maximo,
  atalhos,
  aoMudar,
  obrigatorio = false,
  className,
}: {
  de?: string;
  ate?: string;
  nomeDe?: string;
  nomeAte?: string;
  /** O último dia que se pode escolher, como hoje. */
  maximo?: string;
  atalhos?: AtalhoDeIntervalo[];
  aoMudar?: (intervalo: Intervalo) => void;
  obrigatorio?: boolean;
  className?: string;
}) {
  const [intervalo, setIntervalo] = useState<Intervalo>({ de: deInicial, ate: ateInicial });

  function muda(novo: Intervalo) {
    setIntervalo(novo);
    aoMudar?.(novo);
  }

  const atalhoAtivo = atalhos?.find((a) => a.de === intervalo.de && a.ate === intervalo.ate);

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {atalhos?.length ? (
        <div>
        <GrupoDePilulas
          ativo={atalhoAtivo ? `${atalhoAtivo.de}_${atalhoAtivo.ate}` : null}
          opcoes={atalhos.map((a) => ({
            chave: `${a.de}_${a.ate}`,
            rotulo: a.rotulo,
            aoClicar: () => muda({ de: a.de, ate: a.ate }),
          }))}
        />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          name={nomeDe}
          aria-label="De"
          value={intervalo.de}
          max={intervalo.ate || maximo}
          required={obrigatorio}
          onChange={(e) => muda({ ...intervalo, de: e.target.value })}
        />
        <span className="text-apoio text-ink-mute">até</span>
        <DatePicker
          name={nomeAte}
          aria-label="Até"
          value={intervalo.ate}
          min={intervalo.de || undefined}
          max={maximo}
          required={obrigatorio}
          onChange={(e) => muda({ ...intervalo, ate: e.target.value })}
        />
      </div>
    </div>
  );
}
