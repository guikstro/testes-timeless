import Link from "next/link";
import { Delta } from "@/components/ui/delta";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { formatCentsAsBRL } from "@/lib/currency";
import {
  alterna,
  Conjunto,
  CONJUNTOS,
  conjuntoDe,
  DEFINICAO,
  formataTaxa,
  Metrica,
  METRICAS,
  metricasDoConjunto,
} from "@/lib/campanhas/metricas";
import type { CampanhaComparada, DesempenhoDeCampanha, DesempenhoDeCampanhas } from "./tipos";

/*
  As peças das métricas que a tela de Campanhas e o painel usam juntas: o
  seletor, os cartões de total e as contas deles. Num lugar só, os dois
  lugares não podem mostrar o mesmo número de jeitos diferentes.
*/

export interface Anteriores {
  gastoCentavos: number;
  leads: number;
  vendas: number;
  /** Undefined quando nenhuma campanha do período de comparação trouxe o número. */
  impressoes?: number;
  cliques?: number;
}

export function somaAnteriores(campanhas: CampanhaComparada[]): Anteriores {
  const soma = (valor: (linha: DesempenhoDeCampanha) => number | null) => {
    const conhecidos = campanhas
      .map((linha) => (linha.anterior ? valor(linha.anterior) : null))
      .filter((numero): numero is number => numero !== null);
    return conhecidos.length > 0 ? conhecidos.reduce((total, numero) => total + numero, 0) : undefined;
  };
  return {
    gastoCentavos: soma((linha) => linha.gastoCentavos) ?? 0,
    leads: soma((linha) => linha.leads) ?? 0,
    vendas: soma((linha) => linha.vendas) ?? 0,
    impressoes: soma((linha) => linha.impressoes),
    cliques: soma((linha) => linha.cliques),
  };
}

export const SEM_DADO = "Sem dado";
export const SEM_MEDIDA = "Sem medida";

/** O cartão do total de uma métrica. */
export function resumoDaMetrica(
  metrica: Metrica,
  totais: DesempenhoDeCampanhas["totais"],
  anteriores: Anteriores | null,
  medido: boolean,
): { titulo: string; valor: string; atual?: number; anterior?: number; nota?: string; apagado?: boolean; invertido?: boolean } {
  const titulo = DEFINICAO[metrica].rotulo;
  const dinheiro = (centavos: number | null) => (centavos === null ? SEM_DADO : formatCentsAsBRL(centavos));
  const piso = !totais.entregaCompleta && totais.impressoes !== null ? "No mínimo: falta dado de alguns dias" : undefined;

  switch (metrica) {
    case "impressoes":
      return {
        titulo,
        valor: totais.impressoes === null ? SEM_DADO : totais.impressoes.toLocaleString("pt-BR"),
        atual: totais.impressoes ?? undefined,
        anterior: totais.impressoes === null ? undefined : anteriores?.impressoes,
        apagado: totais.impressoes === null,
        nota: piso,
      };
    case "cliques":
      return {
        titulo,
        valor: totais.cliques === null ? SEM_DADO : totais.cliques.toLocaleString("pt-BR"),
        atual: totais.cliques ?? undefined,
        anterior: totais.cliques === null ? undefined : anteriores?.cliques,
        apagado: totais.cliques === null,
        nota: piso,
      };
    case "cpm":
      return { titulo, valor: dinheiro(totais.cpmCentavos), apagado: totais.cpmCentavos === null, nota: "A cada mil impressões" };
    case "ctr":
      return {
        titulo,
        valor: totais.ctr === null ? SEM_DADO : formataTaxa(totais.ctr),
        apagado: totais.ctr === null,
        nota: "Cliques por impressão",
      };
    case "cpc":
      return { titulo, valor: dinheiro(totais.cpcCentavos), apagado: totais.cpcCentavos === null, nota: "Por clique" };
    case "conversas":
      return {
        titulo,
        valor: totais.conversasNaPlataforma === null ? SEM_DADO : String(totais.conversasNaPlataforma),
        apagado: totais.conversasNaPlataforma === null,
        nota: "O que o Gerenciador de Anúncios conta",
      };
    case "custoPorConversa":
      return {
        titulo,
        valor: dinheiro(totais.custoPorConversaCentavos),
        apagado: totais.custoPorConversaCentavos === null,
      };
    case "leads":
      return {
        titulo,
        valor: medido ? String(totais.leads) : SEM_MEDIDA,
        atual: medido ? totais.leads : undefined,
        anterior: medido ? anteriores?.leads : undefined,
        apagado: !medido,
      };
    case "custoPorLead":
      return {
        titulo,
        valor: !medido
          ? SEM_MEDIDA
          : totais.gastoCentavos <= 0
            ? "Sem gasto"
            : totais.leads === 0
              ? "Nenhum lead"
              : formatCentsAsBRL(Math.round(totais.gastoCentavos / totais.leads)),
        apagado: !medido || totais.gastoCentavos <= 0 || totais.leads === 0,
      };
    case "vendas":
      return {
        titulo,
        valor: medido ? String(totais.vendas) : SEM_MEDIDA,
        atual: medido ? totais.vendas : undefined,
        anterior: medido ? anteriores?.vendas : undefined,
        apagado: !medido,
      };
    case "receita":
      return { titulo, valor: medido ? formatCentsAsBRL(totais.receitaCentavos) : SEM_MEDIDA, apagado: !medido };
    case "retorno":
      return {
        titulo,
        valor: medido ? retorno(totais.receitaCentavos, totais.gastoCentavos, totais.vendas) : SEM_MEDIDA,
        nota: medido && totais.gastoCentavos > 0 ? "Receita dividida pelo investimento" : undefined,
        apagado: !medido,
      };
  }
}

/**
 * A escolha das colunas.
 *
 * Em links, e não em estado do navegador: a escolha vai junto quando o
 * endereço é compartilhado, e a tela continua desenhada no servidor. Os
 * conjuntos prontos resolvem o caso comum num clique; as métricas soltas, o
 * resto.
 */
export function SeletorDeMetricas({
  metricas,
  escolhaManual,
  sugestao,
  href,
}: {
  metricas: Metrica[];
  escolhaManual: boolean;
  sugestao: { conjunto: Conjunto; objetivo: string | null };
  /** O endereço com outra escolha; null volta para a sugestão. Cada tela monta o seu. */
  href: (lista: Metrica[] | null) => string;
}) {

  const conjuntos: Conjunto[] = ["entrega", "conversas", "vendas", "todas"];
  const ativo = escolhaManual ? conjuntoDe(metricas) : "sugeridas";

  return (
    <section aria-label="Métricas da tabela" className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Métricas</p>
        <GrupoDePilulas
          ativo={ativo}
          opcoes={[
            {
              chave: "sugeridas",
              rotulo: sugestao.objetivo ? `Pelo objetivo: ${sugestao.objetivo}` : "Sugeridas",
              href: href(null),
              titulo: sugestao.objetivo
                ? `A maior parte do investimento está em campanhas de ${sugestao.objetivo.toLowerCase()}.`
                : "Sem objetivo informado pela plataforma, ficam as métricas de resultado.",
            },
            ...conjuntos.map((conjunto) => ({
              chave: conjunto,
              rotulo: CONJUNTOS[conjunto].rotulo,
              href: href(metricasDoConjunto(conjunto)),
            })),
          ]}
        />
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label="Escolher as métricas uma a uma">
        {METRICAS.map((metrica) => {
          const ligada = metricas.includes(metrica.chave);
          return (
            <li key={metrica.chave}>
              <Link
                href={href(alterna(metricas, metrica.chave))}
                scroll={false}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-apoio transition-all duration-200 ease-soft active:scale-95 ${
                  ligada
                    ? "bg-accent/15 font-medium text-ink ring-1 ring-inset ring-accent/50"
                    : "border border-line bg-panel text-ink-mute hover:border-ink/20 hover:text-ink"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden
                >
                  {ligada ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
                </svg>
                {metrica.rotulo}
                <span className="sr-only">{ligada ? ", mostrando" : ", escondida"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Retorno escrito, e não só a conta.
 *
 * "0,00x" com nenhuma venda é aritmeticamente certo e ninguém entende; dizer
 * que não houve venda é o mesmo fato em português.
 */
export function retorno(receitaCentavos: number, gastoCentavos: number, vendas: number): string {
  if (gastoCentavos <= 0) return "Sem gasto";
  if (vendas === 0) return "Nenhuma venda";
  return `${(receitaCentavos / gastoCentavos).toFixed(2).replace(".", ",")}x`;
}

export function Resumo({
  titulo,
  valor,
  atual,
  anterior,
  nota,
  apagado = false,
  invertido = false,
}: {
  titulo: string;
  valor: string;
  atual?: number;
  /** Ausente quando não há período de comparação escolhido. */
  anterior?: number;
  nota?: string;
  /** Sem medida: o valor é escrito, mas não pode parecer um número. */
  apagado?: boolean;
  /** Para custo: subir é ruim. */
  invertido?: boolean;
}) {
  const compara = anterior !== undefined && atual !== undefined;

  return (
    <div className="surface p-4">
      <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{titulo}</p>
      <p
        className={`mt-1.5 font-display font-semibold tabular-nums ${
          apagado ? "text-lg text-ink-mute" : "text-xl text-ink"
        }`}
      >
        {valor}
      </p>
      {compara && (
        <div className="mt-1">
          <Delta delta={anterior === 0 ? null : (atual - anterior) / anterior} invertido={invertido} />
        </div>
      )}
      {nota && <p className="mt-1 text-rotulo text-ink-mute">{nota}</p>}
    </div>
  );
}
