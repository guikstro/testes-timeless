import { apiFetch } from "@/lib/api-client";
import { montaBlocoDeDados } from "@/lib/relatorio/dados";
import { montaPrompt } from "@/lib/relatorio/prompt";
import { RelatorioView } from "./relatorio-view";
import { periodoValido } from "./periodos";
import { DadosDoRelatorio } from "./relatorio-impresso";

interface Overview {
  period: { days: number; from: string; to: string };
  totals: {
    leads: number;
    disqualified: number;
    qualified: number;
    meetings: number;
    won: number;
    revenueCents: number;
  };
  comparacao: {
    leads: { anterior: number };
    qualified: { anterior: number };
    meetings: { anterior: number };
    won: { anterior: number };
    revenueCents: { anterior: number };
  };
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    aguardando: number;
    semResposta: number;
    respondidos: number;
  };
  byOrigin: { label: string; leads: number; meetings: number; won: number; revenueCents: number }[];
  daily: { date: string; leads: number; won: number }[];
}

interface Investimento {
  name: string;
  platform: "META" | "GOOGLE";
  diasComGasto: number;
  totalCents: number;
}

interface Organizacao {
  name: string;
}

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = periodoValido(params.days);

  const [overview, investimentos, organizacao] = await Promise.all([
    apiFetch<Overview>(`/analytics/overview?days=${days}`),
    apiFetch<Investimento[]>(`/campaigns/investimento?days=${days}`),
    apiFetch<Organizacao>("/organizations/current"),
  ]);

  const inicio = overview.period.from.slice(0, 10);
  const fim = overview.period.to.slice(0, 10);

  const bloco = montaBlocoDeDados({
    cliente: organizacao.name,
    periodo: { de: inicio, ate: fim, dias: days },
    totais: {
      leads: overview.totals.leads,
      qualificados: overview.totals.qualified,
      reunioes: overview.totals.meetings,
      vendas: overview.totals.won,
      receitaCentavos: overview.totals.revenueCents,
      descartados: overview.totals.disqualified,
    },
    anterior: {
      leads: overview.comparacao.leads.anterior,
      qualificados: overview.comparacao.qualified.anterior,
      reunioes: overview.comparacao.meetings.anterior,
      vendas: overview.comparacao.won.anterior,
      receitaCentavos: overview.comparacao.revenueCents.anterior,
    },
    atendimento: overview.atendimento,
    origens: overview.byOrigin.map((o) => ({
      nome: o.label,
      leads: o.leads,
      reunioes: o.meetings,
      vendas: o.won,
      receitaCentavos: o.revenueCents,
    })),
    diario: overview.daily.map((d) => ({ data: d.date, leads: d.leads, vendas: d.won })),
    // Campanha sem nenhum gasto na janela fica de fora: listá-la com zero faria
    // o relatório afirmar que ela rodou sem custo, quando o caso é que ela não
    // rodou.
    investimento: investimentos
      .filter((campanha) => campanha.totalCents > 0)
      .map((campanha) => ({
        campanha: campanha.name,
        plataforma: campanha.platform === "GOOGLE" ? "Google Ads" : "Meta Ads",
        totalCentavos: campanha.totalCents,
        dias: campanha.diasComGasto,
      })),
  });

  const prompt = montaPrompt(bloco);
  const nomeArquivo = `relatorio-${organizacao.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${inicio}.txt`;

  const dados: DadosDoRelatorio = {
    cliente: organizacao.name,
    periodo: { de: inicio, ate: fim, dias: days },
    totais: {
      leads: overview.totals.leads,
      aproveitaveis: overview.totals.leads - overview.totals.disqualified,
      qualificados: overview.totals.qualified,
      reunioes: overview.totals.meetings,
      vendas: overview.totals.won,
      receitaCentavos: overview.totals.revenueCents,
      descartados: overview.totals.disqualified,
    },
    anterior: {
      leads: overview.comparacao.leads.anterior,
      vendas: overview.comparacao.won.anterior,
      receitaCentavos: overview.comparacao.revenueCents.anterior,
    },
    atendimento: {
      medianaSegundos: overview.atendimento.medianaPrimeiraRespostaSegundos,
      semResposta: overview.atendimento.semResposta,
      respondidos: overview.atendimento.respondidos,
    },
    origens: overview.byOrigin.map((o) => ({
      nome: o.label,
      leads: o.leads,
      vendas: o.won,
      receitaCentavos: o.revenueCents,
    })),
    investimento: investimentos
      .filter((campanha) => campanha.totalCents > 0)
      .map((campanha) => ({
        campanha: campanha.name,
        plataforma: campanha.platform === "GOOGLE" ? "Google Ads" : "Meta Ads",
        totalCentavos: campanha.totalCents,
        dias: campanha.diasComGasto,
      })),
  };

  return (
    <RelatorioView dados={dados} bloco={bloco} prompt={prompt} nomeArquivo={nomeArquivo} days={days} />
  );
}
