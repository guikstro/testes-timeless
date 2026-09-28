import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tabela de dados.
 *
 * Números alinhados à direita e com algarismos de mesma largura (`tnum`),
 * para comparar de cima para baixo sem o olho pular. Cabeçalho em rótulo
 * pequeno, porque quem manda é o dado.
 *
 * No celular, a tabela larga não vira rolagem para o lado: cada linha vira um
 * bloco com "rótulo: valor", que é como uma tela estreita se lê. Tabela que
 * cabe no celular (duas ou três colunas) pode manter a forma com
 * `empilharNoCelular={false}`.
 */
export interface Coluna<T> {
  chave: string;
  titulo: ReactNode;
  celula: (linha: T) => ReactNode;
  /** Números e dinheiro vão à direita. */
  alinhar?: "esquerda" | "direita";
  /** A coluna que dá nome à linha: no celular vira o título do bloco. */
  principal?: boolean;
  className?: string;
}

export function DataTable<T>({
  colunas,
  linhas,
  chaveDaLinha,
  vazio,
  rodape,
  empilharNoCelular = true,
  legenda,
  className,
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  chaveDaLinha: (linha: T) => string;
  /** O que mostrar sem linhas; normalmente um `EmptyState`. */
  vazio?: ReactNode;
  /** Uma linha de total, por exemplo. Mesmas colunas. */
  rodape?: ReactNode;
  empilharNoCelular?: boolean;
  /** Descrição da tabela para o leitor de tela. */
  legenda?: string;
  className?: string;
}) {
  if (linhas.length === 0 && vazio) return <>{vazio}</>;

  const principal = colunas.find((c) => c.principal) ?? colunas[0];
  const direita = (c: Coluna<T>) => c.alinhar === "direita";

  return (
    <div className={className}>
      <div className={cn("overflow-x-auto", empilharNoCelular && "hidden sm:block")}>
        <table className="w-full border-collapse text-left text-corpo">
          {legenda ? <caption className="sr-only">{legenda}</caption> : null}
          <thead>
            <tr className="border-b border-line/70">
              {colunas.map((coluna) => (
                <th
                  key={coluna.chave}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap py-2 pr-4 text-rotulo font-semibold uppercase tracking-[0.08em] text-ink-mute last:pr-0",
                    direita(coluna) && "text-right",
                    coluna.className,
                  )}
                >
                  {coluna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={chaveDaLinha(linha)} className="border-b border-line/50 transition-colors last:border-0 hover:bg-panel-soft/50">
                {colunas.map((coluna) => (
                  <td
                    key={coluna.chave}
                    className={cn(
                      "py-2.5 pr-4 align-middle text-ink-soft last:pr-0",
                      direita(coluna) && "tnum text-right",
                      coluna === principal && "text-ink",
                      coluna.className,
                    )}
                  >
                    {coluna.celula(linha)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {rodape ? <tfoot className="border-t border-line/70 font-medium text-ink">{rodape}</tfoot> : null}
        </table>
      </div>

      {empilharNoCelular ? (
        <ul className="divide-y divide-line/60 sm:hidden">
          {linhas.map((linha) => (
            <li key={chaveDaLinha(linha)} className="py-3">
              <p className="text-corpo font-medium text-ink">{principal.celula(linha)}</p>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                {colunas
                  .filter((coluna) => coluna !== principal)
                  .map((coluna) => (
                    <div key={coluna.chave} className="flex min-w-0 flex-col">
                      <dt className="text-rotulo uppercase tracking-[0.08em] text-ink-mute">{coluna.titulo}</dt>
                      <dd className={cn("text-apoio text-ink-soft", direita(coluna) && "tnum")}>{coluna.celula(linha)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
