import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/skeleton";
import { formataDia } from "@/lib/periodo";
import { StatCard } from "./stat-card";
import type { InsightsDaPagina } from "./tipos";

/**
 * Os números da Página do Facebook, como a tela de Insights da Meta mostra.
 *
 * Cada cartão traz o número do período, a variação contra o período anterior
 * do mesmo tamanho e a curva dia a dia, que é o que a Meta mostra e o que
 * quem anuncia já sabe ler. Número que a Meta não mandou aparece como "Sem
 * dado", nunca como zero.
 */
export function AbaPagina({ dados, dias }: { dados: InsightsDaPagina; dias: number }) {
  if (!dados.pagina) {
    return (
      <div className="surface">
        <EmptyState
          title="Nenhuma Página escolhida"
          description="Escolha a Página do Facebook em Integrações, Meta Ads, para ver aqui visualizações, visitas, interações, seguidores e vídeos."
          action={
            <Link href="/integrations/meta" className="focus-ring text-corpo font-medium text-ink underline underline-offset-2">
              Escolher a Página
            </Link>
          }
        />
      </div>
    );
  }

  const { atual, comparacao, porDia, visualizadores } = dados;
  const serie = (valor: (dia: InsightsDaPagina["porDia"][number]) => number | null) => porDia.map((dia) => valor(dia) ?? 0);
  const variacao = (agora: number | null, antes: number | null) =>
    agora === null || antes === null ? undefined : antes === 0 ? null : (agora - antes) / antes;

  // A Meta não dá pessoas únicas de um período qualquer: vale a janela que ela fecha, com a data.
  const unicos = dias <= 7 ? visualizadores.semana : visualizadores.mes;
  const notaDosUnicos = unicos
    ? `${unicos.valor.toLocaleString("pt-BR")} pessoas nos ${dias <= 7 ? "7" : "28"} dias até ${formataDia(unicos.ate)}`
    : undefined;

  return (
    <div className="space-y-5">
      {dados.pagina.erro ? (
        <Alert tom="warning" titulo="A última leitura da Página não deu certo">
          {dados.pagina.erro}{" "}
          <Link href="/integrations/meta" className="underline">
            Ver em Integrações
          </Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cartao
          rotulo="Visualizações"
          numero={atual.visualizacoes}
          delta={variacao(atual.visualizacoes, comparacao.visualizacoes)}
          anterior={comparacao.visualizacoes}
          serie={serie((dia) => dia.visualizacoes)}
          nota={notaDosUnicos}
        />
        <Cartao
          rotulo="Visitas à Página"
          numero={atual.visitas}
          delta={variacao(atual.visitas, comparacao.visitas)}
          anterior={comparacao.visitas}
          serie={serie((dia) => dia.visitas)}
        />
        <Cartao
          rotulo="Interações"
          numero={atual.interacoes}
          delta={variacao(atual.interacoes, comparacao.interacoes)}
          anterior={comparacao.interacoes}
          serie={serie((dia) => dia.interacoes)}
          nota="Com os posts da Página"
        />
        <Cartao
          rotulo="Novos seguidores"
          numero={atual.novosSeguidores}
          delta={variacao(atual.novosSeguidores, comparacao.novosSeguidores)}
          anterior={comparacao.novosSeguidores}
          serie={serie((dia) => dia.novosSeguidores)}
          nota={
            atual.deixaramDeSeguir !== null && atual.seguidoresLiquidos !== null
              ? `${atual.deixaramDeSeguir.toLocaleString("pt-BR")} deixaram de seguir, saldo de ${saldo(atual.seguidoresLiquidos)}`
              : undefined
          }
        />
        <Cartao
          rotulo="Seguidores"
          numero={atual.seguidores}
          nota="Total no último dia lido do período"
        />
        <Cartao
          rotulo="Vídeos"
          numero={atual.videos}
          delta={variacao(atual.videos, comparacao.videos)}
          anterior={comparacao.videos}
          nota={
            atual.tempoDeVideoSegundos !== null
              ? `Assistidos por 3 segundos ou mais, ${tempoDeVideo(atual.tempoDeVideoSegundos)} no total`
              : "Assistidos por 3 segundos ou mais"
          }
        />
      </div>

      <p className="text-apoio leading-relaxed text-ink-mute">
        Números da tela de Insights da Meta, lidos de hora em hora. A Meta ainda acerta os dos últimos dias, então eles
        podem mudar um pouco na leitura seguinte.
      </p>
    </div>
  );
}

/** O cartão de métrica, ou "Sem dado" quando a Meta não mandou o número. */
function Cartao({
  rotulo,
  numero,
  delta,
  anterior,
  serie,
  nota,
}: {
  rotulo: string;
  numero: number | null;
  delta?: number | null;
  anterior?: number | null;
  serie?: number[];
  nota?: string;
}) {
  if (numero === null) {
    return (
      <div className="surface p-4">
        <p className="text-rotulo font-medium uppercase tracking-[0.1em] text-ink-mute">{rotulo}</p>
        <p className="mt-1.5 text-lg font-semibold text-ink-mute">Sem dado</p>
        <p className="mt-1 text-rotulo text-ink-mute">A Meta não mandou este número para o período.</p>
      </div>
    );
  }
  return (
    <StatCard
      rotulo={rotulo}
      numero={numero}
      delta={delta}
      anterior={anterior ?? undefined}
      serie={serie}
      nota={nota}
    />
  );
}

function saldo(liquidos: number): string {
  return liquidos > 0 ? `+${liquidos.toLocaleString("pt-BR")}` : liquidos.toLocaleString("pt-BR");
}

/** Tempo de vídeo como se fala: 13 min 23 s, 2 h 5 min. */
export function tempoDeVideo(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min ${segundos % 60} s`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${minutos % 60} min`;
}
