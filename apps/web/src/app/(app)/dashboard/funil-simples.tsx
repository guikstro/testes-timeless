/**
 * O funil em barras, lido de cima para baixo.
 *
 * Já tentei aqui um funil em discos e um fluxo com ramificações. Os dois eram
 * bonitos e nenhum dos dois foi entendido sem explicação, o que num painel de
 * trabalho é o mesmo que não funcionar. Barra que encurta e uma frase dizendo
 * quantos saíram no meio do caminho não precisa de legenda.
 *
 * O comprimento é sempre proporcional à primeira etapa, e não à maior: assim
 * a última barra mostra de verdade o quanto sobrou de quem chegou.
 */
export interface EtapaDoFunil {
  chave: string;
  rotulo: string;
  valor: number;
  /** Como chamar quem não passou daqui para a etapa seguinte. */
  saida?: string;
  /**
   * O que fez quem chegou aqui vindo da etapa anterior ("foram contatados").
   * Com isto, a linha entre as barras diz a conversão da passagem, e não só
   * quantos saíram.
   */
  chegada?: string;
  /** Quem parou nesta etapa: os que ainda podem andar e os que foram perdidos. */
  parados?: { abertos: number; perdidos: number };
}

export function FunilSimples({ etapas }: { etapas: EtapaDoFunil[] }) {
  const inicial = etapas[0]?.valor ?? 0;
  if (inicial === 0) return null;

  return (
    <ol className="space-y-1">
      {etapas.map((etapa, i) => {
        const proporcao = etapa.valor / inicial;
        const anterior = i > 0 ? etapas[i - 1] : null;

        return (
          <li key={etapa.chave}>
            {/* A passagem vem antes da etapa, no espaço entre as duas barras: é
                literalmente o que acontece no caminho de uma para a outra. */}
            {anterior ? <Passagem anterior={anterior} etapa={etapa} /> : null}

            <div className="flex items-baseline justify-between gap-4">
              <p className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{etapa.rotulo}</p>
              <p className="text-apoio tabular-nums text-ink-mute">
                {i === 0 ? "todos que chegaram" : `${porCento(proporcao)} de quem chegou`}
              </p>
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              {/* Trilho de fundo com a largura total: sem ele, a barra curta
                  não teria contra o que ser comparada. */}
              <div className="h-9 min-w-0 flex-1 overflow-hidden rounded-lg bg-panel-soft">
                <div
                  className="h-full rounded-lg bg-accent transition-[width] duration-500 ease-soft"
                  style={{ width: `${Math.max(proporcao * 100, 1.5)}%` }}
                />
              </div>
              <p className="w-20 shrink-0 text-right font-display text-destaque font-semibold tabular-nums text-ink">
                {etapa.valor.toLocaleString("pt-BR")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Passagem({ anterior, etapa }: { anterior: EtapaDoFunil; etapa: EtapaDoFunil }) {
  const perda = anterior.valor - etapa.valor;

  // Sem ninguém na etapa anterior não há passagem para descrever, e sem
  // perda e sem conversão a pedir, a linha só ocuparia espaço.
  if (anterior.valor === 0) return null;
  if (!etapa.chegada && perda <= 0) return null;

  return (
    <p className="flex items-start gap-2 py-2 pl-6 text-apoio leading-relaxed text-ink-mute">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-[3px] h-3.5 w-3.5 shrink-0"
        aria-hidden
      >
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
      {etapa.chegada ? (
        <span>
          <span className="font-semibold tabular-nums text-ink-soft">{porCento(etapa.valor / anterior.valor)}</span>{" "}
          {etapa.chegada}
          {perda > 0 ? <>. {ficaram(perda, anterior.parados)}</> : "."}
        </span>
      ) : (
        <span>
          <span className="font-semibold text-ink-soft">{perda.toLocaleString("pt-BR")}</span>{" "}
          {anterior.saida ?? "saíram"}{" "}
          <span className="tabular-nums">({porCento(perda / anterior.valor)})</span>
        </span>
      )}
    </p>
  );
}

/**
 * Quem ficou na etapa anterior, em palavras.
 *
 * "Ficaram 12" sozinho deixa a pergunta que importa sem resposta: esses doze
 * ainda podem comprar, ou já foram? Em aberto e perdido pedem ações
 * diferentes (cobrar a equipe, ou rever a oferta), então a frase separa os dois.
 */
export function ficaram(quantos: number, parados?: { abertos: number; perdidos: number }): string {
  const verbo = quantos === 1 ? "Ficou" : "Ficaram";
  const total = quantos.toLocaleString("pt-BR");
  if (!parados) return `${verbo} ${total}.`;

  const { abertos, perdidos } = parados;
  const perdidosEmTexto = `${perdidos.toLocaleString("pt-BR")} ${perdidos === 1 ? "perdido" : "perdidos"}`;
  if (abertos > 0 && perdidos > 0) return `${verbo} ${total}: ${abertos.toLocaleString("pt-BR")} em aberto e ${perdidosEmTexto}.`;
  if (perdidos > 0) return quantos === 1 ? `${verbo} 1, perdido.` : `${verbo} ${total}, todos perdidos.`;
  if (abertos > 0) return quantos === 1 ? `${verbo} 1, em aberto.` : `${verbo} ${total}, todos em aberto.`;
  return `${verbo} ${total}.`;
}

/**
 * Porcentagem sem arredondar para uma mentira.
 *
 * Um lead de trezentos arredonda para 0%, que diz "ninguém"; e 299 de
 * trezentos arredonda para 100%, que diz "todo mundo". Nos dois casos a
 * frase escrita afirma o contrário do que aconteceu.
 */
export function porCento(fracao: number): string {
  if (fracao > 0 && fracao < 0.01) return "menos de 1%";
  const inteiro = Math.round(fracao * 100);
  if (fracao < 1 && inteiro === 100) return "99%";
  return `${inteiro}%`;
}
